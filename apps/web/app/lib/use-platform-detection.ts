'use client';

import { useEffect, useState } from 'react';
import { 
  BrowserDetection, 
  FeatureDetection, 
  Web3WalletDetection,
  InteractionPattern 
} from './browser-detection';

export interface PlatformInfo {
  browser: string;
  isMobile: boolean;
  isTablet: boolean;
  hasTouch: boolean;
  hasWeb3: boolean;
  walletConflict: boolean;
  needsWalletConnect: boolean;
  shouldShowHover: boolean;
  touchTargetSize: number;
  enableAnimations: boolean;
  connectionType: string;
}

/**
 * React Hook for platform detection
 * Must be used in client components only
 */
export function usePlatformDetection(): PlatformInfo {
  const [platform, setPlatform] = useState<PlatformInfo>({
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
  });

  useEffect(() => {
    setPlatform({
      browser: BrowserDetection.getBrowserName(),
      isMobile: BrowserDetection.isMobile(),
      isTablet: BrowserDetection.isTablet(),
      hasTouch: FeatureDetection.hasTouchScreen(),
      hasWeb3: FeatureDetection.hasWeb3(),
      walletConflict: Web3WalletDetection.hasWalletConflict(),
      needsWalletConnect: Web3WalletDetection.needsWalletConnect(),
      shouldShowHover: InteractionPattern.shouldShowHoverStates(),
      touchTargetSize: InteractionPattern.getTouchTargetSize(),
      enableAnimations: InteractionPattern.shouldEnableAnimations(),
      connectionType: FeatureDetection.getConnectionType(),
    });
  }, []);

  return platform;
}

/**
 * Hook for detecting viewport size changes
 */
export function useViewportSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const handleResize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}

/**
 * Hook for detecting iOS safe area insets
 */
export function useSafeArea() {
  const [insets, setInsets] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  useEffect(() => {
    if (!BrowserDetection.isIOS()) return;

    const getInset = (prop: string): number => {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue(`env(safe-area-inset-${prop})`);
      return parseFloat(value) || 0;
    };

    const updateInsets = () => {
      setInsets({
        top: getInset('top'),
        right: getInset('right'),
        bottom: getInset('bottom'),
        left: getInset('left'),
      });
    };

    updateInsets();
    window.addEventListener('orientationchange', updateInsets);
    return () => window.removeEventListener('orientationchange', updateInsets);
  }, []);

  return insets;
}
