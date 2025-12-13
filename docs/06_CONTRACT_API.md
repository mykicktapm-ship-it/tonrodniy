# Contract API

## View Methods

- getLobby(lobbyId) → Lobby
- listLobbies() → Lobby[]

## Action Methods

- createLobby(mode, stake, playersTotal, donateTon?)
- joinLobby(lobbyId)
- refundLobby(lobbyId)

## Requirements

- joinLobby:
  - msg.value == stakeTon
  - lobby.status == OPEN
