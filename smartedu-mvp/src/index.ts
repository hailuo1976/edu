import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import courseRoutes from './api/course';
import { Writable } from 'stream';

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, `smartedu_${formatDate(new Date())}.log`);

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatTime(date: Date): string {
  return date.toISOString();
}

function writeToFile(message: string) {
  try {
    fs.appendFileSync(LOG_FILE, message + '\n', 'utf-8');
  } catch (e) {
    originalConsoleError('Failed to write to log file:', e);
  }
}

function logWithTimestamp(level: string, message: string): string {
  return `[${formatTime(new Date())}] [${level}] ${message}`;
}

console.log = (...args: any[]) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  originalConsoleLog.apply(console, args);
  writeToFile(logWithTimestamp('INFO', msg));
};

console.error = (...args: any[]) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  originalConsoleError.apply(console, args);
  writeToFile(logWithTimestamp('ERROR', msg));
};

console.warn = (...args: any[]) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  originalConsoleWarn.apply(console, args);
  writeToFile(logWithTimestamp('WARN', msg));
};

const logger = {
  info: (msg: string, ...args: any[]) => {
    const fullMsg = args.length > 0 ? `${msg} ${JSON.stringify(args)}` : msg;
    originalConsoleLog(msg, ...args);
    writeToFile(logWithTimestamp('INFO', fullMsg));
  },
  error: (msg: string, ...args: any[]) => {
    const fullMsg = args.length > 0 ? `${msg} ${JSON.stringify(args)}` : msg;
    originalConsoleError(msg, ...args);
    writeToFile(logWithTimestamp('ERROR', fullMsg));
  },
  warn: (msg: string, ...args: any[]) => {
    const fullMsg = args.length > 0 ? `${msg} ${JSON.stringify(args)}` : msg;
    originalConsoleWarn(msg, ...args);
    writeToFile(logWithTimestamp('WARN', fullMsg));
  },
  debug: (msg: string, ...args: any[]) => {
    const fullMsg = args.length > 0 ? `${msg} ${JSON.stringify(args)}` : msg;
    writeToFile(logWithTimestamp('DEBUG', fullMsg));
  },
};

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/course', courseRoutes);

const webPath = path.join(__dirname, '..', 'web');
app.use(express.static(webPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(webPath, 'index.html'));
});

app.get('/web', (req, res) => {
  res.sendFile(path.join(webPath, 'index.html'));
});

app.get('/api', (req, res) => {
  res.json({
    name: 'SmartEdu MVP API',
    version: '1.0.0',
    description: 'OpenCode课程生成验证',
    webUrl: `http://localhost:${PORT}/web`,
    logFile: LOG_FILE,
    endpoints: {
      'POST /api/course/generate': '生成课程',
      'GET /api/course/list': '列出所有课程',
      'GET /api/course/:courseId': '获取课程',
      'GET /api/course/health': '健康检查',
    },
  });
});

logger.info('========================================');
logger.info('SmartEdu MVP 服务启动');
logger.info(`日志文件: ${LOG_FILE}`);
logger.info(`API Key: ${process.env.OPENCODE_API_KEY ? '已配置' : '未配置'}`);
logger.info('========================================');

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║     SmartEdu MVP 智能教育辅助系统                         ║
║                                                          ║
║     服务器已启动: http://localhost:${PORT}                   ║
║     Web界面:       http://localhost:${PORT}/web             ║
║     日志文件:      ${LOG_FILE.split('/').pop()}              ║
║                                                          ║
║     API Endpoints:                                       ║
║     • POST /api/course/generate  - 生成课程              ║
║     • GET  /api/course/list     - 列出课程               ║
║     • GET  /api/course/:id      - 获取课程               ║
║     • GET  /api/course/health   - 健康检查               ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});

export default app;
