import cors from 'cors';
import express from 'express';
import type { Request } from 'express';
import { env } from './config/env';
import { healthRouter } from './routes/health';
import { lobbiesRouter } from './routes/lobbies';
import { roundsRouter } from './routes/rounds';
import { usersRouter } from './routes/users';
import { tonWebhookRouter } from './routes/tonWebhookRoutes';

const app = express();

const corsOptions = env.corsOrigins.length
  ? {
      origin: env.corsOrigins,
      credentials: true
    }
  : undefined;

app.use(cors(corsOptions));
app.use(
  express.json({
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      if (buf?.length) {
        req.rawBody = Buffer.from(buf);
      }
    }
  })
);

app.get('/', (_req, res) => {
  res.json({ service: 'tonrody-backend', status: 'online' });
});

app.use('/healthz', healthRouter);
app.use('/lobbies', lobbiesRouter);
app.use('/users', usersRouter);
app.use('/rounds', roundsRouter);
app.use('/ton', tonWebhookRouter);

export { app };
