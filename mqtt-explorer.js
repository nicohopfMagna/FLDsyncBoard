const mqtt = require('mqtt');
const { createLogger } = require('./logger');

const explorerLogger = createLogger({ service: 'mqtt-explorer' });

const DEFAULT_MESSAGE_LIMIT = 500;
const ALLOWED_PROTOCOLS = new Set(['mqtt', 'mqtts', 'ws', 'wss', 'tcp', 'ssl', 'tls']);

let explorerClient = null;
let explorerState = {
  connected: false,
  connecting: false,
  lastError: '',
  subscriptions: new Map(),
  messages: [],
  config: null
};

function sanitizeConfig(raw) {
  const host = String(raw?.host || '').trim();
  if (!host) throw new Error('host is required');

  const protocol = String(raw?.protocol || 'mqtts').trim().toLowerCase();
  if (!ALLOWED_PROTOCOLS.has(protocol)) {
    throw new Error(`Unsupported protocol '${protocol}'`);
  }

  const parsedPort = Number(raw?.port || (protocol === 'mqtts' || protocol === 'wss' ? 8883 : 1883));
  if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
    throw new Error('port must be an integer between 1 and 65535');
  }

  const keepalive = Number(raw?.keepalive || 60);
  const connectTimeout = Number(raw?.connectTimeout || 10000);
  const reconnectPeriod = Number(raw?.reconnectPeriod || 1000);
  const username = String(raw?.username || '').trim();
  const password = String(raw?.password || '');

  const cfg = {
    host,
    port: parsedPort,
    protocol,
    clientId: String(raw?.clientId || '').trim() || `fld-syncboard-${Math.random().toString(16).slice(2, 10)}`,
    clean: raw?.clean !== false,
    keepalive: Number.isFinite(keepalive) && keepalive > 0 ? keepalive : 60,
    connectTimeout: Number.isFinite(connectTimeout) && connectTimeout > 0 ? connectTimeout : 10000,
    reconnectPeriod: Number.isFinite(reconnectPeriod) && reconnectPeriod >= 0 ? reconnectPeriod : 1000,
    rejectUnauthorized: raw?.rejectUnauthorized !== false
  };

  if (username) {
    cfg.username = username;
    cfg.password = password;
  }

  const caPem = String(raw?.caPem || '').trim();
  if (caPem) {
    cfg.ca = caPem;
  }

  return cfg;
}

function attachClientHandlers(client) {
  client.on('connect', () => {
    explorerState.connected = true;
    explorerState.connecting = false;
    explorerState.lastError = '';
    explorerLogger.info('mqtt.explorer.connected', {
      host: explorerState.config?.host,
      port: explorerState.config?.port,
      protocol: explorerState.config?.protocol
    });
  });

  client.on('reconnect', () => {
    explorerState.connecting = true;
    explorerLogger.warn('mqtt.explorer.reconnecting');
  });

  client.on('close', () => {
    explorerState.connected = false;
    explorerState.connecting = false;
    explorerLogger.warn('mqtt.explorer.closed');
  });

  client.on('offline', () => {
    explorerState.connected = false;
    explorerState.connecting = false;
    explorerLogger.warn('mqtt.explorer.offline');
  });

  client.on('error', (err) => {
    explorerState.lastError = String(err?.message || err || 'Unknown MQTT error');
    explorerLogger.error('mqtt.explorer.error', { error: err });
  });

  client.on('message', (topic, payload, packet) => {
    const message = {
      ts: new Date().toISOString(),
      topic: String(topic || ''),
      qos: Number(packet?.qos || 0),
      retain: Boolean(packet?.retain),
      payload: Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload || '')
    };

    explorerState.messages.push(message);
    if (explorerState.messages.length > DEFAULT_MESSAGE_LIMIT) {
      explorerState.messages.splice(0, explorerState.messages.length - DEFAULT_MESSAGE_LIMIT);
    }
  });
}

function publicConfig() {
  if (!explorerState.config) return null;
  const cfg = { ...explorerState.config };
  if (cfg.password) cfg.password = '***';
  if (cfg.ca) cfg.ca = '[provided]';
  return cfg;
}

