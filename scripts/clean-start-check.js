const { spawnSync } = require('child_process');
const net = require('net');

const port = Number(process.env.APP_PORT || 3000);
const forceKill = process.argv.includes('--force-kill');

function isPortOpen(targetPort) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });

    socket.connect(targetPort, '127.0.0.1');
  });
}

function findWindowsPidsForPort(targetPort) {
  const result = spawnSync('netstat', ['-ano', '-p', 'tcp'], {
    encoding: 'utf8',
    shell: true
  });

  if (typeof result.status === 'number' && result.status !== 0) {
    return [];
  }

  const lines = String(result.stdout || '').split(/\r?\n/);
  const needle = `:${targetPort}`;
  const pids = new Set();

  for (const line of lines) {
    if (!line.includes('LISTENING') || !line.includes(needle)) {
      continue;
    }

    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (/^\d+$/.test(pid)) {
      pids.add(pid);
    }
  }

  return [...pids];
}

function killWindowsPids(pids) {
  const unique = [...new Set((pids || []).filter((pid) => /^\d+$/.test(String(pid))))];
  if (!unique.length) return;

  const result = spawnSync('taskkill', ['/F', ...unique.flatMap((pid) => ['/PID', String(pid)])], {
    encoding: 'utf8',
    shell: true
  });

  if (typeof result.status === 'number' && result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(stderr || `taskkill failed with exit code ${result.status}`);
  }
}

(async () => {
  const inUse = await isPortOpen(port);
  if (!inUse) {
    console.log(`[clean-start-check] Port ${port} is free.`);
    process.exit(0);
  }

  const pids = process.platform === 'win32' ? findWindowsPidsForPort(port) : [];
  console.error(`[clean-start-check] Port ${port} is already in use.`);

  if (forceKill && process.platform === 'win32' && pids.length) {
    try {
      console.error(`[clean-start-check] Force-killing PID(s): ${pids.join(', ')}`);
      killWindowsPids(pids);
      const stillInUse = await isPortOpen(port);
      if (!stillInUse) {
        console.log(`[clean-start-check] Port ${port} is now free.`);
        process.exit(0);
      }
      console.error(`[clean-start-check] Port ${port} is still in use after force-kill.`);
    } catch (err) {
      console.error(`[clean-start-check] Force-kill failed: ${err.message || err}`);
    }
  }

  if (pids.length) {
    console.error(`[clean-start-check] Listening PID(s): ${pids.join(', ')}`);
    console.error(`[clean-start-check] Suggested cleanup: Stop-Process -Id ${pids.join(',')} -Force`);
  }

  process.exit(1);
})();
