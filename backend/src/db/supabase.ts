import { createClient, PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { getActiveContractVersion } from '../config/contracts';
import { env } from '../config/env';

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type LobbyStatus = 'open' | 'filling' | 'locked' | 'finalized' | 'archived';
type SeatStatus = 'free' | 'taken' | 'pending_payment' | 'paid' | 'failed';
type TxAction = 'join' | 'pay' | 'leave' | 'result' | 'payout' | 'ref_bonus';
type TxStatus = 'pending' | 'confirmed' | 'failed';
type AuditActor = 'user' | 'backend' | 'contract';

export interface LobbyRow {
  id: string;
  lobby_code: string;
  class: string | null;
  stake_amount: string | number;
  seats_total: number;
  status: LobbyStatus;
  round_wallet: string;
  round_seed_commit: string;
  round_seed_reveal: string | null;
  round_hash: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeatRow {
  id: string;
  lobby_id: string;
  seat_index: number;
  user_id: string | null;
  status: SeatStatus;
  taken_at: string | null;
  paid_at: string | null;
  released_at: string | null;
  ton_amount: string | number | null;
  created_at: string;
}

export interface RoundRow {
  id: string;
  lobby_id: string;
  round_number: number;
  round_hash: string | null;
  winner_user_id: string | null;
  winner_wallet: string | null;
  payout_amount: string | number | null;
  finalized_at: string | null;
  tx_hash: string | null;
  contract_version: string | null;
  created_at: string;
}

export interface UserRow {
  id: string;
  telegram_id: string;
  username: string | null;
  wallet: string | null;
  avatar_url: string | null;
  referral_code: string;
  referred_by: string | null;
  balance_ton: string | number;
  created_at: string;
  updated_at: string;
}

export interface TxLogRow {
  id: string;
  user_id: string | null;
  lobby_id: string | null;
  seat_id: string | null;
  action: TxAction;
  tx_hash: string | null;
  amount: string | number | null;
  status: TxStatus;
  metadata: Json;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  actor_type: AuditActor;
  actor_id: string;
  action: string;
  payload: Json;
  hash: string;
  signature: string | null;
  created_at: string;
}

export interface LobbyComposite {
  lobby: LobbyRow;
  seats: SeatRow[];
  currentRound?: RoundRow;
}

let cachedClient: SupabaseClient | null = null;

const getClient = (): SupabaseClient => {
  if (!cachedClient) {
    cachedClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { 'x-tonrody-backend': 'true' } }
    });
  }
  return cachedClient;
};

const toNumber = (value: string | number | null | undefined): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const raise = (context: string, error: PostgrestError): never => {
  throw new Error(`[supabase:${context}] ${error.message}`);
};

const canonicalTxHashVariants = (hash: string): string[] => {
  const trimmed = hash.trim();
  if (!trimmed) {
    return [];
  }
  const lower = trimmed.toLowerCase();
  const withoutPrefix = lower.replace(/^0x/i, '');
  const prefixed = `0x${withoutPrefix}`;
  const variants = new Set([trimmed, lower, withoutPrefix, prefixed]);
  return Array.from(variants);
};

const extractRequired = <T>(context: string, data: T | null, error: PostgrestError | null): T => {
  if (error) {
    raise(context, error);
  }
  if (!data) {
    throw new Error(`[supabase:${context}] no rows returned`);
  }
  return data;
};

const groupSeatsByLobby = (seats: SeatRow[] | null | undefined): Map<string, SeatRow[]> => {
  const map = new Map<string, SeatRow[]>();
  if (!seats) {
    return map;
  }
  for (const seat of seats) {
    const existing = map.get(seat.lobby_id);
    if (existing) {
      existing.push(seat);
    } else {
      map.set(seat.lobby_id, [seat]);
    }
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.seat_index - b.seat_index);
  }
  return map;
};

const groupRoundsByLobby = (rounds: RoundRow[] | null | undefined): Map<string, RoundRow> => {
  const map = new Map<string, RoundRow>();
  if (!rounds) {
    return map;
  }
  for (const round of rounds) {
    if (!map.has(round.lobby_id)) {
      map.set(round.lobby_id, round);
    }
  }
  return map;
};

