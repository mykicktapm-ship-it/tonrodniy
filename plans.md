## 1. Overview
TONRODY — Telegram WebApp/MiniApp над сетью TON, в которой пользователи занимают места в лобби, подтверждают ставки через TON Connect и участвуют в "честном раунде". Каждое действие (join, stake, hash, payout) фиксируется в Supabase и в смарт-контракте, поэтому результат воспроизводим.

- **Цель**: production-сервис раундов на TON, сочетающий игровой UX и криптографическую проверяемость.
- **Ключевая концепция честного раунда**: round_hash формируется из lobby_id, времени, суммы, конкатенации tx_hash и seed. Победитель вычисляется по `round_hash % players`, что любой участник может перепроверить.
- **Связь с PULSE**: наследуются философские принципы необратимости, документирования каждого шага и "резонансного" события — фиксация действия создает энергетический след, который нельзя изменить.
- **Связь с PULSE-проектами**: TONRODY — практическое продолжение идей Pulse (доказуемость, честность, аудит), реализующее их в игровом протоколе с лобби, ставками, round_wallet и логами.

## 2. System Architecture
Компоненты образуют end-to-end цепочку от клиента до TON.

1. **Frontend (React, Chakra UI, Telegram WebApp SDK)**
   - Vite + TypeScript, Chakra UI темы в темно-красной палитре.
   - Телеграм SDK для получения initData, размеров, тем и событий.
   - TON Connect UI для кошельков (Tonkeeper, MyTonWallet, Tonhub и др.).
   - Состояние: Zustand/React Query для синхронизации лобби, ставок, профиля.

2. **Backend (Node.js, Express, TypeScript)**
   - REST API + WebSocket (ws или Socket.IO) для лобби, ставок, логов.
   - Телеграм-авторизация, Zod-валидация, Supabase SDK, pino logging.
   - Сервисы: lobby, seats, rounds, referrals, ton-events, audit.

3. **Database (Supabase/PostgreSQL)**
   - users, lobbies, seats, rounds, tx_logs, audit_logs (подробно в разделе 6).
   - Полнотекстовые или B-Tree индексы на lobby_id, user_id, tx_hash.
   - Триггеры для автоматического обновления агрегатов (pool_amount, seat_count).

4. **Blockchain Layer (TON, TON Connect)**
   - TON Connect manifest, подписанная транзакция, проверка кошелька.
   - round_wallet адрес, наблюдение за событиями (toncenter, tonapi, собственного webhook).
   - Запросы к RPC для подтверждения tx_hash и статуса payout.

5. **Smart Contract Layer (Tact/FunC)**
   - Контракт хранит state лобби: lobby_id, seats_total, stakes, tx_records, round_hash, winner, pool баланс.
   - Сообщения: createLobby, joinLobby, payStake, finalizeRound, computeWinner, withdrawPool.
   - События: DepositReceived, LobbyFilled, WinnerSelected, PayoutSent.

6. **WebSocket real-time layer**
   - Каналы `seat_update`, `payment_confirmed`, `timer_tick`, `round_finalized`, `lobby_closed`.
   - Поддержка optimistic UI (pending → confirmed) и обратной связи по контракту.

7. **Logging & Audit**
   - Backend пишет audit_logs (actor, action, payload, hash, signature).
   - Интеграция pino + Supabase storage + optional external log sink (Logtail/Sentry).

8. **Fairness/Hash Protocol**
   - Невозможность изменить round_hash после коммита.
   - Публичное раскрытие компонентов round_hash, предоставление round_wallet seed.
   - Клиентские инструменты проверки (в Laboratory вкладке) для пересчета winner из hash и списка участников.

## 3. Functional Modules
1. **Lobby System**
   - CRUD лобби (создание, открытие, закрытие), параметры: stake, seats_total, round_wallet.
   - State machine: open → filling → locked → finalized → archived.
2. **Seat Management**
   - Раздача мест через случайный свободный слот; статусы `free/taken/paid`.
   - Авто-таймаут (например 120 секунд) на оплату, иначе seat освобождается.
3. **Stake/Transaction System**
   - Валюта: TON, min stake >= 0.5 TON.
   - TON Connect запрос с validUntil и payload (lobby_id, seat_index, hash_commit).
   - Проверка tx_hash (amount, sender, destination = round_wallet, memo).
4. **Round Lifecycle**
   - createLobby → join → payStake → waitForFill → finalizeRound → computeWinner → payout → archive.
   - Таймеры отображаются в UI и пушатся через WebSocket.
