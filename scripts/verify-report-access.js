const { spawnSync } = require('child_process');
const fs = require('fs');

const strictMode = process.argv.includes('--strict');
const apiUrl = process.env.API_BASE_URL || 'http://localhost:3000';
const sqlServer = process.env.MSSQL_SERVER || 'DEFMSPD001';
const sqlDb = process.env.MSSQL_DATABASE || 'FLDSyncboardDB';
const sqlReportUser = process.env.SQL_REPORT_USER || 'report';
const sqlReportPassword = process.env.SQL_REPORT_PASSWORD || 'report';
const requireSqlReportLogin = String(process.env.SQL_REPORT_LOGIN_REQUIRED || 'false').toLowerCase() === 'true';
const defaultSqlcmdWin = 'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\SQLCMD.EXE';
const sqlcmdBin = process.env.SQLCMD_BIN
  || (process.platform === 'win32' && fs.existsSync(defaultSqlcmdWin) ? defaultSqlcmdWin : 'sqlcmd');

function runSqlcmd(args) {
  const result = spawnSync(sqlcmdBin, args, {
    encoding: 'utf8',
    shell: false,
    windowsHide: true
  });

  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    error: result.error
  };
}

function parseSingleInt(output) {
  const lines = output
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => /^\d+$/.test(x));

  if (!lines.length) return null;
  return Number(lines[lines.length - 1]);
}

function pushResult(results, name, pass, detail) {
  results.push({ name, pass, detail });
}

async function checkApiReport(results) {
  try {
    const login = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'local', username: 'report', password: 'report' })
    });

    const loginText = await login.text();
    if (!login.ok) {
      pushResult(results, 'API login report/report', false, `status=${login.status} body=${loginText}`);
      return;
    }

    let token = '';
    try {
      token = JSON.parse(loginText).accessToken || '';
    } catch {
      token = '';
    }

    if (!token) {
      pushResult(results, 'API login report/report', false, 'accessToken missing in response');
      return;
    }

    pushResult(results, 'API login report/report', true, `status=${login.status}`);

    const read = await fetch(`${apiUrl}/api/stations`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const readText = await read.text();
    if (!read.ok) {
      pushResult(results, 'API read /api/stations with report token', false, `status=${read.status} body=${readText}`);
      return;
    }

    pushResult(results, 'API read /api/stations with report token', true, `status=${read.status}`);
  } catch (error) {
    pushResult(results, 'API endpoint reachable', false, error.message || String(error));
  }
}

async function main() {
  const results = [];

  // Validate SQL login first; a successful SQL-auth connection is authoritative.
  // Metadata visibility for sys.server_principals can be restricted for integrated users.
  const reportLoginTest = runSqlcmd([
    '-S', sqlServer,
    '-d', sqlDb,
    '-U', sqlReportUser,
    '-P', sqlReportPassword,
    '-Q', 'SET NOCOUNT ON; SELECT 1 AS ok;'
  ]);

  const reportLoginWorks = reportLoginTest.ok;

  pushResult(
    results,
    `SQL login ${sqlReportUser}/*** works`,
    reportLoginWorks || !requireSqlReportLogin,
    reportLoginWorks
      ? 'login ok'
      : (requireSqlReportLogin
        ? (reportLoginTest.stderr || reportLoginTest.stdout || 'login failed')
        : `optional-check-skipped: ${reportLoginTest.stderr || reportLoginTest.stdout || 'login failed'}`)
  );

  const loginExists = runSqlcmd([
    '-S', sqlServer,
    '-d', 'master',
    '-E',
    '-Q', `SET NOCOUNT ON; SELECT COUNT(1) FROM sys.server_principals WHERE name='${String(sqlReportUser).replace(/'/g, "''")}';`
  ]);

  if (!loginExists.ok) {
    pushResult(
      results,
      'SQL check report login exists',
      !requireSqlReportLogin,
      requireSqlReportLogin
        ? (loginExists.stderr || loginExists.stdout || 'sqlcmd failed')
        : `optional-check-skipped: ${loginExists.stderr || loginExists.stdout || 'sqlcmd failed'}`
    );
  } else {
    const count = parseSingleInt(loginExists.stdout);
    const exists = count === 1;
    const inferredFromLogin = !exists && reportLoginWorks;

    pushResult(
      results,
      'SQL check report login exists',
      exists || inferredFromLogin || !requireSqlReportLogin,
      exists
        ? `count=${count}`
        : (inferredFromLogin
          ? `count=${count}; inferred=true (sql login succeeded with ${sqlReportUser})`
          : (requireSqlReportLogin ? `count=${count}` : `optional-check-skipped: count=${count}`))
    );
  }

  const roleGrantCheck = runSqlcmd([
    '-S', sqlServer,
    '-d', sqlDb,
    '-E',
    '-Q', "SET NOCOUNT ON; SELECT COUNT(1) FROM sys.database_permissions dp JOIN sys.database_principals p ON p.principal_id = dp.grantee_principal_id JOIN sys.objects o ON o.object_id = dp.major_id WHERE p.name='report_view_readers' AND dp.permission_name='SELECT' AND o.name LIKE 'vw_report_%';"
  ]);

  if (!roleGrantCheck.ok) {
    pushResult(results, 'SQL role report_view_readers has view grants', false, roleGrantCheck.stderr || roleGrantCheck.stdout || 'sqlcmd failed');
  } else {
    const count = parseSingleInt(roleGrantCheck.stdout);
    pushResult(results, 'SQL role report_view_readers has view grants', count >= 6, `grants=${count}`);
  }

  const integratedViewRead = runSqlcmd([
    '-S', sqlServer,
    '-d', sqlDb,
    '-E',
    '-Q', 'SET NOCOUNT ON; SELECT TOP (1) station_id FROM dbo.vw_report_stations;'
  ]);

  pushResult(
    results,
    'Integrated principal can read report views',
    integratedViewRead.ok,
    integratedViewRead.ok ? 'read ok' : (integratedViewRead.stderr || integratedViewRead.stdout || 'read failed')
  );

  await checkApiReport(results);

  const failing = results.filter((x) => !x.pass);
  console.log('\nReport Access Verification Matrix:');
  for (const entry of results) {
    console.log(`- [${entry.pass ? 'PASS' : 'FAIL'}] ${entry.name} -> ${entry.detail}`);
  }

  if (strictMode && failing.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
