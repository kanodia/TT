import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';
import { api } from './api';
import { VARIANT } from './env';

type NotificationsModule = typeof import('expo-notifications');

const TOKEN_KEY = 'tt_push_token';

// Expo Go on Android has no push support and throws as soon as expo-notifications is imported,
// so the module is loaded lazily and only where it works (development and store builds).
const pushSupported = !(Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient);
let mod: NotificationsModule | null | undefined;
export function notifications(): NotificationsModule | null {
  if (mod === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = pushSupported ? (require('expo-notifications') as NotificationsModule) : null;
    // Show alerts that arrive while the app is open too.
    mod?.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
  }
  return mod;
}

/**
 * Asks for permission and sends this phone's Expo push token to the API (spec 8.1: FCM/APNs push).
 * Quietly does nothing where push can't work: simulators, Expo Go on Android, or before `eas init`.
 */
export async function registerForPush() {
  const N = notifications();
  try {
    if (!N || !Device.isDevice) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    // Android 13+ shows the permission prompt only once a channel exists.
    if (Platform.OS === 'android') await N.setNotificationChannelAsync('default', { name: 'Updates', importance: N.AndroidImportance.DEFAULT });
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const { data: token } = await N.getExpoPushTokenAsync({ projectId });
    await api('/v1/me/push-tokens', { method: 'PUT', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android', app: VARIANT } });
    Storage.setItemSync(TOKEN_KEY, token);
  } catch {
    /* push is a nice-to-have; never block the app on it */
  }
}

/** Forgets this phone's token locally and returns it so sign-out can tell the API. */
export async function unregisterPush() {
  const token = Storage.getItemSync(TOKEN_KEY);
  Storage.removeItemSync(TOKEN_KEY);
  return token;
}

/** Where a tapped notification should take the user, from its template and payload. */
export function notificationTarget(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const template = String(data.template ?? '');
  if (VARIANT === 'field') return template === 'capture_sent_back' ? '/field/queue' : '/field';
  if (VARIANT === 'partner') {
    const id = typeof data.restaurantId === 'string' ? data.restaurantId : null;
    if (!id) return '/partner';
    if (template === 'review_new' || template === 'review_digest') return `/partner/${id}/reviews`;
    if (template === 'hours_reminder') return `/partner/${id}/hours`;
    if (template === 'menu_reminder') return `/partner/${id}/menu`;
    return `/partner/${id}`;
  }
  return '/notifications';
}

/** Calls `onOpen` with the target route when the user taps a notification (including the one that launched the app). */
export function onNotificationTap(onOpen: (target: string) => void) {
  const N = notifications();
  if (!N) return () => {};
  const open = (data: Record<string, unknown> | undefined) => {
    const target = notificationTarget(data);
    if (target) onOpen(target);
  };
  N.getLastNotificationResponseAsync()
    .then((r) => {
      if (r) {
        open(r.notification.request.content.data);
        N.clearLastNotificationResponseAsync?.();
      }
    })
    .catch(() => {});
  const sub = N.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
  return () => sub.remove();
}