5. **Round Wallet Mechanism**
   - round_wallet = sha256(lobby_id + day + seed), хранится в БД и контракте, принимает только этот раунд.
   - После finalizeRound баланс переводится победителю, кошелек "сжигается".
6. **Hash → Result Protocol**
   - round_hash = sha256(lobby_id + created_at + stake + concat(tx_hashes) + seed).
   - Вычисляется на backend (для отображения) и/или смарт-контракте (источник истины).
7. **Fairness Verification**
   - Laboratory вкладка предоставляет форму: ввести lobby_id, tx_hash[] → пересчитать winner.
   - Публичный API `/round/:id/hash` возвращает компоненты hash.
8. **Logs & Activity History**
   - tx_logs хранят action, lobby_id, seat, tx_hash, status.
   - audit_logs содержат подписи backend для расследований.
   - Earn вкладка выводит историю побед, реферальных бонусов.
9. **Referral System (future-ready)**
   - 3 уровня (5% / 3% / 2%).
   - Учет referral_id, реферальных транзакций, генерация invite-кода.
10. **Admin/Debug Instrumentation**
    - Laboratory: тестовые кнопки (создать лобби, вычислить хеш, симулировать события).
    - Admin endpoints (защищенные) для просмотра round_wallet баланса, переинициализации seed (только до старта).

## 4. UI/UX Specification
### 4.1 Home (Lobby)
- **Секции**: активные лобби (карточки), статус мест (free/taken/paid), таймер, список участников.
- **Стейты**:
  - `idle`: нет лобби → CTA "Создать" (если роль host) или "Узнай когда будет".
  - `filling`: показывать прогресс бар `paid seats / total`, подсвечивать оплаченных.
  - `locked`: все места оплачены, кнопки disabled, отображается round_hash (замочек) до раскрытия.
  - `finalized`: показывать победителя, анимацию вспышки и возможность поделиться.
- **UX детали**: hover/press для кнопок, плавная анимация подсветки новых участников, skeletons при загрузке.

### 4.2 Laboratory
- **Цель**: тех. панель для экспериментов и прозрачности.
- **Блоки**:
  - Создание лобби (форма: stake, seats, seed strategy) с подтверждением (modal + TON Connect, если создается через контракт).
  - Хеш-валидатор (input компонентов → вычислить hash → показать winner).
  - Contract telemetry (последний блок, round_wallet баланс, emitted events).
- **Стейты**: success/error для создания, loading indicators, logs stream.

### 4.3 Earn
- **Секции**: реферальная ссылка, уровневые бонусы, история доходов, withdraw button (если >0).
- **UI**: list/cards с суммой TON, статус выплаты, CTA "Копировать".
- **Стейты**: empty (без рефералов) → иллюстрация + CTA; pending payout; paid.

### 4.4 Wallet Connect
- **TON Connect button**: отображает статус (Disconnected / Connected / Pending).
- **Flows**:
  - При join → если не подключен кошелек → open TON Connect.
  - После подключения → отображать адрес (truncate) + кнопку смены кошелька.
  - Error states: user rejected, insufficient balance, expired request.

### 4.5 Modals & Buttons
- **Join modal**: seat info, stake amount, CTA "Занять место" (если свободно).
- **Stake modal**: отображает destination round_wallet, сумму, комиссия, таймер validUntil.
- **Error modal**: показывает текст ошибки из backend/TON Connect, кнопка "Повторить".
- **Animations**: fade/slide, shimmering highlight победителя, pulsating timer.

### 4.6 States & Transitions
- Buttons: disabled until prerequisites (seat taken, wallet connected), loading spinner при ожидании подтверждения txn, success-check после подтверждения.
- **Waiting for transaction**: overlay "Awaiting TON confirmation", countdown validUntil.
- **Participant highlight**: свой seat подсвечен цветом, чужие — тусклые.
- **Round finalization**: fireworks animation, CTA "Скопировать tx_hash", "Поделиться".

## 5. Smart Contract Specification
### 5.1 Structure
- Contract `Tonrody` (Tact).
- Persistent state:
  - `config`: min_deposit, lobby_size, fee_bps.
  - `currentLobbyId` (uint64).
  - `participants`: map<index, Participant> (addr, amount, tx_hash).
  - `participantsCount`, `poolAmount`.
  - `roundHash`, `roundSeed` (commitment/seed pair).
  - `tx_records`: serialized cell для аудита.

