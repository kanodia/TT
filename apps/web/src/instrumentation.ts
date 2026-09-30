import * as Sentry from '@sentry/nextjs';

// Server-side error tracking (spec 8.1 observability). Off unless SENTRY_DSN is set.
export function register() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
}

export const onRequestError = Sentry.captureRequestError;
