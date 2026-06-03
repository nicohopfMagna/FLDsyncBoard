# Web Application Documentation (Hindi)

> Auto-generated from WEBAPP-DOCUMENTATION.md.
> Source of truth: the base documentation file listed above.
> Regenerate with: npm run docs:sync

## 1. Purpose
FLD-SyncBoard is a browser-based MES-oriented web application for master data maintenance, shift assignment handling, API testing, and SQL integrity operations.

## 2. Runtime Architecture
- Frontend: static HTML + JavaScript in index.html and script.js.
- Backend: Express API in server.js.
- Database: Microsoft SQL Server or PostgreSQL via sql-db.js (selected by DB_CONNECTOR).
- Messaging: MQTT publishing for master data changes.

Runtime profiles:
- Default local profile can run with MSSQL or PostgreSQL based on environment variables.
- Docker PostgreSQL profile runs app + postgres service with DB_CONNECTOR=postgres.

## 3. Main UI Areas
- Section 1: Plant master data template catalog.
- Section 2: Stations, lines, and station-line assignments.
- Section 3: Time events.
- Section 4: Shift models.
- Section 5: Shift schedules and assignment targets.
- Section 6: API query simulator, API catalog tester, and MQTT Explorer controls.
- Auth panel: login, token refresh, logout, and admin user management.

## 4. Core User Flows
- Login with local or configured auth provider.
- Maintain stations, lines, shifts, and shift assignments.
- Save imported or edited structures to SQL.
- Run SQL integrity check and repair from the UI.
- Use API catalog tester with selectable input and output fields.
- Use MQTT Explorer to connect with protocol/host/port/TLS settings, subscribe to topics, and publish payloads.
- Import and export broker CA certificates in MQTT Explorer (for example magna_global_fullchain.pem); import accepts only .pem files.
- A quick action Load magna_global_fullchain.pem is available and falls back to manual .pem selection when browser preselection is not supported.
- Build payloads with variable placeholders and optional JSON parsing before publish.
- Export and import Excel-based data packages.

## 5. Language Behavior
- UI texts are translated via I18N dictionaries in script.js.
- Database values and Excel payload values stay language-stable.
- Language switching updates labels, helper texts, and dynamic API tester captions.

## 6. Security and Permissions
- API access requires Authorization header except selected auth bootstrap routes.
- Permission model distinguishes read, write, health, repair, and user management operations.
- Admin panel operations require admin permission scope.

## 7. Frontend Files
- index.html: page layout and controls.
- script.js: i18n, rendering, API tester logic, MQTT explorer logic, data import and export logic.
- FileSaver.min.js and xlsx.full.min.js: browser-side export/import support.

## 8. Reporting Access for Read-Only Consumers
- API report account is created by default with username report and password report.
- The report account is read-focused and can be used for API-based dashboards and query tooling.
- In addition to API reads, SQL reporting views are provisioned to support direct SQL statements.

Typical SQL reporting views:
- dbo.vw_report_stations
- dbo.vw_report_lines
- dbo.vw_report_shifts
- dbo.vw_report_shift_assignments
- dbo.vw_report_masterdata_templates
- dbo.vw_report_sql_integrity

## 9. Language Quick Guide
### German (de)
Diese Webanwendung dient der Pflege von Stammdaten, Schichtmodellen, Schichtzuweisungen und API-Tests. Die Oberflaeche ist mehrsprachig, waehrend Datenbank- und Excel-Werte sprachstabil bleiben.

### English (en)
This web app manages master data, shift models, shift assignments, and API testing workflows. UI text is localized while DB and Excel values remain stable.

### Spanish (es)
Esta aplicacion web gestiona datos maestros, modelos de turno, asignaciones y pruebas de API. Los textos de interfaz se traducen, pero los valores en BD y Excel permanecen estables.

### French (fr)
Cette application web gere les donnees de base, les modeles d equipe, les affectations et les tests API. L interface est traduite, mais les valeurs BD et Excel restent stables.

### Chinese (zh)
该 Web 应用用于维护主数据、班次模型、班次分配和 API 测试。界面文本可本地化，数据库与 Excel 数值保持稳定不变。

## 10. Extended Language Glossary
- pt: Aplicacao Web, Dados Mestres, Modelo de Turno, Integridade SQL.
- ru: Веб-приложение, Основные данные, Модели смен, Целостность SQL.
- ja: Webアプリ, マスタデータ, シフトモデル, SQL整合性.
- ko: 웹 애플리케이션, 기준 데이터, 교대 모델, SQL 무결성.
- it: Applicazione Web, Dati master, Modelli turno, Integrita SQL.
- tr: Web uygulamasi, Ana veriler, Vardiya modelleri, SQL butunlugu.
- sk: Web aplikacia, Kmenove data, Modely zmien, SQL integrita.
- hu: Webalkalmazas, Torzsadatok, Muszakmodellek, SQL integritas.
- hi: वेब एप्लिकेशन, मास्टर डेटा, शिफ्ट मॉडल, SQL इंटीग्रिटी.