export const lobbyStore = {
  async listDetailed(): Promise<LobbyComposite[]> {
    const client = getClient();
    const { data: lobbies, error } = await client
      .from('lobbies')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      raise('lobbies.list', error);
    }
    if (!lobbies?.length) {
      return [];
    }
    const lobbyIds = lobbies.map((row) => row.id);
    const { data: seats, error: seatsError } = await client
      .from('seats')
      .select('*')
      .in('lobby_id', lobbyIds)
      .order('seat_index', { ascending: true });
    if (seatsError) {
      raise('seats.list', seatsError);
    }
    const { data: rounds, error: roundsError } = await client
      .from('rounds')
      .select('*')
      .in('lobby_id', lobbyIds)
      .order('round_number', { ascending: false });
    if (roundsError) {
      raise('rounds.list', roundsError);
    }
    const seatBuckets = groupSeatsByLobby(seats ?? []);
    const roundBuckets = groupRoundsByLobby(rounds ?? []);
    return lobbies.map((lobby) => ({
      lobby,
      seats: seatBuckets.get(lobby.id) ?? [],
      currentRound: roundBuckets.get(lobby.id)
    }));
  },

  async getDetailed(lobbyId: string): Promise<LobbyComposite | null> {
    const client = getClient();
    const { data: lobby, error } = await client.from('lobbies').select('*').eq('id', lobbyId).maybeSingle();
    if (error) {
      raise('lobbies.get', error);
    }
    if (!lobby) {
      return null;
    }
    const { data: seats, error: seatsError } = await client
      .from('seats')
      .select('*')
      .eq('lobby_id', lobbyId)
      .order('seat_index', { ascending: true });
    if (seatsError) {
      raise('seats.forLobby', seatsError);
    }
    const { data: round, error: roundError } = await client
      .from('rounds')
      .select('*')
      .eq('lobby_id', lobbyId)
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (roundError) {
      raise('rounds.forLobby', roundError);
    }
    return { lobby, seats: seats ?? [], currentRound: round ?? undefined };
  },

  async findByCode(lobbyCode: string): Promise<LobbyRow | null> {
    const client = getClient();
    const { data, error } = await client.from('lobbies').select('*').eq('lobby_code', lobbyCode).maybeSingle();
    if (error) {
      raise('lobbies.byCode', error);
    }
    return data ?? null;
  },

  async create(input: {
    lobbyCode: string;
    lobbyClass?: string | null;
    stakeAmount: number;
    seatsTotal: number;
    roundWallet: string;
    seedCommit: string;
    createdBy?: string | null;
  }): Promise<LobbyRow> {
    const client = getClient();
    const { data, error } = await client
      .from('lobbies')
      .insert({
        lobby_code: input.lobbyCode,
        class: input.lobbyClass ?? null,
        stake_amount: input.stakeAmount,
        seats_total: input.seatsTotal,
        round_wallet: input.roundWallet,
        round_seed_commit: input.seedCommit,
        created_by: input.createdBy ?? null,
        status: 'open'
      })
      .select('*')
      .single();
    return extractRequired('lobbies.create', data, error);
  },

  async update(lobbyId: string, patch: Partial<Omit<LobbyRow, 'id'>>): Promise<LobbyRow> {
    const client = getClient();
    const { data, error } = await client
      .from('lobbies')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', lobbyId)
      .select('*')
      .single();
    return extractRequired('lobbies.update', data, error);
  }
};

