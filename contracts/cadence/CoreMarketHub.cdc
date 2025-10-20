access(all) contract CoreMarketHub {

    // --- Shared enums ------------------------------------------------------

    access(all) enum MarketState: UInt8 {
        access(all) case draft
        access(all) case live
        access(all) case suspended
        access(all) case closed
        access(all) case settled
        access(all) case voided
    }

    access(all) enum MarketCategory: UInt8 {
        access(all) case crypto
        access(all) case sports
        access(all) case esports
        access(all) case custom
    }

    access(all) enum PatrolSignalSeverity: UInt8 {
        access(all) case info
        access(all) case warning
        access(all) case critical
    }

    access(all) enum OutcomeStatus: UInt8 {
        access(all) case active
        access(all) case suspended
        access(all) case settled
    }

    access(all) enum WorkflowActionType: UInt8 {
        access(all) case open
        access(all) case suspend
        access(all) case settle
        access(all) case void
        access(all) case distribute
        access(all) case custom
    }

    access(all) enum WorkflowActionStatus: UInt8 {
        access(all) case pending
        access(all) case scheduled
        access(all) case executed
        access(all) case failed
    }

    access(all) enum Role: UInt8 {
        access(all) case admin
        access(all) case operator
        access(all) case oracle
        access(all) case patrol
    }

    // --- Views -------------------------------------------------------------

    access(all) struct OutcomeView {
        access(all) let id: UInt64
        access(all) let index: UInt8
        access(all) let label: String
        access(all) let status: OutcomeStatus
        access(all) let metadata: {String: String}

        init(id: UInt64, index: UInt8, label: String, status: OutcomeStatus, metadata: {String: String}) {
            self.id = id
            self.index = index
            self.label = label
            self.status = status
            self.metadata = metadata
        }
    }

    access(all) struct WorkflowActionView {
        access(all) let id: UInt64
        access(all) let actionType: WorkflowActionType
        access(all) let status: WorkflowActionStatus
        access(all) let scheduledAt: UFix64?
        access(all) let executedAt: UFix64?
        access(all) let payload: {String: String}

        init(
            id: UInt64,
            actionType: WorkflowActionType,
            status: WorkflowActionStatus,
            scheduledAt: UFix64?,
            executedAt: UFix64?,
            payload: {String: String}
        ) {
            self.id = id
            self.actionType = actionType
            self.status = status
            self.scheduledAt = scheduledAt
            self.executedAt = executedAt
            self.payload = payload
        }
    }

    access(all) struct SettlementView {
        access(all) let resolvedOutcomeId: UInt64
        access(all) let txHash: String
        access(all) let settledAt: UFix64
        access(all) let notes: String?
        access(all) let overridden: Bool

        init(resolvedOutcomeId: UInt64, txHash: String, settledAt: UFix64, notes: String?, overridden: Bool) {
            self.resolvedOutcomeId = resolvedOutcomeId
            self.txHash = txHash
            self.settledAt = settledAt
            self.notes = notes
            self.overridden = overridden
        }
    }

    access(all) struct MarketScheduleView {
        access(all) let scheduledStartAt: UFix64?
        access(all) let tradingLockAt: UFix64?
        access(all) let freezeWindowStartAt: UFix64?
        access(all) let freezeWindowEndAt: UFix64?

        init(
            scheduledStartAt: UFix64?,
            tradingLockAt: UFix64?,
            freezeWindowStartAt: UFix64?,
            freezeWindowEndAt: UFix64?
        ) {
            self.scheduledStartAt = scheduledStartAt
            self.tradingLockAt = tradingLockAt
            self.freezeWindowStartAt = freezeWindowStartAt
            self.freezeWindowEndAt = freezeWindowEndAt
        }
    }

    access(all) struct PatrolSignalView {
        access(all) let issuer: Address
        access(all) let severity: PatrolSignalSeverity
        access(all) let code: String
        access(all) let weight: UFix64
        access(all) let createdAt: UFix64
        access(all) let expiresAt: UFix64?
        access(all) let notes: String?

        init(
            issuer: Address,
            severity: PatrolSignalSeverity,
            code: String,
            weight: UFix64,
            createdAt: UFix64,
            expiresAt: UFix64?,
            notes: String?
        ) {
            self.issuer = issuer
            self.severity = severity
            self.code = code
            self.weight = weight
            self.createdAt = createdAt
            self.expiresAt = expiresAt
            self.notes = notes
        }
    }

    access(all) struct MarketView {
        access(all) let id: UInt64
        access(all) let slug: String
        access(all) let title: String
        access(all) let description: String
        access(all) let creator: Address
        access(all) let state: MarketState
        access(all) let category: MarketCategory
        access(all) let tags: [String]
        access(all) let createdAt: UFix64
        access(all) let closeAt: UFix64?
        access(all) let schedule: MarketScheduleView
        access(all) let oracleId: String?
        access(all) let patrolThreshold: UFix64
        access(all) let patrolSignals: [PatrolSignalView]
        access(all) let outcomes: [OutcomeView]
        access(all) let workflow: [WorkflowActionView]
        access(all) let settlement: SettlementView?

        init(
            id: UInt64,
            slug: String,
            title: String,
            description: String,
            creator: Address,
            state: MarketState,
            category: MarketCategory,
            tags: [String],
            createdAt: UFix64,
            closeAt: UFix64?,
            schedule: MarketScheduleView,
            oracleId: String?,
            patrolThreshold: UFix64,
            patrolSignals: [PatrolSignalView],
            outcomes: [OutcomeView],
            workflow: [WorkflowActionView],
            settlement: SettlementView?
        ) {
            self.id = id
            self.slug = slug
            self.title = title
            self.description = description
            self.creator = creator
            self.state = state
            self.category = category
            self.tags = tags
            self.createdAt = createdAt
            self.closeAt = closeAt
            self.schedule = schedule
            self.oracleId = oracleId
            self.patrolThreshold = patrolThreshold
            self.patrolSignals = patrolSignals
            self.outcomes = outcomes
            self.workflow = workflow
            self.settlement = settlement
        }
    }

    // --- Role registry -----------------------------------------------------

    access(all) resource RoleBadge {
        access(all) let role: Role
        access(contract) var holder: Address

        init(role: Role, owner: Address) {
            self.role = role
            self.holder = owner
        }

        access(all) fun getOwner(): Address {
            return self.holder
        }

        access(contract) fun setOwner(_ newOwner: Address) {
            self.holder = newOwner
        }

        access(all) fun assertRole(_ expected: Role) {
            if self.role != expected {
                panic("role badge mismatch")
            }
        }
    }

    access(all) resource interface RoleBadgeCollectionPublic {
        access(all) fun hasRole(role: Role): Bool
        access(all) fun getRoles(): [String]
    }

    access(all) resource RoleBadgeCollection: RoleBadgeCollectionPublic {
        access(contract) var items: @{UInt8: RoleBadge}

        init() {
            self.items <- {}
        }

        access(all) fun hasRole(role: Role): Bool {
            let key = role.rawValue
            return &self.items[key] as &RoleBadge? != nil
        }

        access(all) fun getRoles(): [String] {
            var result: [String] = []
            for key in self.items.keys {
                if let badgeRef = &self.items[key] as &RoleBadge? {
                    result.append(CoreMarketHub.roleIdentifier(role: badgeRef.role))
                }
            }
            return result
        }

        access(all) fun deposit(badge: @RoleBadge) {
            let key = badge.role.rawValue
            self.items[key] <-! badge
        }

        access(all) fun withdraw(role: Role): @RoleBadge {
            let key = role.rawValue
            let badge <- self.items.remove(key: key) ?? panic("role badge missing")
            return <-badge
        }

    }

    access(self) var roleAssignments: {UInt8: {Address: Bool}}

    access(all) fun roleIdentifier(role: Role): String {
        switch role {
        case Role.admin:
            return "admin"
        case Role.operator:
            return "operator"
        case Role.oracle:
            return "oracle"
        case Role.patrol:
            return "patrol"
        }
        panic("unknown role")
    }

    access(all) fun roleStoragePath(role: Role): StoragePath {
        return StoragePath(identifier: "forte_roleBadge_".concat(CoreMarketHub.roleIdentifier(role: role)))!
    }

    access(all) fun rolePublicPath(role: Role): PublicPath {
        return PublicPath(identifier: "/public/forte_roleBadge_".concat(CoreMarketHub.roleIdentifier(role: role)))!
    }

    access(all) fun roleCollectionStoragePath(): StoragePath {
        return StoragePath(identifier: "forte_roleBadges")!
    }

    access(all) fun roleCollectionPublicPath(): PublicPath {
        return PublicPath(identifier: "/public/forte_roleBadges")!
    }

    access(all) fun roleFromString(_ raw: String): Role {
        if raw == "admin" || raw == "ADMIN" {
            return Role.admin
        }
        if raw == "operator" || raw == "OPERATOR" {
            return Role.operator
        }
        if raw == "oracle" || raw == "ORACLE" {
            return Role.oracle
        }
        if raw == "patrol" || raw == "PATROL" {
            return Role.patrol
        }
        panic("unknown role")
    }

    access(all) fun marketCategoryIdentifier(category: MarketCategory): String {
        switch category {
        case MarketCategory.crypto:
            return "crypto"
        case MarketCategory.sports:
            return "sports"
        case MarketCategory.esports:
            return "esports"
        case MarketCategory.custom:
            return "custom"
        }
        panic("unknown category")
    }

    access(all) fun marketCategoryFromString(_ raw: String): MarketCategory {
        if raw == "crypto" || raw == "CRYPTO" {
            return MarketCategory.crypto
        }
        if raw == "sports" || raw == "SPORTS" {
            return MarketCategory.sports
        }
        if raw == "esports" || raw == "ESPORTS" {
            return MarketCategory.esports
        }
        return MarketCategory.custom
    }

    access(all) fun patrolSeverityIdentifier(severity: PatrolSignalSeverity): String {
        switch severity {
        case PatrolSignalSeverity.info:
            return "info"
        case PatrolSignalSeverity.warning:
            return "warning"
        case PatrolSignalSeverity.critical:
            return "critical"
        }
        panic("unknown severity")
    }

    access(all) fun patrolSeverityFromString(_ raw: String): PatrolSignalSeverity {
        if raw == "critical" || raw == "CRITICAL" {
            return PatrolSignalSeverity.critical
        }
        if raw == "warning" || raw == "WARNING" {
            return PatrolSignalSeverity.warning
        }
        return PatrolSignalSeverity.info
    }

    access(self) fun recordAssignment(address: Address, role: Role, granted: Bool) {
        let key = role.rawValue
        var assignments = self.roleAssignments[key] ?? {} as {Address: Bool}
        if granted {
            assignments[address] = true
        } else {
            assignments.remove(key: address)
        }
        self.roleAssignments[key] = assignments
    }

    access(all) fun hasRole(address: Address, role: Role): Bool {
        let key = role.rawValue
        let assignments = self.roleAssignments[key]
        if assignments == nil {
            return false
        }
        return assignments![address] == true
    }

    access(all) fun hasRoleStorage(address: Address): Bool {
        let capability = getAccount(address).capabilities.get<&RoleBadgeCollection>(CoreMarketHub.roleCollectionPublicPath())
        if capability == nil {
            return false
        }
        return capability!.check()
    }

    access(all) fun rolesOf(address: Address): [String] {
        let capability = getAccount(address).capabilities.get<&RoleBadgeCollection>(CoreMarketHub.roleCollectionPublicPath())
        if capability == nil {
            return []
        }
        let reference = capability!.borrow()
        if reference == nil {
            return []
        }
        return reference!.getRoles()
    }

    access(self) fun assertRoleBadge(_ badge: &RoleBadge, role: Role) {
        badge.assertRole(role)
        let owner = badge.getOwner()
        if !self.hasRole(address: owner, role: role) {
            panic("role revoked")
        }
    }

    access(self) fun borrowRoleBadgeCollection(address: Address): &RoleBadgeCollection {
        let capability = getAccount(address).capabilities.get<&RoleBadgeCollection>(CoreMarketHub.roleCollectionPublicPath())
        if capability == nil {
            panic("role storage not initialized")
        }
        let reference = capability!.borrow()
        if reference == nil {
            panic("role storage not available")
        }
        return reference!
    }

    access(all) fun setupRoleStorage(account: auth(Storage, Capabilities) &Account) {
        let storagePath = CoreMarketHub.roleCollectionStoragePath()
        if account.storage.borrow<&RoleBadgeCollection>(from: storagePath) == nil {
            account.storage.save(<-create RoleBadgeCollection(), to: storagePath)
        }
        let publicPath = CoreMarketHub.roleCollectionPublicPath()
        account.capabilities.unpublish(publicPath)
        let capability = account.capabilities.storage.issue<&RoleBadgeCollection>(storagePath)
        account.capabilities.publish(capability, at: publicPath)
    }

    access(all) fun storeRoleBadge(target: auth(Storage, Capabilities) &Account, badge: @RoleBadge) {
        CoreMarketHub.setupRoleStorage(account: target)
        let collection = target.storage.borrow<&RoleBadgeCollection>(from: CoreMarketHub.roleCollectionStoragePath())
            ?? panic("role storage missing")
        badge.setOwner(target.address)
        collection.deposit(badge: <-badge)
    }

    // --- Storage -----------------------------------------------------------

    access(self) var lastMarketId: UInt64
    access(self) var markets: {UInt64: MarketData}
    access(all) struct StorageMetadata {
        access(all) let liquidityPoolPath: StoragePath
        access(all) let outcomeVaultPath: StoragePath
        access(all) let liquidityReceiverPath: PublicPath
        access(all) let liquidityProviderPath: PublicPath
        access(all) let outcomeReceiverPath: PublicPath
        access(all) let outcomeBalancePath: PublicPath
        access(all) let outcomeProviderPath: PublicPath
        access(all) let owner: Address

        init(
            liquidityPoolPath: StoragePath,
            outcomeVaultPath: StoragePath,
            liquidityReceiverPath: PublicPath,
            liquidityProviderPath: PublicPath,
            outcomeReceiverPath: PublicPath,
            outcomeBalancePath: PublicPath,
            outcomeProviderPath: PublicPath,
            owner: Address
        ) {
            self.liquidityPoolPath = liquidityPoolPath
            self.outcomeVaultPath = outcomeVaultPath
            self.liquidityReceiverPath = liquidityReceiverPath
            self.liquidityProviderPath = liquidityProviderPath
            self.outcomeReceiverPath = outcomeReceiverPath
            self.outcomeBalancePath = outcomeBalancePath
            self.outcomeProviderPath = outcomeProviderPath
            self.owner = owner
        }
    }

    access(self) var marketStorageMetadata: {UInt64: StorageMetadata}

    access(self) var slugToId: {String: UInt64}

    // --- Events ------------------------------------------------------------

    access(all) event MarketCreated(id: UInt64, slug: String, creator: Address, timestamp: UFix64)
    access(all) event MarketActivated(id: UInt64, activatedBy: Address, timestamp: UFix64)
    access(all) event MarketSuspended(id: UInt64, reason: String?, timestamp: UFix64)
    access(all) event MarketClosed(id: UInt64, closedBy: Address, reason: String?, timestamp: UFix64)
    access(all) event MarketSettled(id: UInt64, outcomeId: UInt64, txHash: String, timestamp: UFix64)
    access(all) event MarketVoided(id: UInt64, timestamp: UFix64)
    access(all) event MarketScheduleUpdated(id: UInt64, scheduledBy: Address, startAt: UFix64?, lockAt: UFix64?, freezeStart: UFix64?, freezeEnd: UFix64?, timestamp: UFix64)
    access(all) event PatrolThresholdUpdated(id: UInt64, newThreshold: UFix64, updatedBy: Address, timestamp: UFix64)
    access(all) event PatrolSignalRecorded(id: UInt64, issuer: Address, severityRaw: UInt8, weight: UFix64, code: String, expiresAt: UFix64?, timestamp: UFix64)
    access(all) event PatrolSignalCleared(id: UInt64, issuer: Address, timestamp: UFix64)

    access(all) event WorkflowActionScheduled(id: UInt64, actionId: UInt64, actionTypeRaw: UInt8, scheduledAt: UFix64)
    access(all) event WorkflowActionExecuted(id: UInt64, actionId: UInt64, executedAt: UFix64)
    access(all) event OutcomeStatusUpdated(id: UInt64, outcomeId: UInt64, newStatusRaw: UInt8, reason: String?)
    access(all) event LiquidityUpdated(id: UInt64, delta: UFix64, provider: Address)

    access(all) event RoleGranted(address: Address, role: String, timestamp: UFix64)
    access(all) event RoleRevoked(address: Address, role: String, timestamp: UFix64)

    // --- Resource definitions ----------------------------------------------

    access(all) struct MarketData {
        access(all) let id: UInt64
        access(all) let slug: String
        access(all) var title: String
        access(all) var description: String
        access(all) let creator: Address
        access(all) var state: MarketState
        access(all) let category: MarketCategory
        access(all) var tags: [String]
        access(all) let createdAt: UFix64
        access(all) var closeAt: UFix64?
        access(all) var oracleId: String?
        access(all) var storageMetadata: StorageMetadata?
        access(all) var schedule: MarketSchedule
        access(all) var patrolThreshold: UFix64

        access(all) var outcomes: [Outcome]
        access(all) var workflow: {UInt64: WorkflowAction}
        access(all) var nextWorkflowId: UInt64
        access(all) var settlement: Settlement?
        access(all) var patrolSignals: {Address: PatrolSignal}

        init(
            id: UInt64,
            slug: String,
            title: String,
            description: String,
            creator: Address,
            state: MarketState,
            category: MarketCategory,
            tags: [String],
            createdAt: UFix64,
            closeAt: UFix64?,
            oracleId: String?,
            schedule: MarketSchedule,
            patrolThreshold: UFix64,
            outcomes: [Outcome]
        ) {
            self.id = id
            self.slug = slug
            self.title = title
            self.description = description
            self.creator = creator
            self.state = state
            self.category = category
            self.tags = tags
            self.createdAt = createdAt
            self.closeAt = closeAt
            self.oracleId = oracleId
            self.storageMetadata = nil
            self.schedule = schedule
            self.patrolThreshold = patrolThreshold
            self.outcomes = outcomes
            self.workflow = {} as {UInt64: WorkflowAction}
            self.nextWorkflowId = 1
            self.settlement = nil
            self.patrolSignals = {} as {Address: PatrolSignal}
        }

        access(all) fun view(): MarketView {
            let outcomesView: [OutcomeView] = self.outcomes.map(fun (outcome: Outcome): OutcomeView {
                return outcome.view()
            })

            var workflowView: [WorkflowActionView] = []
            for action in self.workflow.values {
                workflowView.append(action.view())
            }

            var signalViews: [PatrolSignalView] = []
            let now = getCurrentBlock().timestamp
            for signal in self.patrolSignals.values {
                if signal.isExpired(at: now) {
                    continue
                }
                signalViews.append(signal.view())
            }

            return MarketView(
                id: self.id,
                slug: self.slug,
                title: self.title,
                description: self.description,
                creator: self.creator,
                state: self.state,
                category: self.category,
                tags: self.tags,
                createdAt: self.createdAt,
                closeAt: self.closeAt,
                schedule: self.schedule.view(),
                oracleId: self.oracleId,
                patrolThreshold: self.patrolThreshold,
                patrolSignals: signalViews,
                outcomes: outcomesView,
                workflow: workflowView,
                settlement: self.settlement?.view()
            )
        }

        access(contract) fun setState(_ newState: MarketState) {
            self.state = newState
        }

        access(contract) fun setSettlement(_ settlement: Settlement) {
            self.settlement = settlement
        }

        access(contract) fun setStorageMetadata(_ metadata: StorageMetadata) {
            self.storageMetadata = metadata
        }

        access(contract) fun setWorkflowAction(actionId: UInt64, action: WorkflowAction) {
            self.workflow[actionId] = action
        }

        access(contract) fun markWorkflowExecuted(actionId: UInt64, timestamp: UFix64) {
            var action = self.workflow[actionId] ?? panic("Unknown workflow action")
            action.markExecuted(at: timestamp)
            self.workflow[actionId] = action
        }

        access(contract) fun setNextWorkflowId(_ nextId: UInt64) {
            self.nextWorkflowId = nextId
        }

        access(contract) fun updateOutcomeStatus(index: Int, status: OutcomeStatus) {
            var outcome = self.outcomes[index]
            outcome.setStatus(status)
            self.outcomes[index] = outcome
        }

        access(contract) fun setCloseAt(_ closeAt: UFix64?) {
            self.closeAt = closeAt
        }

        access(contract) fun updateSchedule(_ schedule: MarketSchedule) {
            self.schedule = schedule
        }

        access(contract) fun updateTags(_ tags: [String]) {
            self.tags = tags
        }

        access(contract) fun setPatrolThreshold(_ threshold: UFix64) {
            self.patrolThreshold = threshold
        }

        access(contract) fun upsertPatrolSignal(address: Address, signal: PatrolSignal?) {
            if signal == nil {
                self.patrolSignals.remove(key: address)
                return
            }
            self.patrolSignals[address] = signal!
        }
    }

    access(all) struct Outcome {
        access(all) let id: UInt64
        access(all) let index: UInt8
        access(all) let label: String
        access(all) var status: OutcomeStatus
        access(all) var metadata: {String: String}

        init(id: UInt64, index: UInt8, label: String, status: OutcomeStatus) {
            self.id = id
            self.index = index
            self.label = label
            self.status = status
            self.metadata = {} as {String: String}
        }

        access(all) fun view(): OutcomeView {
            return OutcomeView(id: self.id, index: self.index, label: self.label, status: self.status, metadata: self.metadata)
        }

        access(contract) fun setStatus(_ newStatus: OutcomeStatus) {
            self.status = newStatus
        }
    }

    access(all) struct WorkflowAction {
        access(all) let id: UInt64
        access(all) let actionType: WorkflowActionType
        access(all) var status: WorkflowActionStatus
        access(all) var scheduledAt: UFix64?
        access(all) var executedAt: UFix64?
        access(all) var payload: {String: String}

        init(id: UInt64, actionType: WorkflowActionType, status: WorkflowActionStatus, scheduledAt: UFix64?, payload: {String: String}) {
            self.id = id
            self.actionType = actionType
            self.status = status
            self.scheduledAt = scheduledAt
            self.executedAt = nil
            self.payload = payload
        }

        access(all) fun view(): WorkflowActionView {
            return WorkflowActionView(
                id: self.id,
                actionType: self.actionType,
                status: self.status,
                scheduledAt: self.scheduledAt,
                executedAt: self.executedAt,
                payload: self.payload
            )
        }

        access(contract) fun markExecuted(at timestamp: UFix64) {
            self.status = WorkflowActionStatus.executed
            self.executedAt = timestamp
        }
    }

    access(all) struct Settlement {
        access(all) let resolvedOutcomeId: UInt64
        access(all) let txHash: String
        access(all) let settledAt: UFix64
        access(all) let notes: String?
        access(all) let overrideReason: String?

        init(resolvedOutcomeId: UInt64, txHash: String, settledAt: UFix64, notes: String?, overrideReason: String?) {
            self.resolvedOutcomeId = resolvedOutcomeId
            self.txHash = txHash
            self.settledAt = settledAt
            self.notes = notes
            self.overrideReason = overrideReason
        }

        access(all) fun view(): SettlementView {
            return SettlementView(
                resolvedOutcomeId: self.resolvedOutcomeId,
                txHash: self.txHash,
                settledAt: self.settledAt,
                notes: self.notes,
                overridden: self.overrideReason != nil
            )
        }
    }

    access(all) struct MarketSchedule {
        access(all) var scheduledStartAt: UFix64?
        access(all) var tradingLockAt: UFix64?
        access(all) var freezeWindowStartAt: UFix64?
        access(all) var freezeWindowEndAt: UFix64?

        init(
            scheduledStartAt: UFix64?,
            tradingLockAt: UFix64?,
            freezeWindowStartAt: UFix64?,
            freezeWindowEndAt: UFix64?
        ) {
            self.scheduledStartAt = scheduledStartAt
            self.tradingLockAt = tradingLockAt
            self.freezeWindowStartAt = freezeWindowStartAt
            self.freezeWindowEndAt = freezeWindowEndAt
        }

        access(all) fun view(): MarketScheduleView {
            return MarketScheduleView(
                scheduledStartAt: self.scheduledStartAt,
                tradingLockAt: self.tradingLockAt,
                freezeWindowStartAt: self.freezeWindowStartAt,
                freezeWindowEndAt: self.freezeWindowEndAt
            )
        }

        access(contract) fun updateTradingLock(at timestamp: UFix64?) {
            self.tradingLockAt = timestamp
        }

        access(contract) fun updateFreezeWindow(startAt: UFix64?, endAt: UFix64?) {
            self.freezeWindowStartAt = startAt
            self.freezeWindowEndAt = endAt
        }
    }

    access(all) struct PatrolSignal {
        access(all) let issuer: Address
        access(all) let severity: PatrolSignalSeverity
        access(all) let code: String
        access(all) let weight: UFix64
        access(all) let createdAt: UFix64
        access(all) let expiresAt: UFix64?
        access(all) let notes: String?

        init(
            issuer: Address,
            severity: PatrolSignalSeverity,
            code: String,
            weight: UFix64,
            createdAt: UFix64,
            expiresAt: UFix64?,
            notes: String?
        ) {
            self.issuer = issuer
            self.severity = severity
            self.code = code
            self.weight = weight
            self.createdAt = createdAt
            self.expiresAt = expiresAt
            self.notes = notes
        }

        access(all) fun view(): PatrolSignalView {
            return PatrolSignalView(
                issuer: self.issuer,
                severity: self.severity,
                code: self.code,
                weight: self.weight,
                createdAt: self.createdAt,
                expiresAt: self.expiresAt,
                notes: self.notes
            )
        }

        access(all) fun isExpired(at timestamp: UFix64): Bool {
            if self.expiresAt == nil {
                return false
            }
            return timestamp >= self.expiresAt!
        }
    }

    // --- Utility -----------------------------------------------------------

    access(self) fun requireActiveBadge(_ badge: &RoleBadge) {
        let owner = badge.getOwner()
        if !self.hasRole(address: owner, role: badge.role) {
            panic("role revoked")
        }
    }

    // --- Public API --------------------------------------------------------

    access(all) fun isAdmin(_ address: Address): Bool {
        return self.hasRole(address: address, role: Role.admin)
    }

    access(all) fun isOperator(_ address: Address): Bool {
        return self.hasRole(address: address, role: Role.operator)
    }

    access(all) fun isOracle(_ address: Address): Bool {
        return self.hasRole(address: address, role: Role.oracle)
    }

    access(all) fun isPatrol(_ address: Address): Bool {
        return self.hasRole(address: address, role: Role.patrol)
    }

    access(self) fun createRoleBadge(role: Role, target: Address): @RoleBadge {
        if self.hasRole(address: target, role: role) {
            panic("role already assigned")
        }
        self.recordAssignment(address: target, role: role, granted: true)
        return <-create RoleBadge(role: role, owner: target)
    }

    access(all) fun grantRole(adminBadge: &RoleBadge, role: Role, target: Address): @RoleBadge {
        self.assertRoleBadge(adminBadge, role: Role.admin)
        let badge <- self.createRoleBadge(role: role, target: target)
        emit RoleGranted(address: target, role: CoreMarketHub.roleIdentifier(role: role), timestamp: getCurrentBlock().timestamp)
        return <-badge
    }

    access(all) fun grantRoleToAddress(adminBadge: &RoleBadge, role: Role, target: Address) {
        self.assertRoleBadge(adminBadge, role: Role.admin)
        let badge <- self.createRoleBadge(role: role, target: target)
        let collection = self.borrowRoleBadgeCollection(address: target)
        collection.deposit(badge: <-badge)
        emit RoleGranted(address: target, role: CoreMarketHub.roleIdentifier(role: role), timestamp: getCurrentBlock().timestamp)
    }

    access(all) fun revokeRole(adminBadge: &RoleBadge, badge: @RoleBadge) {
        self.assertRoleBadge(adminBadge, role: Role.admin)
        let role = badge.role
        let owner = badge.getOwner()
        if !self.hasRole(address: owner, role: role) {
            destroy badge
            panic("role not assigned")
        } else {
            self.recordAssignment(address: owner, role: role, granted: false)
            emit RoleRevoked(address: owner, role: CoreMarketHub.roleIdentifier(role: role), timestamp: getCurrentBlock().timestamp)
            destroy badge
        }
    }

    access(all) fun revokeRoleFromAddress(adminBadge: &RoleBadge, role: Role, target: Address) {
        self.assertRoleBadge(adminBadge, role: Role.admin)
        if !self.hasRole(address: target, role: role) {
            panic("role not assigned")
        }
        let collection = self.borrowRoleBadgeCollection(address: target)
        let badge <- collection.withdraw(role: role)
        self.recordAssignment(address: target, role: role, granted: false)
        emit RoleRevoked(address: target, role: CoreMarketHub.roleIdentifier(role: role), timestamp: getCurrentBlock().timestamp)
        destroy badge
    }

    access(all) fun createMarket(
        operatorBadge: &RoleBadge,
        slug: String,
        title: String,
        description: String,
        categoryRaw: String,
        oracleId: String?,
        closeAt: UFix64?,
        scheduledStartAt: UFix64?,
        tradingLockAt: UFix64?,
        freezeWindowStartAt: UFix64?,
        freezeWindowEndAt: UFix64?,
        patrolThreshold: UFix64?,
        tags: [String],
        outcomeLabels: [String]
    ): UInt64 {
        self.assertRoleBadge(operatorBadge, role: Role.operator)
        let executor = operatorBadge.getOwner()

        if outcomeLabels.length == 0 {
            panic("At least one outcome required")
        }

        if self.slugToId[slug] != nil {
            panic("Slug already used")
        }

        let marketId = self.lastMarketId + 1
        self.lastMarketId = marketId

        var outcomes: [Outcome] = []
        var index: UInt8 = 0
        for label in outcomeLabels {
            let outcomeId = marketId * 1000 + UInt64(index)
            outcomes.append(
                Outcome(
                    id: outcomeId,
                    index: index,
                    label: label,
                    status: OutcomeStatus.active
                )
            )
            index = index + 1
        }

        let category = CoreMarketHub.marketCategoryFromString(categoryRaw)
        let threshold = patrolThreshold ?? 0.0
        let schedule = MarketSchedule(
            scheduledStartAt: scheduledStartAt,
            tradingLockAt: tradingLockAt,
            freezeWindowStartAt: freezeWindowStartAt,
            freezeWindowEndAt: freezeWindowEndAt
        )

        var sanitizedTags: [String] = []
        for tag in tags {
            if tag.length == 0 {
                continue
            }
            sanitizedTags.append(tag)
        }

        let market = MarketData(
            id: marketId,
            slug: slug,
            title: title,
            description: description,
            creator: executor,
            state: MarketState.draft,
            category: category,
            tags: sanitizedTags,
            createdAt: getCurrentBlock().timestamp,
            closeAt: closeAt,
            oracleId: oracleId,
            schedule: schedule,
            patrolThreshold: threshold,
            outcomes: outcomes
        )

        self.slugToId[slug] = marketId
        self.storeMarket(market)
        emit MarketCreated(id: marketId, slug: slug, creator: executor, timestamp: getCurrentBlock().timestamp)
        emit MarketScheduleUpdated(
            id: marketId,
            scheduledBy: executor,
            startAt: schedule.scheduledStartAt,
            lockAt: schedule.tradingLockAt,
            freezeStart: schedule.freezeWindowStartAt,
            freezeEnd: schedule.freezeWindowEndAt,
            timestamp: getCurrentBlock().timestamp
        )
        emit PatrolThresholdUpdated(id: marketId, newThreshold: threshold, updatedBy: executor, timestamp: getCurrentBlock().timestamp)
        return marketId
    }

    access(all) fun getMarketView(id: UInt64): MarketView? {
        if let market = self.markets[id] {
            return market.view()
        }
        return nil
    }

    access(all) fun getMarketViewBySlug(slug: String): MarketView? {
        if let marketId = self.slugToId[slug] {
            return self.getMarketView(id: marketId)
        }
        return nil
    }

    access(all) fun activateMarket(operatorBadge: &RoleBadge, id: UInt64) {
        self.assertRoleBadge(operatorBadge, role: Role.operator)
        let executor = operatorBadge.getOwner()

        var market = self.borrowMarket(id: id)
        if market.state != MarketState.draft {
            panic("Market must be draft")
        }
        market.setState(MarketState.live)
        self.storeMarket(market)
        emit MarketActivated(id: id, activatedBy: executor, timestamp: getCurrentBlock().timestamp)
    }

    access(all) fun suspendMarket(operatorBadge: &RoleBadge, id: UInt64, reason: String?) {
        self.assertRoleBadge(operatorBadge, role: Role.operator)

        var market = self.borrowMarket(id: id)
        if market.state != MarketState.live {
            panic("Market must be live")
        }
        market.setState(MarketState.suspended)
        self.storeMarket(market)
        emit MarketSuspended(id: id, reason: reason, timestamp: getCurrentBlock().timestamp)
    }

    access(all) fun closeMarket(operatorBadge: &RoleBadge, id: UInt64, reason: String?, closedAt: UFix64?) {
        self.assertRoleBadge(operatorBadge, role: Role.operator)
        let executor = operatorBadge.getOwner()

        var market = self.borrowMarket(id: id)
        if market.state != MarketState.live && market.state != MarketState.suspended {
            panic("Market must be live or suspended")
        }
        market.setState(MarketState.closed)
        let timestamp = closedAt ?? getCurrentBlock().timestamp
        market.setCloseAt(timestamp)
        self.storeMarket(market)
        emit MarketClosed(id: id, closedBy: executor, reason: reason, timestamp: timestamp)
    }

    access(all) fun voidMarket(operatorBadge: &RoleBadge, id: UInt64) {
        self.assertRoleBadge(operatorBadge, role: Role.operator)

        var market = self.borrowMarket(id: id)
        if market.state == MarketState.settled {
            panic("cannot void settled market")
        }
        market.setState(MarketState.voided)
        self.storeMarket(market)
        emit MarketVoided(id: id, timestamp: getCurrentBlock().timestamp)
    }

    access(all) fun updateMarketSchedule(
        operatorBadge: &RoleBadge,
        id: UInt64,
        scheduledStartAt: UFix64?,
        tradingLockAt: UFix64?,
        freezeWindowStartAt: UFix64?,
        freezeWindowEndAt: UFix64?
    ) {
        self.assertRoleBadge(operatorBadge, role: Role.operator)
        let executor = operatorBadge.getOwner()

        var market = self.borrowMarket(id: id)
        let current = market.schedule
        let schedule = MarketSchedule(
            scheduledStartAt: scheduledStartAt ?? current.scheduledStartAt,
            tradingLockAt: tradingLockAt ?? current.tradingLockAt,
            freezeWindowStartAt: freezeWindowStartAt ?? current.freezeWindowStartAt,
            freezeWindowEndAt: freezeWindowEndAt ?? current.freezeWindowEndAt
        )
        market.updateSchedule(schedule)
        self.storeMarket(market)
        emit MarketScheduleUpdated(
            id: id,
            scheduledBy: executor,
            startAt: schedule.scheduledStartAt,
            lockAt: schedule.tradingLockAt,
            freezeStart: schedule.freezeWindowStartAt,
            freezeEnd: schedule.freezeWindowEndAt,
            timestamp: getCurrentBlock().timestamp
        )
    }

    access(all) fun updatePatrolThreshold(operatorBadge: &RoleBadge, id: UInt64, newThreshold: UFix64) {
        self.assertRoleBadge(operatorBadge, role: Role.operator)
        let executor = operatorBadge.getOwner()

        var market = self.borrowMarket(id: id)
        market.setPatrolThreshold(newThreshold)
        self.storeMarket(market)
        emit PatrolThresholdUpdated(id: id, newThreshold: newThreshold, updatedBy: executor, timestamp: getCurrentBlock().timestamp)
    }

    access(all) fun recordPatrolSignal(
        patrolBadge: &RoleBadge,
        id: UInt64,
        severityRaw: String,
        code: String,
        weight: UFix64,
        expiresAt: UFix64?,
        notes: String?
    ) {
        self.assertRoleBadge(patrolBadge, role: Role.patrol)
        let issuer = patrolBadge.getOwner()

        var market = self.borrowMarket(id: id)
        if market.state == MarketState.voided {
            panic("cannot signal voided market")
        }
        let severity = CoreMarketHub.patrolSeverityFromString(severityRaw)
        let timestamp = getCurrentBlock().timestamp
        let signal = PatrolSignal(
            issuer: issuer,
            severity: severity,
            code: code,
            weight: weight,
            createdAt: timestamp,
            expiresAt: expiresAt,
            notes: notes
        )
        market.upsertPatrolSignal(address: issuer, signal: signal)
        self.storeMarket(market)
        emit PatrolSignalRecorded(
            id: id,
            issuer: issuer,
            severityRaw: severity.rawValue,
            weight: weight,
            code: code,
            expiresAt: expiresAt,
            timestamp: timestamp
        )
    }

    access(all) fun clearPatrolSignal(executorBadge: &RoleBadge, id: UInt64, patrolAddress: Address) {
        let role = executorBadge.role
        let executor = executorBadge.getOwner()
        if role == Role.patrol && executor != patrolAddress {
            panic("patrol can clear only own signal")
        }
        if role != Role.operator && role != Role.admin && role != Role.patrol {
            panic("badge not authorized")
        }
        var market = self.borrowMarket(id: id)
        market.upsertPatrolSignal(address: patrolAddress, signal: nil)
        self.storeMarket(market)
        emit PatrolSignalCleared(id: id, issuer: patrolAddress, timestamp: getCurrentBlock().timestamp)
    }

    access(all) fun settleMarket(oracleBadge: &RoleBadge, id: UInt64, outcomeId: UInt64, txHash: String, notes: String?) {
        self.assertRoleBadge(oracleBadge, role: Role.oracle)

        var market = self.borrowMarket(id: id)
        if market.state == MarketState.voided {
            panic("cannot settle void market")
        }
        market.setState(MarketState.settled)
        market.setCloseAt(getCurrentBlock().timestamp)
        let settlement = Settlement(
            resolvedOutcomeId: outcomeId,
            txHash: txHash,
            settledAt: getCurrentBlock().timestamp,
            notes: notes,
            overrideReason: nil
        )
        market.setSettlement(settlement)
        self.storeMarket(market)
        emit MarketSettled(id: id, outcomeId: outcomeId, txHash: txHash, timestamp: getCurrentBlock().timestamp)
    }

    access(all) fun overrideSettlement(operatorBadge: &RoleBadge, id: UInt64, outcomeId: UInt64, txHash: String, notes: String?, reason: String) {
        self.assertRoleBadge(operatorBadge, role: Role.operator)

        var market = self.borrowMarket(id: id)
        market.setState(MarketState.settled)
        market.setCloseAt(getCurrentBlock().timestamp)
        let settlement = Settlement(
            resolvedOutcomeId: outcomeId,
            txHash: txHash,
            settledAt: getCurrentBlock().timestamp,
            notes: notes,
            overrideReason: reason
        )
        market.setSettlement(settlement)
        self.storeMarket(market)
        emit MarketSettled(id: id, outcomeId: outcomeId, txHash: txHash, timestamp: getCurrentBlock().timestamp)
    }

    access(self) fun registerWorkflowAction(marketId: UInt64, action: WorkflowAction) {
        var market = self.borrowMarket(id: marketId)
        let actionId = market.nextWorkflowId
        market.setWorkflowAction(actionId: actionId, action: action)
        market.setNextWorkflowId(actionId + 1)
        self.storeMarket(market)
        emit WorkflowActionScheduled(
            id: marketId,
            actionId: actionId,
            actionTypeRaw: action.actionType.rawValue,
            scheduledAt: action.scheduledAt ?? getCurrentBlock().timestamp
        )
    }

    access(all) fun executeWorkflow(operatorBadge: &RoleBadge, id: UInt64, actionId: UInt64) {
        self.assertRoleBadge(operatorBadge, role: Role.operator)

        var market = self.borrowMarket(id: id)
        market.markWorkflowExecuted(actionId: actionId, timestamp: getCurrentBlock().timestamp)
        self.storeMarket(market)
        emit WorkflowActionExecuted(id: id, actionId: actionId, executedAt: getCurrentBlock().timestamp)
    }

    access(all) fun updateOutcomeStatus(operatorBadge: &RoleBadge, id: UInt64, outcomeIndex: UInt8, newStatus: OutcomeStatus, reason: String?) {
        self.assertRoleBadge(operatorBadge, role: Role.operator)

        var market = self.borrowMarket(id: id)
        let idx = Int(outcomeIndex)
        if idx >= market.outcomes.length {
            panic("Invalid outcome index")
        }

        market.updateOutcomeStatus(index: idx, status: newStatus)
        self.storeMarket(market)
        emit OutcomeStatusUpdated(id: id, outcomeId: market.outcomes[idx].id, newStatusRaw: newStatus.rawValue, reason: reason)
    }

    // --- Helpers -----------------------------------------------------------

    access(self) fun borrowMarket(id: UInt64): MarketData {
        return self.markets[id] ?? panic("Unknown market")
    }

    access(self) fun storeMarket(_ market: MarketData) {
        self.markets[market.id] = market
    }

    access(all) fun getMarketStorageMetadata(id: UInt64): StorageMetadata? {
        return self.marketStorageMetadata[id]
    }

    access(all) fun setMarketStorage(
        operatorBadge: &RoleBadge,
        id: UInt64,
        liquidityPoolPath: StoragePath,
        outcomeVaultPath: StoragePath,
        liquidityReceiverPath: PublicPath,
        liquidityProviderPath: PublicPath,
        outcomeReceiverPath: PublicPath,
        outcomeBalancePath: PublicPath,
        outcomeProviderPath: PublicPath
    ) {
        self.assertRoleBadge(operatorBadge, role: Role.operator)
        let owner = operatorBadge.getOwner()

        var market = self.borrowMarket(id: id)
        let metadata = StorageMetadata(
            liquidityPoolPath: liquidityPoolPath,
            outcomeVaultPath: outcomeVaultPath,
            liquidityReceiverPath: liquidityReceiverPath,
            liquidityProviderPath: liquidityProviderPath,
            outcomeReceiverPath: outcomeReceiverPath,
            outcomeBalancePath: outcomeBalancePath,
            outcomeProviderPath: outcomeProviderPath,
            owner: owner
        )
        market.setStorageMetadata(metadata)

        self.storeMarket(market)
        self.marketStorageMetadata[id] = market.storageMetadata!
    }

    init() {
        let deployer = self.account.address

        self.roleAssignments = {} as {UInt8: {Address: Bool}}
        self.lastMarketId = 0
        self.markets = {} as {UInt64: MarketData}
        self.marketStorageMetadata = {} as {UInt64: StorageMetadata}
        self.slugToId = {} as {String: UInt64}

        self.recordAssignment(address: deployer, role: Role.admin, granted: true)
        self.recordAssignment(address: deployer, role: Role.operator, granted: true)
        self.recordAssignment(address: deployer, role: Role.oracle, granted: true)

        let adminStorage = CoreMarketHub.roleStoragePath(role: Role.admin)
        let adminPublic = CoreMarketHub.rolePublicPath(role: Role.admin)
        let adminBadge <- create RoleBadge(role: Role.admin, owner: deployer)
        self.account.storage.save(<-adminBadge, to: adminStorage)
        self.account.capabilities.unpublish(adminPublic)
        let adminCap = self.account.capabilities.storage.issue<&RoleBadge>(adminStorage)
        self.account.capabilities.publish(adminCap, at: adminPublic)

        let operatorStorage = CoreMarketHub.roleStoragePath(role: Role.operator)
        let operatorPublic = CoreMarketHub.rolePublicPath(role: Role.operator)
        let operatorBadge <- create RoleBadge(role: Role.operator, owner: deployer)
        self.account.storage.save(<-operatorBadge, to: operatorStorage)
        self.account.capabilities.unpublish(operatorPublic)
        let operatorCap = self.account.capabilities.storage.issue<&RoleBadge>(operatorStorage)
        self.account.capabilities.publish(operatorCap, at: operatorPublic)

        let oracleStorage = CoreMarketHub.roleStoragePath(role: Role.oracle)
        let oraclePublic = CoreMarketHub.rolePublicPath(role: Role.oracle)
        let oracleBadge <- create RoleBadge(role: Role.oracle, owner: deployer)
        self.account.storage.save(<-oracleBadge, to: oracleStorage)
        self.account.capabilities.unpublish(oraclePublic)
        let oracleCap = self.account.capabilities.storage.issue<&RoleBadge>(oracleStorage)
        self.account.capabilities.publish(oracleCap, at: oraclePublic)
    }
}
