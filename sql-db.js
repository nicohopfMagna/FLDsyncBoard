// SQL / Postgres data layer
require('dotenv').config({ override: true });

const DB_CONNECTOR = String(process.env.DB_CONNECTOR || 'mssql').trim().toLowerCase();
const isPostgresConnector = DB_CONNECTOR === 'postgres' || DB_CONNECTOR === 'pg';

const useTrustedConnection = !isPostgresConnector && (
  String(process.env.MSSQL_TRUSTED_CONNECTION || '').toLowerCase() === 'true'
  || (
    process.platform === 'win32'
    && !process.env.MSSQL_CONNECTION_STRING
    && !process.env.MSSQL_USER
    && !process.env.MSSQL_PASSWORD
  )
);

const sql = isPostgresConnector
  ? null
  : (useTrustedConnection ? require('mssql/msnodesqlv8') : require('mssql'));

let PgPool = null;
if (isPostgresConnector) {
  ({ Pool: PgPool } = require('pg'));
}
const { createLogger } = require('./logger');
const dbLogger = createLogger({ service: 'sql' });

function envFlag(value, fallback) {
  if (value == null)
    return fallback;
  return String(value).toLowerCase() === 'true';
}

const defaultServer = process.env.MSSQL_SERVER || 'DEFMSPD001';
const defaultDatabase = process.env.MSSQL_DATABASE || 'FLDSyncboardDB';
const trustServerCertificate = envFlag(process.env.MSSQL_TRUST_CERT, true);

const trustedConnectionString = process.env.MSSQL_CONNECTION_STRING
  || `Driver={ODBC Driver 17 for SQL Server};Server=${defaultServer};Database=${defaultDatabase};Trusted_Connection=Yes;TrustServerCertificate=${trustServerCertificate ? 'Yes' : 'No'};`;

const sqlConfig = useTrustedConnection
  ? {
      connectionString: trustedConnectionString,
      options: {
        trustedConnection: true,
        trustServerCertificate,
        encrypt: envFlag(process.env.MSSQL_ENCRYPT, false)
      }
    }
  : process.env.MSSQL_CONNECTION_STRING
  ? {
      connectionString: process.env.MSSQL_CONNECTION_STRING,
      options: {
        encrypt: envFlag(process.env.MSSQL_ENCRYPT, false),
        trustServerCertificate
      }
    }
  : {
      server: defaultServer,
      port: Number(process.env.MSSQL_PORT || 1433),
      user: process.env.MSSQL_USER || 'sa',
      password: process.env.MSSQL_PASSWORD || 'YourStrong!Passw0rd',
      database: defaultDatabase,
      options: {
        encrypt: envFlag(process.env.MSSQL_ENCRYPT, false),
        trustServerCertificate
      }
    };
const postgresConfig = process.env.POSTGRES_CONNECTION_STRING
  ? {
      connectionString: process.env.POSTGRES_CONNECTION_STRING,
      ssl: envFlag(process.env.POSTGRES_SSL, false)
        ? { rejectUnauthorized: envFlag(process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED, true) }
        : false
    }
  : {
      host: process.env.POSTGRES_HOST || '127.0.0.1',
      port: Number(process.env.POSTGRES_PORT || 5432),
      database: process.env.POSTGRES_DATABASE || 'fldsyncboard',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      ssl: envFlag(process.env.POSTGRES_SSL, false)
        ? { rejectUnauthorized: envFlag(process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED, true) }
        : false
    };

const poolPromise = isPostgresConnector
  ? Promise.resolve(new PgPool(postgresConfig))
  : new sql.ConnectionPool(sqlConfig).connect();

function translateSqlServerToPostgres(text) {
  let translated = String(text || '');

  translated = translated.replace(/\[([^\]]+)\]/g, '"$1"');
  translated = translated.replace(/\bISNULL\s*\(/gi, 'COALESCE(');
  translated = translated.replace(/\bSYSUTCDATETIME\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP');
  translated = translated.replace(/\bGETUTCDATE\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP');
  translated = translated.replace(/\bTOP\s+(\d+)\b/gi, '__TOP__$1');

  translated = translated.replace(/SELECT\s+__TOP__(\d+)\s+/gi, 'SELECT ');

  // Preserve camelCase aliases in PostgreSQL result keys.
  translated = translated.replace(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)/g, (full, alias) => {
    if (!/[A-Z]/.test(alias) || !/[a-z]/.test(alias)) return full;
    return `AS "${alias}"`;
  });

  // SQL Server often stores booleans as BIT and uses ISNULL(..., 0).
  // PostgreSQL uses boolean, so convert these default/coalesce patterns safely.
  translated = translated.replace(/COALESCE\(([^)]*\b(?:bottleneck|is_last_station)\b[^)]*),\s*0\)/gi, 'COALESCE($1, false)');
  translated = translated.replace(/COALESCE\(([^)]*\b(?:bottleneck|is_last_station)\b[^)]*),\s*false\)\s*=\s*1/gi, 'COALESCE($1, false) = true');
  translated = translated.replace(/COALESCE\(([^)]*\b(?:bottleneck|is_last_station)\b[^)]*),\s*false\)\s*=\s*0/gi, 'COALESCE($1, false) = false');

  translated = translated.replace(/(ORDER\s+BY[\s\S]*?)(;|$)/gi, (match, orderClause, ending) => {
    if (!translated.includes('__TOP__')) return `${orderClause}${ending}`;
    return `${orderClause}${ending}`;
  });

  const topMatch = String(text || '').match(/SELECT\s+TOP\s+(\d+)\s+/i);
  if (topMatch) {
    const limitValue = Number(topMatch[1]);
    if (Number.isInteger(limitValue) && limitValue > 0) {
      translated = `${translated.trim().replace(/;$/, '')} LIMIT ${limitValue};`;
    }
  }

  translated = translated.replace(/__TOP__\d+/g, '');

  return translated;
}

