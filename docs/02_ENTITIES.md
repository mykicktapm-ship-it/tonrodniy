# Entities

## Lobby

Основная игровая сущность.

### Поля:
- lobbyId: uint
- mode: enum { CLASSIC, DONATE, EXPERIMENTAL }
- stakeTon: uint (нанотоны)
- playersCurrent: uint
- playersTotal: uint
- status: enum { OPEN, FULL, RUNNING, FINISHED }
- donateTon: uint (опционально)
- createdAt: timestamp
- deadline: timestamp (опционально)

## Player

- address: TON address
- joinedAt: timestamp

## Round

- lobbyId
- players: list<address>
- startedAt: timestamp
- resolvedAt: timestamp
- winner: address
- totalPool: uint

## Donation (для Donate Lobby)

- amountTon
- receiver: predefined treasury address

## Platform (неигровая сущность)

- не владеет средствами игроков
- не может инициировать игровые действия
