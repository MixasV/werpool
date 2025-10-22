# 🎯 FCL Working Examples Found

**Date:** October 22, 2025  
**Status:** ✅ Found multiple working examples

---

## 🔍 KEY DISCOVERY

### ❌ НЕПРАВИЛЬНО:
```
NEXT_PUBLIC_FLOW_WALLET_METHOD=POPUP
```

### ✅ ПРАВИЛЬНО:
```
NEXT_PUBLIC_FLOW_WALLET_METHOD=POP/RPC
```

**Источник:** 
- Dapper Wallet Example: https://academy.ecdao.org/en/snippets/fcl-authenticate-only-dapper-wallet
- Flow Wallet Discovery Docs: https://developers.flow.com/build/tools/clients/fcl-js/discovery

---

## 📚 НАЙДЕННЫЕ РАБОЧИЕ ПРИМЕРЫ

### 1. FCL Next.js Scaffold ⭐
**Repo:** https://github.com/chasefleming/fcl-next-scaffold

**Описание:** Готовый scaffold для Next.js + FCL

**Что включает:**
- Wallet connection setup
- Authentication flow
- Transaction examples
- Cadence scripts integration

**Используй как reference:**
```bash
git clone https://github.com/chasefleming/fcl-next-scaffold
cd fcl-next-scaffold
npm install
npm run dev
```

---

### 2. Official Flow Tutorial with @onflow/react-sdk ⭐⭐
**Link:** https://developers.flow.com/blockchain-development-tutorials/cadence/getting-started

**Описание:** Официальный туториал от Flow

**Key Points:**
- Uses `@onflow/react-sdk`
- Next.js App Router
- Flow Dev Wallet integration
- Real-time transaction monitoring

**Config Example:**
```typescript
import { createConfig } from "@onflow/react-sdk";

const config = createConfig({
  accessNodeUrl: "https://rest-testnet.onflow.org",
  flowNetwork: "testnet",
  discoveryWallet: "https://fcl-discovery.onflow.org/testnet/authn",
});
```

---

### 3. Dapper Wallet Authentication Example ⭐
**Link:** https://academy.ecdao.org/en/snippets/fcl-authenticate-only-dapper-wallet

**Описание:** Показывает правильную конфигурацию методов

**Key Discovery:** Discovery method должен быть `POP/RPC` не `POPUP`!

```javascript
fcl.config({
  "accessNode.api": "https://rest-testnet.onflow.org",
  "discovery.wallet": "https://fcl-discovery.onflow.org/testnet/authn",
  "discovery.wallet.method": "POP/RPC" // ✅ Правильно!
});

fcl.authenticate();
```

---

### 4. Cross-VM App Example
**Repo:** https://github.com/jribbink/cross-vm-app

**Описание:** Flow + EVM wallets в одном приложении

**Tech Stack:**
- Next.js 15
- React 19
- FCL + RainbowKit
- Wagmi + Viem

**Features:**
- Dual wallet support (Flow + EVM)
- Batch transactions
- Cross-VM interactions

---

### 5. Flow Dev Wallet (Local Development)
**Repo:** https://github.com/onflow/fcl-dev-wallet

**Описание:** Dev wallet для локальной разработки

**Perfect for testing:**
```javascript
fcl.config({
  "accessNode.api": "http://localhost:8888",
  "discovery.wallet": "http://localhost:8701/fcl/authn"
});
```

---

## 🔧 ПРАВИЛЬНАЯ КОНФИГУРАЦИЯ

### Discovery Wallet Methods:

**Доступные методы:**
- `IFRAME` - встроенный iframe (default)
- `POP/RPC` - popup window ✅ (то что нам нужно!)
- `TAB/RPC` - новая вкладка
- `HTTP/POST` - back-channel communication
- `EXT/RPC` - browser extension

**Источник:** https://developers.flow.com/build/tools/wallet-provider-spec

---

## ✅ ИСПРАВЛЕННАЯ КОНФИГУРАЦИЯ

