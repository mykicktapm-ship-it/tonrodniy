import "@stdlib/tuple";

struct TonrodyConfig {
    minDeposit: Int;
    lobbySize: Int;
    feeBps: Int;
    treasury: Address;
}

struct Participant {
    wallet: Address;
    amount: Int;
    memo: Int;
}

message CreateLobby {
    lobbyId: Int;
    seedCommit: Int;
    createdAt: Int;
}

message PayStake {
    lobbyId: Int;
    seatIndex: Int;
    memo: Int;
}

message FinalizeRound {
    lobbyId: Int;
    seedReveal: Int;
}

message WithdrawPool {}

message ResetLogs {}

const OP_DEPOSIT: Int = 1;
const OP_FINALIZE: Int = 2;
const OP_PAYOUT: Int = 3;

const ERR_ACTIVE_LOBBY: Int = 101;
const ERR_INVALID_LOBBY: Int = 102;
const ERR_SEAT_BUSY: Int = 103;
const ERR_INVALID_AMOUNT: Int = 104;
const ERR_NOT_READY: Int = 105;
const ERR_ALREADY_FINALIZED: Int = 106;
const ERR_INVALID_REVEAL: Int = 107;
const ERR_WITHDRAWN: Int = 108;
const ERR_NOT_WINNER: Int = 109;
const ERR_WALLET_BUSY: Int = 110;
const ERR_INVALID_SEAT: Int = 111;

fun emptyTxLog(): cell {
    return beginCell().endCell();
}

event DepositReceived(lobbyId: Int, seatIndex: Int, sender: Address, amount: Int, memo: Int);
event LobbyFilled(lobbyId: Int, pool: Int);
event WinnerSelected(lobbyId: Int, winner: Address, roundHash: Int, payout: Int);
event PayoutSent(lobbyId: Int, winner: Address, payout: Int, success: Bool);

type ParticipantMap = map<Int, Participant>;