async function query(text, params = []) {
  if (isPostgresConnector) {
    const pool = await poolPromise;
    const translatedText = translateSqlServerToPostgres(text);
    const result = await pool.query(translatedText, params);
    return { rows: result.rows || [] };
  }

  const pool = await poolPromise;
  const request = pool.request();

  // Map positional placeholders ($1, $2, ...) to unique named params for SQL Server.
  // Repeated placeholders are supported by binding the same value to multiple unique names.
  const occurrences = [];
  const mappedText = text.replace(/\$(\d+)(?![0-9])/g, (fullMatch, oneBasedIndexText) => {
    const oneBasedIndex = Number(oneBasedIndexText);
    const zeroBasedIndex = oneBasedIndex - 1;
    if (!Number.isInteger(oneBasedIndex) || zeroBasedIndex < 0 || zeroBasedIndex >= params.length) {
      throw new Error(`Missing SQL parameter for placeholder ${fullMatch}`);
    }

    const paramName = `p${oneBasedIndex}_${occurrences.length + 1}`;
    occurrences.push({ name: paramName, value: params[zeroBasedIndex] });
    return `@${paramName}`;
  });

  for (const occurrence of occurrences) {
    request.input(occurrence.name, occurrence.value);
  }

  const result = await request.query(mappedText);
  return { rows: result.recordset || [] };
}

