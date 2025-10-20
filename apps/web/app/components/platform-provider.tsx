'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePlatformDetection, type PlatformInfo } from '../lib/use-platform-detection';
import { PerformanceMonitor } from '../lib/performance-monitor';

const PlatformContext = createContext<PlatformInfo | null>(null);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const platform = usePlatformDetection();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Initialize performance monitoring
    PerformanceMonitor.init();
    
    // Log metrics in development
    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => {
        PerformanceMonitor.logMetrics();
      }, 5000);
    }
  }, []);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <PlatformContext.Provider value={platform}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform() {
  const context = useContext(PlatformContext);
  if (!context) {
    // Return default values if used outside provider
    return {
      browser: 'Unknown',
      isMobile: false,
      isTablet: false,
      hasTouch: false,
      hasWeb3: false,
      walletConflict: false,
      needsWalletConnect: false,
      shouldShowHover: true,
      touchTargetSize: 32,
      enableAnimations: true,
      connectionType: 'unknown',
    };
  }
  return context;
}
