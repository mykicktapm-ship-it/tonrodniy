# UI ↔ Contract Mapping

| UI Element        | Contract Method | Value        |
|------------------|-----------------|--------------|
| Join Button      | joinLobby       | stakeTon     |
| Create Lobby     | createLobby     | stakeTon     |
| Refund Button    | refundLobby     | 0            |

UI всегда делает:
1. getLobby
2. проверку состояния
3. подтверждение
4. отправку транзакции