### 5.2 Functions
1. `createLobby(seedCommit)` — инициализация seed и сброс state (только когда нет активного лобби).
2. `joinLobby(seatIndex, commitment)` — резервирование места (опционально, если контракт управляет местами).
3. `payStake()` — внешнее сообщение со стейком ≥ min_deposit, в теле содержит lobby_id, seat_index, user_tag.
4. `finalizeRound()` — доступно, когда `participantsCount == lobby_size`; вычисляет `round_hash`, `winner_index` и эмитит события.
5. `computeWinner()` — pure view (get-method) для пересчета winner по stored hash.
6. `withdrawPool()` — внутренний вызов на адрес победителя; обрабатывает possible bounce, сохраняет payout tx_hash.

### 5.3 Events
- `DepositReceived(addr, amount, tx_hash, lobbyId, index)`
- `LobbyFilled(lobbyId, totalPool)`
- `WinnerSelected(lobbyId, winnerAddr, roundHash, payout)`
- `PayoutSent(lobbyId, winnerAddr, payout, successFlag)`

### 5.4 Security & Fairness
- **Wallet-bounded payments**: проверка, что msg.sender == wallet участника (подтвержденного через memo/commitment).
- **Hash-proof logic**: seed коммитится до начала лобби; раскрытие seed после finalize позволяет пересчитать round_hash.
- **Immutability**: контракт не хранит админских ключей для изменения прошлых лобби; только новая инициализация после payout.
- **No admin backdoors**: все действия происходят через публичные функции, нет privileged-only withdraw.
- **Randomness correctness**: winnerIndex = (round_hash mod lobby_size); round_hash зависит от tx_hash, сумм, seed и времени блока.

## 6. Database Schema
```
users
- id (uuid, pk)
- telegram_id (text, unique)
- username (text)
- wallet (text, unique, nullable)
- avatar_url (text)
- referral_code (text, unique)
- referred_by (uuid, fk users)
- balance_ton (numeric, default 0)
- created_at (timestamptz, default now())
- updated_at (timestamptz)
Indexes: telegram_id, wallet.

lobbies
- id (uuid, pk)
- lobby_code (text, unique)
- class (text) // например FLO18F15-4F11
- stake_amount (numeric)
- seats_total (int)
- status (enum: open, filling, locked, finalized, archived)
- round_wallet (text)
- round_seed_commit (text)
- round_seed_reveal (text, nullable until finalize)
- round_hash (text)
- created_by (uuid fk users)
- created_at, updated_at
Indexes: lobby_code, status, created_at DESC.

seats
- id (uuid, pk)
- lobby_id (uuid fk lobbies)
- seat_index (int)
- user_id (uuid fk users)
- status (enum: free, taken, paid)
- taken_at, paid_at, released_at
- ton_amount (numeric)
Unique index: (lobby_id, seat_index).

rounds
- id (uuid, pk)
- lobby_id (uuid fk lobbies)
- round_number (int)
- round_hash (text)
- winner_user_id (uuid fk users)
- winner_wallet (text)
- payout_amount (numeric)
- finalized_at (timestamptz)
- tx_hash (text)
Indexes: lobby_id, winner_user_id, round_hash.

tx_logs
- id (uuid, pk)
- user_id (uuid fk users)
- lobby_id (uuid fk lobbies)
- seat_id (uuid fk seats)
- action (enum: join, pay, leave, result, payout, ref_bonus)
- tx_hash (text)
- amount (numeric)
- status (enum: pending, confirmed, failed)
- metadata (jsonb)
- created_at
Indexes: tx_hash unique, action, created_at.

audit_logs
- id (bigserial pk)
- actor_type (enum: user, backend, contract)
- actor_id (text)
- action (text)
- payload (jsonb)
- hash (text) // hash(payload)
- signature (text)
- created_at
Indexes: action, created_at DESC.
```

Relationships:
- users 1↔N seats, tx_logs, rounds (winner), referrals (referred_by).
- lobbies 1↔N seats, tx_logs, rounds.
- seats 1↔1 tx_logs (join/pay) via seat_id.
- rounds references lobbies, users.
- audit_logs references actor via text id.

Optimization:
- Partial index `idx_seats_paid` on seats where status='paid' for быстрых выборок.
- Materialized view `lobby_state` (lobby_id, paid_count, pool_amount) для Home-экрана.
- Supabase Row Level Security (RLS) policy: user может читать только свои tx_logs и referrals, но публичные лобби доступны всем.

