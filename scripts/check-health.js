const { spawnSync } = require('child_process');

const npmCmd = process.platform === 'win32' ? 'npm' : 'npm';
const isVerbose = process.argv.includes('--verbose');
const baseEnv = {
  ...process.env,
  ...(isVerbose ? {} : { NODE_NO_WARNINGS: '1' })
};

const steps = [
  { label: 'npm ls', command: `${npmCmd} ls` },
  { label: 'npm audit', command: `${npmCmd} audit` },
  { label: 'npm run docs:check', command: `${npmCmd} run docs:check` },
  { label: 'npm run test:integration', command: `${npmCmd} run test:integration` }
];

for (const step of steps) {
  process.stdout.write(`\n[check-health] Running: ${step.label}\n`);
  const result = spawnSync(step.command, {
    stdio: 'inherit',
    env: baseEnv,
    shell: true
  });

  if (result.error) {
    console.error(`[check-health] Failed to execute ${step.label}:`, result.error.message);
    process.exit(1);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    console.error(`[check-health] Step failed: ${step.label} (exit ${result.status})`);
    process.exit(result.status);
  }
}

console.log(`\n[check-health] All checks passed. Mode: ${isVerbose ? 'verbose' : 'clean'}`);
