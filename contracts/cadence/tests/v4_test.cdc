import Test
import CoreMarketContractV4 from "CoreMarketContractV4"
import OrderBookV4 from "OrderBookV4"
import OutcomeTokenV4 from "OutcomeTokenV4"
import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"

access(all) let adminAccount = Test.serviceAccount()
access(all) var testMarketId: UInt64 = 1

// Transaction codes
access(all) let splitPositionCode = Test.readFile("../transactions/splitPositionV4.cdc")
access(all) let mergePositionCode = Test.readFile("../transactions/mergePositionV4.cdc")
access(all) let createBuyOrderCode = Test.readFile("../transactions/createBuyOrderV4.cdc")
access(all) let createSellOrderCode = Test.readFile("../transactions/createSellOrderV4.cdc")
access(all) let cancelOrderCode = Test.readFile("../transactions/cancelOrderV4.cdc")
access(all) let buyOutcomeDirectlyCode = Test.readFile("../transactions/buyOutcomeDirectlyV4.cdc")

// Script codes
access(all) let getMarketCode = Test.readFile("../scripts/getMarketV4.cdc")
access(all) let getOrderBookCode = Test.readFile("../scripts/getOrderBookV4.cdc")
access(all) let getUserBalancesCode = Test.readFile("../scripts/getUserOutcomeBalancesV4.cdc")

// Setup Flow vault and mint tokens
access(all) let setupFlowCode =
    "import FlowToken from \"FlowToken\"\n"
        .concat("import FungibleToken from \"FungibleToken\"\n")
        .concat("transaction(amount: UFix64) {\n")
        .concat("    prepare(signer: auth(Storage, Capabilities) &Account) {\n")
        .concat("        if signer.storage.borrow<&FlowToken.Vault>(from: /storage/flowTokenVault) == nil {\n")
        .concat("            signer.storage.save(<-FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>()), to: /storage/flowTokenVault)\n")
        .concat("            let receiverCap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(/storage/flowTokenVault)\n")
        .concat("            signer.capabilities.publish(receiverCap, at: /public/flowTokenReceiver)\n")
        .concat("            let balanceCap = signer.capabilities.storage.issue<&{FungibleToken.Balance}>(/storage/flowTokenVault)\n")
        .concat("            signer.capabilities.publish(balanceCap, at: /public/flowTokenBalance)\n")
        .concat("        }\n")
        .concat("        let mintVault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())\n")
        .concat("        let vaultRef = signer.storage.borrow<&FlowToken.Vault>(from: /storage/flowTokenVault)!\n")
        .concat("        vaultRef.deposit(from: <-mintVault)\n")
        .concat("    }\n")
        .concat("}\n")

// Create test market directly in contract
access(all) let createTestMarketCode =
    "import CoreMarketContractV4 from \"CoreMarketContractV4\"\n"
        .concat("transaction(question: String, outcomes: [String], closeAt: UFix64) {\n")
        .concat("    prepare(admin: auth(Storage) &Account) {\n")
        .concat("        CoreMarketContractV4.createMarket(\n")
        .concat("            creator: admin.address,\n")
        .concat("            question: question,\n")
        .concat("            outcomes: outcomes,\n")
        .concat("            closeAt: closeAt,\n")
        .concat("            patrolThreshold: 100.0\n")
        .concat("        )\n")
        .concat("    }\n")
        .concat("}\n")

// Test 1: Split position
access(all) fun testSplitPosition() {
    let user = Test.createAccount()
    
    // Setup Flow vault with 1000 FLOW
    let setupResult = Test.executeTransaction(setupFlowCode, [1000.0], user)
    Test.expect(setupResult, Test.beSucceeded())
    
    // Create test market
    let futureTime = getCurrentBlock().timestamp + 86400.0
    let createResult = Test.executeTransaction(
        createTestMarketCode,
        ["Will BTC reach 100k?", ["YES", "NO"], futureTime],
        adminAccount
    )
    Test.expect(createResult, Test.beSucceeded())
    
    // Split 100 FLOW into outcome tokens
    let splitResult = Test.executeTransaction(
        splitPositionCode,
        [testMarketId, 100.0],
        user
    )
    Test.expect(splitResult, Test.beSucceeded())
    
    // Check user balances - should have 100 YES + 100 NO
    let balancesResult = Test.executeScript(
        getUserBalancesCode,
        [user.address, testMarketId, 2]
    )
    Test.expect(balancesResult, Test.beSucceeded())
    
    let balances = balancesResult.returnValue! as! [UFix64]
    Test.assertEqual(100.0, balances[0]) // YES balance
    Test.assertEqual(100.0, balances[1]) // NO balance
}

