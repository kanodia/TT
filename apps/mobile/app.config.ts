import type { ConfigContext, ExpoConfig } from 'expo/config';

// One codebase, two store apps (spec 8.1): the diner app and the field team's app.
// APP_VARIANT picks which one is built; screens read it from `extra.variant`.
const variant = process.env.APP_VARIANT === 'field' ? 'field' : 'diner';
// Company-based ids, not the brand (spec 11.6), so a rebrand doesn't change store identities.
// Decide the final prefix before the first store upload: ids can't change after publishing.
const ID_PREFIX = process.env.APP_ID_PREFIX ?? 'com.twiggytomato';
const BRAND = '#e23744';

const apps = {
  diner: { name: 'TwiggyTomato', slug: 'tt-diner', scheme: 'ttdiner', id: `${ID_PREFIX}.diner`, easProjectId: '945500d2-9f3a-4aac-928e-d161d9298144' },
  field: { name: 'TT Field', slug: 'tt-field', scheme: 'ttfield', id: `${ID_PREFIX}.field`, easProjectId: '9486489c-8827-4132-b738-74f92e16c942' },
} as const;
const app = apps[variant];
const why =
  variant === 'field'
    ? { location: 'Your location pins each place you capture and shows your assigned area.', camera: 'Take storefront, menu and food photos of places you visit.' }
    : { location: 'Your location is used to show restaurants near you. It is not stored.', camera: 'Take photos to add to your review.' };

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  owner: 'abhishekkanodia',
  name: app.name,
  slug: app.slug,
  scheme: app.scheme,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: app.id,
    supportsTablet: false,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: app.id,
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA'],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: BRAND, image: './assets/images/splash-icon.png', imageWidth: 76 }],
    'expo-sqlite',
    'expo-secure-store',
    'expo-localization',
    ['expo-notifications', { color: BRAND }],
    ['expo-location', { locationWhenInUsePermission: why.location }],
    ['expo-image-picker', { photosPermission: 'Choose photos to upload.', cameraPermission: why.camera }],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    variant,
    // Each app is its own Expo project; builds and push tokens need its id.
    eas: { projectId: app.easProjectId },
  },
});
