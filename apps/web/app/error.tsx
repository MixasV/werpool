'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { ErrorScreen } from './components/error-screen';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App segment error', error);
  }, [error]);

  return (
    <ErrorScreen
      title="Something went wrong"
      description="Try refreshing the page or head back to the homepage."
      onRetry={reset}
      extraContent={(
        <Link href="/" className="button secondary">
          Go to homepage
        </Link>
      )}
    />
  );
}