export const seatStore = {
  async listByLobbyIds(lobbyIds: string[]): Promise<Map<string, SeatRow[]>> {
    if (!lobbyIds.length) {
      return new Map();
    }
    const client = getClient();
    const { data, error } = await client
      .from('seats')
      .select('*')
      .in('lobby_id', lobbyIds)
      .order('seat_index', { ascending: true });
    if (error) {
      raise('seats.listByLobbyIds', error);
    }
    return groupSeatsByLobby(data ?? []);
  },

  async createBatch(lobbyId: string, seatsTotal: number): Promise<SeatRow[]> {
    const client = getClient();
    const inserts = Array.from({ length: seatsTotal }, (_, index) => ({ lobby_id: lobbyId, seat_index: index }));
    const { data, error } = await client.from('seats').insert(inserts).select('*');
    return extractRequired('seats.createBatch', data, error);
  },

  async reserveSeat(seatId: string, userId: string, takenAtIso: string): Promise<SeatRow> {
    const client = getClient();
    const { data, error } = await client
      .from('seats')
      .update({ status: 'taken', user_id: userId, taken_at: takenAtIso, released_at: null })
      .eq('id', seatId)
      .select('*')
      .single();
    return extractRequired('seats.reserve', data, error);
  },

  async markPendingPayment(seatId: string): Promise<SeatRow> {
    const client = getClient();
    const { data, error } = await client
      .from('seats')
      .update({ status: 'pending_payment', paid_at: null, released_at: null, ton_amount: null })
      .eq('id', seatId)
      .select('*')
      .single();
    return extractRequired('seats.markPendingPayment', data, error);
  },

  async markPaid(seatId: string, tonAmount: number, paidAtIso: string): Promise<SeatRow> {
    const client = getClient();
    const { data, error } = await client
      .from('seats')
      .update({ status: 'paid', paid_at: paidAtIso, ton_amount: tonAmount })
      .eq('id', seatId)
      .select('*')
      .single();
    return extractRequired('seats.markPaid', data, error);
  },

  async markFailed(seatId: string, failedAtIso: string): Promise<SeatRow> {
    const client = getClient();
    const { data, error } = await client
      .from('seats')
      .update({
        status: 'failed',
        paid_at: null,
        released_at: failedAtIso,
        ton_amount: null
      })
      .eq('id', seatId)
      .select('*')
      .single();
    return extractRequired('seats.markFailed', data, error);
  },

  async releaseSeat(seatId: string, releasedAtIso: string): Promise<SeatRow> {
    const client = getClient();
    const { data, error } = await client
      .from('seats')
      .update({
        status: 'free',
        user_id: null,
        taken_at: null,
        paid_at: null,
        released_at: releasedAtIso,
        ton_amount: null
      })
      .eq('id', seatId)
      .select('*')
      .single();
    return extractRequired('seats.release', data, error);
  },

  async releaseExpired(lobbyId: string, cutoffIso: string): Promise<void> {
    const client = getClient();
    const { error } = await client
      .from('seats')
      .update({ status: 'free', user_id: null, taken_at: null, paid_at: null, released_at: new Date().toISOString(), ton_amount: null })
      .eq('lobby_id', lobbyId)
      .in('status', ['taken', 'pending_payment'])
      .lt('taken_at', cutoffIso)
      .is('paid_at', null);
    if (error) {
      raise('seats.releaseExpired', error);
    }
  },

  async findById(seatId: string): Promise<SeatRow | null> {
    const client = getClient();
    const { data, error } = await client.from('seats').select('*').eq('id', seatId).maybeSingle();
    if (error) {
      raise('seats.byId', error);
    }
    return data ?? null;
  },

  async findByLobbyAndIndex(lobbyId: string, seatIndex: number): Promise<SeatRow | null> {
    const client = getClient();
    const { data, error } = await client
      .from('seats')
      .select('*')
      .eq('lobby_id', lobbyId)
      .eq('seat_index', seatIndex)
      .maybeSingle();
    if (error) {
      raise('seats.byLobbyIndex', error);
    }
    return data ?? null;
  }
};

export const roundStore = {
  async list(): Promise<RoundRow[]> {
    const client = getClient();
    const { data, error } = await client.from('rounds').select('*').order('created_at', { ascending: false });
    if (error) {
      raise('rounds.listAll', error);
    }
    return data ?? [];
  },

  async getById(roundId: string): Promise<RoundRow | null> {
    const client = getClient();
    const { data, error } = await client.from('rounds').select('*').eq('id', roundId).maybeSingle();
    if (error) {
      raise('rounds.byId', error);
    }
    return data ?? null;
  },

  async getLatestByLobbyIds(lobbyIds: string[]): Promise<Map<string, RoundRow>> {
    if (!lobbyIds.length) {
      return new Map();
    }
    const client = getClient();
    const { data, error } = await client
      .from('rounds')
      .select('*')
      .in('lobby_id', lobbyIds)
      .order('round_number', { ascending: false });
    if (error) {
      raise('rounds.latestByLobbyIds', error);
    }
    return groupRoundsByLobby(data ?? []);
  },

  async create(lobbyId: string, roundNumber = 1, roundHash?: string | null): Promise<RoundRow> {
    const client = getClient();
    const { data, error } = await client
      .from('rounds')
      .insert({
        lobby_id: lobbyId,
        round_number: roundNumber,
        round_hash: roundHash ?? null,
        contract_version: getActiveContractVersion()
      })
      .select('*')
      .single();
    return extractRequired('rounds.create', data, error);
  },

  async update(roundId: string, patch: Partial<Omit<RoundRow, 'id'>>): Promise<RoundRow> {
    const client = getClient();
    const { data, error } = await client.from('rounds').update(patch).eq('id', roundId).select('*').single();
    return extractRequired('rounds.update', data, error);
  }
};

