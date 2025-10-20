'use client';

import type { ReactNode } from 'react';

interface ErrorScreenProps {
  title: string;
  description?: string;
  onRetry?: () => void;
  actionLabel?: string;
  extraContent?: ReactNode;
}

export const ErrorScreen = ({
  title,
  description,
  onRetry,
  actionLabel = 'Try again',
  extraContent,
}: ErrorScreenProps) => (
  <div className="error-screen">
    <div className="error-screen__card">
      <h1 className="error-screen__title">{title}</h1>
      {description ? <p className="error-screen__description">{description}</p> : null}
      <div className="error-screen__actions">
        {onRetry ? (
          <button type="button" className="button primary" onClick={onRetry}>
            {actionLabel}
          </button>
        ) : null}
        {extraContent}
      </div>
    </div>
  </div>
);
