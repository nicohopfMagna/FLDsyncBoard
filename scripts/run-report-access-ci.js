const { spawnSync } = require('child_process');

const requireSqlLogin = process.argv.includes('--require-sql-login');
const command = requireSqlLogin
  ? 'npm run verify:report-access:strict:with-start'
  : 'npm run verify:report-access:with-start';

const env = {
  ...process.env,
  ...(requireSqlLogin ? { SQL_REPORT_LOGIN_REQUIRED: 'true' } : {})
};

const result = spawnSync(command, {
  stdio: 'inherit',
  env,
  shell: true,
  windowsHide: true
});

if (result.error) {
  console.error('[ci:report-access] Failed to start report access CI check:', result.error.message);
  process.exit(1);
}

process.exit(typeof result.status === 'number' ? result.status : 1);
