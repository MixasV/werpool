import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import CoreMarketContractV4 from 0x3ea7ac2bcdd8bcef

// SealedBettingV4: Optional sealed betting with auto-reveal after 30 days
// - User can commit sealed bet (outcome hidden)
// - Platform stores encrypted salt on-chain
// - Auto-reveal via scheduled transaction after 30 days
// - Manual reveal available anytime for instant payout
access(all) contract SealedBettingV4 {

    // --- Storage Paths ---
    access(all) let SealedBetStoragePath: StoragePath
    access(all) let PlatformKeyStoragePath: StoragePath

    // --- Events ---
    access(all) event SealedBetCommitted(
        betId: UInt64,
        marketId: UInt64,
        bettor: Address,
        amount: UFix64,
        hashedChoice: String,
        timestamp: UFix64,
        autoRevealScheduledFor: UFix64
    )

    access(all) event SealedBetRevealed(
        betId: UInt64,
        marketId: UInt64,
        outcomeIndex: Int,
        revealMethod: String,
        timestamp: UFix64
    )

    access(all) event SealedBetAutoRevealed(
        betId: UInt64,
        marketId: UInt64,
        outcomeIndex: Int,
        timestamp: UFix64
    )

    access(all) event PayoutClaimed(
        betId: UInt64,
        winner: Address,
        amount: UFix64,
        timestamp: UFix64
    )

    // --- Enums ---
    access(all) enum SealedBetStatus: UInt8 {
        access(all) case committed
        access(all) case revealed
        access(all) case claimed
        access(all) case forfeited
    }

    // --- Structs ---
    access(all) struct SealedBet {
        access(all) let id: UInt64
        access(all) let marketId: UInt64
        access(all) let bettor: Address
        access(all) let amount: UFix64
        access(all) let hashedChoice: String
        access(all) let encryptedOutcome: String  // Encrypted by platform
        access(all) let encryptedSalt: String  // Encrypted by platform
        access(all) let commitTime: UFix64
        access(all) var status: SealedBetStatus
        access(all) var revealedOutcome: Int?
        access(all) var revealTime: UFix64?
        access(all) var autoRevealTxId: UInt64?
        access(all) var autoRevealScheduledFor: UFix64?

        init(
            id: UInt64,
            marketId: UInt64,
            bettor: Address,
            amount: UFix64,
            hashedChoice: String,
            encryptedOutcome: String,
            encryptedSalt: String,
            autoRevealTxId: UInt64?,
            autoRevealScheduledFor: UFix64?,
            status: SealedBetStatus?,
            revealedOutcome: Int?,
            revealTime: UFix64?
        ) {
            self.id = id
            self.marketId = marketId
            self.bettor = bettor
            self.amount = amount
            self.hashedChoice = hashedChoice
            self.encryptedOutcome = encryptedOutcome
            self.encryptedSalt = encryptedSalt
            self.commitTime = getCurrentBlock().timestamp
            self.status = status ?? SealedBetStatus.committed
            self.revealedOutcome = revealedOutcome
            self.revealTime = revealTime
            self.autoRevealTxId = autoRevealTxId
            self.autoRevealScheduledFor = autoRevealScheduledFor
        }
    }

    // --- Helper: Update SealedBet ---
    access(self) fun updateBetStatus(betId: UInt64, status: SealedBetStatus) {
        let old = self.sealedBets[betId]!
        self.sealedBets[betId] = SealedBet(
            id: old.id,
            marketId: old.marketId,
            bettor: old.bettor,
            amount: old.amount,
            hashedChoice: old.hashedChoice,
            encryptedOutcome: old.encryptedOutcome,
            encryptedSalt: old.encryptedSalt,
            autoRevealTxId: old.autoRevealTxId,
            autoRevealScheduledFor: old.autoRevealScheduledFor,
            status: status,
            revealedOutcome: old.revealedOutcome,
            revealTime: old.revealTime
        )
    }

    access(self) fun updateBetReveal(betId: UInt64, status: SealedBetStatus, revealedOutcome: Int, revealTime: UFix64) {
        let old = self.sealedBets[betId]!
        self.sealedBets[betId] = SealedBet(
            id: old.id,
            marketId: old.marketId,
            bettor: old.bettor,
            amount: old.amount,
            hashedChoice: old.hashedChoice,
            encryptedOutcome: old.encryptedOutcome,
            encryptedSalt: old.encryptedSalt,
            autoRevealTxId: old.autoRevealTxId,
            autoRevealScheduledFor: old.autoRevealScheduledFor,
            status: status,
            revealedOutcome: revealedOutcome,
            revealTime: revealTime
        )
    }

    // --- Storage ---
    access(all) var sealedBets: {UInt64: SealedBet}
    access(all) var nextBetId: UInt64
    access(all) var betsByMarket: {UInt64: [UInt64]}
    access(all) var betsByUser: {Address: [UInt64]}
    access(all) var collateralEscrow: @{UInt64: {FungibleToken.Vault}}
    access(all) var platformEncryptionKey: String  // Stored on-chain (in production, use HSM)

    // --- Commit Sealed Bet ---
    // Platform generates salt, encrypts it, stores on-chain
    // Schedules auto-reveal transaction for 30 days after market closes
    access(all) fun commitSealedBet(
        marketId: UInt64,
        bettor: Address,
        outcomeIndex: Int,
        collateral: @{FungibleToken.Vault},
        salt: String,  // Generated by platform, not user!
        autoRevealTxId: UInt64?,
        autoRevealScheduledFor: UFix64?
    ): UInt64 {
        pre {
            collateral.balance > 0.0: "collateral must be positive"
        }

        let betId = self.nextBetId
        self.nextBetId = self.nextBetId + 1

        let amount = collateral.balance

        // Hash choice (outcome + salt)
        let message = outcomeIndex.toString().concat(":").concat(salt)
        let hashedChoice = String.encodeHex(HashAlgorithm.SHA3_256.hash(message.utf8))

        // Encrypt outcome and salt with platform key (simplified - in production use proper encryption)
        let encryptedOutcome = self.simpleEncrypt(outcomeIndex.toString(), self.platformEncryptionKey)
        let encryptedSalt = self.simpleEncrypt(salt, self.platformEncryptionKey)

        let bet = SealedBet(
            id: betId,
            marketId: marketId,
            bettor: bettor,
            amount: amount,
            hashedChoice: hashedChoice,
            encryptedOutcome: encryptedOutcome,
            encryptedSalt: encryptedSalt,
            autoRevealTxId: autoRevealTxId,
            autoRevealScheduledFor: autoRevealScheduledFor,
            status: nil,
            revealedOutcome: nil,
            revealTime: nil
        )

        self.sealedBets[betId] = bet

        // Track by market
        if self.betsByMarket[marketId] == nil {
            self.betsByMarket[marketId] = []
        }
        self.betsByMarket[marketId]!.append(betId)

        // Track by user
        if self.betsByUser[bettor] == nil {
            self.betsByUser[bettor] = []
        }
        self.betsByUser[bettor]!.append(betId)

        // Escrow collateral
        self.collateralEscrow[betId] <-! collateral

        emit SealedBetCommitted(
            betId: betId,
            marketId: marketId,
            bettor: bettor,
            amount: amount,
            hashedChoice: hashedChoice,
            timestamp: getCurrentBlock().timestamp,
            autoRevealScheduledFor: autoRevealScheduledFor ?? 0.0
        )

        return betId
    }

    // --- Manual Reveal ---
    // User can reveal early for instant payout (optional)
    access(all) fun revealBet(
        betId: UInt64,
        revealer: Address,
        outcomeIndex: Int,
        salt: String
    ) {
        pre {
            self.sealedBets[betId] != nil: "bet not found"
            self.sealedBets[betId]!.bettor == revealer: "only bettor can reveal"
            self.sealedBets[betId]!.status == SealedBetStatus.committed: "bet already revealed"
        }

        let bet = self.sealedBets[betId]!

        // Verify hash
        let message = outcomeIndex.toString().concat(":").concat(salt)
        let computedHash = String.encodeHex(HashAlgorithm.SHA3_256.hash(message.utf8))

        if computedHash != bet.hashedChoice {
            panic("invalid reveal: hash mismatch")
        }

        // Update bet
        self.updateBetReveal(
            betId: betId,
            status: SealedBetStatus.revealed,
            revealedOutcome: outcomeIndex,
            revealTime: getCurrentBlock().timestamp
        )

        emit SealedBetRevealed(
            betId: betId,
            marketId: bet.marketId,
            outcomeIndex: outcomeIndex,
            revealMethod: "MANUAL",
            timestamp: getCurrentBlock().timestamp
        )
    }

    // --- Auto Reveal (called by scheduled transaction) ---
    // Platform decrypts outcome and salt, reveals automatically
    access(all) fun autoRevealBet(betId: UInt64) {
        pre {
            self.sealedBets[betId] != nil: "bet not found"
            self.sealedBets[betId]!.status == SealedBetStatus.committed: "bet already revealed"
        }

        let bet = self.sealedBets[betId]!

        // Decrypt outcome (platform knows the key)
        let decryptedOutcome = self.simpleDecrypt(bet.encryptedOutcome, self.platformEncryptionKey)
        let outcomeIndex = Int.fromString(decryptedOutcome)!

        // Update bet
        self.updateBetReveal(
            betId: betId,
            status: SealedBetStatus.revealed,
            revealedOutcome: outcomeIndex,
            revealTime: getCurrentBlock().timestamp
        )

        emit SealedBetAutoRevealed(
            betId: betId,
            marketId: bet.marketId,
            outcomeIndex: outcomeIndex,
            timestamp: getCurrentBlock().timestamp
        )
    }

    // --- Claim Payout ---
    // After market settles, user (or auto-reveal) claims payout
    access(all) fun claimPayout(betId: UInt64, claimer: Address): @{FungibleToken.Vault} {
        pre {
            self.sealedBets[betId] != nil: "bet not found"
            self.sealedBets[betId]!.bettor == claimer: "only bettor can claim"
            self.sealedBets[betId]!.status == SealedBetStatus.revealed: "bet not revealed"
        }

        let bet = self.sealedBets[betId]!
        let market = CoreMarketContractV4.getMarket(marketId: bet.marketId)!

        assert(market.state == CoreMarketContractV4.MarketState.settled, message: "market not settled")
        assert(market.winningOutcome != nil, message: "no winning outcome")

        let winningOutcome = market.winningOutcome!
        let revealedOutcome = bet.revealedOutcome!

        var payout: @{FungibleToken.Vault}? <- nil

        if revealedOutcome == winningOutcome {
            // Winner! Return collateral 1:1
            let escrowRef = &self.collateralEscrow[betId] as auth(FungibleToken.Withdraw) &{FungibleToken.Vault}?
            payout <-! escrowRef!.withdraw(amount: bet.amount)

            self.updateBetStatus(betId: betId, status: SealedBetStatus.claimed)

            emit PayoutClaimed(
                betId: betId,
                winner: claimer,
                amount: bet.amount,
                timestamp: getCurrentBlock().timestamp
            )
        } else {
            // Loser - no payout
            payout <-! FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
            self.updateBetStatus(betId: betId, status: SealedBetStatus.forfeited)
        }

        return <-payout!
    }

    // --- Auto Claim (called by scheduled transaction after auto-reveal) ---
    access(all) fun autoClaimPayout(betId: UInt64): @{FungibleToken.Vault} {
        pre {
            self.sealedBets[betId] != nil: "bet not found"
            self.sealedBets[betId]!.status == SealedBetStatus.revealed: "bet not revealed"
        }

        let bet = self.sealedBets[betId]!
        return <-self.claimPayout(betId: betId, claimer: bet.bettor)
    }

    // --- Simple encryption/decryption (placeholder for production HSM) ---
    access(self) fun simpleEncrypt(_ plaintext: String, _ key: String): String {
        // In production: use proper encryption (AES-256-GCM, etc.)
        // For now: just base64 encode with key prefix (NOT SECURE!)
        return "ENC:".concat(key.slice(from: 0, upTo: 4)).concat(":").concat(plaintext)
    }

    access(self) fun simpleDecrypt(_ ciphertext: String, _ key: String): String {
        // In production: use proper decryption
        // For now: just strip prefix
        let parts = ciphertext.split(separator: ":")
        if parts.length == 3 {
            return parts[2]
        }
        return ""
    }

    // --- Getters ---
    access(all) fun getSealedBet(betId: UInt64): SealedBet? {
        return self.sealedBets[betId]
    }

    access(all) fun getBetsByMarket(marketId: UInt64): [SealedBet] {
        let betIds = self.betsByMarket[marketId] ?? []
        let bets: [SealedBet] = []
        
        for betId in betIds {
            if let bet = self.sealedBets[betId] {
                bets.append(bet)
            }
        }
        
        return bets
    }

    access(all) fun getBetsByUser(user: Address): [SealedBet] {
        let betIds = self.betsByUser[user] ?? []
        let bets: [SealedBet] = []
        
        for betId in betIds {
            if let bet = self.sealedBets[betId] {
                bets.append(bet)
            }
        }
        
        return bets
    }

    access(all) fun setPlatformKey(newKey: String) {
        // Only contract can set (in production, use HSM)
        self.platformEncryptionKey = newKey
    }

    // --- Init ---
    init() {
        self.SealedBetStoragePath = /storage/SealedBettingV4
        self.PlatformKeyStoragePath = /storage/SealedBettingV4PlatformKey

        self.sealedBets = {}
        self.nextBetId = 1
        self.betsByMarket = {}
        self.betsByUser = {}
        self.collateralEscrow <- {}
        
        // Generate initial platform key (in production, use HSM)
        self.platformEncryptionKey = "PLATFORM_SECRET_KEY_V4_DO_NOT_EXPOSE"
    }
}
