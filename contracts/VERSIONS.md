# Contract versions

| Version | Network | Address | Deployed | Notes |
| --- | --- | --- | --- | --- |
| `v1.0-f6-beta` | testnet | `<fill-from-env>` | 2024-05-01 | First contract aligned with F6-beta honesty requirements (Ton Connect stakes, webhook verification). |

Each lobby/round stores `contract_version` so migrations can roll out new bytecode without breaking fairness proofs.
