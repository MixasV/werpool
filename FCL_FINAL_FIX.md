# 🎯 FCL Final Fix: "Externally Halted" Resolution

**Date:** October 22, 2025  
**Issue:** Popup opened but authentication failed with "Declined: Externally Halted"

---

## 🔍 ROOT CAUSE ANALYSIS

### Problem 1: Hardcoded POPUP in Code ❌
```typescript
// apps/web/app/lib/flow-network.ts
testnet: {
  walletMethod: "POPUP",  // ❌ Wrong!
}
```

**Impact:** Env variable `NEXT_PUBLIC_FLOW_WALLET_METHOD=POP/RPC` was overridden by code

### Problem 2: Missing App Metadata ❌
```typescript
app.detail.icon: ""  // ❌ Empty!
app.detail.url: undefined  // ❌ Missing!
```

**Impact:** Wallet cannot verify app identity → "Externally Halted"

### Problem 3: Conditional Method Setting ❌
```typescript
if (walletMethod) {
  config.put("discovery.wallet.method", walletMethod);
}
```

**Impact:** Method not always set, fallback to undefined

---

## ✅ SOLUTION APPLIED

### Fix 1: Changed Hardcoded Values
```typescript
// apps/web/app/lib/flow-network.ts
testnet: {
  accessNode: "https://rest-testnet.onflow.org",
  discoveryWallet: "https://fcl-discovery.onflow.org/testnet/authn",
  discoveryAuthn: "https://fcl-discovery.onflow.org/testnet/authn",
  walletMethod: "POP/RPC",  // ✅ Fixed!
  contracts: { ... }
}

mainnet: {
  accessNode: "https://rest-mainnet.onflow.org",
  discoveryWallet: "https://fcl-discovery.onflow.org/authn",
  discoveryAuthn: "https://fcl-discovery.onflow.org/authn",
  walletMethod: "POP/RPC",  // ✅ Fixed!
  contracts: { ... }
}
```

### Fix 2: Added App Metadata
```typescript
// apps/web/app/lib/flow-config.ts
const config = fcl
  .config()
  .put("app.detail.title", appTitle)
  .put("app.detail.icon", appIcon || "https://werpool.mixas.pro/favicon.ico")  // ✅ Fallback icon
  .put("app.detail.url", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")  // ✅ App origin
  .put("flow.network", network)
  .put("accessNode.api", accessNode)
  .put("discovery.wallet", discoveryWallet)
  .put("discovery.authn.endpoint", discoveryAuthn)
  .put("discovery.wallet.method", walletMethod || "POP/RPC")  // ✅ Always set!
  .put("service.OpenID.scopes", "email profile")
  .put("0xCoreMarketHub", contracts.coreMarketHub)
  .put("0xLMSRAmm", contracts.lmsrAmm)
  .put("0xOutcomeToken", contracts.outcomeToken);
```

### Fix 3: Removed Conditional Logic
```typescript
// Before ❌
if (walletMethod) {
  config.put("discovery.wallet.method", walletMethod);
}

// After ✅
.put("discovery.wallet.method", walletMethod || "POP/RPC")
```

---

## 📋 COMPLETE FCL CONFIGURATION

### Final Configuration:
```typescript
{
  // App Identity (Required for Wallets!)
  "app.detail.title": "Forte Prediction Markets",
  "app.detail.icon": "https://werpool.mixas.pro/favicon.ico",
  "app.detail.url": "http://localhost:3000",
  
  // Network
  "flow.network": "testnet",
  "accessNode.api": "https://rest-testnet.onflow.org",
  
  // Wallet Discovery
  "discovery.wallet": "https://fcl-discovery.onflow.org/testnet/authn",
  "discovery.authn.endpoint": "https://fcl-discovery.onflow.org/testnet/authn",
  "discovery.wallet.method": "POP/RPC",
  
  // OpenID
  "service.OpenID.scopes": "email profile",
  
  // Contracts
  "0xCoreMarketHub": "0x3ea7ac2bcdd8bcef",
  "0xLMSRAmm": "0x3ea7ac2bcdd8bcef",
  "0xOutcomeToken": "0x3ea7ac2bcdd8bcef"
}
```

---

## 🎯 WHY "EXTERNALLY HALTED" OCCURRED

### Wallet Authentication Flow:

1. **User clicks "Connect wallet"** ✅
   - fcl.authenticate() called
   
2. **Popup window opens** ✅
   - POP/RPC method working
   
3. **Wallet Discovery loads** ✅
   - https://fcl-discovery.onflow.org/testnet/authn
   
4. **User selects wallet** ✅
   - Wallet clicked
   
5. **Wallet checks app metadata** ❌
   - Looking for: app.detail.icon
   - Looking for: app.detail.url
   - Looking for: app.detail.title
   
6. **Metadata missing → Halt** ❌
   - Wallet cannot verify app identity
   - Security measure: decline connection
   - Error: "Declined: Externally Halted"

---

## ✅ WHY IT SHOULD WORK NOW

### App Metadata Present:
```typescript
✅ app.detail.title: "Forte Prediction Markets"
✅ app.detail.icon: "https://werpool.mixas.pro/favicon.ico"
✅ app.detail.url: "http://localhost:3000"
```

### Method Correct:
```typescript
✅ discovery.wallet.method: "POP/RPC"
```

