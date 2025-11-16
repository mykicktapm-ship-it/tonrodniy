import { Router } from 'express';
import { findRound, listRounds } from '../data';

export const roundsRouter = Router();

roundsRouter.get('/', (_req, res) => {
  res.json({ rounds: listRounds() });
});

roundsRouter.get('/:id', (req, res) => {
  const round = findRound(req.params.id);
  if (!round) {
    return res.status(404).json({ error: 'Round not found' });
  }
  res.json({ round });
});
