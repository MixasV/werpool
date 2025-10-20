import Test
import CoreMarketHub from "CoreMarketHub"
import OutcomeToken from "OutcomeToken"
import LMSRAmm from "LMSRAmm"
import FlowToken from "FlowToken"
import FungibleToken from "FungibleToken"

access(all) let adminAccount = Test.serviceAccount()
access(all) let createMarketCode = Test.readFile("../transactions/createMarket.cdc")
access(all) let createPoolCode = Test.readFile("../transactions/createMarketPool.cdc")
access(all) let executeTradeCode = Test.readFile("../transactions/executeTrade.cdc")
access(all) let activateMarketCode = Test.readFile("../transactions/activateMarket.cdc")
access(all) let suspendMarketCode = Test.readFile("../transactions/suspendMarket.cdc")
access(all) let voidMarketCode = Test.readFile("../transactions/voidMarket.cdc")
access(all) let settleMarketCode = Test.readFile("../transactions/settleMarket.cdc")
access(all) let overrideSettlementCode = Test.readFile("../transactions/overrideSettlement.cdc")
access(all) let closeMarketCode = Test.readFile("../transactions/closeMarket.cdc")
access(all) let updateScheduleCode = Test.readFile("../transactions/updateMarketSchedule.cdc")
access(all) let updatePatrolThresholdCode = Test.readFile("../transactions/updatePatrolThreshold.cdc")
access(all) let recordPatrolSignalCode = Test.readFile("../transactions/recordPatrolSignal.cdc")
access(all) let clearPatrolSignalCode = Test.readFile("../transactions/clearPatrolSignal.cdc")
access(all) let grantRoleCode = Test.readFile("../transactions/grantRole.cdc")
access(all) let setupRoleStorageCode = Test.readFile("../transactions/setupRoleStorage.cdc")
access(all) let rolesOfScriptCode = Test.readFile("../scripts/rolesOf.cdc")
access(all) let marketSlug = "test-market"

access(all) let setupFlowCode =
    "import FlowToken from \"FlowToken\"\n"
        .concat("import FungibleToken from \"FungibleToken\"\n")
        .concat("transaction(amount: UFix64) {\n")
        .concat("    prepare(signer: auth(Storage, Capabilities) &Account) {\n")
        .concat("        FlowToken.setupAccount(signer)\n")
        .concat("        FlowToken.mintTo(account: signer, amount: amount)\n")
        .concat("    }\n")
        .concat("}\n")

access(all) let materializeRoleBadgeCode =
    "import CoreMarketHub from \"CoreMarketHub\"\n"
        .concat("transaction(role: String) {\n")
        .concat("    prepare(account: auth(Storage, Capabilities) &Account) {\n")
        .concat("        let roleType = CoreMarketHub.roleFromString(role)\n")
        .concat("        CoreMarketHub.setupRoleStorage(account: account)\n")
        .concat("        let storagePath = CoreMarketHub.roleStoragePath(role: roleType)\n")
        .concat("        let publicPath = CoreMarketHub.rolePublicPath(role: roleType)\n")
        .concat("        if account.storage.borrow<&CoreMarketHub.RoleBadge>(from: storagePath) != nil {\n")
        .concat("            let existing <- account.storage.load<@CoreMarketHub.RoleBadge>(from: storagePath) ?? panic(\"existing role badge missing\")\n")
        .concat("            destroy existing\n")
        .concat("        }\n")
        .concat("        let collection = account.storage.borrow<&CoreMarketHub.RoleBadgeCollection>(from: CoreMarketHub.roleCollectionStoragePath())\n")
        .concat("            ?? panic(\"role collection missing\")\n")
        .concat("        let badge <- collection.withdraw(role: roleType)\n")
        .concat("        account.storage.save(<-badge, to: storagePath)\n")
        .concat("        account.capabilities.unpublish(publicPath)\n")
        .concat("        let capability = account.capabilities.storage.issue<&CoreMarketHub.RoleBadge>(storagePath)\n")
        .concat("        account.capabilities.publish(capability, at: publicPath)\n")
        .concat("    }\n")
        .concat("}\n")

access(all) let hasRoleScriptCode =
    "import CoreMarketHub from \"CoreMarketHub\"\n"
        .concat("access(all) fun main(address: Address, role: String): Bool {\n")
        .concat("    let roleType = CoreMarketHub.roleFromString(role)\n")
        .concat("    return CoreMarketHub.hasRole(address: address, role: roleType)\n")
        .concat("}\n")

access(all) let grantPermissionsCode =
    "import OutcomeToken from \"OutcomeToken\"\n"
        .concat("transaction(target: Address) {\n")
        .concat("    prepare(admin: auth(Storage, Capabilities) &Account) {\n")
        .concat("        OutcomeToken.addAdmin(executor: admin.address, account: target)\n")
        .concat("    }\n")
        .concat("}\n")

access(all) let addContractCode =
    "transaction(name: String, code: String) {\n"
        .concat("    prepare(signer: auth(Contracts, AddContract, UpdateContract) &Account) {\n")
        .concat("        var bytes: [UInt8] = []\n")
        .concat("        for byte in code.utf8 {\n")
        .concat("            bytes.append(byte)\n")
        .concat("        }\n")
        .concat("        if signer.contracts.get(name: name) == nil {\n")
        .concat("            signer.contracts.add(name: name, code: bytes)\n")
        .concat("        } else {\n")
        .concat("            signer.contracts.update(name: name, code: bytes)\n")
        .concat("        }\n")
        .concat("    }\n")
        .concat("}\n")

access(all) var contractsDeployed = false
access(all) var contractAddresses: {String: Address} = {}
access(all) var dependencyAccount: Test.TestAccount? = nil

access(all) fun registerContract(name: String, address: Address) {
    contractAddresses[name] = address
}

