# Mobile apps

One Expo (React Native) codebase builds two store apps (spec 8.1):

| App | `APP_VARIANT` | What it is |
|---|---|---|
| TwiggyTomato | `diner` (default) | Diner app: location, home feed, search and filters, map, restaurant pages, menus, reviews with photos, saved lists, notifications |
| TT Field | `field` | Field team: assigned leads, capture new places offline (GPS pin, photos, hours, owner consent), visit log, uploads when there's signal |

The partner portal and admin console stay on the website; the apps link out to them.

Screens live in `src/app` (Expo Router): `(diner)/…` for the diner app and `field/…` for the field app. Each build can only reach its own screens. Text, API types and formatting come from `packages/shared`, the same files the website uses — add every user-facing string there with a Hindi entry.

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
   npm run diner      # or: npm run field
   ```
4. Scan the QR code: Android with Expo Go, iPhone with the Camera app.

Sign in with the seed numbers (admin `9999999999`, field agent `7777777777`, owner `8888888888`, diners `9000000001`–`9000000006`); the code is shown on screen.

Push notifications don't work in Expo Go on Android; they need a build (below).

## Builds (EAS)

```bash
npx eas-cli@latest login            # projects tt-diner / tt-field under abhishekkanodia, ids in app.config.ts
npx eas-cli@latest build --profile diner-preview -p android   # installable APK for testers
npx eas-cli@latest build --profile field-preview -p android
```

`diner-production` / `field-production` are for the stores. Before the first store upload, decide the bundle id prefix (`APP_ID_PREFIX`, default `com.twiggytomato`) — it can't change afterwards — and set `EXPO_PUBLIC_MAP_TILES` to a paid tile provider.

## Checks

```bash
npx tsc --noEmit
npx expo lint
```
