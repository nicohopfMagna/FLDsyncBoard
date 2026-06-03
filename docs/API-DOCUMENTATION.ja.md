# API Documentation (Japanese)

> Auto-generated from API-DOCUMENTATION.md.
> Source of truth: the base documentation file listed above.
> Regenerate with: npm run docs:sync

## 1. Base Information
- Base URL: http://localhost:3000
- Prefix: /api
- Content type: application/json
- Auth: Bearer token from /api/auth/login, plus configured legacy options.
- Database backend: DB_CONNECTOR selects mssql or postgres.
- Docker PostgreSQL profile is supported using .env.postgres and compose profile postgres.

## 2. Authentication Endpoints
- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout
- GET /api/auth/status
- GET /api/auth/sessions

## 3. Admin User Management Endpoints
- GET /api/auth/users
- POST /api/auth/users
- PATCH /api/auth/users/:username
- POST /api/auth/users/:username/grant
- POST /api/auth/users/:username/revoke
- DELETE /api/auth/users/:username

## 4. Master Data Write Endpoints
- POST /api/station
- PATCH /api/station/:id
- DELETE /api/station/:id
- POST /api/line
- PATCH /api/line/:id
- DELETE /api/line/:id
- POST /api/shift
- PATCH /api/shift/:id
- DELETE /api/shift/:id
- POST /api/assign-shift
- GET /api/assign-shift
- PATCH /api/assign-shift/:id
- DELETE /api/assign-shift/:id

## 5. Master Data Read and MES Endpoints
- GET /api/stations
- GET /api/lines
- GET /api/shifts
- GET /api/stationSetting
- GET /api/time-events
- GET /api/shift-modells
- GET /api/shift-schedule
- GET /api/shift-data
- GET /api/lines/:lineId/stations
- GET /api/lines/:lineId/bottlenecks
- GET /api/lines/:lineId/bottleneck-cycle-time
- GET /api/stations/:stationId/cycle-time
- GET /api/lines/:lineId/mes-summary

## 6. Template Endpoints
- POST /api/masterdata-template
- GET /api/masterdata-templates
- GET /api/masterdata-templates/:id
- PATCH /api/masterdata-templates/:id/plant
- DELETE /api/masterdata-templates/:id

## 7. System Endpoints
- GET /api/sql-integrity
- POST /api/sql-integrity-repair
- POST /api/point

## 8. MQTT Explorer Endpoints
- GET /api/mqtt-explorer/status
- POST /api/mqtt-explorer/connect
- POST /api/mqtt-explorer/disconnect
- POST /api/mqtt-explorer/subscribe
- POST /api/mqtt-explorer/unsubscribe
- POST /api/mqtt-explorer/publish
- GET /api/mqtt-explorer/messages
- POST /api/mqtt-explorer/messages/clear

Contract highlights:
- Connect expects host, optional protocol and port, optional auth, TLS flags, and optional CA PEM.
- Subscribe and unsubscribe expect topic and optional qos (0..2).
- Publish expects topic, payload (string or JSON object), optional qos, and optional retain.
- Status and messages endpoints provide current explorer state and buffered incoming messages.

## 9. Important Contract Notes
- POST /api/masterdata-template requires plant, templateName, and payload object.
- PATCH and DELETE endpoints require existing IDs and write permissions.
- /api/shift-data supports timezone mode and lineId mode.
- Missing or invalid authorization returns 401 or 403 depending on permission state.
- If OTP policy is enabled, OTP_SHARED_SECRET must be configured, otherwise login is rejected.
- Default report login is available as username report with password report (override via API_REPORT_USER and API_REPORT_PASSWORD).
- Report access verification treats direct SQL login checks as optional by default; set SQL_REPORT_LOGIN_REQUIRED=true to make missing SQL logins fail strict mode.

## 10. SQL Reporting Views (for direct SQL statements)
The following read-oriented SQL views are available for report consumers:
- dbo.vw_report_stations
- dbo.vw_report_lines
- dbo.vw_report_shifts
- dbo.vw_report_shift_assignments
- dbo.vw_report_masterdata_templates
- dbo.vw_report_sql_integrity
- Startup grants view access through role report_view_readers and then attempts SQL login/user provisioning for SQL_REPORT_USER.
- If SQL login creation is blocked by SQL policy/permissions, the API remains operational and logs sql.report_user.login_path.skipped.

## 11. Error and Response Patterns
- Success responses commonly return status: ok and optional entity payload.
- Validation failures return status 400 with error message.
- Not found paths or entities return status 404.
- Server failures return status 500 with error details.

## 12. Language Quick Guide
### German (de)
Die API trennt Authentifizierung, Stammdaten, MES-Leselogik und System-Checks. Schreiboperationen brauchen passende Berechtigungen.

### English (en)
The API separates authentication, master data CRUD, MES read logic, and system health operations. Write operations require permissions.

### Spanish (es)
La API separa autenticacion, CRUD de datos maestros, logica MES de lectura y operaciones de salud del sistema. Las escrituras requieren permisos.

### French (fr)
L API separe authentification, CRUD des donnees de base, logique MES en lecture et operations de sante systeme. Les ecritures exigent des permissions.

### Chinese (zh)
该 API 将认证、主数据 CRUD、MES 读取逻辑和系统健康操作分离。写操作需要权限。

## 13. Extended Language Glossary
- pt: Autenticacao, CRUD, Endpoint, Permissao.
- ru: Аутентификация, CRUD, Эндпоинт, Разрешение.
- ja: 認証, CRUD, エンドポイント, 権限.
- ko: 인증, CRUD, 엔드포인트, 권한.
- it: Autenticazione, CRUD, Endpoint, Permesso.
- tr: Kimlik dogrulama, CRUD, Uc nokta, Yetki.
- sk: Autentifikacia, CRUD, Endpoint, Opravnenie.
- hu: Hitelesites, CRUD, Vegpont, Jogosultsag.
- hi: प्रमाणीकरण, CRUD, एंडपॉइंट, अनुमति.
