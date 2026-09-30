// Sentry must initialise before anything else is imported.
import './instrument.js';
import { buildApp } from './app.js';
import { startWorker } from './lib/worker.js';

const app = await buildApp();
const port = Number(process.env.PORT ?? 4000);

try {
  await app.listen({ port, host: '0.0.0.0' });
  // Background jobs run in-process by default; set WORKER=off to run them elsewhere (npm run worker).
  if (process.env.WORKER !== 'off') startWorker(app.log);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
