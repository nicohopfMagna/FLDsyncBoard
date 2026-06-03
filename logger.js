const crypto = require('crypto');

const DEFAULT_REDACT_KEYS = new Set([
  'password',
  'passwordHash',
  'authorization',
  'token',
  'accessToken',
  'refreshToken',
  'oneTimeCode',
  'otp',
  'secret'
]);

const LOG_MESSAGES = {
  en: {
    'http.request.start': 'HTTP request started',
    'http.request.finish': 'HTTP request finished',
    'station.create.failed': 'Station creation failed',
    'line.create.failed': 'Line creation failed',
    'shift.create.failed': 'Shift creation failed',
    'sql.integrity.auto_repair.applied': 'Relational integrity auto-repair applied',
    'sql.integrity.status': 'Relational integrity status',
    'server.started': 'Server started',
    'db.initialization.failed': 'Database initialization failed',
    'server.degraded_mode.enabled': 'Server started in degraded mode',
    'server.started.degraded': 'Server started without database connection',
    'process.unhandled_rejection': 'Unhandled promise rejection',
    'process.uncaught_exception': 'Uncaught exception',
    'sql.writePoint.failed': 'writePoint operation failed',
    'sql.test_insert.success': 'SQL test insert succeeded',
    'sql.test_insert.failed': 'SQL test insert failed',
    'sql.connection.established': 'Database connection established',
    'sql.connection.failed': 'Database connection failed',
    'mqtt.connected': 'MQTT connected',
    'mqtt.reconnecting': 'MQTT reconnecting',
    'mqtt.offline': 'MQTT offline',
    'mqtt.closed': 'MQTT connection closed',
    'mqtt.error': 'MQTT error',
    'mqtt.publish.failed': 'MQTT publish failed'
  },
  es: {
    'http.request.start': 'Solicitud HTTP iniciada',
    'http.request.finish': 'Solicitud HTTP finalizada',
    'station.create.failed': 'Fallo al crear estacion',
    'line.create.failed': 'Fallo al crear linea',
    'shift.create.failed': 'Fallo al crear turno',
    'sql.integrity.auto_repair.applied': 'Reparacion automatica de integridad relacional aplicada',
    'sql.integrity.status': 'Estado de integridad relacional',
    'server.started': 'Servidor iniciado',
    'db.initialization.failed': 'Fallo en la inicializacion de base de datos',
    'server.degraded_mode.enabled': 'Servidor iniciado en modo degradado',
    'server.started.degraded': 'Servidor iniciado sin conexion de base de datos',
    'process.unhandled_rejection': 'Rechazo de promesa no controlado',
    'process.uncaught_exception': 'Excepcion no capturada',
    'sql.writePoint.failed': 'Operacion writePoint fallida',
    'sql.test_insert.success': 'Insercion de prueba SQL exitosa',
    'sql.test_insert.failed': 'Insercion de prueba SQL fallida',
    'sql.connection.established': 'Conexion de base de datos establecida',
    'sql.connection.failed': 'Conexion de base de datos fallida',
    'mqtt.connected': 'MQTT conectado',
    'mqtt.reconnecting': 'MQTT reconectando',
    'mqtt.offline': 'MQTT sin conexion',
    'mqtt.closed': 'Conexion MQTT cerrada',
    'mqtt.error': 'Error de MQTT',
    'mqtt.publish.failed': 'Fallo al publicar en MQTT'
  },
  zh: {
    'http.request.start': 'HTTP 请求已开始',
    'http.request.finish': 'HTTP 请求已完成',
    'station.create.failed': '创建工位失败',
    'line.create.failed': '创建产线失败',
    'shift.create.failed': '创建班次失败',
    'sql.integrity.auto_repair.applied': '已应用关系完整性自动修复',
    'sql.integrity.status': '关系完整性状态',
    'server.started': '服务器已启动',
    'db.initialization.failed': '数据库初始化失败',
    'server.degraded_mode.enabled': '服务器以降级模式启动',
    'server.started.degraded': '服务器已启动（无数据库连接）',
    'process.unhandled_rejection': '未处理的 Promise 拒绝',
    'process.uncaught_exception': '未捕获异常',
    'sql.writePoint.failed': 'writePoint 操作失败',
    'sql.test_insert.success': 'SQL 测试插入成功',
    'sql.test_insert.failed': 'SQL 测试插入失败',
    'sql.connection.established': '数据库连接已建立',
    'sql.connection.failed': '数据库连接失败',
    'mqtt.connected': 'MQTT 已连接',
    'mqtt.reconnecting': 'MQTT 正在重连',
    'mqtt.offline': 'MQTT 离线',
    'mqtt.closed': 'MQTT 连接已关闭',
    'mqtt.error': 'MQTT 错误',
    'mqtt.publish.failed': 'MQTT 发布失败'
  }
};

function normalizeLogLanguage(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return 'en';
  if (raw === 'en' || raw.startsWith('en-')) return 'en';
  if (raw === 'es' || raw.startsWith('es-')) return 'es';
  if (raw === 'zh' || raw.startsWith('zh-') || raw === 'cn') return 'zh';
  return 'en';
}

const LOG_LANGUAGE = normalizeLogLanguage(process.env.LOG_LANG);

function translateMessage(eventName) {
  const key = String(eventName || '').trim();
  if (!key) return '';
  return LOG_MESSAGES[LOG_LANGUAGE]?.[key] || LOG_MESSAGES.en[key] || key;
}

function redactValue(value, parentKey) {
  if (value == null) return value;

  const key = String(parentKey || '').toLowerCase();
  if (DEFAULT_REDACT_KEYS.has(key)) {
    return '[REDACTED]';
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (typeof value === 'object') {
    const next = {};
    for (const [k, v] of Object.entries(value)) {
      next[k] = redactValue(v, k);
    }
    return next;
  }

  return value;
}

function createLogger(base = {}) {
  function write(level, event, meta = {}) {
    const payload = {
      time: new Date().toISOString(),
      level,
      event,
      message: translateMessage(event),
      lang: LOG_LANGUAGE,
      ...base,
      ...redactValue(meta)
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }

  return {
    child(extra = {}) {
      return createLogger({ ...base, ...extra });
    },
    debug(message, meta) {
      write('debug', message, meta);
    },
    info(message, meta) {
      write('info', message, meta);
    },
    warn(message, meta) {
      write('warn', message, meta);
    },
    error(message, meta) {
      write('error', message, meta);
    },
    fatal(message, meta) {
      write('fatal', message, meta);
    }
  };
}

function createRequestLogger(logger) {
  return function requestLogger(req, res, next) {
    const requestId = req.get('x-request-id') || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const started = process.hrtime.bigint();
    logger.info('http.request.start', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent') || null
    });

    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      logger.info('http.request.finish', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round(elapsedMs * 1000) / 1000,
        user: req.auth?.user || null
      });
    });

    next();
  };
}

module.exports = {
  createLogger,
  createRequestLogger
};