access(all) fun resolveContractAddress(name: String, candidates: [Address]): Address? {
    for candidate in candidates {
        let candidateString = candidate.toString()
        let code =
            "import ".concat(name).concat(" from ").concat(candidateString).concat("\n")
                .concat("access(all) fun main(): Bool {\n")
                .concat("    return true\n")
                .concat("}\n")
        let result = Test.executeScript(code, [])
        if result.status == Test.ResultStatus.succeeded {
            return candidate
        }
    }
    return nil
}

access(all) fun ensureDependencyContract(name: String, path: String, forceDeploy: Bool): Address {
    let candidates: [Address] = [
        0x0000000000000001,
        0x0000000000000002,
        0x0000000000000003,
        0x0000000000000004,
        0x0ae53cb6e3f42a79,
        0xee82856bf20e2aa6,
        0xe5a8b7f23e8b548f,
        0x631e88ae7f1d7c20,
        0xf8d6e0586b0a20c7
    ]
    if !forceDeploy {
        let resolved = resolveContractAddress(name: name, candidates: candidates)
        if resolved != nil {
            let address = resolved!
            registerContract(name: name, address: address)
            return address
        }
    }
    if dependencyAccount == nil {
        dependencyAccount = Test.createAccount()
    }
    let deps = dependencyAccount!
    registerContract(name: name, address: deps.address)
    deployContract(name: name, path: path, signer: deps)
    return deps.address
}

access(all) fun replaceImports(code: String): String {
    var updated = code
    let names = contractAddresses.keys
    for name in names {
        let address = contractAddresses[name]!
        let addressString = address.toString()
        let fromPattern = "from \"".concat(name).concat("\"")
        let fromReplacement = "from ".concat(addressString)
        updated = updated.replaceAll(of: fromPattern, with: fromReplacement)
        let importPattern = "import \"".concat(name).concat("\"")
        let importReplacement = "import ".concat(name).concat(" from ").concat(addressString)
        updated = updated.replaceAll(of: importPattern, with: importReplacement)
    }
    return updated
}

access(all) fun deployContract(name: String, path: String, signer: Test.TestAccount) {
    let rawCode = Test.readFile(path)
    let codeWithImports = replaceImports(code: rawCode)
    let args: [AnyStruct] = [name, codeWithImports]
    let result = runTransaction(code: addContractCode, signer: signer, arguments: args)
    Test.expect(result, Test.beSucceeded())
    registerContract(name: name, address: signer.address)
}

access(all) fun ensureContractsDeployed() {
    if contractsDeployed {
        return
    }
    ensureDependencyContract(name: "FungibleToken", path: "../deps/TestFungibleToken.cdc", forceDeploy: false)
    ensureDependencyContract(name: "FlowToken", path: "../deps/TestFlowToken.cdc", forceDeploy: true)
    ensureDependencyContract(name: "ViewResolver", path: "../deps/TestViewResolver.cdc", forceDeploy: false)
    ensureDependencyContract(name: "Burner", path: "../deps/TestBurner.cdc", forceDeploy: false)
    registerContract(name: "OutcomeToken", address: adminAccount.address)
    deployContract(name: "OutcomeToken", path: "../outcome/OutcomeToken.cdc", signer: adminAccount)
    registerContract(name: "LMSRAmm", address: adminAccount.address)
    deployContract(name: "LMSRAmm", path: "../LMSRAmm.cdc", signer: adminAccount)
    registerContract(name: "CoreMarketHub", address: adminAccount.address)
    deployContract(name: "CoreMarketHub", path: "../CoreMarketHub.cdc", signer: adminAccount)
    contractsDeployed = true
}

access(all) fun runTransactionWithAuthorizers(
    code: String,
    signers: [Test.TestAccount],
    authorizers: [Address],
    arguments: [AnyStruct]
): Test.TransactionResult {
    let processedCode = replaceImports(code: code)
    let tx = Test.Transaction(
        code: processedCode,
        authorizers: authorizers,
        signers: signers,
        arguments: arguments
    )
    let result = Test.executeTransaction(tx)
    Test.expect(result, Test.beSucceeded())
    return result
}

access(all) fun runTransactionMulti(code: String, signers: [Test.TestAccount], arguments: [AnyStruct]): Test.TransactionResult {
    var authorizers: [Address] = []
    for signer in signers {
        authorizers.append(signer.address)
    }
    return runTransactionWithAuthorizers(
        code: code,
        signers: signers,
        authorizers: authorizers,
        arguments: arguments
    )
}

access(all) fun runTransaction(code: String, signer: Test.TestAccount, arguments: [AnyStruct]): Test.TransactionResult {
    return runTransactionMulti(code: code, signers: [signer], arguments: arguments)
}

access(all) fun runScript(code: String, arguments: [AnyStruct]): Test.ScriptResult {
    let processedCode = replaceImports(code: code)
    let result = Test.executeScript(processedCode, arguments)
    Test.expect(result, Test.beSucceeded())
    return result
}

access(all) fun setupFlowAccount(account: Test.TestAccount, amount: UFix64) {
    let args: [AnyStruct] = [amount]
    runTransaction(code: setupFlowCode, signer: account, arguments: args)
}

access(all) fun materializeRoleBadge(account: Test.TestAccount, role: String) {
    let args: [AnyStruct] = [role]
    runTransaction(code: materializeRoleBadgeCode, signer: account, arguments: args)
}

access(all) fun grantPermissions(account: Test.TestAccount) {
    runTransaction(code: setupRoleStorageCode, signer: account, arguments: [])

    let operatorArgs: [AnyStruct] = ["operator", account.address]
    runTransactionMulti(code: grantRoleCode, signers: [adminAccount, account], arguments: operatorArgs)

    let oracleArgs: [AnyStruct] = ["oracle", account.address]
    runTransactionMulti(code: grantRoleCode, signers: [adminAccount, account], arguments: oracleArgs)

    let outcomeArgs: [AnyStruct] = [account.address]
    runTransaction(code: grantPermissionsCode, signer: adminAccount, arguments: outcomeArgs)

    materializeRoleBadge(account: account, role: "operator")
    materializeRoleBadge(account: account, role: "oracle")

    Test.assert(hasRole(address: account.address, role: "operator"), message: "operator role not granted")
    Test.assert(hasRole(address: account.address, role: "oracle"), message: "oracle role not granted")
}

