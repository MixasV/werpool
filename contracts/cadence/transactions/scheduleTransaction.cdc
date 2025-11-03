import ScheduledTransactionHandlers from 0x3ea7ac2bcdd8bcef

// Schedule a transaction to execute in the future
// Used for auto-reveal and auto-settlement
transaction(
  delaySeconds: UFix64,
  priority: UInt8,
  executionEffort: UInt64,
  handlerPath: String,
  dataJson: String?
) {
  prepare(signer: &Account) {
    // Get scheduler capability
    let scheduler = signer.storage.borrow<&ScheduledTransactionHandlers.Scheduler>(
      from: /storage/ScheduledTransactionScheduler
    ) ?? panic("Scheduler not found in storage")

    // Schedule the transaction
    let scheduledTx = scheduler.schedule(
      delay: delaySeconds,
      priority: priority,
      executionEffort: executionEffort,
      handlerPath: handlerPath,
      data: dataJson
    )

    log("Scheduled transaction: ".concat(scheduledTx.id.toString()))
  }

  execute {
    log("Transaction scheduled successfully")
  }
}