async function initDb() {
  if (isPostgresConnector) {
    await initDbPostgres();
    return;
  }

  await query(`
    IF OBJECT_ID('dbo.stations', 'U') IS NULL
    CREATE TABLE dbo.stations (
      id NVARCHAR(255) PRIMARY KEY,
      description NVARCHAR(500) NOT NULL,
      bottleneck BIT NOT NULL CONSTRAINT DF_stations_bottleneck DEFAULT (0),
      is_last_station BIT NOT NULL CONSTRAINT DF_stations_is_last_station DEFAULT (0),
      cycle_time FLOAT NULL,
      created_at DATETIME2 NOT NULL CONSTRAINT DF_stations_created_at DEFAULT (SYSUTCDATETIME()),
      updated_at DATETIME2 NOT NULL CONSTRAINT DF_stations_updated_at DEFAULT (SYSUTCDATETIME())
    );
  `);

  await query(`
    IF COL_LENGTH('dbo.stations', 'is_last_station') IS NULL
      ALTER TABLE dbo.stations ADD is_last_station BIT NOT NULL CONSTRAINT DF_stations_is_last_station_legacy DEFAULT (0);
  `);

  await query(`
    IF OBJECT_ID('dbo.lines', 'U') IS NULL
    CREATE TABLE dbo.lines (
      id NVARCHAR(255) PRIMARY KEY,
      description NVARCHAR(500) NOT NULL,
      shape_type NVARCHAR(50) NOT NULL CONSTRAINT DF_lines_shape_type DEFAULT ('I-shape'),
      created_at DATETIME2 NOT NULL CONSTRAINT DF_lines_created_at DEFAULT (SYSUTCDATETIME()),
      updated_at DATETIME2 NOT NULL CONSTRAINT DF_lines_updated_at DEFAULT (SYSUTCDATETIME())
    );
  `);

  await query(`
    IF COL_LENGTH('dbo.lines', 'shape_type') IS NULL
      ALTER TABLE dbo.lines ADD shape_type NVARCHAR(50) NOT NULL CONSTRAINT DF_lines_shape_type_legacy DEFAULT ('I-shape');
  `);

  await query(`
    UPDATE dbo.lines
    SET shape_type = CASE LOWER(LTRIM(RTRIM(ISNULL(shape_type, ''))))
      WHEN 'i' THEN 'I-shape'
      WHEN 'i-shape' THEN 'I-shape'
      WHEN 'l' THEN 'L-shape'
      WHEN 'l-shape' THEN 'L-shape'
      WHEN 'u' THEN 'U-shape'
      WHEN 'u-shape' THEN 'U-shape'
      WHEN 'o' THEN 'O-shape'
      WHEN 'o-shape' THEN 'O-shape'
      WHEN 's' THEN 'S-shape'
      WHEN 's-shape' THEN 'S-shape'
      WHEN 't' THEN 'T-shape'
      WHEN 't-shape' THEN 'T-shape'
      WHEN 'cell' THEN 'Cell-shape'
      WHEN 'cell-shape' THEN 'Cell-shape'
      WHEN 'ring' THEN 'O-shape'
      WHEN 'ring-shape' THEN 'O-shape'
      WHEN 'other' THEN 'I-shape'
      WHEN 'other-shape' THEN 'I-shape'
      ELSE 'I-shape'
    END;
  `);

  await query(`
    IF EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE name = 'CHK_lines_shape_type_allowed'
        AND parent_object_id = OBJECT_ID('dbo.lines')
    )
    ALTER TABLE dbo.lines DROP CONSTRAINT CHK_lines_shape_type_allowed;

    ALTER TABLE dbo.lines WITH NOCHECK
    ADD CONSTRAINT CHK_lines_shape_type_allowed CHECK (
      shape_type IN (
        'I-shape',
        'L-shape',
        'U-shape',
        'O-shape',
        'S-shape',
        'T-shape',
        'Cell-shape',
        -- Legacy aliases for backward compatibility.
        'I',
        'L',
        'U',
        'O',
        'S',
        'T',
        'CELL'
      )
    );
  `);

  await query(`
    IF OBJECT_ID('dbo.shifts', 'U') IS NULL
    CREATE TABLE dbo.shifts (
      id NVARCHAR(255) PRIMARY KEY,
      name NVARCHAR(255) NOT NULL,
      start_time NVARCHAR(100) NOT NULL,
      end_time NVARCHAR(100) NOT NULL,
      line_id NVARCHAR(255) NULL,
      station_id NVARCHAR(255) NULL,
      created_at DATETIME2 NOT NULL CONSTRAINT DF_shifts_created_at DEFAULT (SYSUTCDATETIME()),
      updated_at DATETIME2 NOT NULL CONSTRAINT DF_shifts_updated_at DEFAULT (SYSUTCDATETIME())
    );
  `);

  await query(`
    IF COL_LENGTH('dbo.shifts', 'line_id') IS NULL
      ALTER TABLE dbo.shifts ADD line_id NVARCHAR(255) NULL;
    IF COL_LENGTH('dbo.shifts', 'station_id') IS NULL
      ALTER TABLE dbo.shifts ADD station_id NVARCHAR(255) NULL;
  `);

  await query(`
    IF OBJECT_ID('dbo.shift_assignments', 'U') IS NULL
    CREATE TABLE dbo.shift_assignments (
      id BIGINT IDENTITY(1,1) PRIMARY KEY,
      shift_id NVARCHAR(255) NULL,
      target_type NVARCHAR(255) NULL,
      target_id NVARCHAR(255) NULL,
      line_id NVARCHAR(255) NULL,
      station_id NVARCHAR(255) NULL,
      created_at DATETIME2 NOT NULL CONSTRAINT DF_shift_assignments_created_at DEFAULT (SYSUTCDATETIME())
    );
  `);

  await query(`
    IF COL_LENGTH('dbo.shift_assignments', 'shift_id') IS NULL
      ALTER TABLE dbo.shift_assignments ADD shift_id NVARCHAR(255) NULL;
    IF COL_LENGTH('dbo.shift_assignments', 'target_type') IS NULL
      ALTER TABLE dbo.shift_assignments ADD target_type NVARCHAR(255) NULL;
    IF COL_LENGTH('dbo.shift_assignments', 'target_id') IS NULL
      ALTER TABLE dbo.shift_assignments ADD target_id NVARCHAR(255) NULL;
    IF COL_LENGTH('dbo.shift_assignments', 'line_id') IS NULL
      ALTER TABLE dbo.shift_assignments ADD line_id NVARCHAR(255) NULL;
    IF COL_LENGTH('dbo.shift_assignments', 'station_id') IS NULL
      ALTER TABLE dbo.shift_assignments ADD station_id NVARCHAR(255) NULL;
  `);

  await query(`
    IF OBJECT_ID('dbo.measurements', 'U') IS NULL
    CREATE TABLE dbo.measurements (
      id BIGINT IDENTITY(1,1) PRIMARY KEY,
      measurement NVARCHAR(255) NOT NULL,
      fields NVARCHAR(MAX) NOT NULL CONSTRAINT DF_measurements_fields DEFAULT ('{}'),
      tags NVARCHAR(MAX) NOT NULL CONSTRAINT DF_measurements_tags DEFAULT ('{}'),
      created_at DATETIME2 NOT NULL CONSTRAINT DF_measurements_created_at DEFAULT (SYSUTCDATETIME())
    );
  `);

  await query(`
    IF OBJECT_ID('dbo.auth_users', 'U') IS NULL
    CREATE TABLE dbo.auth_users (
      username NVARCHAR(255) PRIMARY KEY,
      password_hash NVARCHAR(600) NOT NULL,
      role NVARCHAR(50) NOT NULL CONSTRAINT DF_auth_users_role DEFAULT ('user'),
      enabled BIT NOT NULL CONSTRAINT DF_auth_users_enabled DEFAULT (1),
      source NVARCHAR(100) NOT NULL CONSTRAINT DF_auth_users_source DEFAULT ('manual'),
      created_at DATETIME2 NOT NULL CONSTRAINT DF_auth_users_created_at DEFAULT (SYSUTCDATETIME()),
      updated_at DATETIME2 NOT NULL CONSTRAINT DF_auth_users_updated_at DEFAULT (SYSUTCDATETIME())
    );
  `);

  await query(`
    IF OBJECT_ID('dbo.auth_user_permissions', 'U') IS NULL
    CREATE TABLE dbo.auth_user_permissions (
      username NVARCHAR(255) NOT NULL,
      permission NVARCHAR(120) NOT NULL,
      created_at DATETIME2 NOT NULL CONSTRAINT DF_auth_user_permissions_created_at DEFAULT (SYSUTCDATETIME()),
      CONSTRAINT PK_auth_user_permissions PRIMARY KEY (username, permission)
    );
  `);

  await query(`
    IF OBJECT_ID('dbo.masterdata_templates', 'U') IS NULL
    CREATE TABLE dbo.masterdata_templates (
      id BIGINT IDENTITY(1,1) PRIMARY KEY,
      plant NVARCHAR(255) NOT NULL,
      template_name NVARCHAR(255) NOT NULL,
      payload NVARCHAR(MAX) NOT NULL,
      created_by NVARCHAR(255) NULL,
      created_at DATETIME2 NOT NULL CONSTRAINT DF_masterdata_templates_created_at DEFAULT (SYSUTCDATETIME()),
      updated_at DATETIME2 NOT NULL CONSTRAINT DF_masterdata_templates_updated_at DEFAULT (SYSUTCDATETIME())
    );
  `);

  await query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'UX_masterdata_templates_plant_template_name'
        AND object_id = OBJECT_ID('dbo.masterdata_templates')
    )
    CREATE UNIQUE INDEX UX_masterdata_templates_plant_template_name
      ON dbo.masterdata_templates (plant, template_name);
  `);

  await query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.foreign_keys
      WHERE name = 'FK_auth_user_permissions_auth_users'
    )
    ALTER TABLE dbo.auth_user_permissions WITH NOCHECK
    ADD CONSTRAINT FK_auth_user_permissions_auth_users FOREIGN KEY (username)
    REFERENCES dbo.auth_users(username) ON DELETE CASCADE;
  `);

  // Keep natural IDs as primary keys and connect tables via foreign keys.
  await query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.foreign_keys
      WHERE name = 'FK_shifts_lines'
    )
    ALTER TABLE dbo.shifts WITH NOCHECK
    ADD CONSTRAINT FK_shifts_lines FOREIGN KEY (line_id)
    REFERENCES dbo.lines(id);

    IF NOT EXISTS (
      SELECT 1
      FROM sys.foreign_keys
      WHERE name = 'FK_shifts_stations'
    )
    ALTER TABLE dbo.shifts WITH NOCHECK
    ADD CONSTRAINT FK_shifts_stations FOREIGN KEY (station_id)
    REFERENCES dbo.stations(id);

    IF NOT EXISTS (
      SELECT 1
      FROM sys.foreign_keys
      WHERE name = 'FK_shift_assignments_shifts'
    )
    ALTER TABLE dbo.shift_assignments WITH NOCHECK
    ADD CONSTRAINT FK_shift_assignments_shifts FOREIGN KEY (shift_id)
    REFERENCES dbo.shifts(id);

    IF NOT EXISTS (
      SELECT 1
      FROM sys.foreign_keys
      WHERE name = 'FK_shift_assignments_lines'
    )
    ALTER TABLE dbo.shift_assignments WITH NOCHECK
    ADD CONSTRAINT FK_shift_assignments_lines FOREIGN KEY (line_id)
    REFERENCES dbo.lines(id);

    IF NOT EXISTS (
      SELECT 1
      FROM sys.foreign_keys
      WHERE name = 'FK_shift_assignments_stations'
    )
    ALTER TABLE dbo.shift_assignments WITH NOCHECK
    ADD CONSTRAINT FK_shift_assignments_stations FOREIGN KEY (station_id)
    REFERENCES dbo.stations(id);
  `);

  await query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE name = 'CHK_shift_assignments_target_consistency'
    )
    ALTER TABLE dbo.shift_assignments WITH NOCHECK
    ADD CONSTRAINT CHK_shift_assignments_target_consistency CHECK (
      (line_id IS NOT NULL OR station_id IS NOT NULL)
      AND (target_type IS NULL OR target_type IN ('line', 'station'))
      AND (target_type <> 'line' OR line_id IS NOT NULL)
      AND (target_type <> 'station' OR station_id IS NOT NULL)
      AND (target_type IS NOT NULL OR target_id IS NULL)
      AND (target_type <> 'line' OR target_id IS NULL OR target_id = line_id)
      AND (target_type <> 'station' OR target_id IS NULL OR target_id = station_id)
    );
  `);

  await query(`
    -- Remove invalid legacy rows so constraints and unique business key can be enforced.
    DELETE FROM dbo.shift_assignments
    WHERE target_type IS NULL
      OR target_id IS NULL
      OR target_type NOT IN ('line', 'station');

    DELETE FROM dbo.shift_assignments
    WHERE target_type = 'line' AND (line_id IS NULL OR (target_id IS NOT NULL AND target_id <> line_id));

    DELETE FROM dbo.shift_assignments
    WHERE target_type = 'station' AND (station_id IS NULL OR (target_id IS NOT NULL AND target_id <> station_id));

    ;WITH dedup AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY shift_id, target_type, target_id
          ORDER BY id DESC
        ) AS rn
      FROM dbo.shift_assignments
    )
    DELETE FROM dbo.shift_assignments
    WHERE id IN (
      SELECT id
      FROM dedup
      WHERE rn > 1
    );
  `);

  await query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'UX_shift_assignments_business_key'
        AND object_id = OBJECT_ID('dbo.shift_assignments')
    )
    CREATE UNIQUE INDEX UX_shift_assignments_business_key
      ON dbo.shift_assignments (shift_id, target_type, target_id);
  `);

  await query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_shifts_line_id' AND object_id = OBJECT_ID('dbo.shifts')
    )
    CREATE INDEX IX_shifts_line_id ON dbo.shifts (line_id);

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_shifts_station_id' AND object_id = OBJECT_ID('dbo.shifts')
    )
    CREATE INDEX IX_shifts_station_id ON dbo.shifts (station_id);

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_shift_assignments_line_id' AND object_id = OBJECT_ID('dbo.shift_assignments')
    )
    CREATE INDEX IX_shift_assignments_line_id ON dbo.shift_assignments (line_id);

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_shift_assignments_station_id' AND object_id = OBJECT_ID('dbo.shift_assignments')
    )
    CREATE INDEX IX_shift_assignments_station_id ON dbo.shift_assignments (station_id);

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_shift_assignments_shift_id' AND object_id = OBJECT_ID('dbo.shift_assignments')
    )
    CREATE INDEX IX_shift_assignments_shift_id ON dbo.shift_assignments (shift_id);

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_shift_assignments_target_type_target_id_shift_id' AND object_id = OBJECT_ID('dbo.shift_assignments')
    )
    CREATE INDEX IX_shift_assignments_target_type_target_id_shift_id ON dbo.shift_assignments (target_type, target_id, shift_id);

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_shift_assignments_shift_id_line_id_station_id' AND object_id = OBJECT_ID('dbo.shift_assignments')
    )
    CREATE INDEX IX_shift_assignments_shift_id_line_id_station_id ON dbo.shift_assignments (shift_id, line_id, station_id);

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_shift_assignments_created_at_desc' AND object_id = OBJECT_ID('dbo.shift_assignments')
    )
    CREATE INDEX IX_shift_assignments_created_at_desc ON dbo.shift_assignments (created_at DESC);

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_stations_bottleneck_cycle_id' AND object_id = OBJECT_ID('dbo.stations')
    )
    CREATE INDEX IX_stations_bottleneck_cycle_id ON dbo.stations (bottleneck, cycle_time, id);

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_masterdata_templates_plant_updated' AND object_id = OBJECT_ID('dbo.masterdata_templates')
    )
    CREATE INDEX IX_masterdata_templates_plant_updated ON dbo.masterdata_templates (plant, updated_at DESC);

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_measurements_measurement_id_desc' AND object_id = OBJECT_ID('dbo.measurements')
    )
    CREATE INDEX IX_measurements_measurement_id_desc ON dbo.measurements (measurement, id DESC);
  `);

  await ensureReportingViews();
  await ensureSqlReportUserAccess();
}