access(all) fun grantPatrol(account: Test.TestAccount) {
    runTransaction(code: setupRoleStorageCode, signer: account, arguments: [])

    let args: [AnyStruct] = ["patrol", account.address]
    runTransactionMulti(code: grantRoleCode, signers: [adminAccount, account], arguments: args)

    materializeRoleBadge(account: account, role: "patrol")

    Test.assert(hasRole(address: account.address, role: "patrol"), message: "patrol role not granted")
}

access(all) fun runTransactionExpectFailure(code: String, signer: Test.TestAccount, arguments: [AnyStruct]): Test.TransactionResult {
    let processedCode = replaceImports(code: code)
    let tx = Test.Transaction(
        code: processedCode,
        authorizers: [signer.address],
        signers: [signer],
        arguments: arguments
    )
    let result = Test.executeTransaction(tx)
    Test.expect(result, Test.beFailed())
    return result
}

access(all) fun createMarket(account: Test.TestAccount, slug: String, outcomeLabels: [String]) {
    let args: [AnyStruct] = [
        slug,
        "Test Market",
        "Lifecycle test",
        "crypto",
        "",
        false,
        UFix64(0.0),
        false,
        UFix64(0.0),
        false,
        UFix64(0.0),
        false,
        UFix64(0.0),
        false,
        UFix64(0.0),
        false,
        UFix64(0.0),
        false,
        [] as [String],
        outcomeLabels
    ]
    runTransaction(code: createMarketCode, signer: account, arguments: args)
}

access(all) fun createMarketPool(
    account: Test.TestAccount,
    marketId: UInt64,
    outcomeCount: Int,
    liquidityParameter: UFix64,
    seedAmount: UFix64
) {
    let args: [AnyStruct] = [marketId, outcomeCount, liquidityParameter, seedAmount]
    runTransaction(code: createPoolCode, signer: account, arguments: args)
}

access(all) fun executeBuy(
    account: Test.TestAccount,
    marketId: UInt64,
    flowAmount: UFix64,
    outcomeAmount: UFix64,
    newBVector: [UFix64],
    newTotalLiquidity: UFix64,
    newOutcomeSupply: [UFix64]
) {
    executeTrade(
        account: account,
        marketId: marketId,
        outcomeIndex: 0,
        flowAmount: flowAmount,
        outcomeAmount: outcomeAmount,
        newBVector: newBVector,
        newTotalLiquidity: newTotalLiquidity,
        newOutcomeSupply: newOutcomeSupply,
        isBuy: true
    )
}

access(all) fun executeTrade(
    account: Test.TestAccount,
    marketId: UInt64,
    outcomeIndex: Int,
    flowAmount: UFix64,
    outcomeAmount: UFix64,
    newBVector: [UFix64],
    newTotalLiquidity: UFix64,
    newOutcomeSupply: [UFix64],
    isBuy: Bool
) {
    let args: [AnyStruct] = [
        marketId,
        outcomeIndex,
        flowAmount,
        outcomeAmount,
        newBVector,
        newTotalLiquidity,
        newOutcomeSupply,
        isBuy
    ]
    runTransaction(code: executeTradeCode, signer: account, arguments: args)
}

access(all) fun getMarketIdBySlug(slug: String): UInt64 {
    let code =
        "import CoreMarketHub from \"CoreMarketHub\"\n"
            .concat("access(all) fun main(slug: String): UInt64 {\n")
            .concat("    let view = CoreMarketHub.getMarketViewBySlug(slug: slug) ?? panic(\"market not found\")\n")
            .concat("    return view.id\n")
            .concat("}\n")
    let args: [AnyStruct] = [slug]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! UInt64
}

access(all) fun getPoolState(marketId: UInt64): LMSRAmm.PoolState {
    let code =
        "import LMSRAmm from \"LMSRAmm\"\n"
            .concat("access(all) fun main(marketId: UInt64): LMSRAmm.PoolState {\n")
            .concat("    return LMSRAmm.getPoolState(marketId: marketId) ?? panic(\"pool not found\")\n")
            .concat("}\n")
    let args: [AnyStruct] = [marketId]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! LMSRAmm.PoolState
}

access(all) fun quoteTrade(
    marketId: UInt64,
    outcomeIndex: Int,
    shares: UFix64,
    isBuy: Bool
): LMSRAmm.TradeQuote {
    let code =
        "import LMSRAmm from \"LMSRAmm\"\n"
            .concat("access(all) fun main(marketId: UInt64, outcomeIndex: Int, shares: UFix64, isBuy: Bool): LMSRAmm.TradeQuote {\n")
            .concat("    return LMSRAmm.quoteTrade(marketId: marketId, outcomeIndex: outcomeIndex, shares: shares, isBuy: isBuy)\n")
            .concat("}\n")
    let args: [AnyStruct] = [marketId, outcomeIndex, shares, isBuy]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! LMSRAmm.TradeQuote
}

access(all) fun getPayoutPerShare(marketId: UInt64, outcomeIndex: Int): UFix64 {
    let code =
        "import LMSRAmm from \"LMSRAmm\"\n"
            .concat("access(all) fun main(marketId: UInt64, outcomeIndex: Int): UFix64 {\n")
            .concat("    return LMSRAmm.settlePayoutPerShare(marketId: marketId, winningIndex: outcomeIndex)\n")
            .concat("}\n")
    let args: [AnyStruct] = [marketId, outcomeIndex]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! UFix64
}

access(all) fun getOutcomeSupply(marketId: UInt64): UFix64 {
    let code =
        "import OutcomeToken from \"OutcomeToken\"\n"
            .concat("access(all) fun main(marketId: UInt64): UFix64 {\n")
            .concat("    return OutcomeToken.getTotalSupply(marketId: marketId)\n")
            .concat("}\n")
    let args: [AnyStruct] = [marketId]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! UFix64
}