// Test 2: Merge position
access(all) fun testMergePosition() {
    let user = Test.createAccount()
    
    // Setup and split first
    Test.executeTransaction(setupFlowCode, [1000.0], user)
    let futureTime = getCurrentBlock().timestamp + 86400.0
    Test.executeTransaction(
        createTestMarketCode,
        ["Test merge", ["YES", "NO"], futureTime],
        adminAccount
    )
    Test.executeTransaction(splitPositionCode, [testMarketId, 100.0], user)
    
    // Now merge 50 shares back
    let mergeResult = Test.executeTransaction(
        mergePositionCode,
        [testMarketId, 50.0, 2],
        user
    )
    Test.expect(mergeResult, Test.beSucceeded())
    
    // Check balances - should have 50 YES + 50 NO remaining
    let balancesResult = Test.executeScript(
        getUserBalancesCode,
        [user.address, testMarketId, 2]
    )
    let balances = balancesResult.returnValue! as! [UFix64]
    Test.assertEqual(50.0, balances[0])
    Test.assertEqual(50.0, balances[1])
}

// Test 3: Create buy order
access(all) fun testCreateBuyOrder() {
    let user = Test.createAccount()
    
    // Setup
    Test.executeTransaction(setupFlowCode, [1000.0], user)
    let futureTime = getCurrentBlock().timestamp + 86400.0
    Test.executeTransaction(
        createTestMarketCode,
        ["Test buy order", ["YES", "NO"], futureTime],
        adminAccount
    )
    
    // Create buy order: want to buy 100 YES at 0.65 price
    let buyResult = Test.executeTransaction(
        createBuyOrderCode,
        [testMarketId, 0, 0.65, 100.0],
        user
    )
    Test.expect(buyResult, Test.beSucceeded())
    
    // Check order book
    let orderBookResult = Test.executeScript(
        getOrderBookCode,
        [testMarketId, 0]
    )
    Test.expect(orderBookResult, Test.beSucceeded())
}

// Test 4: Create sell order
access(all) fun testCreateSellOrder() {
    let user = Test.createAccount()
    
    // Setup and split first to get outcome tokens
    Test.executeTransaction(setupFlowCode, [1000.0], user)
    let futureTime = getCurrentBlock().timestamp + 86400.0
    Test.executeTransaction(
        createTestMarketCode,
        ["Test sell order", ["YES", "NO"], futureTime],
        adminAccount
    )
    Test.executeTransaction(splitPositionCode, [testMarketId, 100.0], user)
    
    // Create sell order: sell 50 YES at 0.70 price
    let sellResult = Test.executeTransaction(
        createSellOrderCode,
        [testMarketId, 0, 0.70, 50.0],
        user
    )
    Test.expect(sellResult, Test.beSucceeded())
    
    // Check balances - 50 YES should be escrowed
    let balancesResult = Test.executeScript(
        getUserBalancesCode,
        [user.address, testMarketId, 2]
    )
    let balances = balancesResult.returnValue! as! [UFix64]
    Test.assertEqual(50.0, balances[0]) // 50 YES remaining (50 escrowed)
}

// Test 5: Cancel order
access(all) fun testCancelOrder() {
    let user = Test.createAccount()
    
    // Setup and create buy order
    Test.executeTransaction(setupFlowCode, [1000.0], user)
    let futureTime = getCurrentBlock().timestamp + 86400.0
    Test.executeTransaction(
        createTestMarketCode,
        ["Test cancel", ["YES", "NO"], futureTime],
        adminAccount
    )
    Test.executeTransaction(createBuyOrderCode, [testMarketId, 0, 0.65, 100.0], user)
    
    // Cancel order (orderId=0, isBuyOrder=true)
    let cancelResult = Test.executeTransaction(
        cancelOrderCode,
        [UInt64(0), testMarketId, 0, true],
        user
    )
    Test.expect(cancelResult, Test.beSucceeded())
}

// Test 6: Buy outcome directly
access(all) fun testBuyOutcomeDirectly() {
    let user = Test.createAccount()
    
    // Setup
    Test.executeTransaction(setupFlowCode, [1000.0], user)
    let futureTime = getCurrentBlock().timestamp + 86400.0
    Test.executeTransaction(
        createTestMarketCode,
        ["Test direct buy", ["YES", "NO"], futureTime],
        adminAccount
    )
    
    // Buy 100 YES directly (split + keep YES + sell NO at 0.5)
    let buyResult = Test.executeTransaction(
        buyOutcomeDirectlyCode,
        [testMarketId, 0, 100.0, 0.5, 2],
        user
    )
    Test.expect(buyResult, Test.beSucceeded())
    
    // Check balances - should have 100 YES
    let balancesResult = Test.executeScript(
        getUserBalancesCode,
        [user.address, testMarketId, 2]
    )
    let balances = balancesResult.returnValue! as! [UFix64]
    Test.assertEqual(100.0, balances[0]) // 100 YES kept
    Test.assertEqual(0.0, balances[1])   // NO was listed for sale
}
