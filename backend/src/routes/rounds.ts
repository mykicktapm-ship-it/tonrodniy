import { Router } from 'express';
import { numberParsers, roundStore, RoundRow, txLogStore } from '../db/supabase';

export const roundsRouter = Router();

const serializeRound = async (round: RoundRow) => {
  const txLogs = await txLogStore.listByRound(round.id);
  const txHashes = txLogs.map((log) => log.tx_hash).filter((hash): hash is string => Boolean(hash));
  return {
    id: round.id,
    lobbyId: round.lobby_id,
    roundNumber: round.round_number,
    roundHash: round.round_hash ?? undefined,
    winnerUserId: round.winner_user_id ?? undefined,
    winnerWallet: round.winner_wallet ?? undefined,
    payoutAmount: numberParsers.toNumber(round.payout_amount) ?? undefined,
    finalizedAt: round.finalized_at ?? undefined,
    txHashes,
    contractVersion: round.contract_version ?? undefined
  };
};

roundsRouter.get('/', async (_req, res) => {
  try {
    const rounds = await roundStore.list();
    const payload = await Promise.all(rounds.map((round) => serializeRound(round)));
    res.json({ rounds: payload });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

roundsRouter.get('/:id', async (req, res) => {
  try {
    const round = await roundStore.getById(req.params.id);
    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }
    res.json({ round: await serializeRound(round) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});
