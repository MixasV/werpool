import ScheduledTransactionHandlers from 0x3ea7ac2bcdd8bcef

// Cancel a scheduled transaction
transaction(scheduledTxId: String) {
  prepare(signer: &Account) {
    // Get scheduler capability
    let scheduler = signer.storage.borrow<&ScheduledTransactionHandlers.Scheduler>(
      from: /storage/ScheduledTransactionScheduler
    ) ?? panic("Scheduler not found in storage")

    // Cancel the scheduled transaction
    scheduler.cancel(txId: scheduledTxId)

    log("Cancelled scheduled transaction: ".concat(scheduledTxId))
  }

  execute {
    log("Scheduled transaction cancelled successfully")
  }
}
