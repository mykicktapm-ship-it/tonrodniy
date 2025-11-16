import { Router } from 'express';
import { findUser, getUserActivity, listUsers } from '../data';

export const usersRouter = Router();

usersRouter.get('/', (_req, res) => {
  res.json({ users: listUsers() });
});

usersRouter.get('/:id', (req, res) => {
  const user = findUser(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

usersRouter.get('/:id/logs', (req, res) => {
  const user = findUser(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user, logs: getUserActivity(req.params.id) });
});
