import aiSportsJuice from 0x9db94c9564243ba7
import FungibleToken from 0x9a0766d93b6608b7

pub fun main(userAddress: Address): UFix64? {
    let account = getAccount(userAddress)
    let capability = account.getCapability<&{FungibleToken.Balance}>(/public/aiSportsJuiceBalance)
    let balanceRef = capability.borrow()
    return balanceRef?.balance
}
