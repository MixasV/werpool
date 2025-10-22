import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

import { FlowWalletProvider } from "./providers/flow-wallet-provider";
import { AppHeader } from "./components/app-header";
import { AppSidebar } from "./components/app-sidebar";
import { AppFooter } from "./components/app-footer";
import { WalletConflictResolver } from "./components/wallet-conflict-resolver";

import "./globals.css";

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Werpool — Your forecast is your asset',
  description: 'Werpool is the social prediction exchange on Flow where intuition becomes an on-chain asset.',
  appleWebApp: {
    title: 'Werpool',
    capable: true,
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/favicon/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon/favicon.ico',
    apple: '/favicon/apple-touch-icon.png',
  },
  manifest: '/favicon/site.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#0c0f17',
  viewportFit: 'cover', // iOS safe area support
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`app-body ${inter.className}`}>
        <a href="#main-content" className="skip-to-main">
          Skip to main content
        </a>
        <FlowWalletProvider>
          <WalletConflictResolver />
          <div className="app-shell">
            <AppHeader />
            <div className="app-shell__content">
              <AppSidebar />
              <main id="main-content" className="app-shell__main">{children}</main>
            </div>
            <AppFooter />
          </div>
        </FlowWalletProvider>
      </body>
    </html>
  );
}
