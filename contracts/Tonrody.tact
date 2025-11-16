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
    }

    receive(msg: PayStake) {
        require(self.isActiveLobby(), ERR_INVALID_LOBBY);
        require(msg.lobbyId == self.currentLobbyId, ERR_INVALID_LOBBY);
        require(self.participantsCount < self.config.lobbySize, ERR_NOT_READY);
        let value = context.value;
        require(value >= self.config.minDeposit, ERR_INVALID_AMOUNT);
        require(!self.participants.has(msg.seatIndex), ERR_SEAT_BUSY);

        let participant = Participant(context.sender, value, msg.memo);
        self.participants = self.participants.set(msg.seatIndex, participant);
        self.participantsCount = self.participantsCount + 1;
        self.poolAmount = self.poolAmount + value;

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

        let hashSeed = self.buildRoundHashSeed(msg.seedReveal);
        self.roundHash = hashSeed.hash();
        self.seedReveal = msg.seedReveal;
        let size = self.config.lobbySize;
        let winnerIndex = self.roundHash % size;
        self.winnerIndex = winnerIndex;

        let payout = self.poolAmount;
        emit WinnerSelected(self.currentLobbyId, self.lookupWinnerAddress(), self.roundHash, payout);
        self.txLog = self.appendTxLog(OP_FINALIZE, winnerIndex, self.lookupWinnerAddress(), payout, msg.seedReveal);
    }

    receive(_: WithdrawPool) {
        require(self.isFinalized(), ERR_NOT_READY);
        require(!self.payoutSent, ERR_WITHDRAWN);
        require(context.sender == self.lookupWinnerAddress(), ERR_NOT_WINNER);

        let payout = self.computeNetPayout();
        self.payoutSent = true;
        send(SendParameters{
            to: context.sender,
            value: payout,
            bounce: true,
            mode: SendIgnoreErrors,
            body: null()
        });
        emit PayoutSent(self.currentLobbyId, context.sender, payout, true);
        self.txLog = self.appendTxLog(OP_PAYOUT, self.winnerIndex, context.sender, payout, self.roundHash);
    }

    fun isActiveLobby(): Bool {
        return self.currentLobbyId != 0 && (self.winnerIndex < 0 || !self.payoutSent);
    }

    fun isFinalized(): Bool {
        return self.winnerIndex >= 0;
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

    fun computeNetPayout(): Int {
        let fee = (self.poolAmount * self.config.feeBps) / 10_000;
        if (fee > 0 && self.config.treasury != null()) {
            send(SendParameters{
                to: self.config.treasury,
                value: fee,
                bounce: false,
                mode: SendIgnoreErrors,
                body: null()
            });
        }
        return self.poolAmount - fee;
    }

    fun buildRoundHashSeed(seedReveal: Int): cell {
        let builder = beginCell();
        builder.storeUint(self.currentLobbyId, 64);
        builder.storeUint(self.participantsCount, 16);
        builder.storeUint(self.poolAmount, 128);
        builder.storeUint(seedReveal, 256);
        builder.storeUint(self.lobbyCreatedAt, 64);
        builder.storeRef(self.serializeParticipants());
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
}