### Access Node Correct:
```typescript
✅ accessNode.api: "https://rest-testnet.onflow.org"
```

### Discovery Endpoint Correct:
```typescript
✅ discovery.wallet: "https://fcl-discovery.onflow.org/testnet/authn"
```

---

## 🔄 AUTHENTICATION FLOW (Fixed)

```
User clicks "Connect wallet"
         ↓
fcl.authenticate() called
         ↓
Popup opens (POP/RPC)
         ↓
Discovery service loads
         ↓
User selects wallet
         ↓
Wallet receives app metadata:
  - title: "Forte Prediction Markets" ✅
  - icon: "https://werpool.mixas.pro/favicon.ico" ✅
  - url: "http://localhost:3000" ✅
         ↓
Wallet verifies app ✅
         ↓
User approves connection ✅
         ↓
Wallet signs message ✅
         ↓
fcl.currentUser updated ✅
         ↓
SUCCESS! 🎉
```

---

## 📚 REFERENCE DOCUMENTATION

### App Metadata Requirements:
- **Flow Wallet Provider Spec:** https://developers.flow.com/build/tools/wallet-provider-spec
- **FCL Configuration:** https://developers.flow.com/build/tools/clients/fcl-js/configure-fcl
- **Wallet Discovery:** https://developers.flow.com/build/tools/clients/fcl-js/discovery

### Required Fields:
1. `app.detail.title` - App name shown to user
2. `app.detail.icon` - App logo/favicon
3. `app.detail.url` - App origin for callbacks

**All wallets verify these fields before allowing connection!**

---

## 🎓 KEY LEARNINGS

### 1. Don't Hardcode Config Values
```typescript
❌ walletMethod: "POPUP"  // Hardcoded in preset
✅ walletMethod: "POP/RPC"  // Correct value
```

### 2. Always Provide App Metadata
```typescript
❌ .put("app.detail.icon", "")  // Empty
✅ .put("app.detail.icon", "https://werpool.mixas.pro/favicon.ico")
```

### 3. Don't Use Conditional Config
```typescript
❌ if (walletMethod) { config.put(...) }
✅ .put("discovery.wallet.method", walletMethod || "POP/RPC")
```

### 4. Use Fallback Values
```typescript
✅ appIcon || "https://werpool.mixas.pro/favicon.ico"
✅ walletMethod || "POP/RPC"
✅ process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
```

---

## 🚀 FILES CHANGED

### 1. apps/web/app/lib/flow-network.ts
- Changed `walletMethod: "POPUP"` → `"POP/RPC"` in testnet preset
- Changed `walletMethod: "POPUP"` → `"POP/RPC"` in mainnet preset

### 2. apps/web/app/lib/flow-config.ts
- Added `app.detail.url` with fallback
- Added fallback for `app.detail.icon`
- Removed conditional `discovery.wallet.method` setting
- Now always sets method with fallback to "POP/RPC"

---

## ✅ EXPECTED BEHAVIOR

### After Hard Reload:

1. **Click "Connect wallet"**
   - Popup opens immediately

2. **Wallet Discovery loads**
   - Shows available wallets

3. **Select wallet**
   - Wallet receives app info:
     - Title: "Forte Prediction Markets"
     - Icon: favicon
     - URL: http://localhost:3000

4. **Approve connection**
   - NO "Externally Halted" error ✅
   - Connection succeeds ✅

5. **User authenticated**
   - fcl.currentUser.addr populated
   - Can see address in UI
   - Can make transactions

---

## 🐛 IF STILL FAILS

### Try Different Wallet:
1. **Flow Wallet** (official)
2. **Blocto** (email-based, easier)
3. **Lilico** (Chrome extension)

### Check Browser Console:
```javascript
// Check current config
await fcl.config().get("app.detail.title")
await fcl.config().get("app.detail.icon")
await fcl.config().get("app.detail.url")
await fcl.config().get("discovery.wallet.method")

// Should return:
// "Forte Prediction Markets"
// "https://werpool.mixas.pro/favicon.ico"
// "http://localhost:3000"
// "POP/RPC"
```

### Alternative: Use IFRAME Method:
```bash
NEXT_PUBLIC_FLOW_WALLET_METHOD=IFRAME
```

### Alternative: Use Dev Wallet:
```bash
# For local development only
NEXT_PUBLIC_FLOW_WALLET_URL=http://localhost:8701/fcl/authn
```

---

## 📊 CHANGES SUMMARY

| Issue | Before | After |
|-------|--------|-------|
| Method in code | `"POPUP"` ❌ | `"POP/RPC"` ✅ |
| App icon | `""` ❌ | `"https://...favicon.ico"` ✅ |
| App URL | `undefined` ❌ | `"http://localhost:3000"` ✅ |
| Method setting | Conditional ❌ | Always set ✅ |
| Fallbacks | None ❌ | All critical fields ✅ |

---

## 🎉 RESULT

**All FCL configuration requirements met:**
- ✅ Correct method: POP/RPC
- ✅ App metadata complete
- ✅ Access node: REST testnet
- ✅ Discovery endpoint: testnet authn
- ✅ Fallback values for all fields
- ✅ No conditional configuration

**Authentication should now work!**

---

**Next step:** Hard reload (Ctrl+Shift+R) and test wallet connection again.

**Expected:** No "Externally Halted" error, successful authentication! 🚀
