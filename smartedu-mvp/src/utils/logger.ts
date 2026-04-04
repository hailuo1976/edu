import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogFile(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `smartedu_${date}.log`);
}

function formatEntry(level: string, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level}] ${message}`;
}

function writeToFile(entry: string): void {
  try {
    ensureLogDir();
    fs.appendFileSync(getLogFile(), entry + '\n', 'utf-8');
  } catch {}
}

export interface Logger {
  info(msg: string, ...args: any[]): void;
  warn(msg: string, ...args: any[]): void;
  error(msg: string, ...args: any[]): void;
  debug(msg: string, ...args: any[]): void;
}

function createLogger(prefix: string): Logger {
  const fmt = (level: string, msg: string, args: any[]) => {
    const full = args.length > 0 ? `${msg} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}` : msg;
    writeToFile(formatEntry(level, `[${prefix}] ${full}`));
  };

  return {
    info(msg, ...args) { fmt('INFO', msg, args); console.log(`[${prefix}] ${msg}`, ...args); },
    warn(msg, ...args) { fmt('WARN', msg, args); console.warn(`[${prefix}] ${msg}`, ...args); },
    error(msg, ...args) { fmt('ERROR', msg, args); console.error(`[${prefix}] ${msg}`, ...args); },
    debug(msg, ...args) { fmt('DEBUG', msg, args); },
  };
}

export const logger = createLogger('App');

/** 创建子 logger */
export function createChildLogger(prefix: string): Logger {
  return createLogger(prefix);
}
