# TwiggyTomato

Restaurant discovery for small towns in Rajasthan: menus, timings, photos and reviews, plus tools for restaurant owners, the field team and ops. Product spec: [docs/spec.md](docs/spec.md).

```
apps/api   Fastify + Prisma + PostgreSQL/PostGIS — REST API under /v1, background worker
apps/web        Next.js 16 — diner site, partner portal, field app (offline), admin console
apps/mobile     Expo (React Native) — diner, field-team and restaurant-partner apps, three store apps from one codebase
packages/shared Translations (Hindi/English), API types and formatting used by web and mobile
```

## Run locally

Needs Node 20+ and PostgreSQL 17 with PostGIS (`brew install postgresql@17 postgis && brew services start postgresql@17`).

```bash
createdb twiggytomato && createdb twiggytomato_test

cd apps/api
cp .env.example .env         # set DATABASE_URL to your local user
npm install
npm run db:migrate           # creates tables, PostGIS/trigram extensions and indexes
npm run db:seed              # fictional sample data (wipes existing rows)
npm run dev                  # http://localhost:4000 — also runs the background worker

cd ../web
cp .env.example .env.local
npm install
npm run dev                  # http://localhost:3000
```

Sign in with any 10-digit mobile number. In development the OTP is shown on screen, and `123456` always works.

| Seed login | Role |
|---|---|
| 9999999999 | Admin |
| 7777777778 | Field supervisor |
| 7777777777 | Field agent (has a beat and leads) |
| 8888888888 | Partner (owns several sample restaurants) |

## Checks

```bash
cd apps/api && npm run typecheck && npm test && npm run test:api   # test:api resets twiggytomato_test
cd apps/web && npx tsc --noEmit && npm run lint && npm run build
cd apps/mobile && npx tsc --noEmit && npx expo lint
```

## Optional services

Everything works locally without these; each switches on when its variables are set (see `apps/api/.env.example`).

| Feature | Variables | Without it |
|---|---|---|
| SMS (OTP, alerts, owner invites) | `SMS_PROVIDER=msg91` + `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, or `twilio` + `TWILIO_*` | Messages are logged by the worker |
| Email alerts | `SES_FROM`, AWS credentials | Logged |
| Photo & document storage | `S3_BUCKET`, `S3_PRIVATE_BUCKET`, `MEDIA_BASE_URL` (CloudFront) | Local `uploads/`, `private-uploads/` |
| Virus scan on upload | `CLAMAV_HOST` | Skipped |
| Street-level address search | `MAPBOX_TOKEN` | Towns and localities only |
| Google sign-in | `GOOGLE_CLIENT_ID` (API) + `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (web) | Phone OTP only |
| Apple sign-in (mobile apps) | `APPLE_CLIENT_ID` | — |
| AI review summaries | `ANTHROPIC_API_KEY` (Claude Opus 5.5, nightly) | Plain summary from ratings |

Production also needs a 32+ character `JWT_SECRET`, `INTERNAL_API_KEY` shared by API and web, `TRUST_PROXY=1` behind a load balancer, `WEB_PUBLIC_URL`, and `NODE_ENV=production` (turns off the dev OTP).

## Decisions that differ from the spec's stack (spec 8.1)

- **Fastify instead of NestJS** — same TypeScript, modular routes, zod validation.
- **Search runs in PostgreSQL** (PostGIS radius + pg_trgm typo tolerance + a synonyms table) instead of OpenSearch. `listRestaurants` in `apps/api/src/lib/restaurants.ts` is the single place to swap in a search index.
- **Background jobs run in-process** with a Postgres advisory lock and a notification outbox table, instead of Redis + BullMQ. Set `WORKER=off` to run them elsewhere.
- **Field app exists twice**: the native app in `apps/mobile` (SQLite queue, spec 7.3) and an offline web version at `/field` for phones that can't install it.
- **Maps in the apps use Leaflet + OpenStreetMap in a WebView**, like the website, instead of the Google Maps SDK — no API key, works in Expo Go. Set `EXPO_PUBLIC_MAP_TILES` to a paid tile provider before launch.
- The API speaks camelCase JSON and whole rupees; money is stored in paise (spec 9).
