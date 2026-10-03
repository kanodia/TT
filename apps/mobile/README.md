# Mobile apps

One Expo (React Native) codebase builds three store apps:

| App | `APP_VARIANT` | What it is |
|---|---|---|
| TwiggyTomato | `diner` (default) | Diner app: location, home feed, search and filters, map, restaurant pages, menus, reviews with photos, saved lists, notifications |
| TT Field | `field` | Field team: assigned leads, capture new places offline (GPS pin, photos, hours, owner consent), visit log, uploads when there's signal |
| TwiggyTomato Partner | `partner` | Restaurant owners and staff: overview and stats, reply to reviews, menu (sold-out switch, dishes), photos from the camera, hours, temporarily closed, offers, alerts |

The admin console stays on the website. The partner app opens the partner website for document-heavy tasks (new listing, claims, team, full profile, menu import); the website's `/partner` can also be installed to the home screen.

Screens live in `src/app` (Expo Router): `(diner)/…` for the diner app, `field/…` and `partner/…` for the other two. Each build can only reach its own screens. Text, API types and formatting come from `packages/shared`, the same files the website uses — add every user-facing string there with a Hindi entry.

## Try it on your phone (Expo Go)

1. Install **Expo Go** from the Play Store / App Store.
2. Create `apps/mobile/.env.local` (not committed):
   ```
   EXPO_PUBLIC_API_URL=https://twiggytomato-api-staging.onrender.com
   EXPO_PUBLIC_DEV_OTP_KEY=<the API's DEV_OTP_KEY from Render>
   ```
3. On a Mac on the **same Wi-Fi** as the phone:
   ```bash
   cd apps/mobile
   npm install
   npm run diner      # or: npm run field / npm run partner
   ```
4. Scan the QR code: Android with Expo Go, iPhone with the Camera app.

Sign in with the seed numbers (admin `9999999999`, field agent `7777777777`, owner `8888888888`, diners `9000000001`–`9000000006`); the code is shown on screen.

Push notifications don't work in Expo Go on Android; they need a build (below).

## Builds (EAS)

```bash
npx eas-cli@latest login            # projects tt-diner / tt-field / tt-partner under abhishekkanodia, ids in app.config.ts
npx eas-cli@latest build --profile diner-preview -p android   # installable APK for testers
npx eas-cli@latest build --profile field-preview -p android
npx eas-cli@latest build --profile partner-preview -p android
```

`*-production` profiles are for the stores. Before the first store upload, decide the bundle id prefix (`APP_ID_PREFIX`, default `com.twiggytomato`) — it can't change afterwards — and set `EXPO_PUBLIC_MAP_TILES` to a paid tile provider.

## Checks

```bash
npx tsc --noEmit
npx expo lint
```