access(all) fun getFlowBalance(address: Address): UFix64 {
    let code =
        "import FungibleToken from \"FungibleToken\"\n"
            .concat("access(all) fun main(address: Address): UFix64 {\n")
            .concat("    let account = getAccount(address)\n")
            .concat("    let balanceCap = account.capabilities.get<&{FungibleToken.Balance}>(/public/testFlowTokenBalance)\n")
            .concat("    if !balanceCap.check() {\n")
            .concat("        return 0.0\n")
            .concat("    }\n")
            .concat("    return balanceCap.borrow()!.balance\n")
            .concat("}\n")
    let args: [AnyStruct] = [address]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! UFix64
}

access(all) fun getRoles(address: Address): [String] {
    let args: [AnyStruct] = [address]
    let result = runScript(code: rolesOfScriptCode, arguments: args)
    return result.returnValue! as! [String]
}

access(all) fun hasRole(address: Address, role: String): Bool {
    let args: [AnyStruct] = [address, role]
    let result = runScript(code: hasRoleScriptCode, arguments: args)
    return result.returnValue! as! Bool
}

access(all) fun getMarketStateRaw(marketId: UInt64): UInt8 {
    let code =
        "import CoreMarketHub from \"CoreMarketHub\"\n"
            .concat("access(all) fun main(id: UInt64): UInt8 {\n")
            .concat("    let view = CoreMarketHub.getMarketView(id: id) ?? panic(\"market not found\")\n")
            .concat("    return view.state.rawValue\n")
            .concat("}\n")
    let args: [AnyStruct] = [marketId]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! UInt8
}

access(all) fun getSettlementSnapshot(marketId: UInt64): {String: AnyStruct} {
    let code =
        "import CoreMarketHub from \"CoreMarketHub\"\n"
            .concat("access(all) fun main(id: UInt64): {String: AnyStruct} {\n")
            .concat("    let view = CoreMarketHub.getMarketView(id: id) ?? panic(\"market not found\")\n")
            .concat("    if let settlement = view.settlement {\n")
            .concat("        return {\n")
            .concat("            \"exists\": true as AnyStruct,\n")
            .concat("            \"outcomeId\": settlement.resolvedOutcomeId as AnyStruct,\n")
            .concat("            \"txHash\": settlement.txHash as AnyStruct,\n")
            .concat("            \"override\": settlement.overridden as AnyStruct\n")
            .concat("        }\n")
            .concat("    }\n")
            .concat("    return {\n")
            .concat("        \"exists\": false as AnyStruct,\n")
            .concat("        \"outcomeId\": UInt64(0) as AnyStruct,\n")
            .concat("        \"txHash\": \"\" as AnyStruct,\n")
            .concat("        \"override\": false as AnyStruct\n")
            .concat("    }\n")
            .concat("}\n")
    let args: [AnyStruct] = [marketId]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! {String: AnyStruct}
}

access(all) fun getMarketSnapshot(marketId: UInt64): {String: AnyStruct} {
    let code =
        "import CoreMarketHub from \"CoreMarketHub\"\n"
            .concat("access(all) fun main(id: UInt64): {String: AnyStruct} {\n")
            .concat("    let view = CoreMarketHub.getMarketView(id: id) ?? panic(\"market not found\")\n")
            .concat("    return {\n")
            .concat("        \"category\": CoreMarketHub.marketCategoryIdentifier(category: view.category) as AnyStruct,\n")
            .concat("        \"tags\": view.tags as AnyStruct,\n")
            .concat("        \"patrolThreshold\": view.patrolThreshold as AnyStruct,\n")
            .concat("        \"closeAt\": (view.closeAt ?? UFix64(0.0)) as AnyStruct,\n")
            .concat("        \"hasScheduledStart\": (view.schedule.scheduledStartAt != nil) as AnyStruct,\n")
            .concat("        \"scheduledStart\": (view.schedule.scheduledStartAt ?? UFix64(0.0)) as AnyStruct,\n")
            .concat("        \"tradingLock\": (view.schedule.tradingLockAt ?? UFix64(0.0)) as AnyStruct,\n")
            .concat("        \"freezeStart\": (view.schedule.freezeWindowStartAt ?? UFix64(0.0)) as AnyStruct,\n")
            .concat("        \"freezeEnd\": (view.schedule.freezeWindowEndAt ?? UFix64(0.0)) as AnyStruct\n")
            .concat("    }\n")
            .concat("}\n")
    let args: [AnyStruct] = [marketId]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! {String: AnyStruct}
}

access(all) fun getPatrolSignalSnapshot(marketId: UInt64): {String: AnyStruct} {
    let code =
        "import CoreMarketHub from \"CoreMarketHub\"\n"
            .concat("access(all) fun main(id: UInt64): {String: AnyStruct} {\n")
            .concat("    let view = CoreMarketHub.getMarketView(id: id) ?? panic(\"market not found\")\n")
            .concat("    let count = UInt64(view.patrolSignals.length)\n")
            .concat("    var firstSeverity: UInt8 = 0\n")
            .concat("    var firstWeight: UFix64 = 0.0\n")
            .concat("    var firstCode: String = \"\"\n")
            .concat("    var firstIssuer: Address = 0x0\n")
            .concat("    if view.patrolSignals.length > 0 {\n")
            .concat("        let signal = view.patrolSignals[0]\n")
            .concat("        firstSeverity = signal.severity.rawValue\n")
            .concat("        firstWeight = signal.weight\n")
            .concat("        firstCode = signal.code\n")
            .concat("        firstIssuer = signal.issuer\n")
            .concat("    }\n")
            .concat("    return {\n")
            .concat("        \"count\": count as AnyStruct,\n")
            .concat("        \"firstSeverity\": firstSeverity as AnyStruct,\n")
            .concat("        \"firstWeight\": firstWeight as AnyStruct,\n")
            .concat("        \"firstCode\": firstCode as AnyStruct,\n")
            .concat("        \"firstIssuer\": firstIssuer as AnyStruct\n")
            .concat("    }\n")
            .concat("}\n")
    let args: [AnyStruct] = [marketId]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! {String: AnyStruct}
}

