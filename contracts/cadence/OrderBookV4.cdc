import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import OutcomeTokenV4 from 0x3ea7ac2bcdd8bcef

// OrderBookV4: FIFO matching engine for Polymarket-style trading
// Users create buy/sell orders for individual outcome shares
access(all) contract OrderBookV4 {

    // --- Events ---
    access(all) event OrderCreated(
        orderId: UInt64,
        marketId: UInt64,
        outcomeIndex: Int,
        maker: Address,
        side: String,
        price: UFix64,
        size: UFix64,
        timestamp: UFix64
    )

    access(all) event OrderMatched(
        orderId: UInt64,
        marketId: UInt64,
        outcomeIndex: Int,
        maker: Address,
        taker: Address,
        price: UFix64,
        size: UFix64,
        timestamp: UFix64
    )

    access(all) event OrderCanceled(
        orderId: UInt64,
        marketId: UInt64,
        maker: Address,
        timestamp: UFix64
    )

    access(all) event OrderPartiallyFilled(
        orderId: UInt64,
        filledSize: UFix64,
        remainingSize: UFix64
    )

    // --- Enums ---
    access(all) enum OrderSide: UInt8 {
        access(all) case buy
        access(all) case sell
    }

    access(all) enum OrderStatus: UInt8 {
        access(all) case open
        access(all) case partiallyFilled
        access(all) case filled
        access(all) case canceled
    }

    // --- Structs ---
    access(all) struct Order {
        access(all) let id: UInt64
        access(all) let marketId: UInt64
        access(all) let outcomeIndex: Int
        access(all) let maker: Address
        access(all) let side: OrderSide
        access(all) let price: UFix64  // Price per share (0.01 to 0.99)
        access(all) let originalSize: UFix64  // Total shares
        access(all) var remainingSize: UFix64
        access(all) var status: OrderStatus
        access(all) let createdAt: UFix64

        init(
            id: UInt64,
            marketId: UInt64,
            outcomeIndex: Int,
            maker: Address,
            side: OrderSide,
            price: UFix64,
            size: UFix64,
            remainingSize: UFix64,
            status: OrderStatus
        ) {
            self.id = id
            self.marketId = marketId
            self.outcomeIndex = outcomeIndex
            self.maker = maker
            self.side = side
            self.price = price
            self.originalSize = size
            self.remainingSize = remainingSize
            self.status = status
            self.createdAt = getCurrentBlock().timestamp
        }
    }

    // --- Storage ---
    access(all) var orders: {UInt64: Order}
    access(all) var nextOrderId: UInt64
    access(all) var ordersByMarket: {UInt64: [UInt64]}  // marketId -> [orderId]
    access(all) var collateralEscrow: @{UInt64: {FungibleToken.Vault}}  // orderId -> collateral
    access(all) var shareEscrow: @{UInt64: {FungibleToken.Vault}}  // orderId -> outcome tokens

    // --- Helper: Update Order Status ---
    access(self) fun updateOrderStatus(orderId: UInt64, status: OrderStatus) {
        let old = self.orders[orderId]!
        self.orders[orderId] = Order(
            id: old.id,
            marketId: old.marketId,
            outcomeIndex: old.outcomeIndex,
            maker: old.maker,
            side: old.side,
            price: old.price,
            size: old.originalSize,
            remainingSize: old.remainingSize,
            status: status
        )
    }

    access(self) fun updateOrderRemainingSize(orderId: UInt64, remainingSize: UFix64) {
        let old = self.orders[orderId]!
        self.orders[orderId] = Order(
            id: old.id,
            marketId: old.marketId,
            outcomeIndex: old.outcomeIndex,
            maker: old.maker,
            side: old.side,
            price: old.price,
            size: old.originalSize,
            remainingSize: remainingSize,
            status: old.status
        )
    }

    // --- Create Order ---
    access(all) fun createBuyOrder(
        marketId: UInt64,
        outcomeIndex: Int,
        maker: Address,
        price: UFix64,
        size: UFix64,
        collateral: @{FungibleToken.Vault}
    ): UInt64 {
        pre {
            price > 0.0 && price < 1.0: "price must be between 0 and 1"
            size > 0.0: "size must be positive"
            collateral.balance >= (price * size): "insufficient collateral for buy order"
        }

        let orderId = self.nextOrderId
        self.nextOrderId = self.nextOrderId + 1

        let order = Order(
            id: orderId,
            marketId: marketId,
            outcomeIndex: outcomeIndex,
            maker: maker,
            side: OrderSide.buy,
            price: price,
            size: size,
            remainingSize: size,
            status: OrderStatus.open
        )

        self.orders[orderId] = order
        
        // Track by market
        if self.ordersByMarket[marketId] == nil {
            self.ordersByMarket[marketId] = []
        }
        self.ordersByMarket[marketId]!.append(orderId)

        // Escrow collateral
        self.collateralEscrow[orderId] <-! collateral

        emit OrderCreated(
            orderId: orderId,
            marketId: marketId,
            outcomeIndex: outcomeIndex,
            maker: maker,
            side: "BUY",
            price: price,
            size: size,
            timestamp: getCurrentBlock().timestamp
        )

        return orderId
    }

    access(all) fun createSellOrder(
        marketId: UInt64,
        outcomeIndex: Int,
        maker: Address,
        price: UFix64,
        size: UFix64,
        shares: @{FungibleToken.Vault}
    ): UInt64 {
        pre {
            price > 0.0 && price < 1.0: "price must be between 0 and 1"
            size > 0.0: "size must be positive"
            shares.balance >= size: "insufficient shares for sell order"
        }

        let orderId = self.nextOrderId
        self.nextOrderId = self.nextOrderId + 1

        let order = Order(
            id: orderId,
            marketId: marketId,
            outcomeIndex: outcomeIndex,
            maker: maker,
            side: OrderSide.sell,
            price: price,
            size: size,
            remainingSize: size,
            status: OrderStatus.open
        )

        self.orders[orderId] = order
        
        // Track by market
        if self.ordersByMarket[marketId] == nil {
            self.ordersByMarket[marketId] = []
        }
        self.ordersByMarket[marketId]!.append(orderId)

        // Escrow shares
        self.shareEscrow[orderId] <-! shares

        emit OrderCreated(
            orderId: orderId,
            marketId: marketId,
            outcomeIndex: outcomeIndex,
            maker: maker,
            side: "SELL",
            price: price,
            size: size,
            timestamp: getCurrentBlock().timestamp
        )

        return orderId
    }

    // --- Match Orders ---
    // Taker fills an existing order
    access(all) fun takeBuyOrder(
        orderId: UInt64,
        taker: Address,
        takerShares: @{FungibleToken.Vault},
        fillSize: UFix64
    ): @{FungibleToken.Vault} {
        pre {
            self.orders[orderId] != nil: "order not found"
            self.orders[orderId]!.status == OrderStatus.open || self.orders[orderId]!.status == OrderStatus.partiallyFilled: "order not fillable"
            self.orders[orderId]!.side == OrderSide.buy: "not a buy order"
            fillSize > 0.0 && fillSize <= self.orders[orderId]!.remainingSize: "invalid fill size"
            takerShares.balance >= fillSize: "insufficient shares"
        }

        let order = self.orders[orderId]!
        let collateralAmount = order.price * fillSize

        // Transfer collateral from escrow to taker
        let escrowRef = &self.collateralEscrow[orderId] as auth(FungibleToken.Withdraw) &{FungibleToken.Vault}?
        let payment <- escrowRef!.withdraw(amount: collateralAmount)

        // Transfer shares from taker to maker (stored in escrow temporarily)
        let takerVault <- takerShares as! @OutcomeTokenV4.Vault
        let takerSharesWithdraw <- takerVault.withdraw(amount: fillSize)
        
        // Return remaining shares to taker
        let remainingShares <- takerVault
        
        // Store filled shares for maker to claim
        if self.shareEscrow[orderId] == nil {
            self.shareEscrow[orderId] <-! takerSharesWithdraw
        } else {
            let escrowSharesRef = &self.shareEscrow[orderId] as &{FungibleToken.Vault}?
            escrowSharesRef!.deposit(from: <-takerSharesWithdraw)
        }

        // Update order
        let oldOrder = self.orders[orderId]!
        let newRemainingSize = oldOrder.remainingSize - fillSize
        self.updateOrderRemainingSize(orderId: orderId, remainingSize: newRemainingSize)
        
        if newRemainingSize == 0.0 {
            self.updateOrderStatus(orderId: orderId, status: OrderStatus.filled)
        } else {
            self.updateOrderStatus(orderId: orderId, status: OrderStatus.partiallyFilled)
            emit OrderPartiallyFilled(
                orderId: orderId,
                filledSize: fillSize,
                remainingSize: newRemainingSize
            )
        }

        emit OrderMatched(
            orderId: orderId,
            marketId: order.marketId,
            outcomeIndex: order.outcomeIndex,
            maker: order.maker,
            taker: taker,
            price: order.price,
            size: fillSize,
            timestamp: getCurrentBlock().timestamp
        )

        // Combine payment and remaining shares for taker
        payment.deposit(from: <-remainingShares)
        return <-payment
    }

    access(all) fun takeSellOrder(
        orderId: UInt64,
        taker: Address,
        takerCollateral: @{FungibleToken.Vault},
        fillSize: UFix64
    ): @{FungibleToken.Vault} {
        pre {
            self.orders[orderId] != nil: "order not found"
            self.orders[orderId]!.status == OrderStatus.open || self.orders[orderId]!.status == OrderStatus.partiallyFilled: "order not fillable"
            self.orders[orderId]!.side == OrderSide.sell: "not a sell order"
            fillSize > 0.0 && fillSize <= self.orders[orderId]!.remainingSize: "invalid fill size"
        }

        let order = self.orders[orderId]!
        let collateralAmount = order.price * fillSize

        assert(takerCollateral.balance >= collateralAmount, message: "insufficient collateral")

        // Transfer shares from escrow to taker
        let escrowRef = &self.shareEscrow[orderId] as auth(FungibleToken.Withdraw) &{FungibleToken.Vault}?
        let shares <- escrowRef!.withdraw(amount: fillSize)

        // Transfer collateral from taker to maker (stored in escrow)
        let payment <- takerCollateral.withdraw(amount: collateralAmount)
        
        if self.collateralEscrow[orderId] == nil {
            self.collateralEscrow[orderId] <-! payment
        } else {
            let escrowCollateralRef = &self.collateralEscrow[orderId] as &{FungibleToken.Vault}?
            escrowCollateralRef!.deposit(from: <-payment)
        }

        // Return remaining collateral
        let remainingCollateral <- takerCollateral

        // Update order
        let oldOrder = self.orders[orderId]!
        let newRemainingSize = oldOrder.remainingSize - fillSize
        self.updateOrderRemainingSize(orderId: orderId, remainingSize: newRemainingSize)
        
        if newRemainingSize == 0.0 {
            self.updateOrderStatus(orderId: orderId, status: OrderStatus.filled)
        } else {
            self.updateOrderStatus(orderId: orderId, status: OrderStatus.partiallyFilled)
            emit OrderPartiallyFilled(
                orderId: orderId,
                filledSize: fillSize,
                remainingSize: newRemainingSize
            )
        }

        emit OrderMatched(
            orderId: orderId,
            marketId: order.marketId,
            outcomeIndex: order.outcomeIndex,
            maker: order.maker,
            taker: taker,
            price: order.price,
            size: fillSize,
            timestamp: getCurrentBlock().timestamp
        )

        // Combine shares and remaining collateral for taker
        shares.deposit(from: <-remainingCollateral)
        return <-shares
    }

    // --- Cancel Order ---
    access(all) fun cancelOrder(orderId: UInt64, canceler: Address): @{FungibleToken.Vault} {
        pre {
            self.orders[orderId] != nil: "order not found"
            self.orders[orderId]!.maker == canceler: "only maker can cancel"
            self.orders[orderId]!.status == OrderStatus.open || self.orders[orderId]!.status == OrderStatus.partiallyFilled: "order not cancelable"
        }

        let order = self.orders[orderId]!
        self.updateOrderStatus(orderId: orderId, status: OrderStatus.canceled)

        // Return escrowed assets
        var returnVault: @{FungibleToken.Vault}? <- nil

        if order.side == OrderSide.buy {
            // Return collateral
            let escrowRef = &self.collateralEscrow[orderId] as auth(FungibleToken.Withdraw) &{FungibleToken.Vault}?
            returnVault <-! escrowRef!.withdraw(amount: escrowRef!.balance)
        } else {
            // Return shares
            let escrowRef = &self.shareEscrow[orderId] as auth(FungibleToken.Withdraw) &{FungibleToken.Vault}?
            returnVault <-! escrowRef!.withdraw(amount: escrowRef!.balance)
        }

        emit OrderCanceled(
            orderId: orderId,
            marketId: order.marketId,
            maker: canceler,
            timestamp: getCurrentBlock().timestamp
        )

        return <-returnVault!
    }

    // --- Claim Filled Order ---
    // Maker claims assets from filled order
    access(all) fun claimFilledOrder(orderId: UInt64, claimer: Address): @{FungibleToken.Vault} {
        pre {
            self.orders[orderId] != nil: "order not found"
            self.orders[orderId]!.maker == claimer: "only maker can claim"
            self.orders[orderId]!.status == OrderStatus.filled: "order not filled"
        }

        let order = self.orders[orderId]!
        var claimVault: @{FungibleToken.Vault}? <- nil

        if order.side == OrderSide.buy {
            // Claim shares
            let escrowRef = &self.shareEscrow[orderId] as auth(FungibleToken.Withdraw) &{FungibleToken.Vault}?
            claimVault <-! escrowRef!.withdraw(amount: escrowRef!.balance)
        } else {
            // Claim collateral
            let escrowRef = &self.collateralEscrow[orderId] as auth(FungibleToken.Withdraw) &{FungibleToken.Vault}?
            claimVault <-! escrowRef!.withdraw(amount: escrowRef!.balance)
        }

        return <-claimVault!
    }

    // --- Getters ---
    access(all) fun getOrder(orderId: UInt64): Order? {
        return self.orders[orderId]
    }

    access(all) fun getOrdersByMarket(marketId: UInt64): [Order] {
        let orderIds = self.ordersByMarket[marketId] ?? []
        let orders: [Order] = []
        
        for orderId in orderIds {
            if let order = self.orders[orderId] {
                if order.status == OrderStatus.open || order.status == OrderStatus.partiallyFilled {
                    orders.append(order)
                }
            }
        }
        
        return orders
    }

    access(all) fun getOrderBook(marketId: UInt64, outcomeIndex: Int): {String: [Order]} {
        let allOrders = self.getOrdersByMarket(marketId: marketId)
        let buyOrders: [Order] = []
        let sellOrders: [Order] = []
        
        for order in allOrders {
            if order.outcomeIndex == outcomeIndex {
                if order.side == OrderSide.buy {
                    buyOrders.append(order)
                } else {
                    sellOrders.append(order)
                }
            }
        }
        
        return {
            "buy": buyOrders,
            "sell": sellOrders
        }
    }

    // --- Helper: Find Best Buy Order (highest price) ---
    access(all) fun findBestBuyOrder(marketId: UInt64, outcomeIndex: Int): Order? {
        let allOrders = self.getOrdersByMarket(marketId: marketId)
        var bestOrder: Order? = nil
        var bestPrice: UFix64 = 0.0
        
        for order in allOrders {
            if order.outcomeIndex == outcomeIndex && order.side == OrderSide.buy {
                if order.price > bestPrice {
                    bestPrice = order.price
                    bestOrder = order
                }
            }
        }
        
        return bestOrder
    }

    // --- Helper: Find Best Sell Order (lowest price) ---
    access(all) fun findBestSellOrder(marketId: UInt64, outcomeIndex: Int): Order? {
        let allOrders = self.getOrdersByMarket(marketId: marketId)
        var bestOrder: Order? = nil
        var bestPrice: UFix64 = 1.0
        
        for order in allOrders {
            if order.outcomeIndex == outcomeIndex && order.side == OrderSide.sell {
                if order.price < bestPrice {
                    bestPrice = order.price
                    bestOrder = order
                }
            }
        }
        
        return bestOrder
    }

    // --- Helper: Calculate effective buy price for outcome ---
    // Returns price user would pay to get 1 share of desired outcome
    access(all) fun getEffectiveBuyPrice(marketId: UInt64, desiredOutcomeIndex: Int): UFix64 {
        // To buy 1 YES:
        // 1. Split 1 FLOW → 1 YES + 1 NO + ... (all outcomes)
        // 2. Sell all non-desired outcomes
        // 3. Effective price = 1.0 - (proceeds from selling others)
        
        var totalProceeds: UFix64 = 0.0
        let outcomeCount = OutcomeTokenV4.getOutcomeCount(marketId: marketId) ?? 0
        
        var i = 0
        while i < outcomeCount {
            if i != desiredOutcomeIndex {
                // Find best buy order for this outcome (someone willing to buy)
                let bestBuyOrder = self.findBestBuyOrder(marketId: marketId, outcomeIndex: i)
                if bestBuyOrder != nil {
                    totalProceeds = totalProceeds + bestBuyOrder!.price
                }
            }
            i = i + 1
        }
        
        // Effective price = cost to split - proceeds from selling others
        return 1.0 - totalProceeds
    }

    // --- Helper: Calculate effective sell price for outcome ---
    access(all) fun getEffectiveSellPrice(marketId: UInt64, outcomeToSell: Int): UFix64 {
        // To sell 1 YES:
        // 1. Buy all other outcomes (NO, MAYBE, etc.)
        // 2. Merge complete set → get 1 FLOW back
        // 3. Effective price = 1.0 - (cost to buy others)
        
        var totalCost: UFix64 = 0.0
        let outcomeCount = OutcomeTokenV4.getOutcomeCount(marketId: marketId) ?? 0
        
        var i = 0
        while i < outcomeCount {
            if i != outcomeToSell {
                // Find best sell order for this outcome (someone willing to sell)
                let bestSellOrder = self.findBestSellOrder(marketId: marketId, outcomeIndex: i)
                if bestSellOrder != nil {
                    totalCost = totalCost + bestSellOrder!.price
                }
            }
            i = i + 1
        }
        
        // Effective price = merge proceeds - cost to buy others
        return 1.0 - totalCost
    }

    // --- Init ---
    init() {
        self.orders = {}
        self.nextOrderId = 1
        self.ordersByMarket = {}
        self.collateralEscrow <- {}
        self.shareEscrow <- {}
    }
}
