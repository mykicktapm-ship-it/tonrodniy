import { Router } from 'express';
import {
  findLobby,
  joinLobby as reserveSeat,
  listLobbies,
  payForSeat,
  finalizeRound,
  findUser
} from '../data';
import { broadcastLobbyEvent } from '../ws';

export const lobbiesRouter = Router();

lobbiesRouter.get('/', (_req, res) => {
  res.json({ lobbies: listLobbies() });
});

lobbiesRouter.get('/:id', (req, res) => {
  const lobby = findLobby(req.params.id);
  if (!lobby) {
    return res.status(404).json({ error: 'Lobby not found' });
  }
  res.json({ lobby });
});

lobbiesRouter.post('/:id/join', (req, res) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  if (!findUser(userId)) {
    return res.status(404).json({ error: 'User not found' });
  }

  try {
    const seat = reserveSeat(req.params.id, userId);
    broadcastLobbyEvent(req.params.id, {
      type: 'seat_update',
      payload: { lobbyId: req.params.id, seat }
    });
    res.json({ seat, message: 'Seat reserved. Complete payment before expiration.' });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

lobbiesRouter.post('/:id/pay', (req, res) => {
  const { seatId, txHash } = req.body as { seatId?: string; txHash?: string };
  if (!seatId || !txHash) {
    return res.status(400).json({ error: 'seatId and txHash are required' });
  }

  try {
    const seat = payForSeat(req.params.id, seatId, txHash);
    broadcastLobbyEvent(req.params.id, {
      type: 'payment_confirmed',
      payload: { lobbyId: req.params.id, seat }
    });
    res.json({ seat, status: 'pending_confirmation' });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

lobbiesRouter.post('/:id/finalize', (req, res) => {
  try {
    const round = finalizeRound(req.params.id);
    broadcastLobbyEvent(req.params.id, {
      type: 'round_finalized',
      payload: { lobbyId: req.params.id, round }
    });
    res.json({ round });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});
