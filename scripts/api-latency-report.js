require('dotenv').config({ override: true });

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const ADMIN_USER = process.env.API_DEFAULT_ADMIN_USER || process.env.API_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.API_DEFAULT_ADMIN_PASS
  || process.env.API_DEFAULT_ADMIN_PASSWORD
  || process.env.API_ADMIN_PASSWORD
  || 'admin';

function parseArgs(argv) {
  const out = {
    label: 'current',
    iterations: 30,
    outputDir: 'reports/perf',
    compare: '',
    keepData: false,
    p95BudgetMs: 0,
    strictThreshold: false
  };

  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (arg === '--label' && argv[i + 1]) {
      out.label = String(argv[i + 1]).trim() || out.label;
      i += 1;
      continue;
    }
    if (arg === '--iterations' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isInteger(n) && n > 0) out.iterations = n;
      i += 1;
      continue;
    }
    if (arg === '--output-dir' && argv[i + 1]) {
      out.outputDir = String(argv[i + 1]).trim() || out.outputDir;
      i += 1;
      continue;
    }
    if (arg === '--compare' && argv[i + 1]) {
      out.compare = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg === '--keep-data') {
      out.keepData = true;
      continue;
    }
    if (arg === '--p95-budget-ms' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) out.p95BudgetMs = n;
      i += 1;
      continue;
    }
    if (arg === '--strict-threshold') {
      out.strictThreshold = true;
      continue;
    }

    if (arg && !arg.startsWith('-')) {
      positionals.push(arg);
    }
  }

  if (positionals.length > 0) {
    out.label = positionals[0] || out.label;
  }
  if (positionals.length > 1) {
    const n = Number(positionals[1]);
    if (Number.isInteger(n) && n > 0) {
      out.iterations = n;
    }
  }

  return out;
}

function percentile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function nowStamp() {
  const d = new Date();
  const p2 = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}