async function disconnectExplorer() {
  if (!explorerClient) {
    explorerState.connected = false;
    explorerState.connecting = false;
    explorerState.subscriptions = new Map();
    return;
  }

  const clientRef = explorerClient;
  explorerClient = null;

  await new Promise((resolve) => {
    clientRef.end(true, {}, () => resolve());
  });

  explorerState.connected = false;
  explorerState.connecting = false;
  explorerState.subscriptions = new Map();
}

async function connectExplorer(rawOptions) {
  const config = sanitizeConfig(rawOptions);
  await disconnectExplorer();

  explorerState.connecting = true;
  explorerState.lastError = '';
  explorerState.config = config;
  explorerState.messages = [];
  explorerState.subscriptions = new Map();

  const client = mqtt.connect(config);
  explorerClient = client;
  attachClientHandlers(client);

  await new Promise((resolve, reject) => {
    const timeoutMs = Math.max(1000, Number(config.connectTimeout || 10000));
    const timeout = setTimeout(() => {
      client.end(true, {}, () => {
        if (explorerClient === client) {
          explorerClient = null;
        }
        explorerState.connecting = false;
        explorerState.connected = false;
      });
      reject(new Error('MQTT connection timeout'));
    }, timeoutMs);

    const handleConnect = () => {
      clearTimeout(timeout);
      client.off('error', handleError);
      resolve();
    };

    const handleError = (err) => {
      clearTimeout(timeout);
      client.off('connect', handleConnect);
      reject(err instanceof Error ? err : new Error(String(err || 'MQTT connect failed')));
    };

    client.once('connect', handleConnect);
    client.once('error', handleError);
  });

  return getExplorerStatus();
}

async function subscribeTopic(topic, qos = 0) {
  const normalizedTopic = String(topic || '').trim();
  if (!normalizedTopic) throw new Error('topic is required');
  if (!explorerClient || !explorerState.connected) throw new Error('MQTT explorer is not connected');

  const normalizedQos = Math.max(0, Math.min(2, Number(qos) || 0));
  await new Promise((resolve, reject) => {
    explorerClient.subscribe(normalizedTopic, { qos: normalizedQos }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  explorerState.subscriptions.set(normalizedTopic, normalizedQos);
  return getExplorerStatus();
}

async function unsubscribeTopic(topic) {
  const normalizedTopic = String(topic || '').trim();
  if (!normalizedTopic) throw new Error('topic is required');
  if (!explorerClient || !explorerState.connected) throw new Error('MQTT explorer is not connected');

  await new Promise((resolve, reject) => {
    explorerClient.unsubscribe(normalizedTopic, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  explorerState.subscriptions.delete(normalizedTopic);
  return getExplorerStatus();
}

async function publishMessage({ topic, payload, qos, retain }) {
  const normalizedTopic = String(topic || '').trim();
  if (!normalizedTopic) throw new Error('topic is required');
  if (!explorerClient || !explorerState.connected) throw new Error('MQTT explorer is not connected');

  let outgoingPayload = payload;
  if (typeof outgoingPayload === 'object') {
    outgoingPayload = JSON.stringify(outgoingPayload);
  }
  if (outgoingPayload == null) outgoingPayload = '';
  outgoingPayload = String(outgoingPayload);

  const normalizedQos = Math.max(0, Math.min(2, Number(qos) || 0));
  const normalizedRetain = Boolean(retain);

  await new Promise((resolve, reject) => {
    explorerClient.publish(normalizedTopic, outgoingPayload, { qos: normalizedQos, retain: normalizedRetain }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function getExplorerMessages({ limit = 200, clear = false } = {}) {
  const normalizedLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  const items = explorerState.messages.slice(-normalizedLimit);
  if (clear) {
    explorerState.messages = [];
  }
  return items;
}

function clearExplorerMessages() {
  explorerState.messages = [];
}

function getExplorerStatus() {
  return {
    connected: explorerState.connected,
    connecting: explorerState.connecting,
    lastError: explorerState.lastError,
    subscriptions: Array.from(explorerState.subscriptions.entries()).map(([topic, qos]) => ({ topic, qos })),
    messageCount: explorerState.messages.length,
    config: publicConfig()
  };
}

module.exports = {
  connectExplorer,
  disconnectExplorer,
  subscribeTopic,
  unsubscribeTopic,
  publishMessage,
  getExplorerMessages,
  clearExplorerMessages,
  getExplorerStatus
};