// mqtt.js
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');
const mqttLogger = createLogger({ service: 'mqtt' });

const MQTT_ENABLED = String(process.env.MQTT_ENABLED || 'true').toLowerCase() === 'true';
const MQTT_BASE_TOPIC = String(process.env.MQTT_BASE_TOPIC || 'm/den/fldsyncboard')
  .trim()
  .replace(/\/+$/, '');
const options = {
  host: process.env.MQTT_HOST || 'den-plant1-uns.magna.global',
  port: Number(process.env.MQTT_PORT || 8883),
  protocol: process.env.MQTT_PROTOCOL || 'mqtts',
  username: process.env.MQTT_USERNAME || 'bridge',
  password: process.env.MQTT_PASSWORD || 'bridge',
  rejectUnauthorized: String(process.env.MQTT_REJECT_UNAUTHORIZED || 'true').toLowerCase() === 'true'
};

const mqttCaFile = String(process.env.MQTT_CA_FILE || 'magna_global_fullchain.pem').trim();
if (mqttCaFile) {
  const resolvedCaPath = path.isAbsolute(mqttCaFile)
    ? mqttCaFile
    : path.join(process.cwd(), mqttCaFile);

  if (fs.existsSync(resolvedCaPath)) {
    options.ca = fs.readFileSync(resolvedCaPath);
  } else if (options.protocol === 'mqtts') {
    mqttLogger.warn('mqtt.ca_file.missing', {
      caFile: mqttCaFile,
      resolvedPath: resolvedCaPath,
      note: 'Continuing without explicit CA file.'
    });
  }
}

const client = MQTT_ENABLED ? mqtt.connect(options) : null;

if (client) {
  client.on('connect', () => {
    mqttLogger.info('mqtt.connected', {
      host: options.host,
      port: options.port,
      protocol: options.protocol
    });
  });

  client.on('reconnect', () => {
    mqttLogger.warn('mqtt.reconnecting');
  });

  client.on('offline', () => {
    mqttLogger.warn('mqtt.offline');
  });

  client.on('close', () => {
    mqttLogger.warn('mqtt.closed');
  });

  client.on('error', (error) => {
    mqttLogger.error('mqtt.error', { error });
  });
} else {
  mqttLogger.info('mqtt.disabled');
}

function publishMasterdata(type, data) {
  if (!client) {
    return;
  }
  client.publish('masterdata/update', JSON.stringify({ type, data }), (error) => {
    if (error) {
      mqttLogger.error('mqtt.publish.failed', {
        topic: 'masterdata/update',
        type,
        error
      });
    }
  });
}

function normalizeTopicSegment(value, fallback = 'unknown') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.replace(/[\s#\+]+/g, '_').replace(/^\/+|\/+$/g, '') || fallback;
}

function buildStationDataChangeTopic(stationId) {
  return `${MQTT_BASE_TOPIC}/${normalizeTopicSegment(stationId)}`;
}

function publishDataChangeEvent({ stationId, endpoint, payload, context = {} }) {
  if (!client) {
    return;
  }

  const topic = buildStationDataChangeTopic(stationId);
  const eventPayload = {
    eventType: 'DataChange',
    eventVersion: '1.0',
    timestamp: new Date().toISOString(),
    endpoint: String(endpoint || '').trim(),
    stationId: String(stationId || '').trim(),
    source: 'fld-syncboard',
    context: {
      lineId: String(context.lineId || '').trim(),
      reason: String(context.reason || '').trim(),
      action: String(context.action || '').trim()
    },
    payload
  };

  client.publish(topic, JSON.stringify(eventPayload), (error) => {
    if (error) {
      mqttLogger.error('mqtt.publish_datachange.failed', {
        topic,
        endpoint: eventPayload.endpoint,
        stationId: eventPayload.stationId,
        error
      });
    }
  });
}

module.exports = { publishMasterdata, publishDataChangeEvent, buildStationDataChangeTopic };
