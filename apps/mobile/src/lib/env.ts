import Constants from 'expo-constants';

/** Which of the two apps this build is (app.config.ts → extra.variant). */
const v = Constants.expoConfig?.extra?.variant;
export const VARIANT: 'diner' | 'field' | 'partner' = v === 'field' || v === 'partner' ? v : 'diner';
export const IS_FIELD = VARIANT === 'field';
export const IS_PARTNER = VARIANT === 'partner';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://twiggytomato-api-staging.onrender.com';
// Staging only: lets the team use on-screen sign-in codes before SMS is live (see the API's DEV_OTP_KEY).
export const DEV_OTP_KEY = process.env.EXPO_PUBLIC_DEV_OTP_KEY;
/** Website for share links and pages the app hands off to (partner portal, legal). */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://twiggytomato-staging.vercel.app';
