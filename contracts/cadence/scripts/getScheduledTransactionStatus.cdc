import ScheduledTransactionHandlers from 0x3ea7ac2bcdd8bcef

// Get status of a scheduled transaction
access(all) fun main(scheduledTxId: String, schedulerAddress: Address): {String: AnyStruct}? {
  // Get scheduler from account
  let account = getAccount(schedulerAddress)
  
  let schedulerRef = account.capabilities
    .borrow<&ScheduledTransactionHandlers.Scheduler>(/public/ScheduledTransactionScheduler)
    ?? panic("Scheduler not found")

  // Get transaction status
  let status = schedulerRef.getStatus(txId: scheduledTxId)

  if status == nil {
    return nil
  }

  return {
    "id": scheduledTxId,
    "status": status!.status,
    "executeAt": status!.executeAt,
    "priority": status!.priority,
    "executionEffort": status!.executionEffort
  }
}
