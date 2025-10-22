import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868

// Flow Actions for FastBreak Peer Betting
// Demonstrates Source, Sink, Swapper, and PriceOracle patterns

// Source - Withdraw FLOW for betting
pub struct BettingSource {
    pub let userAddress: Address
    
    init(userAddress: Address) {
        self.userAddress = userAddress
    }
    
    pub fun withdraw(amount: UFix64): @FungibleToken.Vault {
        let account = getAccount(self.userAddress)
        let vaultRef = account
            .getCapability(/public/flowTokenBalance)
            .borrow<&FlowToken.Vault{FungibleToken.Provider}>()
            ?? panic("Could not borrow FlowToken Vault")
        
        return <- vaultRef.withdraw(amount: amount)
    }
}

// Sink - Accept opponent's matching bet
pub struct MatchingBetSink {
    pub let challengeId: String
    pub let requiredAmount: UFix64
    
    init(challengeId: String, requiredAmount: UFix64) {
        self.challengeId = challengeId
        self.requiredAmount = requiredAmount
    }
    
    pub fun tryDeposit(from: @FungibleToken.Vault): @FungibleToken.Vault? {
        // Verify amount matches
        assert(
            from.balance == self.requiredAmount,
            message: "Must match bet amount exactly"
        )
        
        // In production: deposit to actual escrow contract
        // For now, destroy (represents escrow deposit)
        let balance = from.balance
        destroy from
        
        // Emit event
        emit BetMatched(challengeId: self.challengeId, amount: balance)
        
        return nil
    }
}

// PriceOracle - FastBreak rankings as odds
pub struct FastBreakOdds {
    
    pub fun price(playerAddress: Address): UFix64? {
        // Get player's current FastBreak rank
        let rank = self.getCurrentRank(playerAddress)
        
        if rank == nil {
            return nil
        }
        
        // Convert rank to probability (lower rank = higher probability)
        return self.rankToProbability(rank!)
    }
    
    access(self) fun getCurrentRank(_ playerAddress: Address): UInt64? {
        // In production: query FastBreak leaderboard
        // For now: mock implementation
        return nil
    }
    
    access(self) fun rankToProbability(_ rank: UInt64): UFix64 {
        // Simple formula: better ranks = higher probability
        if rank == 1 {
            return 0.9 // 90% for rank 1
        } else if rank <= 10 {
            return 0.5 + (1.0 / UFix64(rank))
        } else {
            return 1.0 / UFix64(rank)
        }
    }
}

// Swapper - Bet execution
pub struct PeerBetSwapper {
    pub let challengeId: String
    
    init(challengeId: String) {
        self.challengeId = challengeId
    }
    
    pub fun swap(from: @FungibleToken.Vault): @FungibleToken.Vault {
        let amount = from.balance
        
        // FLOW → Bet Position
        // In production: mint bet token or store in challenge contract
        destroy from
        
        // Emit event
        emit BetPlaced(challengeId: self.challengeId, amount: amount)
        
        // Return empty vault (bet position stored in contract)
        return <- FlowToken.createEmptyVault()
    }
}

// Events
pub event BetMatched(challengeId: String, amount: UFix64)
pub event BetPlaced(challengeId: String, amount: UFix64)

// Example transaction using Flow Actions
pub fun acceptChallengeWithActions(
    challengeId: String,
    betAmount: UFix64,
    signerAddress: Address
) {
    // 1. Source - withdraw FLOW
    let source = BettingSource(userAddress: signerAddress)
    let myBet <- source.withdraw(amount: betAmount)
    
    // 2. PriceOracle - check current odds
    let oracle = FastBreakOdds()
    let myOdds = oracle.price(playerAddress: signerAddress)
    
    // 3. Sink - match challenge
    let sink = MatchingBetSink(challengeId: challengeId, requiredAmount: betAmount)
    let remaining <- sink.tryDeposit(from: <- myBet)
    assert(remaining == nil, message: "Stake must match exactly")
    
    // 4. Swapper - create bet position
    let swapper = PeerBetSwapper(challengeId: challengeId)
    // In full implementation, would swap FLOW for bet position
}
