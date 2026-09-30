# TwiggyTomato — web

Next.js 16 app serving all four surfaces from one codebase. Every screen talks to `apps/api` over REST.

| Area | Path | Who |
|---|---|---|
| Diner | `/`, `/restaurants`, `/r/[slug]`, `/saved`, `/account` | everyone (sign-in for save/review/report) |
| Partner | `/partner`, `/partner/new`, `/partner/claim`, `/partner/[id]/…` | restaurant owners, managers, staff (admins can open any listing) |
| Field | `/field`, `/field/capture`, `/field/submissions` | `field_agent`, `field_supervisor`, `admin` |
| Admin | `/admin/…` | `admin`; supervisors see captures, leads and overview |

## Run

```bash
npm install
npm run dev          # http://localhost:3000, expects the API on :4000
```

Set `NEXT_PUBLIC_API_URL` if the API is elsewhere.

## Notes

- **Brand is data, not code** (spec 11.6): the name, colours, logo and taglines come from `/v1/config` (Admin → Settings). The page title, manifest and `--brand` CSS colour are all derived from it.
- **Field app works offline**: captures, including compressed photos, are queued in IndexedDB (`src/lib/fieldQueue.ts`) and uploaded when the phone is online. Uploads are idempotent via `clientUuid`. The production build registers `public/sw.js` to cache the `/field` shell.
- **Hindi**: the हिं toggle switches names of restaurants, cuisines, localities and attributes to their Hindi versions where they exist.
- Photos are served by the API host, so they use plain `<img>` (the `next/image` optimiser refuses local IPs in Next 16).
- Read `node_modules/next/dist/docs/` before changing framework-level code — this Next version has breaking changes (async `params`, `proxy` instead of `middleware`).
