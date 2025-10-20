'use client';

import Link from 'next/link';
import { Inter } from 'next/font/google';
import { useEffect } from 'react';

import { ErrorScreen } from './components/error-screen';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global application error', error);
  }, [error]);

  return (
    <html lang="en">
      <body className={inter.className}>
        <ErrorScreen
          title="The application is temporarily unavailable"
          description="We are working on a fix. Please refresh the page or try again later."
          onRetry={reset}
          extraContent={(
            <Link href="/" className="button secondary">
              Go to homepage
            </Link>
          )}
        />
      </body>
    </html>
  );
}