async function ensureReportingViews() {
  if (isPostgresConnector) {
    await ensureReportingViewsPostgres();
    return;
  }

  await query(`
    IF OBJECT_ID('dbo.vw_report_stations', 'V') IS NULL
      EXEC('CREATE VIEW dbo.vw_report_stations AS SELECT 1 AS placeholder');
    EXEC('
      ALTER VIEW dbo.vw_report_stations
      AS
      SELECT
        s.id AS station_id,
        s.description AS station_description,
        CAST(s.bottleneck AS BIT) AS bottleneck,
        CAST(s.is_last_station AS BIT) AS is_last_station,
        s.cycle_time,
        s.created_at,
        s.updated_at
      FROM dbo.stations s
    ');
  `);

  await query(`
    IF OBJECT_ID('dbo.vw_report_lines', 'V') IS NULL
      EXEC('CREATE VIEW dbo.vw_report_lines AS SELECT 1 AS placeholder');
    EXEC('
      ALTER VIEW dbo.vw_report_lines
      AS
      SELECT
        l.id AS line_id,
        l.description AS line_description,
        l.shape_type,
        l.created_at,
        l.updated_at
      FROM dbo.lines l
    ');
  `);

  await query(`
    IF OBJECT_ID('dbo.vw_report_shifts', 'V') IS NULL
      EXEC('CREATE VIEW dbo.vw_report_shifts AS SELECT 1 AS placeholder');
    EXEC('
      ALTER VIEW dbo.vw_report_shifts
      AS
      SELECT
        sh.id AS shift_id,
        sh.name AS shift_name,
        sh.start_time,
        sh.end_time,
        sh.line_id,
        l.description AS line_description,
        sh.station_id,
        s.description AS station_description,
        sh.created_at,
        sh.updated_at
      FROM dbo.shifts sh
      LEFT JOIN dbo.lines l ON l.id = sh.line_id
      LEFT JOIN dbo.stations s ON s.id = sh.station_id
    ');
  `);

  await query(`
    IF OBJECT_ID('dbo.vw_report_shift_assignments', 'V') IS NULL
      EXEC('CREATE VIEW dbo.vw_report_shift_assignments AS SELECT 1 AS placeholder');
    EXEC('
      ALTER VIEW dbo.vw_report_shift_assignments
      AS
      WITH latest AS (
        SELECT
          sa.id,
          sa.shift_id,
          sa.target_type,
          sa.target_id,
          sa.line_id,
          sa.station_id,
          sa.created_at,
          ROW_NUMBER() OVER (
            PARTITION BY sa.shift_id, sa.target_type, sa.target_id
            ORDER BY sa.id DESC
          ) AS rn
        FROM dbo.shift_assignments sa
        WHERE sa.shift_id IS NOT NULL
          AND sa.target_type IN (''line'', ''station'')
          AND sa.target_id IS NOT NULL
      )
      SELECT
        sa.id AS assignment_id,
        sa.shift_id,
        sh.name AS shift_name,
        sa.target_type,
        sa.target_id,
        sa.line_id,
        l.description AS line_description,
        sa.station_id,
        s.description AS station_description,
        sa.created_at
      FROM latest sa
      LEFT JOIN dbo.shifts sh ON sh.id = sa.shift_id
      LEFT JOIN dbo.lines l ON l.id = sa.line_id
      LEFT JOIN dbo.stations s ON s.id = sa.station_id
      WHERE sa.rn = 1
    ');
  `);

  await query(`
    IF OBJECT_ID('dbo.vw_report_masterdata_templates', 'V') IS NULL
      EXEC('CREATE VIEW dbo.vw_report_masterdata_templates AS SELECT 1 AS placeholder');
    EXEC('
      ALTER VIEW dbo.vw_report_masterdata_templates
      AS
      SELECT
        t.id,
        t.plant,
        t.template_name,
        t.created_by,
        t.created_at,
        t.updated_at
      FROM dbo.masterdata_templates t
    ');
  `);

  await query(`
    IF OBJECT_ID('dbo.vw_report_sql_integrity', 'V') IS NULL
      EXEC('CREATE VIEW dbo.vw_report_sql_integrity AS SELECT 1 AS placeholder');
    EXEC('
      ALTER VIEW dbo.vw_report_sql_integrity
      AS
      SELECT
        (SELECT COUNT(1) FROM dbo.shift_assignments sa WHERE sa.station_id IS NOT NULL AND sa.line_id IS NULL) AS stations_without_line,
        (SELECT COUNT(1) FROM dbo.shift_assignments sa WHERE sa.line_id IS NULL AND sa.station_id IS NULL) AS assignments_without_target,
        (SELECT COUNT(1)
         FROM dbo.shift_assignments sa
         WHERE
           (sa.target_type = ''line'' AND (sa.line_id IS NULL OR (sa.target_id IS NOT NULL AND sa.target_id <> sa.line_id)))
           OR
           (sa.target_type = ''station'' AND (sa.station_id IS NULL OR (sa.target_id IS NOT NULL AND sa.target_id <> sa.station_id)))) AS inconsistent_target_type
    ');
  `);
}

