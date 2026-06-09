# FLD-SyncBoard

This project is a Node.js-based server with MQTT integration and Microsoft SQL Server support. It includes scripts for integration testing, file saving, and Excel export. See script.js and server.js for main logic.

## Getting Started

1. Install dependencies:
   npm install
2. Start the server:
   node server.js

The server will run at http://localhost:3000

## Environment Variables

Configuration is environment-variable based. A template is available in `.env.example`.

Quick setup:
1. Create `.env` from `.env.example`.
2. Adjust SQL and auth values for your environment.
3. Start the app with `npm start`.

Important variables:
- App: `APP_PORT`, `PORT`, `LOG_LANG`
- Connector: `DB_CONNECTOR` (`mssql` or `postgres`)
- Auth: `AUTH_PROVIDER`, `API_ADMIN_USER`, `API_ADMIN_PASSWORD`, `API_TOKEN`
- SQL: `MSSQL_SERVER`, `MSSQL_DATABASE`, `MSSQL_USER`, `MSSQL_PASSWORD`, `MSSQL_CONNECTION_STRING`
- PostgreSQL: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DATABASE`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_CONNECTION_STRING`
- MQTT: `MQTT_ENABLED`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_PROTOCOL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_CA_FILE`

Notes:
- For Docker/Linux, use SQL login variables (`MSSQL_USER`/`MSSQL_PASSWORD`) and set `MSSQL_TRUSTED_CONNECTION=false`.
- If no MQTT CA file is present, startup continues and logs a warning when `MQTT_PROTOCOL=mqtts`.

## Docker Preparation

The repository includes:
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `.env.example`
- `.env.postgres.example`
- `.env.prod.postgres.example`

Prepare and run with Docker:
1. Create `.env` from `.env.example` and adjust values.
2. Build and start: `docker compose up --build`
3. Stop: `docker compose down`

By default the service is exposed on `http://localhost:3000`.

PostgreSQL compose profile:
1. Copy `.env.postgres.example` to `.env.postgres`.
2. Set your secrets (at least `POSTGRES_PASSWORD`, auth credentials, token).
3. Start app + PostgreSQL service:
   `ENV_FILE=.env.postgres docker compose --profile postgres up --build -d`

In this profile:
- `DB_CONNECTOR=postgres`
- `POSTGRES_HOST=postgres` (compose service name)

Production image with bundled PostgreSQL:
1. Copy `.env.prod.postgres.example` to `.env.prod.postgres`.
2. Replace all `CHANGE_ME_*` values.
3. Build and run in detached mode:
   `ENV_FILE=.env.prod.postgres docker compose --profile postgres up --build -d`

Optional explicit image naming:
- Set `DOCKER_IMAGE_NAME` and `DOCKER_IMAGE_TAG` in `.env.prod.postgres`.
- Compose will tag the built image as `${DOCKER_IMAGE_NAME}:${DOCKER_IMAGE_TAG}`.

One-click Windows scripts:
- Start dev profile: `start-dev.cmd`
- Stop dev profile: `stop-dev.cmd`
- Start prod profile: `start-prod.cmd`
- Stop prod profile: `stop-prod.cmd`
- Start postgres profile: `start-postgres.cmd`
- Stop postgres profile: `stop-postgres.cmd`
- Start prod + postgres profile: `start-prod-postgres.cmd`
- Stop prod + postgres profile: `stop-prod-postgres.cmd`

## Production Profile

Use `.env.prod.example` as hardened baseline for production-like runs.

Quick start:
1. Copy `.env.prod.example` to `.env.prod`.
2. Replace all `CHANGE_ME_*` values.
3. Start with Docker Compose and the production env file:
   `ENV_FILE=.env.prod docker compose up --build -d`

Notes:
- `API_AUTH_ALLOW_LEGACY=false` disables legacy bearer fallback.
- `MSSQL_ENCRYPT=true` and `MSSQL_TRUST_CERT=false` are set for stricter SQL transport security.
- Set `MQTT_ENABLED=false` if MQTT is not available in the target environment.

PowerShell script entry points (optional):
- `scripts/start-dev.ps1`
- `scripts/stop-dev.ps1`
- `scripts/start-prod.ps1`
- `scripts/stop-prod.ps1`
- `scripts/start-postgres.ps1`
- `scripts/stop-postgres.ps1`
- `scripts/start-prod-postgres.ps1`
- `scripts/stop-prod-postgres.ps1`

## Project Files
- server.js: Main server logic
- sql-db.js: Database connection and queries
- script.js: Client-side logic
- integration-test.js: Integration tests
- mqtt.js: MQTT client logic
- FileSaver.min.js, xlsx.full.min.js: Utility libraries

## Notes
- Ensure Microsoft SQL Server is accessible and configured for Windows authentication.
- See .github/copilot-instructions.md for agent setup and automation details.

## Documentation
- Web Application Documentation: docs/WEBAPP-DOCUMENTATION.md
- API Documentation: docs/API-DOCUMENTATION.md
- SQL Database Documentation: docs/SQL-DATABASE-DOCUMENTATION.md
- Multi-language documentation index: docs/DOCUMENTATION-INDEX.md
- Logging policy: docs/LOGGING-POLICY.md

## Auth API Contract
- Contract version field: `contractVersion` (current backend value: `2026-06-02`).
- Standard error envelope for auth endpoints:
   - `status`: `error`
   - `code`: machine-readable error code
   - `message` and `error`: human-readable message
   - `retryable`: indicates whether retrying can make sense
   - `details`: optional structured details
- Capability/state model:
   - Provider states: `ready`, `not-configured` (future-compatible: `checking`, `error`)
   - Entra OBO state: `ready`, `not-configured`

