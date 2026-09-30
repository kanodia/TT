# Deploying staging

Staging runs on managed services so it's quick and cheap to start. Everything is configured with environment variables, so moving to AWS later (spec 8.1) needs no code changes.

| Piece | Service | Rough cost |
|---|---|---|
| Database (PostgreSQL + PostGIS) | Neon | Free tier |
| Photos and private documents | Cloudflare R2 | Free tier (10 GB) |
| API + background worker | Render (Starter) | ~$7/month |
| Web app | Vercel (Hobby) | Free |

Staging is protected by a site-wide password, and sign-in uses on-screen codes (no SMS) until the DLT-registered SMS provider is ready. Only people who know the password can see or use it.

Do the steps in order — later ones need values from earlier ones. Keep the values in a password manager, not in chat or email.

## 1. Neon (database)

1. Sign up at neon.tech → **New project** → name `twiggytomato-staging`, Postgres 17, region **AWS Asia Pacific (Singapore)**.
2. **Connection details** → turn **Pooled connection off** → copy the connection string. It looks like `postgresql://…@ep-….ap-southeast-1.aws.neon.tech/neondb?sslmode=require`. This is `DATABASE_URL`.
3. Nothing else to do: the first deploy creates the tables and turns on PostGIS, pg_trgm and unaccent.

## 2. Cloudflare R2 (photos)

1. Cloudflare dashboard → **R2** → create two buckets: `tt-staging-media` (photos) and `tt-staging-private` (licences and ownership documents).
2. `tt-staging-media` → **Settings → Public access → R2.dev subdomain → Allow**. Copy the public URL (`https://pub-….r2.dev`). This is `MEDIA_BASE_URL`. Leave `tt-staging-private` private.
3. **R2 → Manage API tokens → Create token**, permission **Object Read & Write**, limited to both buckets. Copy:
   - Access key ID → `AWS_ACCESS_KEY_ID`
   - Secret access key → `AWS_SECRET_ACCESS_KEY`
   - The S3 endpoint (`https://<account-id>.r2.cloudflarestorage.com`) → `S3_ENDPOINT`

## 3. Render (API)

1. Sign up at render.com with GitHub and give it access to `kanodia/TT`.
2. **New → Blueprint** → pick `kanodia/TT`. Render reads `render.yaml` and creates `twiggytomato-api-staging`.
3. Fill in the values it asks for:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | from Neon |
   | `WEB_ORIGIN`, `WEB_PUBLIC_URL` | leave as `https://example.com` for now — fixed in step 5 |
   | `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `MEDIA_BASE_URL` | from R2 |
   | `S3_BUCKET` | `tt-staging-media` |
   | `S3_PRIVATE_BUCKET` | `tt-staging-private` |

   `JWT_SECRET`, `INTERNAL_API_KEY` and `DEV_OTP_KEY` are generated for you.
4. Deploy. When it's live, open `https://<your-api>.onrender.com/health` — it should say `{"ok":true}`.
5. Load the sample data once: service → **Shell** → run `npm run seed`. (Later, the field team replaces it with real places.)
6. From **Environment**, copy the generated `INTERNAL_API_KEY` and `DEV_OTP_KEY` for the next step.

## 4. Vercel (web)

1. Sign up at vercel.com with GitHub → **Add New → Project** → import `kanodia/TT`.
2. **Root Directory**: `apps/web` (framework Next.js is detected).
3. Environment variables:

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://<your-api>.onrender.com` |
   | `INTERNAL_API_KEY` | same as on Render |
   | `NEXT_PUBLIC_DEV_OTP_KEY` | same as Render's `DEV_OTP_KEY` |
   | `STAGING_PASSWORD` | a password you choose and share with the team |

4. Deploy and note the URL, e.g. `https://tt-staging.vercel.app`.

## 5. Connect them

1. Render → service → **Environment**: set `WEB_ORIGIN` and `WEB_PUBLIC_URL` to the Vercel URL → save (it redeploys).
2. Open the Vercel URL, enter the staging password (any username), sign in with a seed number (admin `9999999999`) — the code appears on screen.

## Checklist before real users (production)

- Remove `DEV_OTP_KEY` (Render) and `NEXT_PUBLIC_DEV_OTP_KEY` / `STAGING_PASSWORD` (Vercel).
- Add the SMS provider (`SMS_PROVIDER`, `MSG91_*`) once DLT templates are approved.
- Set `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`.
- Don't run the seed: production starts empty and the field team fills it.
- Final legal pages, brand name and domain.
