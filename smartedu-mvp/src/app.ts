import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { logger } from './utils/logger';
import courseRoutes from './api/course';
import adjustmentRoutes from './api/adjustment';

export function createApp() {
  const app = express();

  // 中间件
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 请求日志
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  // API 路由
  app.use('/api/course', courseRoutes);
  app.use('/api/adjustment', adjustmentRoutes);

  // 静态文件
  const webPath = path.join(__dirname, '..', 'web');
  app.use(express.static(webPath));

  app.get('/', (req, res) => res.sendFile(path.join(webPath, 'index.html')));
  app.get('/web', (req, res) => res.sendFile(path.join(webPath, 'index.html')));

  app.get('/api', (req, res) => {
    res.json({
      name: 'SmartEdu MVP API',
      version: '2.0.0',
      endpoints: {
        'POST /api/course/generate': '生成课程',
        'GET /api/course/list': '列出课程',
        'GET /api/course/:id': '获取课程',
        'GET /api/course/health': '健康检查',
        'POST /api/adjustment/adjust': '调整课件',
        'GET /api/adjustment/courses': '列出课件',
      },
    });
  });

  return app;
}
