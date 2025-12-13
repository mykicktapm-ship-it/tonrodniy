# User Actions

## View Lobby

- Тип: read-only
- Контракт: getLobby(lobbyId)

## Create Lobby

- Контракт: createLobby(...)
- Value: stakeTon (если требуется)

## Join Lobby

- Контракт: joinLobby(lobbyId)
- Value: stakeTon

## Watch Lobby

- Тип: UI only
- Без транзакции

## Refund

- Контракт: refundLobby(lobbyId)
- Доступно только при failcase