async function ensureSqlReportUserAccess() {
  if (isPostgresConnector) {
    dbLogger.info('sql.report_user.provisioning.skipped', {
      reason: 'postgres-connector-selected',
      note: 'SQL login/user provisioning is SQL Server specific.'
    });
    return;
  }

  const reportSqlUser = String(process.env.SQL_REPORT_USER || process.env.MSSQL_REPORT_USER || 'report').trim();
  const reportSqlPassword = String(process.env.SQL_REPORT_PASSWORD || process.env.MSSQL_REPORT_PASSWORD || 'report');

  if (!reportSqlUser) {
    return;
  }

  try {
    const escapedLogin = reportSqlUser.replace(/]/g, ']]');
    const escapedPassword = reportSqlPassword.replace(/'/g, "''");
    const views = [
      'vw_report_stations',
      'vw_report_lines',
      'vw_report_shifts',
      'vw_report_shift_assignments',
      'vw_report_masterdata_templates',
      'vw_report_sql_integrity'
    ];

    await query(`
      IF SUSER_ID('${escapedLogin}') IS NULL
      BEGIN
        DECLARE @createLogin NVARCHAR(MAX) = N'CREATE LOGIN [${escapedLogin}] WITH PASSWORD = ''${escapedPassword}'', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF';
        EXEC(@createLogin);
      END
    `);

    await query(`
      IF DATABASE_PRINCIPAL_ID('${escapedLogin}') IS NULL
      BEGIN
        DECLARE @createUser NVARCHAR(MAX) = N'CREATE USER [${escapedLogin}] FOR LOGIN [${escapedLogin}]';
        EXEC(@createUser);
      END
    `);

    for (const viewName of views) {
      await query(`
        DECLARE @grantSql NVARCHAR(MAX) = N'GRANT SELECT ON OBJECT::dbo.${viewName} TO [${escapedLogin}]';
        EXEC(@grantSql);
      `);
    }

    dbLogger.info('sql.report_user.provisioned', {
      user: reportSqlUser,
      mode: 'sql-login',
      viewsGranted: views
    });
  } catch (error) {
    dbLogger.info('sql.report_user.provisioning.skipped', {
      user: reportSqlUser,
      reason: 'insufficient-privileges-or-policy',
      errorMessage: error?.message || 'Unknown provisioning error'
    });
  }
}