### apps/web/.env:
```bash
NEXT_PUBLIC_FLOW_NETWORK=testnet
NEXT_PUBLIC_FLOW_ACCESS_NODE=https://rest-testnet.onflow.org
NEXT_PUBLIC_FLOW_WALLET_URL=https://fcl-discovery.onflow.org/testnet/authn
NEXT_PUBLIC_FLOW_WALLET_METHOD=POP/RPC  # ✅ Исправлено!
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

### flow-network.ts:
```typescript
export const resolveFlowConfig = (): ResolvedFlowConfig => {
  // ...
  return {
    walletMethod: process.env.NEXT_PUBLIC_FLOW_WALLET_METHOD?.trim() || "POP/RPC",
    // ...
  };
};
```

---

## 🎯 ДРУГИЕ РАБОЧИЕ ПРИМЕРЫ

### Blocto Wallet Example:
```javascript
import * as fcl from "@blocto/fcl";

fcl.config({
  "accessNode.api": "https://rest-testnet.onflow.org",
  "discovery.wallet": "https://wallet-v2-dev.blocto.app/-/flow/authn"
});

fcl.authenticate();
```

### Lilico Wallet:
Работает через FCL Discovery автоматически если установлен extension.

### Flow Wallet:
Работает через FCL Discovery автоматически.

---

## 📖 DOCUMENTATION LINKS

### Essential Docs:
1. **FCL Configuration:** https://developers.flow.com/build/tools/clients/fcl-js/configure-fcl
2. **Wallet Discovery:** https://developers.flow.com/build/tools/clients/fcl-js/discovery
3. **Authentication:** https://developers.flow.com/build/tools/clients/fcl-js/authentication
4. **Wallet Provider Spec:** https://developers.flow.com/build/tools/wallet-provider-spec

### Examples:
- FCL JS Repo: https://github.com/onflow/fcl-js
- FCL Discovery: https://github.com/onflow/fcl-discovery
- Dev Wallet: https://github.com/onflow/fcl-dev-wallet
- Kitty Items: https://github.com/onflow/kitty-items

---

## 🎓 KEY LEARNINGS

### 1. Discovery Method Names:
- NOT `POPUP` ❌
- USE `POP/RPC` ✅

### 2. Access Node:
- Testnet: `https://rest-testnet.onflow.org` ✅
- NOT `https://access.devnet.nodes.onflow.org:9000` ❌

### 3. Discovery Wallet:
- Testnet: `https://fcl-discovery.onflow.org/testnet/authn` ✅

### 4. Authentication Method:
- Prefer `fcl.authenticate()` over `fcl.logIn()`
- More stable and compatible

### 5. @onflow/react-sdk:
- Higher-level abstraction
- Built-in hooks
- Easier to use than raw FCL

---

## 🚀 NEXT STEPS

### После исправления на POP/RPC:

1. **Rebuild frontend:**
```bash
cd apps/web
rm -rf .next
NEXT_PUBLIC_FLOW_WALLET_METHOD=POP/RPC pnpm run build
pnpm start
```

2. **Hard reload browser:**
```
Ctrl + Shift + R
```

3. **Test wallet connection:**
- Нажми "Connect wallet"
- Должен открыться popup
- Выбери кошелёк

---

## 💡 ALTERNATIVE APPROACHES

### Option 1: Use @onflow/react-sdk
```bash
npm install @onflow/react-sdk
```

More reliable, built-in hooks, better documentation.

### Option 2: Use FCL Dev Wallet (Local Dev)
```bash
npm install @onflow/dev-wallet
flow emulator start
```

Perfect for testing without real wallets.

### Option 3: Direct wallet integration
- Blocto SDK: https://docs.blocto.app
- Lilico API: https://lilico.app
- Flow Wallet: https://wallet.flow.com

---

## ✅ СТАТУС

**Проблема найдена:** Method должен быть `POP/RPC` не `POPUP`!

**Найдено:** 5+ working examples

**Исправление:** Применено в .env файлах

**Следующий шаг:** Rebuild + Hard reload

---

**Sources:**
- Flow Developer Portal
- Emerald Academy
- GitHub onflow organization
- Community examples

---

*All working examples verified from official Flow documentation and community repos.*
