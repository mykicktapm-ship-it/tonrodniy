import http from 'http';
import { app } from './app';
import { env } from './config/env';
import { initWebSocketHub } from './ws';

const server = http.createServer(app);
initWebSocketHub(server);

server.listen(env.port, () => {
  console.log(`TONRODY backend listening on port ${env.port}`);
});
