# SQL Database Documentation (Spanish)

> Auto-generated from SQL-DATABASE-DOCUMENTATION.md.
> Source of truth: the base documentation file listed above.
> Regenerate with: npm run docs:sync

## 1. Database Platform
- Supported engines: Microsoft SQL Server and PostgreSQL
- Connector switch: DB_CONNECTOR=mssql or DB_CONNECTOR=postgres
- Access layer: mssql (with msnodesqlv8 optional driver) and pg in sql-db.js

Connector-specific runtime variables:
- MSSQL: MSSQL_SERVER, MSSQL_PORT, MSSQL_DATABASE, MSSQL_USER, MSSQL_PASSWORD, MSSQL_CONNECTION_STRING
- PostgreSQL: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DATABASE, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_CONNECTION_STRING

Docker PostgreSQL profile:
- Use .env.postgres as env file and run docker compose with profile postgres.
- Profile starts app + postgres service and uses POSTGRES_HOST=postgres.
- In this profile, set DB_CONNECTOR=postgres.

## 2. Schema Initialization
Tables are created or evolved during startup by initDb in sql-db.js.

## 3. Main Tables
- dbo.stations: station master records, bottleneck flag, cycle time.
- dbo.lines: line master records.
- dbo.shifts: shift definitions with optional line and station references.
- dbo.shift_assignments: assignment links between shifts and line or station targets.
- dbo.measurements: technical measurement records with fields and tags JSON.
- dbo.auth_users: local auth user accounts and status.
- dbo.auth_user_permissions: per-user permissions.
- dbo.masterdata_templates: stored template snapshots by plant and name.

## 4. Key Relations
- shifts.line_id -> lines.id
- shifts.station_id -> stations.id
- shift_assignments.shift_id -> shifts.id
- shift_assignments.line_id -> lines.id
- shift_assignments.station_id -> stations.id
- auth_user_permissions.username -> auth_users.username

## 5. Data Integrity Logic
- Startup includes relational integrity checks.
- Auto-repair can fill or correct assignment references.
- Manual repair endpoint: POST /api/sql-integrity-repair.
- Integrity report endpoint: GET /api/sql-integrity.

## 6. Write Strategy
- Stations, lines, and shifts use update-then-insert behavior.
- Shift assignments are inserted as event-style rows, with derived target references.
- Masterdata templates support upsert by plant and template name.

## 7. Operational Notes
- If routes exist in code but 404 appears, confirm no stale process occupies port 3000.
- Restart node server.js after backend route changes.
- Keep payload values language-stable for DB consistency across UI locales.
- PostgreSQL mode requires DB_CONNECTOR=postgres and valid POSTGRES_* credentials.
- MSSQL mode requires DB_CONNECTOR=mssql and valid MSSQL_* credentials.
- MQTT Explorer API and UI features are runtime-only and do not add or modify SQL tables.

## 8. Reporting Views and Report SQL User
- Startup creates or updates dedicated reporting views for read-heavy consumers.
- Startup grants reporting view access to database role report_view_readers.
- Default SQL report credentials are report/report (override with SQL_REPORT_USER and SQL_REPORT_PASSWORD).
- In MSSQL mode, startup attempts SQL login/user provisioning and role membership for SQL_REPORT_USER.
- In PostgreSQL mode, report-user provisioning follows PostgreSQL-specific role/user logic in sql-db.js.
- If SQL Server policy/permissions do not allow login creation, role grant provisioning remains active and login path is logged as sql.report_user.login_path.skipped.
- For verification scripts, direct SQL login checks are optional unless SQL_REPORT_LOGIN_REQUIRED=true is set.

Reporting views:
- dbo.vw_report_stations
- dbo.vw_report_lines
- dbo.vw_report_shifts
- dbo.vw_report_shift_assignments
- dbo.vw_report_masterdata_templates
- dbo.vw_report_sql_integrity

Example report queries:
- SELECT TOP (100) * FROM dbo.vw_report_stations ORDER BY station_id;
- SELECT TOP (100) * FROM dbo.vw_report_shifts ORDER BY shift_id;
- SELECT TOP (100) * FROM dbo.vw_report_shift_assignments ORDER BY assignment_id DESC;
- SELECT * FROM dbo.vw_report_sql_integrity;

## 9. Language Quick Guide
### German (de)
Die SQL-Datenbank speichert Stammdaten, Schichten, Zuweisungen, Messwerte, Benutzerrechte und Vorlagen. Integritaetspruefung und Reparatur laufen automatisch beim Start und optional manuell per API.

### English (en)
The SQL database stores master data, shifts, assignments, measurements, user permissions, and templates. Integrity checks and optional repairs are available via startup and API.

### Spanish (es)
La base SQL guarda datos maestros, turnos, asignaciones, mediciones, permisos y plantillas. Existen comprobaciones y reparaciones de integridad al inicio y por API.

### French (fr)
La base SQL stocke donnees de base, postes, affectations, mesures, permissions et modeles. Les controles et reparations d integrite sont disponibles au demarrage et par API.

### Chinese (zh)
SQL 数据库存储主数据、班次、分配、测量、权限和模板。系统支持启动时与 API 触发的完整性检查和修复。

## 10. Extended Language Glossary
- pt: Banco SQL, Tabelas, Integridade, Reparo.
- ru: SQL база, Таблицы, Целостность, Восстановление.
- ja: SQLデータベース, テーブル, 整合性, 修復.
- ko: SQL 데이터베이스, 테이블, 무결성, 복구.
- it: Database SQL, Tabelle, Integrita, Riparazione.
- tr: SQL veritabani, Tablolar, Butunluk, Onarim.
- sk: SQL databaza, Tabulky, Integrita, Oprava.
- hu: SQL adatbazis, Tablak, Integritas, Javitas.
- hi: SQL डेटाबेस, तालिकाएं, इंटीग्रिटी, रिपेयर.
