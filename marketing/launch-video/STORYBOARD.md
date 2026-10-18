# TwiggyTomato diner launch: storyboard

**Message:** Neem Ka Thana, find where to eat in under 2 minutes, in Hindi or English.
**Format:** 1080×1080, 30 fps, ~40 s (1200 frames). Remotion 4.0.536. Banner = still from the same project.
**Audience:** diners in Neem Ka Thana and nearby towns (feeds on Instagram, WhatsApp, X, LinkedIn).

## Look

- **Palette:** brand red `#e23744`, tomato-leaf green `#7cc242`, "good" green `#267e3e`, warm near-black `#1a0f0f` background with soft red/green glows, cream `#fff6ec` text.
- **Type:** Baloo 2 (Latin + Devanagari in one family, rounded and friendly). Headlines ≥ 84 px, supporting text ≥ 44 px, 80 px side safe area.
- **Cards:** frosted glass (translucent fill, 1 px light border, red glow behind).
- **Mascot "Tamatar":** the app icon (`apps/web/public/icon.svg`: red tile, white tomato, green leaf) rigged as a React component with `blink`, `squash`, `smile`, `leafWiggle` and `lookX` controls. Eyes and smile sit on the white tomato.
- **Kinetic type:** words spring in one by one; Hindi and English lines are paired.
- **Accuracy:** every UI string on screen comes from `packages/shared/src/i18n/diner.ts` (EN + HI), and the chips, filters and card fields are real features.

## Scenes

| # | Time | Scene | On screen |
|---|------|-------|-----------|
| 1 | 0–4 s | **Hook** | Tamatar drops in with a squash-bounce, blinks and looks around. Kinetic: **"भूख लगी है?"** then **"Hungry in Neem Ka Thana?"** |
| 2 | 4–9 s | **The questions** | Glass question bubbles pop around a confused Tamatar: *Open now? · How much? · Any good? · How far? · Pure veg?* (the spec's core decision questions). They pile up and Tamatar squashes under them. |
| 3 | 9–13 s | **Reveal** | The bubbles are swept away and Tamatar springs up into the app-icon tile, which forms the **TwiggyTomato** wordmark. Line: **"Where to eat, decided in 2 minutes."** |
| 4 | 13–20 s | **Discover** | Glass phone card with the home feed: "What are you in the mood for?" Chips **Open now, Pure veg, Rating 4.0+, Under ₹300** light up one by one as Tamatar taps them, and the result count ticks down ("28 places to eat near you" → 9). |
| 5 | 20–27 s | **The answer** | One restaurant card zooms forward. Each fact animates in with a check: ⭐ 4.3 · ₹250 for two · Open now · 6 min walk · ✔ Verified by owner · **Must try: Dal Baati Churma**. Buttons **Directions** and **Call** pulse. |
| 6 | 27–32 s | **Your language** | An EN ⇄ हिंदी toggle flips the same card: "Open now" → "अभी खुला", "Pure veg" → "शुद्ध शाकाहारी", "Directions" → "रास्ता", "Must try" → "ज़रूर चखें". Tamatar winks. |
| 7 | 32–36 s | **Towns** | Minimal map: Neem Ka Thana pin glows, then Patan, Khetri, Shrimadhopur and Kotputli light up as dots ("and nearby towns"). |
| 8 | 36–40 s | **End card** | Tamatar and the logo lockup. **"आज क्या खाने का मन है?"** plus the CTA line (TBD). Small footer: *"Own a restaurant, dhaba or sweet shop? List it free."* |

**Banner still:** the end-card layout at 1500×500 (X header) with Tamatar on the left.

## Decisions (2026-10-17)

1. **CTA:** "Coming soon · Neem Ka Thana", no URL (staging is password-gated, apps not in stores yet).
2. **Restaurant on screen:** invented "Tamatar Rasoi", tagged "Sample listing". Swap for a real partner who agrees to be featured.
3. **Audio:** silent; social feeds autoplay muted.
4. **Brand:** "TwiggyTomato".

## Commands

- `npm run studio`: live preview and editing
- `npm run render`: `out/twiggytomato-launch.mp4`
- `npm run banner`: `out/banner.png` (1500×500)
