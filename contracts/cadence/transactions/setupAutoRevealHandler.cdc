import AutoRevealHandler from 0x3ea7ac2bcdd8bcef
import FlowTransactionScheduler from 0x3ea7ac2bcdd8bcef

// Setup auto-reveal handler in user's account storage
// This needs to be called once per account before scheduling auto-reveals
transaction {
    prepare(signer: auth(BorrowValue, SaveValue, IssueStorageCapabilityController, PublishCapability) &Account) {
        
        // Check if handler already exists
        if signer.storage.check<@AutoRevealHandler.Handler>(from: AutoRevealHandler.HandlerStoragePath) {
            log("Auto-reveal handler already exists")
            return
        }
        
        // Create and save handler
        let handler <- AutoRevealHandler.createHandler()
        signer.storage.save(<-handler, to: AutoRevealHandler.HandlerStoragePath)
        
        // Issue entitled capability for scheduler
        let handlerCap = signer.capabilities.storage
            .issue<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>(
                AutoRevealHandler.HandlerStoragePath
            )
        
        // Issue public capability for metadata
        let publicHandlerCap = signer.capabilities.storage
            .issue<&{FlowTransactionScheduler.TransactionHandler}>(
                AutoRevealHandler.HandlerStoragePath
            )
        signer.capabilities.publish(publicHandlerCap, at: AutoRevealHandler.HandlerPublicPath)
        
        log("Auto-reveal handler setup complete")
    }
}