async function api(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, options);
  let body = null;
  try {
    body = await response.json();
  } catch (_) {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

async function timedGet(pathname, headers, iterations) {
  const times = [];
  for (let i = 0; i < iterations; i += 1) {
    const t0 = process.hrtime.bigint();
    const response = await fetch(`${BASE_URL}${pathname}`, { headers });
    const t1 = process.hrtime.bigint();
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${pathname} -> ${response.status} ${text}`);
    }
    await response.arrayBuffer();
    times.push(Number(t1 - t0) / 1e6);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    endpoint: pathname,
    iterations,
    avgMs: avg,
    p95Ms: percentile(times, 0.95),
    minMs: Math.min(...times),
    maxMs: Math.max(...times)
  };
}

function formatMs(v) {
  return Number(v).toFixed(2);
}

function byEndpoint(entries) {
  const map = new Map();
  for (const item of entries || []) {
    map.set(item.endpoint, item);
  }
  return map;
}

function buildMarkdown(report, compareReport) {
  const lines = [];
  lines.push('# API Latency Report');
  lines.push('');
  lines.push(`- label: ${report.label}`);
  lines.push(`- createdAt: ${report.createdAt}`);
  lines.push(`- baseUrl: ${report.baseUrl}`);
  lines.push(`- iterations: ${report.iterations}`);
  if (Number(report.p95BudgetMs || 0) > 0) {
    lines.push(`- p95BudgetMs: ${report.p95BudgetMs}`);
    lines.push(`- thresholdBreaches: ${report.thresholdBreaches?.length || 0}`);
  }
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| Endpoint | Avg (ms) | P95 (ms) | Min (ms) | Max (ms) |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const row of report.results) {
    lines.push(`| ${row.endpoint} | ${formatMs(row.avgMs)} | ${formatMs(row.p95Ms)} | ${formatMs(row.minMs)} | ${formatMs(row.maxMs)} |`);
  }

  if (compareReport && Array.isArray(compareReport.results)) {
    lines.push('');
    lines.push(`## Comparison Vs ${compareReport.label || 'baseline'}`);
    lines.push('');
    lines.push('| Endpoint | Avg Delta (ms) | P95 Delta (ms) |');
    lines.push('|---|---:|---:|');
    const base = byEndpoint(compareReport.results);
    for (const row of report.results) {
      const prev = base.get(row.endpoint);
      const avgDelta = prev ? row.avgMs - Number(prev.avgMs || 0) : NaN;
      const p95Delta = prev ? row.p95Ms - Number(prev.p95Ms || 0) : NaN;
      lines.push(`| ${row.endpoint} | ${Number.isFinite(avgDelta) ? formatMs(avgDelta) : 'n/a'} | ${Number.isFinite(p95Delta) ? formatMs(p95Delta) : 'n/a'} |`);
    }
  }

  if (Array.isArray(report.thresholdBreaches) && report.thresholdBreaches.length > 0) {
    lines.push('');
    lines.push('## Threshold Breaches');
    lines.push('');
    lines.push('| Endpoint | P95 (ms) | Budget (ms) | Delta (ms) |');
    lines.push('|---|---:|---:|---:|');
    for (const item of report.thresholdBreaches) {
      lines.push(`| ${item.endpoint} | ${formatMs(item.p95Ms)} | ${formatMs(item.budgetMs)} | ${formatMs(item.deltaMs)} |`);
    }
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const login = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS })
  });

  if (!login.ok) {
    throw new Error(`Login failed (${login.status}).`);
  }

  const token = String(login.body?.accessToken || '').trim();
  if (!token) {
    throw new Error('Missing accessToken in auth response.');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const runId = `${Date.now()}`;
  const stationId = `PERF_ST_${runId}`;
  const lineId = `PERF_LN_${runId}`;
  const shiftId = `PERF_SH_${runId}`;
  let assignmentId = null;

  try {
    const createStation = await api('/api/station', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: stationId, description: 'Perf Station', bottleneck: 1, cycleTime: 44, lastStation: 1 })
    });
    if (!createStation.ok) throw new Error(`Create station failed (${createStation.status}).`);

    const createLine = await api('/api/line', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: lineId, description: 'Perf Line', shapeType: 'I-shape' })
    });
    if (!createLine.ok) throw new Error(`Create line failed (${createLine.status}).`);

    const createShift = await api('/api/shift', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: shiftId, name: 'Perf Shift', start: '06:00', end: '14:00', lineId, stationId })
    });
    if (!createShift.ok) throw new Error(`Create shift failed (${createShift.status}).`);

    const createAssign = await api('/api/assign-shift', {
      method: 'POST',
      headers,
      body: JSON.stringify({ shiftId, targetType: 'station', targetId: stationId })
    });
    if (!createAssign.ok) throw new Error(`Create assignment failed (${createAssign.status}).`);

    const assignmentList = await api('/api/assign-shift', { headers });
    if (assignmentList.ok && Array.isArray(assignmentList.body)) {
      const match = assignmentList.body.find((x) => x.shiftId === shiftId && x.targetType === 'station' && x.targetId === stationId);
      assignmentId = match?.id || null;
    }

    const endpoints = [
      `/api/fld/cycle-time-v1?lineId=${encodeURIComponent(lineId)}`,
      `/api/fld/metadata-line-v1?lineId=${encodeURIComponent(lineId)}`,
      `/api/fld/shift-schedule-v1?lineId=${encodeURIComponent(lineId)}&timezone=-1`,
      `/api/shift-schedule?lineId=${encodeURIComponent(lineId)}&timezone=-1`,
      `/api/uns/cycle-time?lineId=${encodeURIComponent(lineId)}`
    ];

    const results = [];
    for (const endpoint of endpoints) {
      results.push(await timedGet(endpoint, headers, args.iterations));
    }

    const compareReport = args.compare && fs.existsSync(args.compare)
      ? JSON.parse(fs.readFileSync(args.compare, 'utf8'))
      : null;

    const report = {
      label: args.label,
      createdAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      iterations: args.iterations,
      p95BudgetMs: args.p95BudgetMs,
      fixture: { stationId, lineId, shiftId },
      results
    };

    const thresholdBreaches = Number(args.p95BudgetMs || 0) > 0
      ? results
        .filter((x) => Number(x.p95Ms) > Number(args.p95BudgetMs))
        .map((x) => ({
          endpoint: x.endpoint,
          p95Ms: Number(x.p95Ms),
          budgetMs: Number(args.p95BudgetMs),
          deltaMs: Number(x.p95Ms) - Number(args.p95BudgetMs)
        }))
      : [];
    report.thresholdBreaches = thresholdBreaches;

    const outDir = path.resolve(process.cwd(), args.outputDir);
    fs.mkdirSync(outDir, { recursive: true });

    const stamp = nowStamp();
    const baseName = `api-latency-${args.label}-${stamp}`;
    const jsonPath = path.join(outDir, `${baseName}.json`);
    const mdPath = path.join(outDir, `${baseName}.md`);

    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(mdPath, buildMarkdown(report, compareReport), 'utf8');

    console.log(`Saved JSON report: ${path.relative(process.cwd(), jsonPath)}`);
    console.log(`Saved Markdown report: ${path.relative(process.cwd(), mdPath)}`);
    for (const row of results) {
      console.log(`${row.endpoint} avg=${formatMs(row.avgMs)}ms p95=${formatMs(row.p95Ms)}ms min=${formatMs(row.minMs)}ms max=${formatMs(row.maxMs)}ms`);
    }

    if (thresholdBreaches.length > 0) {
      console.warn(`P95 threshold breaches: ${thresholdBreaches.length}`);
      for (const breach of thresholdBreaches) {
        console.warn(`- ${breach.endpoint}: p95=${formatMs(breach.p95Ms)}ms budget=${formatMs(breach.budgetMs)}ms delta=${formatMs(breach.deltaMs)}ms`);
      }
      if (args.strictThreshold) {
        throw new Error(`P95 threshold exceeded on ${thresholdBreaches.length} endpoint(s).`);
      }
    }
  } finally {
    if (!args.keepData) {
      if (assignmentId != null) {
        await api(`/api/assign-shift/${assignmentId}`, { method: 'DELETE', headers });
      }
      await api(`/api/shift/${encodeURIComponent(shiftId)}`, { method: 'DELETE', headers });
      await api(`/api/station/${encodeURIComponent(stationId)}`, { method: 'DELETE', headers });
      await api(`/api/line/${encodeURIComponent(lineId)}`, { method: 'DELETE', headers });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
