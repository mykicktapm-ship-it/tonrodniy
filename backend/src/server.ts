import http from 'http';
import { app } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { initWebSocketHub } from './ws';

const server = http.createServer(app);
initWebSocketHub(server);

server.listen(env.port, () => {
  logger.info({ port: env.port }, 'TONRODY backend listening');
});
