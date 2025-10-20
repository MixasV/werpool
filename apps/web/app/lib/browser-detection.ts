/**
 * Browser and Feature Detection Utilities
 * Cross-platform compatibility layer for Web3 applications
 */

// Extend Window interface for Web3 providers
declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      isBraveWallet?: boolean;
      isCoinbaseWallet?: boolean;
      request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

export class BrowserDetection {
  private static userAgent: string = typeof window !== 'undefined' ? navigator.userAgent : '';

  static isChrome(): boolean {
    return /Chrome/.test(this.userAgent) && !/Edg|OPR/.test(this.userAgent);
  }

  static isSafari(): boolean {
    return /Safari/.test(this.userAgent) && !/Chrome/.test(this.userAgent);
  }

  static isFirefox(): boolean {
    return /Firefox/.test(this.userAgent);
  }

  static isEdge(): boolean {
    return /Edg/.test(this.userAgent);
  }

  static isBrave(): boolean {
    // Brave detection requires async check
    return typeof navigator !== 'undefined' && 'brave' in navigator;
  }

  static isIOS(): boolean {
    return /iPad|iPhone|iPod/.test(this.userAgent);
  }

  static isAndroid(): boolean {
    return /Android/.test(this.userAgent);
  }

  static isMobile(): boolean {
    return this.isIOS() || this.isAndroid() || /Mobile/.test(this.userAgent);
  }

  static isTablet(): boolean {
    return /iPad|Android(?!.*Mobile)/.test(this.userAgent);
  }

  static getBrowserName(): string {
    if (this.isChrome()) return 'Chrome';
    if (this.isSafari()) return 'Safari';
    if (this.isFirefox()) return 'Firefox';
    if (this.isEdge()) return 'Edge';
    if (this.isBrave()) return 'Brave';
    return 'Unknown';
  }
}

export class FeatureDetection {
  static hasWebGL(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      return !!(
        canvas.getContext('webgl') || 
        canvas.getContext('experimental-webgl')
      );
    } catch {
      return false;
    }
  }

  static hasServiceWorker(): boolean {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  }

  static hasWeb3(): boolean {
    return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
  }

  static hasTouchScreen(): boolean {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  static hasPointerEvents(): boolean {
    return typeof window !== 'undefined' && 'PointerEvent' in window;
  }

  static supportsBackdropFilter(): boolean {
    if (typeof window === 'undefined') return false;
    const div = document.createElement('div');
    return 'backdropFilter' in div.style || 'webkitBackdropFilter' in div.style;
  }

  static supportsGrid(): boolean {
    if (typeof window === 'undefined') return false;
    const div = document.createElement('div');
    return 'grid' in div.style;
  }

  static getConnectionType(): string {
    if (typeof navigator === 'undefined' || !('connection' in navigator)) {
      return 'unknown';
    }
    const conn = (navigator as any).connection;
    return conn?.effectiveType || 'unknown';
  }

  static isSlowConnection(): boolean {
    const connType = this.getConnectionType();
    return connType === 'slow-2g' || connType === '2g';
  }
}

/**
 * Web3 Wallet Detection and Conflict Resolution
 */
export class Web3WalletDetection {
  static hasMetaMask(): boolean {
    return typeof window !== 'undefined' && 
           typeof window.ethereum !== 'undefined' && 
           !!(window.ethereum as any)?.isMetaMask;
  }

  static hasBraveWallet(): boolean {
    return typeof window !== 'undefined' && 
           typeof window.ethereum !== 'undefined' && 
           !!(window.ethereum as any)?.isBraveWallet;
  }

  static hasCoinbaseWallet(): boolean {
    return typeof window !== 'undefined' && 
           typeof window.ethereum !== 'undefined' && 
           !!(window.ethereum as any)?.isCoinbaseWallet;
  }

  static hasWalletConflict(): boolean {
    // Check for Brave + MetaMask conflict
    return this.hasBraveWallet() && this.hasMetaMask();
  }

  static getDetectedWallets(): string[] {
    const wallets: string[] = [];
    if (this.hasMetaMask()) wallets.push('MetaMask');
    if (this.hasBraveWallet()) wallets.push('Brave Wallet');
    if (this.hasCoinbaseWallet()) wallets.push('Coinbase Wallet');
    return wallets;
  }

  static needsWalletConnect(): boolean {
    // iOS Safari requires WalletConnect
    return BrowserDetection.isIOS() && BrowserDetection.isSafari();
  }
}

/**
 * Device-specific interaction patterns
 */
export class InteractionPattern {
  static getTouchTargetSize(): number {
    // Return minimum touch target size based on platform
    return FeatureDetection.hasTouchScreen() ? 44 : 32;
  }

  static shouldShowHoverStates(): boolean {
    // Only show hover states on non-touch devices
    return !FeatureDetection.hasTouchScreen();
  }

  static getOptimalAnimationDuration(): number {
    // Reduce animation duration on slow connections
    return FeatureDetection.isSlowConnection() ? 0 : 200;
  }

  static shouldEnableAnimations(): boolean {
    // Check for reduced motion preference
    if (typeof window === 'undefined') return true;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    return !mediaQuery.matches && !FeatureDetection.isSlowConnection();
  }
}

/**
 * Performance budgets by device type
 */
export class PerformanceBudget {
  static getTargets() {
    const isMobile = BrowserDetection.isMobile();
    const isTablet = BrowserDetection.isTablet();

    if (isMobile) {
      return {
        firstContentfulPaint: 2000,
        largestContentfulPaint: 3000,
        timeToInteractive: 5000,
        totalBlockingTime: 300,
        cumulativeLayoutShift: 0.1,
      };
    }

    if (isTablet) {
      return {
        firstContentfulPaint: 1500,
        largestContentfulPaint: 2500,
        timeToInteractive: 4000,
        totalBlockingTime: 200,
        cumulativeLayoutShift: 0.1,
      };
    }

    return {
      firstContentfulPaint: 1000,
      largestContentfulPaint: 2000,
      timeToInteractive: 3000,
      totalBlockingTime: 100,
      cumulativeLayoutShift: 0.05,
    };
  }
}