async function initDbPostgres() {
  await query(`CREATE SCHEMA IF NOT EXISTS dbo;`);

  await query(`
    CREATE TABLE IF NOT EXISTS dbo.stations (
      id VARCHAR(255) PRIMARY KEY,
      description VARCHAR(500) NOT NULL,
      bottleneck BOOLEAN NOT NULL DEFAULT FALSE,
      is_last_station BOOLEAN NOT NULL DEFAULT FALSE,
      cycle_time DOUBLE PRECISION NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dbo.lines (
      id VARCHAR(255) PRIMARY KEY,
      description VARCHAR(500) NOT NULL,
      shape_type VARCHAR(50) NOT NULL DEFAULT 'I-shape',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dbo.shifts (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      start_time VARCHAR(100) NOT NULL,
      end_time VARCHAR(100) NOT NULL,
      line_id VARCHAR(255) NULL,
      station_id VARCHAR(255) NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dbo.shift_assignments (
      id BIGSERIAL PRIMARY KEY,
      shift_id VARCHAR(255) NULL,
      target_type VARCHAR(255) NULL,
      target_id VARCHAR(255) NULL,
      line_id VARCHAR(255) NULL,
      station_id VARCHAR(255) NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dbo.measurements (
      id BIGSERIAL PRIMARY KEY,
      measurement VARCHAR(255) NOT NULL,
      fields TEXT NOT NULL DEFAULT '{}',
      tags TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dbo.auth_users (
      username VARCHAR(255) PRIMARY KEY,
      password_hash VARCHAR(600) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      source VARCHAR(100) NOT NULL DEFAULT 'manual',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dbo.auth_user_permissions (
      username VARCHAR(255) NOT NULL,
      permission VARCHAR(120) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (username, permission)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dbo.masterdata_templates (
      id BIGSERIAL PRIMARY KEY,
      plant VARCHAR(255) NOT NULL,
      template_name VARCHAR(255) NOT NULL,
      payload TEXT NOT NULL,
      created_by VARCHAR(255) NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_masterdata_templates_plant_template_name
      ON dbo.masterdata_templates (plant, template_name);
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_auth_user_permissions_auth_users'
      ) THEN
        ALTER TABLE dbo.auth_user_permissions
          ADD CONSTRAINT fk_auth_user_permissions_auth_users
          FOREIGN KEY (username) REFERENCES dbo.auth_users(username) ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_shifts_lines') THEN
        ALTER TABLE dbo.shifts ADD CONSTRAINT fk_shifts_lines FOREIGN KEY (line_id) REFERENCES dbo.lines(id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_shifts_stations') THEN
        ALTER TABLE dbo.shifts ADD CONSTRAINT fk_shifts_stations FOREIGN KEY (station_id) REFERENCES dbo.stations(id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_shift_assignments_shifts') THEN
        ALTER TABLE dbo.shift_assignments ADD CONSTRAINT fk_shift_assignments_shifts FOREIGN KEY (shift_id) REFERENCES dbo.shifts(id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_shift_assignments_lines') THEN
        ALTER TABLE dbo.shift_assignments ADD CONSTRAINT fk_shift_assignments_lines FOREIGN KEY (line_id) REFERENCES dbo.lines(id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_shift_assignments_stations') THEN
        ALTER TABLE dbo.shift_assignments ADD CONSTRAINT fk_shift_assignments_stations FOREIGN KEY (station_id) REFERENCES dbo.stations(id);
      END IF;
    END $$;
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_shift_assignments_business_key
      ON dbo.shift_assignments (shift_id, target_type, target_id);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS ix_shifts_line_id ON dbo.shifts (line_id);
    CREATE INDEX IF NOT EXISTS ix_shifts_station_id ON dbo.shifts (station_id);
    CREATE INDEX IF NOT EXISTS ix_shift_assignments_line_id ON dbo.shift_assignments (line_id);
    CREATE INDEX IF NOT EXISTS ix_shift_assignments_station_id ON dbo.shift_assignments (station_id);
    CREATE INDEX IF NOT EXISTS ix_shift_assignments_shift_id ON dbo.shift_assignments (shift_id);
    CREATE INDEX IF NOT EXISTS ix_shift_assignments_target_type_target_id_shift_id ON dbo.shift_assignments (target_type, target_id, shift_id);
    CREATE INDEX IF NOT EXISTS ix_shift_assignments_shift_id_line_id_station_id ON dbo.shift_assignments (shift_id, line_id, station_id);
    CREATE INDEX IF NOT EXISTS ix_shift_assignments_created_at_desc ON dbo.shift_assignments (created_at DESC);
    CREATE INDEX IF NOT EXISTS ix_stations_bottleneck_cycle_id ON dbo.stations (bottleneck, cycle_time, id);
    CREATE INDEX IF NOT EXISTS ix_masterdata_templates_plant_updated ON dbo.masterdata_templates (plant, updated_at DESC);
    CREATE INDEX IF NOT EXISTS ix_measurements_measurement_id_desc ON dbo.measurements (measurement, id DESC);
  `);

  await ensureReportingViewsPostgres();
}

