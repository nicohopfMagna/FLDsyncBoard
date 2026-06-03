const testPort = String(process.env.TEST_PORT || process.env.PORT || 3100);
process.env.BASE_URL = process.env.BASE_URL || `http://localhost:${testPort}`;

require('../integration-test');