Common auth error codes:
- `AUTH_UNAUTHORIZED`
- `AUTH_ADMIN_PERMISSION_REQUIRED`
- `AUTH_INVALID_CREDENTIALS`
- `AUTH_OTP_INVALID`
- `AUTH_REFRESH_TOKEN_INVALID`
- `AUTH_REFRESH_TOKEN_EXPIRED`
- `ENTRA_ACCESS_TOKEN_REQUIRED`
- `ENTRA_ACCESS_TOKEN_INVALID`
- `ENTRA_OBO_SCOPE_REQUIRED`
- `ENTRA_OBO_ASSERTION_MISSING`

Primary endpoints using this contract:
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/entra/obo`
- `GET /api/auth/entra/config`
- `GET /api/auth/status`

## Logging Language
- Runtime log language can be selected with `LOG_LANG`.
- Supported values: `en`, `es`, `zh`.
- Default: `en`.

## Health Check Modes
- Clean mode (suppresses Node warning noise): `npm run check:health`
- Verbose mode (shows raw runtime warnings): `npm run check:health:verbose`

## CI Report Access Checks
- Default CI mode (strict API/view checks, SQL login optional): `npm run ci:report-access`
- Strict SQL login CI mode (fails when SQL login is missing): `npm run ci:report-access:strict-sql`
- GitHub workflow behavior:
   - Default job runs on push and pull_request.
   - Strict job runs on protected branches (`main`/`master`) and can be forced via workflow_dispatch input `strict_sql_login=true`.
- SQL login strictness can be toggled with `SQL_REPORT_LOGIN_REQUIRED=true`.

## API Latency Benchmark (Performance Bundle)
- Run local benchmark and create JSON/Markdown report files:
   - `npm run perf:api-latency`
- Run benchmark while auto-starting the server:
   - `npm run perf:api-latency:with-start`
- Recommended baseline run:
   - `node scripts/api-latency-report.js baseline 20`
- Recommended comparison run against a baseline file:
   - `node scripts/api-latency-report.js current 20 --compare reports/perf/<baseline-file>.json`

The script writes reports to `reports/perf/` and measures these API endpoints:
- `/api/fld/cycle-time-v1`
- `/api/fld/metadata-line-v1`
- `/api/fld/shift-schedule-v1`
- `/api/shift-schedule`
- `/api/uns/cycle-time`

The benchmark uses temporary `PERF_*` records and cleans them up after each run.

### Thresholds and Warning Mode
- Add a p95 budget (milliseconds):
   - `node scripts/api-latency-report.js current 20 --p95-budget-ms 25`
- Optional strict mode (fails command on p95 budget breach):
   - `node scripts/api-latency-report.js current 20 --p95-budget-ms 25 --strict-threshold`

If a p95 budget is provided, the report includes a threshold breach table with per-endpoint delta.

### Optional CI Job
- Workflow file: `.github/workflows/api-latency-report.yml`
- Default behavior: non-blocking (`continue-on-error: true`) reporting job.
- Enabled on push/PR only when `CI_ENABLE_API_LATENCY=true` is set in repository variables.
- Always available via manual dispatch (`workflow_dispatch`) with inputs:
   - `iterations`
   - `p95_budget_ms`
   - `strict_threshold`

Reports are uploaded as a workflow artifact named `api-latency-reports`.

## Reporting Access
- API report user (default fallback): username `report`, password `report`
- Current recommended report user in env profiles: `FLDSyncboardReport`
- Environment override (API login): `API_REPORT_USER`, `API_REPORT_PASSWORD`
- Optional report alias migration: `API_REPORT_USER_ALIASES` (for example `report`)
- Environment override (SQL login): `SQL_REPORT_USER`, `SQL_REPORT_PASSWORD`
- MSSQL alias env keys are also supported: `MSSQL_REPORT_USER`, `MSSQL_REPORT_PASSWORD`
- Strict SQL login requirement for verification scripts: `SQL_REPORT_LOGIN_REQUIRED=true`

## Local Role Defaults (Current Stage)
- `admin`: admin role with full permissions
- `serviceUserFLDNoderedDEN`: admin role with full permissions
- `FLDSyncboardReport`: user role with `masterdata.read`, `system.health`, `api.catalog.test`
- Optional legacy alias `report` can map to the same report password when configured via `API_REPORT_USER_ALIASES`.

Recommended hardening flags for production profiles:
- `API_AUTH_ALLOW_LEGACY=false`
- `API_ENFORCE_DEFAULT_ROLE_PERMISSIONS=false`
- `API_ENFORCE_DEFAULT_CREDENTIALS=false`
- `API_ENFORCE_REPORT_DEFAULTS=false`

Startup always provisions report view grants via role `report_view_readers` and attempts SQL login/user provisioning for `SQL_REPORT_USER`.
If SQL Server permissions do not allow login/user creation, startup keeps role grants and logs `sql.report_user.login_path.skipped` as a non-fatal warning.

Reporting views:
- `dbo.vw_report_stations`
- `dbo.vw_report_lines`
- `dbo.vw_report_shifts`
- `dbo.vw_report_shift_assignments`
- `dbo.vw_report_masterdata_templates`
- `dbo.vw_report_sql_integrity`

Example SQL statements (after provisioning):
- `SELECT TOP (100) * FROM dbo.vw_report_stations ORDER BY station_id;`
- `SELECT TOP (100) * FROM dbo.vw_report_shifts ORDER BY shift_id;`
- `SELECT TOP (100) * FROM dbo.vw_report_shift_assignments ORDER BY assignment_id DESC;`
- `SELECT * FROM dbo.vw_report_sql_integrity;`