async function ensureReportingViewsPostgres() {
  await query(`
    CREATE OR REPLACE VIEW dbo.vw_report_stations AS
    SELECT
      s.id AS station_id,
      s.description AS station_description,
      s.bottleneck,
      s.is_last_station,
      s.cycle_time,
      s.created_at,
      s.updated_at
    FROM dbo.stations s;
  `);

  await query(`
    CREATE OR REPLACE VIEW dbo.vw_report_lines AS
    SELECT
      l.id AS line_id,
      l.description AS line_description,
      l.shape_type,
      l.created_at,
      l.updated_at
    FROM dbo.lines l;
  `);

  await query(`
    CREATE OR REPLACE VIEW dbo.vw_report_shifts AS
    SELECT
      sh.id AS shift_id,
      sh.name AS shift_name,
      sh.start_time,
      sh.end_time,
      sh.line_id,
      l.description AS line_description,
      sh.station_id,
      s.description AS station_description,
      sh.created_at,
      sh.updated_at
    FROM dbo.shifts sh
    LEFT JOIN dbo.lines l ON l.id = sh.line_id
    LEFT JOIN dbo.stations s ON s.id = sh.station_id;
  `);

  await query(`
    CREATE OR REPLACE VIEW dbo.vw_report_shift_assignments AS
    WITH latest AS (
      SELECT
        sa.id,
        sa.shift_id,
        sa.target_type,
        sa.target_id,
        sa.line_id,
        sa.station_id,
        sa.created_at,
        ROW_NUMBER() OVER (
          PARTITION BY sa.shift_id, sa.target_type, sa.target_id
          ORDER BY sa.id DESC
        ) AS rn
      FROM dbo.shift_assignments sa
      WHERE sa.shift_id IS NOT NULL
        AND sa.target_type IN ('line', 'station')
        AND sa.target_id IS NOT NULL
    )
    SELECT
      sa.id AS assignment_id,
      sa.shift_id,
      sh.name AS shift_name,
      sa.target_type,
      sa.target_id,
      sa.line_id,
      l.description AS line_description,
      sa.station_id,
      s.description AS station_description,
      sa.created_at
    FROM latest sa
    LEFT JOIN dbo.shifts sh ON sh.id = sa.shift_id
    LEFT JOIN dbo.lines l ON l.id = sa.line_id
    LEFT JOIN dbo.stations s ON s.id = sa.station_id
    WHERE sa.rn = 1;
  `);

  await query(`
    CREATE OR REPLACE VIEW dbo.vw_report_masterdata_templates AS
    SELECT
      t.id,
      t.plant,
      t.template_name,
      t.created_by,
      t.created_at,
      t.updated_at
    FROM dbo.masterdata_templates t;
  `);

  await query(`
    CREATE OR REPLACE VIEW dbo.vw_report_sql_integrity AS
    SELECT
      (SELECT COUNT(1) FROM dbo.shift_assignments sa WHERE sa.station_id IS NOT NULL AND sa.line_id IS NULL) AS stations_without_line,
      (SELECT COUNT(1) FROM dbo.shift_assignments sa WHERE sa.line_id IS NULL AND sa.station_id IS NULL) AS assignments_without_target,
      (SELECT COUNT(1)
       FROM dbo.shift_assignments sa
       WHERE
         (sa.target_type = 'line' AND (sa.line_id IS NULL OR (sa.target_id IS NOT NULL AND sa.target_id <> sa.line_id)))
         OR
         (sa.target_type = 'station' AND (sa.station_id IS NULL OR (sa.target_id IS NOT NULL AND sa.target_id <> sa.station_id)))) AS inconsistent_target_type;
  `);
}

async function getRelationalIntegrityReport() {
  const stationsWithoutLine = await query(`
    SELECT COUNT(1) AS count
    FROM dbo.shift_assignments sa
    WHERE sa.station_id IS NOT NULL AND sa.line_id IS NULL
  `);

  const assignmentsWithoutTarget = await query(`
    SELECT COUNT(1) AS count
    FROM dbo.shift_assignments sa
    WHERE sa.line_id IS NULL AND sa.station_id IS NULL
  `);

  const inconsistentTargetType = await query(`
    SELECT COUNT(1) AS count
    FROM dbo.shift_assignments sa
    WHERE
      (sa.target_type = 'line' AND (sa.line_id IS NULL OR (sa.target_id IS NOT NULL AND sa.target_id <> sa.line_id)))
      OR
      (sa.target_type = 'station' AND (sa.station_id IS NULL OR (sa.target_id IS NOT NULL AND sa.target_id <> sa.station_id)))
  `);

  return {
    stationsWithoutLine: Number(stationsWithoutLine.rows?.[0]?.count || 0),
    assignmentsWithoutTarget: Number(assignmentsWithoutTarget.rows?.[0]?.count || 0),
    inconsistentTargetType: Number(inconsistentTargetType.rows?.[0]?.count || 0)
  };
}

async function repairRelationalIntegrity() {
  const before = await getRelationalIntegrityReport();

  if (isPostgresConnector) {
    await query(`
      UPDATE dbo.shift_assignments AS sa
      SET line_id = s.line_id
      FROM dbo.shifts AS s
      WHERE s.id = sa.shift_id
        AND sa.station_id IS NOT NULL
        AND sa.line_id IS NULL
        AND s.line_id IS NOT NULL
    `);
  } else {
    await query(`
      UPDATE sa
      SET sa.line_id = s.line_id
      FROM dbo.shift_assignments sa
      INNER JOIN dbo.shifts s ON s.id = sa.shift_id
      WHERE sa.station_id IS NOT NULL
        AND sa.line_id IS NULL
        AND s.line_id IS NOT NULL
    `);
  }

  const after = await getRelationalIntegrityReport();

  return {
    before,
    after,
    repairedStationsWithoutLine: Math.max(0, before.stationsWithoutLine - after.stationsWithoutLine)
  };
}