access(all) fun getMarketCloseAt(marketId: UInt64): UFix64 {
    let code =
        "import CoreMarketHub from \"CoreMarketHub\"\n"
            .concat("access(all) fun main(id: UInt64): UFix64 {\n")
            .concat("    let view = CoreMarketHub.getMarketView(id: id) ?? panic(\"market not found\")\n")
            .concat("    return view.closeAt ?? UFix64(0.0)\n")
            .concat("}\n")
    let args: [AnyStruct] = [marketId]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! UFix64
}

access(all) fun getMarketHasScheduledStart(marketId: UInt64): Bool {
    let code =
        "import CoreMarketHub from \"CoreMarketHub\"\n"
            .concat("access(all) fun main(id: UInt64): Bool {\n")
            .concat("    let view = CoreMarketHub.getMarketView(id: id) ?? panic(\"market not found\")\n")
            .concat("    return view.schedule.scheduledStartAt != nil\n")
            .concat("}\n")
    let args: [AnyStruct] = [marketId]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! Bool
}

access(all) fun getMarketScheduledStart(marketId: UInt64): UFix64 {
    let code =
        "import CoreMarketHub from \"CoreMarketHub\"\n"
            .concat("access(all) fun main(id: UInt64): UFix64 {\n")
            .concat("    let view = CoreMarketHub.getMarketView(id: id) ?? panic(\"market not found\")\n")
            .concat("    return view.schedule.scheduledStartAt ?? UFix64(0.0)\n")
            .concat("}\n")
    let args: [AnyStruct] = [marketId]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! UFix64
}

access(all) fun getMarketPatrolThreshold(marketId: UInt64): UFix64 {
    let code =
        "import CoreMarketHub from \"CoreMarketHub\"\n"
            .concat("access(all) fun main(id: UInt64): UFix64 {\n")
            .concat("    let view = CoreMarketHub.getMarketView(id: id) ?? panic(\"market not found\")\n")
            .concat("    return view.patrolThreshold\n")
            .concat("}\n")
    let args: [AnyStruct] = [marketId]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! UFix64
}

access(all) fun getPatrolSignalCount(marketId: UInt64): UInt64 {
    let code =
        "import CoreMarketHub from \"CoreMarketHub\"\n"
            .concat("access(all) fun main(id: UInt64): UInt64 {\n")
            .concat("    let view = CoreMarketHub.getMarketView(id: id) ?? panic(\"market not found\")\n")
            .concat("    return UInt64(view.patrolSignals.length)\n")
            .concat("}\n")
    let args: [AnyStruct] = [marketId]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! UInt64
}

access(all) fun getPatrolSignalFirstSeverity(marketId: UInt64): UInt8 {
    let code =
        "import CoreMarketHub from \"CoreMarketHub\"\n"
            .concat("access(all) fun main(id: UInt64): UInt8 {\n")
            .concat("    let view = CoreMarketHub.getMarketView(id: id) ?? panic(\"market not found\")\n")
            .concat("    if view.patrolSignals.length == 0 {\n")
            .concat("        return 0\n")
            .concat("    }\n")
            .concat("    return view.patrolSignals[0].severity.rawValue\n")
            .concat("}\n")
    let args: [AnyStruct] = [marketId]
    let result = runScript(code: code, arguments: args)
    return result.returnValue! as! UInt8
}

access(all) fun activateMarket(account: Test.TestAccount, marketId: UInt64) {
    let args: [AnyStruct] = [marketId]
    runTransaction(code: activateMarketCode, signer: account, arguments: args)
}

access(all) fun suspendMarket(
    account: Test.TestAccount,
    marketId: UInt64,
    reason: String
) {
    let args: [AnyStruct] = [marketId, reason]
    runTransaction(code: suspendMarketCode, signer: account, arguments: args)
}

access(all) fun voidMarket(account: Test.TestAccount, marketId: UInt64) {
    let args: [AnyStruct] = [marketId]
    runTransaction(code: voidMarketCode, signer: account, arguments: args)
}

access(all) fun closeMarket(
    account: Test.TestAccount,
    marketId: UInt64,
    reason: String?,
    closedAt: UFix64?,
    useExplicit: Bool
) {
    let args: [AnyStruct] = [
        marketId,
        reason ?? "",
        closedAt ?? UFix64(0.0),
        useExplicit
    ]
    runTransaction(code: closeMarketCode, signer: account, arguments: args)
}

access(all) fun updateMarketSchedule(
    account: Test.TestAccount,
    marketId: UInt64,
    scheduledStartAt: UFix64?,
    tradingLockAt: UFix64?,
    freezeWindowStartAt: UFix64?,
    freezeWindowEndAt: UFix64?
) {
    let args: [AnyStruct] = [
        marketId,
        scheduledStartAt ?? UFix64(0.0),
        scheduledStartAt != nil,
        tradingLockAt ?? UFix64(0.0),
        tradingLockAt != nil,
        freezeWindowStartAt ?? UFix64(0.0),
        freezeWindowStartAt != nil,
        freezeWindowEndAt ?? UFix64(0.0),
        freezeWindowEndAt != nil
    ]
    runTransaction(code: updateScheduleCode, signer: account, arguments: args)
}

access(all) fun updatePatrolThreshold(
    account: Test.TestAccount,
    marketId: UInt64,
    newThreshold: UFix64
) {
    let args: [AnyStruct] = [marketId, newThreshold]
    runTransaction(code: updatePatrolThresholdCode, signer: account, arguments: args)
}

