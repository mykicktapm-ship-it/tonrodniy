import { Router } from 'express';
import { databaseHealth } from '../db/supabase';
import { checkTonRpcHealth } from '../services/tonClient';
import { isWebSocketHealthy } from '../ws';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const [dbOk, tonRpcOk] = await Promise.all([databaseHealth(), checkTonRpcHealth()]);
  const wsOk = isWebSocketHealthy();
  const healthy = dbOk && tonRpcOk && wsOk;
  res.json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    db_ok: dbOk,
    ton_rpc_ok: tonRpcOk,
    ws_ok: wsOk
  });
});