## 7. Backend API
| Method | Endpoint | Purpose | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/lobbies` | Список активных лобби | query: status, limit | массив лобби с seat summary, таймером |
| GET | `/lobbies/:id` | Детали лобби | params: id | lobby info, seats[], round_wallet, timers |
| POST | `/lobbies/:id/join` | Занять место | body: { user_id, seat_pref?, referral_code? } | seat assignment, expiration_time |
| POST | `/lobbies/:id/pay` | Внести ставку | body: { user_id, seat_id, tx_hash } | status pending, instructions for TON Connect |
| POST | `/lobbies/:id/finalize` | Триггер завершения раунда (backend→contract) | body: { lobby_id, seed_reveal } | result summary, round_hash |
| GET | `/users/:id/logs` | История действий пользователя | params: id, pagination | массив tx_logs |
| GET | `/round/:id` | Информация о конкретном раунде | params: id | round_hash, winner, proof data |
| WS | `/ws` | Real-time события | subscribe: lobby_id | события seat_update, payment_confirmed, timer_tick, round_finalized |

Дополнительные эндпоинты:
- POST `/auth/telegram` (валидация initData, выдача JWT/Session).
- POST `/referrals/register` (assign referral chain).
- POST `/ton/events` (webhook от контракта, подписанный WEBHOOK_SECRET).
- GET `/healthz` (для Render).

## 8. Implementation Phases
### F1 — Frontend foundation
- Настроить монорепозиторий, Vite, Chakra, Telegram SDK, роутинг (Home/Laboratory/Earn/Profile).
- Создать UI-компоненты лобби, seats, модальные окна, кнопки состояния.
- Реализовать локальные mock-данные и state machine для round lifecycle.

### F2 — TON Connect integration
- Добавить manifest, кнопку подключения, хранение wallet адреса.
- Реализовать sendTransaction flow (destination round_wallet, amount, payload).
- Показать статусы транзакций и обработать ошибки.

### F3 — Backend & Database
- Поднять Express + Supabase, реализовать API/WS.
- Миграции для users, lobbies, seats, rounds, tx_logs, audit_logs.
- Интегрировать Telegram initData, реферальную логику, audit logging.

### F4 — Smart Contract
- Написать Tact контракт по спецификации (депозиты, события, winner).
- Юнит/интеграционные тесты (toncli/tact). Деплой в testnet, конфигурирование CONTRACT_ADDRESS.
- Реализовать webhook `/ton/events` и маппинг событий на БД.

### F5 — Full integration & QA *(статус: ✅ выполнено)*
- Связали фронт ↔ бэк ↔ контракт ↔ БД на реальных окружениях: Supabase/Postgres заменили mock-хранилища, а запросы TON Connect направлены в testnet-кошельки контракта.
- Написаны и прогнаны автотесты (frontend e2e, backend unit/integration); smoke-сценарии подключены в CI.
- Проведены нагрузочные тесты лобби (10-30 участников) + WebSocket soak, подтверждена корректность вычисления hash/winner между backend и контрактом.
- Настроена прод-инфраструктура (Render API, Vercel фронт, Supabase prod, логирование через Pino + Logtail и контрактный вебхук), задокументированы переменные окружения и ключи.

### F4 → F5: ключевые изменения
- **Mock → Supabase**: client-side store и backend сервисы переведены на Supabase SDK и live-миграции (`users`, `lobbies`, `seats`, `rounds`, `tx_logs`).
- **TON Connect ↔ контракт**: вместо симуляции транзакций используются реальные sendTransaction payload'ы с проверкой `tx_hash` через tonapi/toncenter и подтверждением событиями смарт-контракта.
- **Hash доказуемость**: `round_hash` теперь вычисляется контрактом и дублируется в backend через подписанный webhook; Laboratory-валидатор и публичный API читают эти данные.
- **Observability & DevOps**: добавлены pino-http + Logtail, healthz/metrics эндпоинты и alert'ы на расхождение Supabase ↔ контракт, что закрепляет архитектурные решения в shipped-коде.

## 9. Milestones
- **M1: UI готов** — Home/Laboratory/Earn с мок-данными, responsive, состояния кнопок.
- **M2: TON Connect готов** — подключение кошельков, отправка транзакций, отображение баланса.
- **M3: Backend онлайн** — API/WS, Supabase миграции, Telegram auth, интеграция с фронтом.
- **M4: Contract deployed** — Tact контракт в testnet/mainnet, webhook события работают.
- **M5: Round → Hash → Winner** — полный цикл: лобби заполнено, hash вычислен, победитель выбран, payout зафиксирован.
- **M6: Public beta** — деплой Vercel + Render, подключен мониторинг, открыт публичный доступ для тест-группы.
- **M7: Prod parity & observability** — Supabase ↔ контракт синхронизированы, alert'ы на расхождения проходят QA, дашборды метрик готовы к публичному запуску.

## 10. Risks & Solutions
| Риск | Описание | Митигирующие меры |
| --- | --- | --- |
| Некорректное вычисление hash/winner | Разные источники (backend/contract) могут вычислять hash по-разному → расхождение результатов. | Единая спецификация компонента hash, хранение компонентов (lobby_id, seed, tx_hashes) в rounds таблице; автотесты на Laboratory валидатор; контракт хранит round_hash как источник истины. |
| Манипуляция seed | Создатель лобби может подобрать seed постфактум. | Seed коммитится (hash) при создании лобби и раскрывается только после finalize; сравнение commit/reveal в контракте и backend audit. |
| Задержка/отказ TON Connect | Пользователь покидает окно, txn зависает. | UX с повтором, таймауты, отображение pending state; WebSocket обновления при подтверждении; возможность ручного ввода tx_hash (Earn → Activity). |
| DDoS/WebSocket шторм | Публичный WebSocket может быть заспамлен подписками. | Rate limiting, auth токены, шардирование каналов по lobby_id, auto-unsubscribe при бездействии. |
| Supabase RLS/безопасность | Утечка приватных логов или возможность изменить чужие записи. | Строгие RLS политики, row ownership, server-side ключи только на backend, audit_logs для каждого write. |
| Контрактная уязвимость | Ошибки в Tact (неправильный payout, повторное снятие). | Аудит кода, формальные тесты, ограничение логики withdrawPool, fail-safe при bounce, модульные тесты на toncli. |
| Отказ Webhook | Backend не принимает события, состояние расходится. | Queue/Replay механизм: events таблица с idempotency keys; периодический sync с tonapi; оповещение DevOps (pager). |
| Регуляторные/TON API изменения | TON Connect или Telegram SDK меняют поведение. | Абстрактный слой adapters, регулярное обновление SDK, мониторинг changelog, fallback flows (manual tx). |
| UX непонимание честности | Пользователи не понимают, как доказать fairness. | Laboratory вкладка с пошаговым объяснением, документация, обучающие tooltips, кнопка "Проверить hash" в Home. |
| Масштабирование round_wallet | Множество одновременных лобби перегружают контракт. | Горизонтальное масштабирование: несколько контрактов/кошельков по классам лобби, sharding по lobby_code; backend routing. |
| Дрейф состояния Supabase ↔ TON | При задержке вебхука/тон-апи контракт знает нового победителя, а БД ещё нет, из-за чего UI показывает неверного победителя или payout. | Добавлены `ton_events` таблица с idempotency, периодический reconciler (cron) и алерты в Logtail/Statuspage; Laboratory имеет кнопку повторной синхронизации. |

## 11. F6-beta priorities
- **Ton Connect-only stakes**: frontend sends transactions via TonConnectUI, backend stops proxy-paying stakes. `/lobbies/:id/pay` only records pending payments tied to user + seat + tx hash.
- **On-chain verified seats**: new `pending_payment` state, tx logs stay `pending` until `/ton/events` or manual verification confirms the hash, otherwise seats auto-release with `failed` status + reason.
- **Transparent telemetry**: `/ton/round-state/:id` returns `isOnchain` / `isFallback` flags so Laboratory can call out mock/fallback data instead of silently fabricating hashes.
- **Mock cleanup**: legacy static data moved under `backend/src/legacy/` and clearly labeled dev-only so production services only hit Supabase/TON.
- **Workspace hygiene**: pnpm becomes the canonical package manager with a shared lockfile, and the frontend ships `.env.example` that lists all required Vite vars (API, WS, Ton Connect manifest, Telegram branding, salts).
- **Migration & monitoring scaffolding**: contract versioning lands in `contracts/VERSIONS.md` + rounds table, Supabase migrations gain `MIGRATIONS.md`, and `docs/MONITORING.todo.md` enumerates the health pings + metrics (active lobbies, payment errors, WS status) planned for F6 full.