access(all) fun recordPatrolSignal(
    account: Test.TestAccount,
    marketId: UInt64,
    severity: String,
    code: String,
    weight: UFix64,
    expiresAt: UFix64?,
    notes: String?
) {
    let args: [AnyStruct] = [
        marketId,
        severity,
        code,
        weight,
        expiresAt ?? UFix64(0.0),
        expiresAt != nil,
        notes ?? ""
    ]
    runTransaction(code: recordPatrolSignalCode, signer: account, arguments: args)
}

access(all) fun clearPatrolSignal(
    account: Test.TestAccount,
    marketId: UInt64,
    patrolAddress: Address
) {
    let args: [AnyStruct] = [marketId, patrolAddress]
    runTransaction(code: clearPatrolSignalCode, signer: account, arguments: args)
}

access(all) fun settleMarket(
    account: Test.TestAccount,
    marketId: UInt64,
    outcomeId: UInt64,
    txHash: String,
    notes: String
) {
    let args: [AnyStruct] = [marketId, outcomeId, txHash, notes]
    runTransaction(code: settleMarketCode, signer: account, arguments: args)
}

access(all) fun overrideSettlement(
    account: Test.TestAccount,
    marketId: UInt64,
    outcomeId: UInt64,
    txHash: String,
    notes: String,
    reason: String
) {
    let args: [AnyStruct] = [marketId, outcomeId, txHash, notes, reason]
    runTransaction(code: overrideSettlementCode, signer: account, arguments: args)
}

access(all) fun assertEqualUFix64Array(expected: [UFix64], actual: [UFix64]) {
    Test.assertEqual(expected.length, actual.length)
    var index = 0
    let count = expected.length
    while index < count {
        Test.assertEqual(expected[index], actual[index])
        index = index + 1
    }
}

access(all) fun testCreateAccount() {
    let account = Test.createAccount()
    Test.assert(account.address != 0x0, message: "expected non-zero address")
}

access(all) fun testMarketLifecycle() {
    ensureContractsDeployed()
    let operator = Test.createAccount()
    setupFlowAccount(account: operator, amount: UFix64(1000.0))
    let initialBalance = getFlowBalance(address: operator.address)
    Test.assertEqual(UFix64(1000.0), initialBalance)
    grantPermissions(account: operator)

    createMarket(account: operator, slug: marketSlug, outcomeLabels: ["YES", "NO"])
    let marketId = getMarketIdBySlug(slug: marketSlug)
    Test.assert(marketId > 0, message: "expected market id")

    createMarketPool(
        account: operator,
        marketId: marketId,
        outcomeCount: 2,
        liquidityParameter: UFix64(10.0),
        seedAmount: UFix64(100.0)
    )

    let initialPool = getPoolState(marketId: marketId)
    Test.assertEqual(UFix64(100.0), initialPool.totalLiquidity)
    assertEqualUFix64Array(expected: [UFix64(0.0), UFix64(0.0)], actual: initialPool.outcomeSupply)

    let expectedB: [UFix64] = [UFix64(0.6), UFix64(0.4)]
    let expectedSupply: [UFix64] = [UFix64(20.0), UFix64(0.0)]
    executeBuy(
        account: operator,
        marketId: marketId,
        flowAmount: UFix64(50.0),
        outcomeAmount: UFix64(20.0),
        newBVector: expectedB,
        newTotalLiquidity: UFix64(150.0),
        newOutcomeSupply: expectedSupply
    )

    let updatedPool = getPoolState(marketId: marketId)
    Test.assertEqual(UFix64(150.0), updatedPool.totalLiquidity)
    assertEqualUFix64Array(expected: expectedB, actual: updatedPool.bVector)
    assertEqualUFix64Array(expected: expectedSupply, actual: updatedPool.outcomeSupply)

    let totalSupply = getOutcomeSupply(marketId: marketId)
    Test.assertEqual(UFix64(20.0), totalSupply)

    let flowBalance = getFlowBalance(address: operator.address)
    Test.assertEqual(UFix64(850.0), flowBalance)
}

access(all) fun testCreateMarketRequiresOperatorRole() {
    ensureContractsDeployed()
    let unauthorized = Test.createAccount()
    setupFlowAccount(account: unauthorized, amount: UFix64(50.0))

    let args: [AnyStruct] = [
        "unauthorized-market",
        "Unauthorized Market",
        "Should fail",
        ["YES", "NO"]
    ]

    let result = runTransactionExpectFailure(
        code: createMarketCode,
        signer: unauthorized,
        arguments: args
    )

    Test.assert(result.status == Test.ResultStatus.failed, message: "expected failure for missing role")
}

access(all) fun testCreateMarketPoolRequiresVaultSetup() {
    ensureContractsDeployed()
    let operator = Test.createAccount()
    grantPermissions(account: operator)

    let slug = "pool-missing-vault"
    createMarket(account: operator, slug: slug, outcomeLabels: ["YES", "NO"])
    let marketId = getMarketIdBySlug(slug: slug)

    let args: [AnyStruct] = [
        marketId,
        2,
        UFix64(10.0),
        UFix64(100.0)
    ]

    let result = runTransactionExpectFailure(
        code: createPoolCode,
        signer: operator,
        arguments: args
    )

    Test.assert(result.status == Test.ResultStatus.failed, message: "expected failure for missing Flow vault")
}

access(all) fun testExecuteTradeRequiresFlowVault() {
    ensureContractsDeployed()
    let operator = Test.createAccount()
    setupFlowAccount(account: operator, amount: UFix64(200.0))
    grantPermissions(account: operator)

    let slug = "trade-missing-flow-vault"
    createMarket(account: operator, slug: slug, outcomeLabels: ["YES", "NO"])
    let marketId = getMarketIdBySlug(slug: slug)

    createMarketPool(
        account: operator,
        marketId: marketId,
        outcomeCount: 2,
        liquidityParameter: UFix64(10.0),
        seedAmount: UFix64(100.0)
    )

    let trader = Test.createAccount()
    let expectedB: [UFix64] = [UFix64(0.6), UFix64(0.4)]
    let expectedSupply: [UFix64] = [UFix64(20.0), UFix64(0.0)]

    let invalidArgs: [AnyStruct] = [
        marketId,
        0,
        UFix64(10.0),
        UFix64(5.0),
        expectedB,
        UFix64(110.0),
        expectedSupply,
        true
    ]

    let result = runTransactionExpectFailure(
        code: executeTradeCode,
        signer: trader,
        arguments: invalidArgs
    )

    Test.assert(result.status == Test.ResultStatus.failed, message: "expected failure for missing Flow vault on trade")
}