export const txLogStore = {
  async insert(entry: {
    userId?: string | null;
    lobbyId?: string | null;
    seatId?: string | null;
    action: TxAction;
    txHash?: string | null;
    amountTon?: number | null;
    status?: TxStatus;
    metadata?: Json;
  }): Promise<TxLogRow> {
    const client = getClient();
    const { data, error } = await client
      .from('tx_logs')
      .insert({
        user_id: entry.userId ?? null,
        lobby_id: entry.lobbyId ?? null,
        seat_id: entry.seatId ?? null,
        action: entry.action,
        tx_hash: entry.txHash ?? null,
        amount: entry.amountTon ?? null,
        status: entry.status ?? 'pending',
        metadata: entry.metadata ?? {}
      })
      .select('*')
      .single();
    return extractRequired('txLogs.insert', data, error);
  },

  async listByUser(userId: string): Promise<TxLogRow[]> {
    const client = getClient();
    const { data, error } = await client
      .from('tx_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      raise('txLogs.byUser', error);
    }
    return data ?? [];
  },

  async listByRound(roundId: string): Promise<TxLogRow[]> {
    const client = getClient();
    const { data, error } = await client
      .from('tx_logs')
      .select('*')
      .contains('metadata', { roundId })
      .order('created_at', { ascending: true });
    if (error) {
      raise('txLogs.byRound', error);
    }
    return data ?? [];
  },

  async latestSeatPayments(seatIds: string[]): Promise<Map<string, string>> {
    if (!seatIds.length) {
      return new Map();
    }
    const client = getClient();
    const { data, error } = await client
      .from('tx_logs')
      .select('seat_id, tx_hash, created_at')
      .in('seat_id', seatIds)
      .eq('action', 'pay')
      .order('created_at', { ascending: false });
    if (error) {
      raise('txLogs.latestSeatPayments', error);
    }
    const map = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.seat_id && row.tx_hash && !map.has(row.seat_id)) {
        map.set(row.seat_id, row.tx_hash);
      }
    }
    return map;
  },

  async updateStatus(id: string, status: TxStatus, metadataPatch?: Json): Promise<TxLogRow> {
    const client = getClient();
    const updatePayload: Record<string, unknown> = { status };
    if (metadataPatch !== undefined) {
      updatePayload.metadata = metadataPatch;
    }
    const { data, error } = await client
      .from('tx_logs')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();
    return extractRequired('txLogs.updateStatus', data, error);
  },

  async findPayLogByHash(txHash: string): Promise<TxLogRow | null> {
    const client = getClient();
    const variants = canonicalTxHashVariants(txHash);
    if (!variants.length) {
      return null;
    }
    const { data, error } = await client
      .from('tx_logs')
      .select('*')
      .in('tx_hash', variants)
      .eq('action', 'pay')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      raise('txLogs.findByHash', error);
    }
    return data ?? null;
  }
};

export const databaseHealth = async (): Promise<boolean> => {
  try {
    const client = getClient();
    const { error } = await client.from('lobbies').select('id').limit(1);
    if (error) {
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[db] health check failed', error);
    return false;
  }
};

export const auditLogStore = {
  async insert(entry: {
    actorType: AuditActor;
    actorId: string;
    action: string;
    payload: Json;
    hash: string;
    signature?: string | null;
  }): Promise<AuditLogRow> {
    const client = getClient();
    const { data, error } = await client
      .from('audit_logs')
      .insert({
        actor_type: entry.actorType,
        actor_id: entry.actorId,
        action: entry.action,
        payload: entry.payload,
        hash: entry.hash,
        signature: entry.signature ?? null
      })
      .select('*')
      .single();
    return extractRequired('auditLogs.insert', data, error);
  },

  async recordSeedCommit(args: { lobbyId: string; actorId: string; seed: string; commit: string }): Promise<AuditLogRow> {
    return this.insert({
      actorType: 'backend',
      actorId: args.actorId,
      action: 'seed_commit',
      payload: { lobbyId: args.lobbyId, seed: args.seed },
      hash: args.commit
    });
  },

  async recordSeedReveal(args: { lobbyId: string; actorId: string; seed: string; commit: string }): Promise<AuditLogRow> {
    return this.insert({
      actorType: 'backend',
      actorId: args.actorId,
      action: 'seed_reveal',
      payload: { lobbyId: args.lobbyId, seed: args.seed },
      hash: args.commit
    });
  },

  async getSeedByCommit(commit: string): Promise<{ seed: string } | null> {
    const client = getClient();
    const { data, error } = await client
      .from('audit_logs')
      .select('payload')
      .eq('hash', commit)
      .eq('action', 'seed_commit')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      raise('auditLogs.seedByCommit', error);
    }
    const payload = (data?.payload ?? null) as { seed?: string } | null;
    if (!payload?.seed) {
      return null;
    }
    return { seed: payload.seed };
  }
};

export const userStore = {
  async list(): Promise<UserRow[]> {
    const client = getClient();
    const { data, error } = await client.from('users').select('*').order('created_at', { ascending: true });
    if (error) {
      raise('users.list', error);
    }
    return data ?? [];
  },

  async getById(userId: string): Promise<UserRow | null> {
    const client = getClient();
    const { data, error } = await client.from('users').select('*').eq('id', userId).maybeSingle();
    if (error) {
      raise('users.byId', error);
    }
    return data ?? null;
  },

  async getByWallet(wallet: string): Promise<UserRow | null> {
    const client = getClient();
    const normalized = wallet.trim();
    if (!normalized) {
      return null;
    }
    const { data, error } = await client.from('users').select('*').ilike('wallet', normalized).maybeSingle();
    if (error) {
      raise('users.byWallet', error);
    }
    return data ?? null;
  }
};

export const numberParsers = { toNumber };