async function writePoint(measurement, fields = {}, tags = {}) {
  try {
    if (measurement === 'station') {
      // Erst Update, dann Insert falls nicht existiert (ohne Batch/IF)
      // 1. UPDATE
      await query(
        `UPDATE dbo.stations SET description = $1, bottleneck = $2, is_last_station = $3, cycle_time = $4, updated_at = SYSUTCDATETIME() WHERE id = $5`,
        [
          fields.description,
          fields.bottleneck === true,
          fields.lastStation === true,
          fields.cycleTime != null ? Number(fields.cycleTime) : null,
          fields.id
        ]
      );
      // 2. SELECT
      const check = await query(`SELECT id FROM dbo.stations WHERE id = $1`, [fields.id]);
      // 3. INSERT falls nicht vorhanden
      if (!check.rows || check.rows.length === 0) {
        const now = new Date();
        await query(
          `INSERT INTO dbo.stations (id, description, bottleneck, is_last_station, cycle_time, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            fields.id,
            fields.description,
            fields.bottleneck === true,
            fields.lastStation === true,
            fields.cycleTime != null ? Number(fields.cycleTime) : null,
            now,
            new Date(now)
          ]
        );
      }
      return;
    }

    if (measurement === 'line') {
      const rawShape = String(fields.shapeType || '').trim().toLowerCase();
      const shapeAliasMap = {
        i: 'I-shape',
        'i-shape': 'I-shape',
        l: 'L-shape',
        'l-shape': 'L-shape',
        u: 'U-shape',
        'u-shape': 'U-shape',
        o: 'O-shape',
        'o-shape': 'O-shape',
        s: 'S-shape',
        's-shape': 'S-shape',
        t: 'T-shape',
        't-shape': 'T-shape',
        cell: 'Cell-shape',
        'cell-shape': 'Cell-shape',
        // Legacy aliases mapped to fixed allowed values.
        ring: 'O-shape',
        'ring-shape': 'O-shape',
        other: 'I-shape',
        'other-shape': 'I-shape'
      };
      const normalizedShapeType = shapeAliasMap[rawShape] || 'I-shape';
      // 1. UPDATE
      await query(
        `UPDATE dbo.lines SET description = $1, shape_type = $2, updated_at = SYSUTCDATETIME() WHERE id = $3`,
        [fields.description, normalizedShapeType, fields.id]
      );
      // 2. SELECT
      const check = await query(`SELECT id FROM dbo.lines WHERE id = $1`, [fields.id]);
      // 3. INSERT falls nicht vorhanden
      if (!check.rows || check.rows.length === 0) {
        const now = new Date();
        await query(
          `INSERT INTO dbo.lines (id, description, shape_type, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5)`,
          [fields.id, fields.description, normalizedShapeType, now, new Date(now)]
        );
      }
      return;
    }

    if (measurement === 'shift') {
      // 1. UPDATE
      await query(
        `UPDATE dbo.shifts SET name = $1, start_time = $2, end_time = $3, line_id = $4, station_id = $5, updated_at = SYSUTCDATETIME() WHERE id = $6`,
        [fields.name, fields.start, fields.end, fields.lineId || null, fields.stationId || null, fields.id]
      );
      // 2. SELECT
      const check = await query(`SELECT id FROM dbo.shifts WHERE id = $1`, [fields.id]);
      // 3. INSERT falls nicht vorhanden
      if (!check.rows || check.rows.length === 0) {
        const now = new Date();
        await query(
          `INSERT INTO dbo.shifts (id, name, start_time, end_time, line_id, station_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [fields.id, fields.name, fields.start, fields.end, fields.lineId || null, fields.stationId || null, now, new Date(now)]
        );
      }
      return;
    }

    if (measurement === 'shift_assignment') {
      const shiftId = String(fields.shiftId || '').trim();
      let targetType = String(fields.targetType || '').trim().toLowerCase() || null;
      let targetId = String(fields.targetId || '').trim() || null;
      const lineId = String(fields.lineId || '').trim() || (targetType === 'line' ? targetId : null) || null;
      const stationId = String(fields.stationId || '').trim() || (targetType === 'station' ? targetId : null) || null;

      const lineStationOnly = !shiftId && !!lineId && !!stationId;
      if (lineStationOnly) {
        targetType = 'station';
        targetId = stationId;
      }

      if (!lineStationOnly && (!shiftId || !targetType || !targetId)) {
        throw new Error('shift_assignment requires either (shiftId, targetType, targetId) or (lineId, stationId)');
      }
      if (targetType !== 'line' && targetType !== 'station') {
        throw new Error("shift_assignment targetType must be 'line' or 'station'");
      }
      if (targetType === 'line' && !lineId) {
        throw new Error('shift_assignment line target requires lineId');
      }
      if (targetType === 'station' && !stationId) {
        throw new Error('shift_assignment station target requires stationId');
      }

      await query(
        `
          UPDATE dbo.shift_assignments
          SET line_id = $1,
              station_id = $2
          WHERE (
              (shift_id = $3)
              OR ($3 IS NULL AND shift_id IS NULL)
            )
            AND target_type = $4
            AND target_id = $5
        `,
        [
          lineId,
          stationId,
          shiftId || null,
          targetType,
          targetId
        ]
      );

      try {
        await query(
          `
            INSERT INTO dbo.shift_assignments (shift_id, target_type, target_id, line_id, station_id)
            VALUES ($1, $2, $3, $4, $5)
          `,
          [
            shiftId || null,
            targetType,
            targetId,
            lineId,
            stationId
          ]
        );
      } catch (insertErr) {
        const message = String(insertErr?.message || '').toLowerCase();
        const code = String(insertErr?.code || '').trim();
        const duplicate = message.includes('duplicate key')
          || message.includes('cannot insert duplicate key row')
          || message.includes('violation of unique key constraint')
          || message.includes('doppelter schlüsselwert')
          || code === '23505';
        if (!duplicate) {
          throw insertErr;
        }

        await query(
          `
            UPDATE dbo.shift_assignments
            SET line_id = $1,
                station_id = $2
            WHERE (
                (shift_id = $3)
                OR ($3 IS NULL AND shift_id IS NULL)
              )
              AND target_type = $4
              AND target_id = $5
          `,
          [lineId, stationId, shiftId || null, targetType, targetId]
        );
      }
      return;
    }

    await query(
      `
        INSERT INTO dbo.measurements (measurement, fields, tags)
        VALUES ($1, $2, $3)
      `,
      [measurement, JSON.stringify(fields || {}), JSON.stringify(tags || {})]
    );
  } catch (err) {
    dbLogger.error('sql.writePoint.failed', {
      measurement,
      fieldKeys: Object.keys(fields || {}),
      tagKeys: Object.keys(tags || {}),
      error: err
    });
    throw err;
  }
}

async function testConnection() {
  try {
    await poolPromise;
    dbLogger.info('sql.connection.established');
  } catch (err) {
    dbLogger.error('sql.connection.failed', { error: err });
    throw err;
  }
}

module.exports = {
  writePoint,
  query,
  initDb,
  getRelationalIntegrityReport,
  repairRelationalIntegrity
};