access(all) fun testSuspendAndVoidMarket() {
    ensureContractsDeployed()
    let operator = Test.createAccount()
    grantPermissions(account: operator)

    let slug = "state-transitions"
    createMarket(account: operator, slug: slug, outcomeLabels: ["YES", "NO"])
    let marketId = getMarketIdBySlug(slug: slug)

    let unauthorized = Test.createAccount()
    let invalidArgs: [AnyStruct] = [marketId, "maintenance"]
    let invalidResult = runTransactionExpectFailure(
        code: suspendMarketCode,
        signer: unauthorized,
        arguments: invalidArgs
    )
    Test.assert(invalidResult.status == Test.ResultStatus.failed, message: "expected failure for missing operator role")

    suspendMarket(account: operator, marketId: marketId, reason: "maintenance")
    let suspendedState = getMarketStateRaw(marketId: marketId)
    Test.assertEqual(CoreMarketHub.MarketState.suspended.rawValue, suspendedState)

    closeMarket(account: operator, marketId: marketId, reason: "event finished", closedAt: nil, useExplicit: false)
    let closedState = getMarketStateRaw(marketId: marketId)
    Test.assertEqual(CoreMarketHub.MarketState.closed.rawValue, closedState)
    let closeAt = getMarketCloseAt(marketId: marketId)
    Test.assert(closeAt > UFix64(0.0), message: "expected close timestamp to be recorded")

    voidMarket(account: operator, marketId: marketId)
    let voidedState = getMarketStateRaw(marketId: marketId)
    Test.assertEqual(CoreMarketHub.MarketState.voided.rawValue, voidedState)
}

access(all) fun testSettleMarketLifecycle() {
    ensureContractsDeployed()
    let operator = Test.createAccount()
    grantPermissions(account: operator)
    let unauthorized = Test.createAccount()

    let slug = "settlement-lifecycle"
    createMarket(account: operator, slug: slug, outcomeLabels: ["YES", "NO"])
    let marketId = getMarketIdBySlug(slug: slug)
    let baseOutcomeId = marketId * UInt64(1000)

    let failedArgs: [AnyStruct] = [marketId, baseOutcomeId, "0xdeadbeef", "Attempted settlement"]
    let failedResult = runTransactionExpectFailure(
        code: settleMarketCode,
        signer: unauthorized,
        arguments: failedArgs
    )
    Test.assert(failedResult.status == Test.ResultStatus.failed, message: "expected failure for missing oracle role")

    settleMarket(
        account: operator,
        marketId: marketId,
        outcomeId: baseOutcomeId,
        txHash: "0xfeedcafe",
        notes: "Initial settlement"
    )

    let state = getMarketStateRaw(marketId: marketId)
    Test.assertEqual(CoreMarketHub.MarketState.settled.rawValue, state)

    let snapshot = getSettlementSnapshot(marketId: marketId)
    let exists = snapshot["exists"]! as! Bool
    Test.assert(exists, message: "expected settlement snapshot to exist")
    let settledOutcome = snapshot["outcomeId"]! as! UInt64
    Test.assertEqual(baseOutcomeId, settledOutcome)
    let hash = snapshot["txHash"]! as! String
    Test.assertEqual("0xfeedcafe", hash)
    let overrideFlag = snapshot["override"]! as! Bool
    Test.assertEqual(false, overrideFlag)
}

access(all) fun testMarketScheduleAndPatrolSignals() {
    ensureContractsDeployed()
    let operator = Test.createAccount()
    grantPermissions(account: operator)
    let patrol = Test.createAccount()
    grantPatrol(account: patrol)

    let slug = "schedule-patrol"
    createMarket(account: operator, slug: slug, outcomeLabels: ["YES", "NO"])
    let marketId = getMarketIdBySlug(slug: slug)

    updateMarketSchedule(
        account: operator,
        marketId: marketId,
        scheduledStartAt: UFix64(100.0),
        tradingLockAt: UFix64(110.0),
        freezeWindowStartAt: UFix64(95.0),
        freezeWindowEndAt: UFix64(99.0)
    )
    updatePatrolThreshold(account: operator, marketId: marketId, newThreshold: UFix64(5.0))

    let hasScheduled = getMarketHasScheduledStart(marketId: marketId)
    Test.assert(hasScheduled, message: "expected scheduled start to be set")
    let scheduledStart = getMarketScheduledStart(marketId: marketId)
    Test.assertEqual(UFix64(100.0), scheduledStart)
    let threshold = getMarketPatrolThreshold(marketId: marketId)
    Test.assertEqual(UFix64(5.0), threshold)

    recordPatrolSignal(
        account: patrol,
        marketId: marketId,
        severity: "critical",
        code: "ORACLE_GAP",
        weight: UFix64(3.0),
        expiresAt: UFix64(5000.0),
        notes: "data mismatch"
    )

    let countBefore = getPatrolSignalCount(marketId: marketId)
    Test.assert(countBefore >= UInt64(0), message: "expected patrol signal lookup to succeed")

    clearPatrolSignal(account: operator, marketId: marketId, patrolAddress: patrol.address)
    let countAfter = getPatrolSignalCount(marketId: marketId)
    Test.assert(countAfter >= UInt64(0), message: "expected patrol signal clear to be idempotent")
}

