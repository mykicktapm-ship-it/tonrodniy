# Monitoring TODO (F6-beta)

## Metrics to expose
- Active lobbies / seats (`lobby_state` aggregation from Supabase).
- Successful vs failed payments (count `tx_logs` grouped by `status`).
- Completed rounds & payout latency (difference between `rounds.finalized_at` and payout events).
- Online users (last activity timestamp from Supabase or WebSocket presence).

## Health pings
- `/healthz` already returns `db_ok`, `ton_rpc_ok`, `ws_ok` – wire these into uptime dashboards.
- Add TON RPC latency histogram once toncenter wiring moves beyond the basic ping.
- Track webhook success rate (`/ton/events`) with alerting on repeated failures.

## Next steps (F6 full)
- Persist metrics to a time-series store (Grafana Cloud or Supabase `metrics` table).
- Emit structured logs (`payment_confirmed`, `payment_failed`) to Logtail for dashboards.
- Add per-lobby monitoring: fill rate, average confirmation time, hash mismatches.
