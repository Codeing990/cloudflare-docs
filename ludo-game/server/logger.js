const fs = require('fs');
const path = require('path');

const logDir = path.resolve(__dirname, '../logs');
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, 'server.log');

function log(level, message, meta = null) {
  const record = {
    time: new Date().toISOString(),
    level,
    message,
    meta
  };
  fs.appendFileSync(logFile, `${JSON.stringify(record)}\n`);
}

module.exports = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta)
};
