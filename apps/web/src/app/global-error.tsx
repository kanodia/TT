'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// Last-resort error page: replaces the root layout, so it can't use the session or translations.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, background: '#fff', color: '#1c1c1c' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ fontSize: 40, margin: 0 }}>🍽️</p>
          <h1 style={{ fontSize: 20 }}>Something went wrong · कुछ गड़बड़ हो गई</h1>
          <button onClick={reset} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>
            Try again · फिर कोशिश करें
          </button>
        </div>
      </body>
    </html>
  );
}
