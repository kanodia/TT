import * as Sentry from '@sentry/nextjs';

// Browser error tracking. Off unless NEXT_PUBLIC_SENTRY_DSN is set. No replays, no PII (spec 11.2).
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.05,
    beforeSend(event) {
      if (event.request?.headers) delete event.request.headers.authorization;
      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
