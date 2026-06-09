const testPort = String(process.env.TEST_PORT || process.env.PORT || 3100);
process.env.PORT = testPort;
process.env.MQTT_ENABLED = process.env.MQTT_ENABLED || 'false';

require('../server');