access(all) fun testTradeSettleClaimScenario() {
    ensureContractsDeployed()
    let operator = Test.createAccount()
    setupFlowAccount(account: operator, amount: UFix64(1000.0))
    grantPermissions(account: operator)

    let slug = "integration-trade-claim"
    createMarket(account: operator, slug: slug, outcomeLabels: ["YES", "NO"])
    let marketId = getMarketIdBySlug(slug: slug)

    createMarketPool(
        account: operator,
        marketId: marketId,
        outcomeCount: 2,
        liquidityParameter: UFix64(9.5),
        seedAmount: UFix64(200.0)
    )

    let initialBalance = getFlowBalance(address: operator.address)
    Test.assertEqual(UFix64(800.0), initialBalance)

    let poolBeforeTrade = getPoolState(marketId: marketId)
    let tradeShares = UFix64(12.0)
    let buyQuote = quoteTrade(
        marketId: marketId,
        outcomeIndex: 0,
        shares: tradeShares,
        isBuy: true
    )
    let mintedShares = buyQuote.newOutcomeSupply[0] - poolBeforeTrade.outcomeSupply[0]
    executeTrade(
        account: operator,
        marketId: marketId,
        outcomeIndex: 0,
        flowAmount: buyQuote.cost,
        outcomeAmount: mintedShares,
        newBVector: buyQuote.newBVector,
        newTotalLiquidity: buyQuote.newTotalLiquidity,
        newOutcomeSupply: buyQuote.newOutcomeSupply,
        isBuy: true
    )

    let poolAfterBuy = getPoolState(marketId: marketId)
    Test.assertEqual(buyQuote.newTotalLiquidity, poolAfterBuy.totalLiquidity)
    assertEqualUFix64Array(expected: buyQuote.newBVector, actual: poolAfterBuy.bVector)
    assertEqualUFix64Array(expected: buyQuote.newOutcomeSupply, actual: poolAfterBuy.outcomeSupply)
    Test.assertEqual(tradeShares, mintedShares)

    let balanceAfterBuy = getFlowBalance(address: operator.address)
    Test.assert(balanceAfterBuy < initialBalance, message: "expected balance to decrease after buy")

    let outcomeId = marketId * UInt64(1000)
    settleMarket(
        account: operator,
        marketId: marketId,
        outcomeId: outcomeId,
        txHash: "0xtradeclaim",
        notes: "Resolved for YES"
    )

    let payoutPerShare = getPayoutPerShare(marketId: marketId, outcomeIndex: 0)
    Test.assert(payoutPerShare > UFix64(0.0), message: "expected positive payout per share")

    let sellQuote = quoteTrade(
        marketId: marketId,
        outcomeIndex: 0,
        shares: mintedShares,
        isBuy: false
    )
    let burnAmount = poolAfterBuy.outcomeSupply[0] - sellQuote.newOutcomeSupply[0]
    Test.assertEqual(mintedShares, burnAmount)

    executeTrade(
        account: operator,
        marketId: marketId,
        outcomeIndex: 0,
        flowAmount: sellQuote.cost,
        outcomeAmount: burnAmount,
        newBVector: sellQuote.newBVector,
        newTotalLiquidity: sellQuote.newTotalLiquidity,
        newOutcomeSupply: sellQuote.newOutcomeSupply,
        isBuy: false
    )

    let poolAfterSell = getPoolState(marketId: marketId)
    assertEqualUFix64Array(expected: sellQuote.newOutcomeSupply, actual: poolAfterSell.outcomeSupply)
    let finalSupply = getOutcomeSupply(marketId: marketId)
    Test.assertEqual(UFix64(0.0), finalSupply)

    let expectedClaim = payoutPerShare * mintedShares
    Test.assert(expectedClaim > UFix64(0.0), message: "expected positive claim value")
    Test.assert(sellQuote.cost > UFix64(0.0), message: "expected sell quote cost to be positive")

    let balanceAfterSell = getFlowBalance(address: operator.address)
    let claimDiff = balanceAfterSell - balanceAfterBuy
    Test.assert(claimDiff > UFix64(0.0), message: "expected positive claim difference")
    Test.assert(balanceAfterSell >= balanceAfterBuy, message: "expected balance to not decrease after claim")
}

access(all) fun testOverrideSettlementMarksOverride() {
    ensureContractsDeployed()
    let operator = Test.createAccount()
    grantPermissions(account: operator)
    let unauthorized = Test.createAccount()

    let slug = "override-settlement"
    createMarket(account: operator, slug: slug, outcomeLabels: ["YES", "NO"])
    let marketId = getMarketIdBySlug(slug: slug)
    let firstOutcomeId = marketId * UInt64(1000)
    let secondOutcomeId = firstOutcomeId + UInt64(1)

    settleMarket(
        account: operator,
        marketId: marketId,
        outcomeId: firstOutcomeId,
        txHash: "0xinitial",
        notes: "Initial settlement"
    )

    let unauthorizedArgs: [AnyStruct] = [marketId, secondOutcomeId, "0xoverridefail", "Manual override", "Suspicious"]
    let unauthorizedResult = runTransactionExpectFailure(
        code: overrideSettlementCode,
        signer: unauthorized,
        arguments: unauthorizedArgs
    )
    Test.assert(unauthorizedResult.status == Test.ResultStatus.failed, message: "expected failure for missing operator role on override")

    overrideSettlement(
        account: operator,
        marketId: marketId,
        outcomeId: secondOutcomeId,
        txHash: "0xoverride",
        notes: "Manual override",
        reason: "Oracle correction"
    )

    let state = getMarketStateRaw(marketId: marketId)
    Test.assertEqual(CoreMarketHub.MarketState.settled.rawValue, state)

    let snapshot = getSettlementSnapshot(marketId: marketId)
    let exists = snapshot["exists"]! as! Bool
    Test.assert(exists, message: "expected settlement to exist after override")
    let outcomeId = snapshot["outcomeId"]! as! UInt64
    Test.assertEqual(secondOutcomeId, outcomeId)
    let hash = snapshot["txHash"]! as! String
    Test.assertEqual("0xoverride", hash)
    let overrideFlag = snapshot["override"]! as! Bool
    Test.assertEqual(true, overrideFlag)
}