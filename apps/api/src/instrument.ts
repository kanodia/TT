import * as Sentry from '@sentry/node';

// Error tracking (spec 8.1 observability). Off unless SENTRY_DSN is set. Must load before the app.
const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{9}/g;

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Never ship tokens or phone numbers to a third party (spec 11.2).
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers['x-internal-key'];
        delete event.request.headers.cookie;
      }
      if (event.request?.data) event.request.data = '[redacted]';
      if (event.message) event.message = event.message.replace(PHONE, '[phone]');
      for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = ex.value.replace(PHONE, '[phone]');
      return event;
    },
  });
}

export { Sentry };
