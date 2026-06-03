# Logging Policy

## Scope
This policy applies to API, SQL layer, and MQTT integration logs.

## Required Principles
- Use structured JSON logs for all runtime events.
- Every HTTP request must include a requestId.
- Log output must be available in English, Spanish, and Chinese.
- Select runtime log language via LOG_LANG (`en`, `es`, `zh`), default `en`.
- Never log secrets or credentials in clear text.
- Use consistent event names, for example http.request.start, sql.write.failed, mqtt.connected.

## Required Fields
- time
- level
- event
- message
- lang
- service
- requestId (for request-scoped events)

## Level Guidance
- debug: low-level diagnostic details
- info: normal lifecycle and request flow
- warn: degraded behavior, retries, non-critical problems
- error: failed operation
- fatal: unrecoverable process-level problem

## Security Rules
- Redact password, token, authorization, one-time code, and secret values.
- Do not log full payloads that may contain sensitive user or production data.
- Prefer key lists, counts, and IDs over full object dumps.

## Operations
- Keep request start/finish logging enabled in all environments.
- Keep startup logs for DB mode and integrity status.
- Keep MQTT connection state logs for connect, reconnect, close, and error.

## Review Checklist
- Are logs JSON-structured?
- Are event names consistent?
- Are messages available in en/es/zh and selected by LOG_LANG?
- Are secrets redacted?
- Is requestId present for API flow?
