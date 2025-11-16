import { Router } from 'express';
import { numberParsers, txLogStore, userStore, UserRow } from '../db/supabase';

export const usersRouter = Router();

const serializeUserRow = (user: UserRow) => ({
  id: user.id,
  telegramId: user.telegram_id,
  username: user.username,
  wallet: user.wallet,
  avatarUrl: user.avatar_url,
  referralCode: user.referral_code,
  balanceTon: numberParsers.toNumber(user.balance_ton) ?? 0,
  createdAt: user.created_at,
  updatedAt: user.updated_at
});

const serializeUser = (user: Awaited<ReturnType<typeof userStore.getById>>) =>
  user ? serializeUserRow(user) : null;

const serializeLog = (log: Awaited<ReturnType<typeof txLogStore.listByUser>>[number]) => ({
  id: log.id,
  action: log.action,
  txHash: log.tx_hash ?? undefined,
  amountTon: numberParsers.toNumber(log.amount) ?? undefined,
  status: log.status,
  lobbyId: log.lobby_id ?? undefined,
  seatId: log.seat_id ?? undefined,
  metadata: log.metadata,
  createdAt: log.created_at
});

usersRouter.get('/', async (_req, res) => {
  try {
    const users = await userStore.list();
    res.json({ users: users.map((user) => serializeUserRow(user)) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

usersRouter.get('/wallet/:address', async (req, res) => {
  try {
    const addressParam = req.params.address;
    const wallet = decodeURIComponent(addressParam ?? '').trim();
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    const user = serializeUser(await userStore.getByWallet(wallet));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

usersRouter.get('/:id', async (req, res) => {
  try {
    const user = serializeUser(await userStore.getById(req.params.id));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

usersRouter.get('/:id/logs', async (req, res) => {
  try {
    const user = serializeUser(await userStore.getById(req.params.id));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const logs = await txLogStore.listByUser(req.params.id);
    res.json({ user, logs: logs.map((log) => serializeLog(log)) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});
