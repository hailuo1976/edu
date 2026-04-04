import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { createApp } from './app';
import { logger } from './utils/logger';
import { config } from './config';

const app = createApp();
const PORT = config.port;

app.listen(PORT, () => {
  logger.info(`SmartEdu MVP 启动: http://localhost:${PORT}`);
  logger.info(`AI Provider: ${config.ai.provider}, Model: ${config.ai.model}`);
  logger.info(`API Key: ${config.ai.apiKey ? '已配置' : '未配置'}`);
});

export default app;