contract Tonrody {
    config: TonrodyConfig;
    currentLobbyId: Int;
    participants: ParticipantMap;
    participantsCount: Int;
    poolAmount: Int;
    seedCommit: Int;
    seedReveal: Int;
    roundHash: Int;
    winnerIndex: Int;
    payoutSent: Bool;
    txLog: cell;
    lobbyCreatedAt: Int;
    stakeTxHashes: map<Int, Int>;
    finalizeTimestamp: Int;
    finalizeValue: Int;
    finalizeTxHash: Int;

    init(config: TonrodyConfig) {
        self.config = config;
        self.currentLobbyId = 0;
        self.participants = mapEmpty<Int, Participant>();
        self.participantsCount = 0;
        self.poolAmount = 0;
        self.seedCommit = 0;
        self.seedReveal = 0;
        self.roundHash = 0;
        self.winnerIndex = -1;
        self.payoutSent = false;
        self.txLog = emptyTxLog();
        self.lobbyCreatedAt = 0;
        self.stakeTxHashes = mapEmpty<Int, Int>();
        self.finalizeTimestamp = 0;
        self.finalizeValue = 0;
        self.finalizeTxHash = 0;
    }

    receive(msg: CreateLobby) {
        require(self.participantsCount == 0 && !self.isActiveLobby(), ERR_ACTIVE_LOBBY);
        self.currentLobbyId = msg.lobbyId;
        self.seedCommit = msg.seedCommit;
        self.seedReveal = 0;
        self.roundHash = 0;
        self.winnerIndex = -1;
        self.payoutSent = false;
        self.poolAmount = 0;
        self.participants = mapEmpty<Int, Participant>();
        self.participantsCount = 0;
        self.txLog = emptyTxLog();
        self.lobbyCreatedAt = msg.createdAt;
        self.stakeTxHashes = mapEmpty<Int, Int>();
        self.finalizeTimestamp = 0;
        self.finalizeValue = 0;
        self.finalizeTxHash = 0;
    }

    receive(msg: PayStake) {
        require(self.isActiveLobby(), ERR_INVALID_LOBBY);
        require(msg.lobbyId == self.currentLobbyId, ERR_INVALID_LOBBY);
        require(self.participantsCount < self.config.lobbySize, ERR_NOT_READY);
        let value = context.value;
        require(value >= self.config.minDeposit, ERR_INVALID_AMOUNT);
        require(msg.seatIndex >= 0 && msg.seatIndex < self.config.lobbySize, ERR_INVALID_SEAT);
        require(!self.participants.has(msg.seatIndex), ERR_SEAT_BUSY);
        require(!self.walletAlreadyParticipating(context.sender), ERR_WALLET_BUSY);

        let participant = Participant(context.sender, value, msg.memo);
        self.participants = self.participants.set(msg.seatIndex, participant);
        self.participantsCount = self.participantsCount + 1;
        self.poolAmount = self.poolAmount + value;
        let stakeTxHash = self.readMessageHash();
        self.stakeTxHashes = self.stakeTxHashes.set(msg.seatIndex, stakeTxHash);

        self.txLog = self.appendTxLog(OP_DEPOSIT, msg.seatIndex, context.sender, value, msg.memo);
        emit DepositReceived(self.currentLobbyId, msg.seatIndex, context.sender, value, msg.memo);

        if (self.participantsCount == self.config.lobbySize) {
            emit LobbyFilled(self.currentLobbyId, self.poolAmount);
        }
    }

    receive(msg: FinalizeRound) {
        require(msg.lobbyId == self.currentLobbyId, ERR_INVALID_LOBBY);
        require(self.participantsCount == self.config.lobbySize, ERR_NOT_READY);
        require(!self.isFinalized(), ERR_ALREADY_FINALIZED);
        require(self.shaCommit(msg.seedReveal) == self.seedCommit, ERR_INVALID_REVEAL);

        let finalizeTimestamp = now();
        let finalizeValue = context.value;
        let finalizeTxHash = self.readMessageHash();
        self.finalizeTimestamp = finalizeTimestamp;
        self.finalizeValue = finalizeValue;
        self.finalizeTxHash = finalizeTxHash;

        let hashSeed = self.buildRoundHashSeed(msg.seedReveal, finalizeTimestamp, finalizeValue, finalizeTxHash);
        self.roundHash = hashSeed.hash();
        self.seedReveal = msg.seedReveal;
        let size = self.config.lobbySize;
        let winnerIndex = self.roundHash % size;
        self.winnerIndex = winnerIndex;

        let winner = self.lookupWinnerAddress();
        let payout = self.computeNetPayoutAmount();

        emit WinnerSelected(self.currentLobbyId, winner, self.roundHash, payout);
        self.txLog = self.appendTxLog(OP_FINALIZE, winnerIndex, winner, payout, msg.seedReveal);
        self.distributePayout(winner, payout);
    }

    receive(_: WithdrawPool) {
        require(self.isFinalized(), ERR_NOT_READY);
        require(false, ERR_WITHDRAWN);
    }

    fun isActiveLobby(): Bool {
        return self.currentLobbyId != 0 && (self.winnerIndex < 0 || !self.payoutSent);
    }

    fun isFinalized(): Bool {
        return self.winnerIndex >= 0;
    }

    fun walletAlreadyParticipating(addr: Address): Bool {
        var index = 0;
        while (index < self.config.lobbySize) {
            if (self.participants.has(index)) {
                let participant = self.participants.get(index).get();
                if (participant.wallet == addr) {
                    return true;
                }
            }
            index = index + 1;
        }
        return false;
    }

    fun lookupWinnerAddress(): Address {
        if (!self.isFinalized()) {
            return null();
        }
        let participant = self.participants.get(self.winnerIndex);
        if (participant.hasValue()) {
            return participant?.wallet!!;
        }
        return null();
    }

    fun computeFee(): Int {
        return (self.poolAmount * self.config.feeBps) / 10_000;
    }

    fun computeNetPayoutAmount(): Int {
        return self.poolAmount - self.computeFee();
    }

    fun buildRoundHashSeed(seedReveal: Int, finalizeTimestamp: Int, finalizeValue: Int, finalizeTxHash: Int): cell {
        let builder = beginCell();
        builder.storeUint(self.currentLobbyId, 64);
        builder.storeUint(finalizeTimestamp, 64);
        builder.storeUint(finalizeValue, 128);
        builder.storeRef(self.serializeTxHashes(finalizeTxHash));
        builder.storeUint(seedReveal, 256);
        return builder.endCell();
    }

    fun serializeParticipants(): cell {
        var cursor = beginCell();
        var index = 0;
        while (index < self.config.lobbySize) {
            if (self.participants.has(index)) {
                let participant = self.participants.get(index).get();
                cursor.storeUint(1, 1);
                cursor.storeAddress(participant.wallet);
                cursor.storeUint(participant.amount, 64);
                cursor.storeUint(participant.memo, 64);
            } else {
                cursor.storeUint(0, 1);
            }
            index = index + 1;
        }
        return cursor.endCell();
    }

    fun serializeTxHashes(finalizeTxHash: Int): cell {
        var cursor = beginCell();
        var index = 0;
        while (index < self.config.lobbySize) {
            if (self.stakeTxHashes.has(index)) {
                cursor.storeUint(self.stakeTxHashes.get(index).get(), 256);
            } else {
                cursor.storeUint(0, 256);
            }
            index = index + 1;
        }
        cursor.storeUint(finalizeTxHash, 256);
        return cursor.endCell();
    }

    fun appendTxLog(op: Int, seat: Int, addr: Address, amount: Int, aux: Int): cell {
        let builder = beginCell();
        builder.storeUint(op, 8);
        builder.storeUint(self.currentLobbyId, 64);
        builder.storeUint(seat, 16);
        builder.storeAddress(addr);
        builder.storeUint(amount, 64);
        builder.storeUint(aux, 256);
        builder.storeRef(self.txLog);
        return builder.endCell();
    }

    fun shaCommit(seed: Int): Int {
        let cell = beginCell();
        cell.storeUint(seed, 256);
        return cell.endCell().hash();
    }

    fun readMessageHash(): Int {
        return context.raw.hash();
    }

    fun distributePayout(winner: Address, payout: Int): Int {
        self.payoutSent = true;
        let fee = self.computeFee();
        if (fee > 0 && self.config.treasury != null()) {
            send(SendParameters{
                to: self.config.treasury,
                value: fee,
                bounce: false,
                mode: SendIgnoreErrors,
                body: null()
            });
        }
        if (winner != null()) {
            send(SendParameters{
                to: winner,
                value: payout,
                bounce: true,
                mode: SendIgnoreErrors,
                body: null()
            });
            emit PayoutSent(self.currentLobbyId, winner, payout, true);
            self.txLog = self.appendTxLog(OP_PAYOUT, self.winnerIndex, winner, payout, self.roundHash);
        }
        return payout;
    }

    get fun getConfig(): TonrodyConfig {
        return self.config;
    }

    get fun getLobbyState(): tuple {
        return (self.currentLobbyId, self.participantsCount, self.poolAmount, self.winnerIndex, self.roundHash);
    }

    get fun getParticipant(index: Int): Participant? {
        if (self.participants.has(index)) {
            return self.participants.get(index).get();
        }
        return null();
    }

    get fun getTxLog(): cell {
        return self.txLog;
    }

    get fun getEntropyProof(): tuple {
        return (self.finalizeTimestamp, self.finalizeValue, self.finalizeTxHash, self.serializeTxHashes(self.finalizeTxHash));
    }
}
