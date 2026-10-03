import type { Lang, MessageKey, Vars } from './i18n';
import type { Named, OpenStatus, Shift } from './types';

export type { Lang };
type T = (key: MessageKey, vars?: Vars) => string;

export const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6].map((d) => `day.short.${d}` as MessageKey);
export const DAY_LONG_KEYS = [0, 1, 2, 3, 4, 5, 6].map((d) => `day.long.${d}` as MessageKey);
// English-only helpers kept for the admin console.
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Hindi name when the diner picked Hindi and we have one. */
export function nm(n: Named | null | undefined, lang: Lang) {
  if (!n) return '';
  return lang === 'hi' && n.nameHi ? n.nameHi : n.name;
}

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
export const priceBand = (band: number) => '₹'.repeat(Math.min(4, Math.max(1, band)));

export function distance(m: number | null | undefined) {
  if (m == null) return null;
  return m < 1000 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

/** "19:30" → "7:30 pm" */
export function time12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

export function openLabel(s: OpenStatus, t: T): { text: string; tone: 'good' | 'warn' | 'bad' | 'muted' } {
  switch (s.state) {
    case 'open':
      if (s.allDay) return { text: t('open.allDay'), tone: 'good' };
      return s.closesSoon ? { text: t('open.closesSoon', { time: time12(s.closesAt) }), tone: 'warn' } : { text: t('open.closesAt', { time: time12(s.closesAt) }), tone: 'good' };
    case 'closed': {
      const prefix = s.note ? `${s.note} · ` : '';
      if (!s.opensAt) return { text: prefix + t('open.closed'), tone: 'bad' };
      if (s.opensInDays === 1) return { text: prefix + t('open.opensTomorrow', { time: time12(s.opensAt) }), tone: 'bad' };
      if (s.opensInDays && s.opensInDays > 1) return { text: prefix + t('open.opensLater', { time: time12(s.opensAt) }), tone: 'bad' };
      return { text: prefix + t('open.opensAt', { time: time12(s.opensAt) }), tone: 'bad' };
    }
    case 'temporarily_closed':
      return { text: t('open.tempClosed', { date: shortDate(s.until) }), tone: 'bad' };
    default:
      return { text: t('open.unknown'), tone: 'muted' };
  }
}

/** Groups shifts by day for the hours table. */
export function hoursByDay(shifts: Shift[]) {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => shifts.filter((s) => s.dayOfWeek === d).sort((a, b) => a.opensAt.localeCompare(b.opensAt)));
}

export function shiftLabel(s: { opensAt: string; closesAt: string }, t?: T) {
  return s.opensAt === s.closesAt ? (t ? t('open.allDay') : 'Open 24 hours') : `${time12(s.opensAt)} – ${time12(s.closesAt)}`;
}

export function shortDate(iso: string | Date) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dayDate(isoDate: string, lang: Lang = 'en') {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function ago(iso: string | Date, t?: T) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!t) {
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 30 * 86400) return `${Math.floor(s / 86400)} d ago`;
    return shortDate(iso);
  }
  if (s < 60) return t('ago.now');
  if (s < 3600) return t('ago.min', { n: Math.floor(s / 60) });
  if (s < 86400) return t('ago.hour', { n: Math.floor(s / 3600) });
  if (s < 30 * 86400) return t('ago.day', { n: Math.floor(s / 86400) });
  return shortDate(iso);
}

export function ratingColor(r: number) {
  if (r >= 4) return '#267e3e';
  if (r >= 3) return '#db7c38';
  if (r > 0) return '#cb202d';
  return '#9ca3af';
}

export const DIET_COLOR: Record<string, string> = { veg: '#267e3e', non_veg: '#b91c1c', egg: '#d97706', vegan: '#15803d' };
export const DIET_LABEL: Record<string, string> = { veg: 'Veg', non_veg: 'Non-veg', egg: 'Egg', vegan: 'Vegan' };

export const STATUS_TONE: Record<string, string> = {
  live: 'bg-green-100 text-green-800',
  approved: 'bg-green-100 text-green-800',
  active: 'bg-green-100 text-green-800',
  verified: 'bg-green-100 text-green-800',
  resolved: 'bg-green-100 text-green-800',
  published: 'bg-green-100 text-green-800',
  pending: 'bg-amber-100 text-amber-800',
  submitted: 'bg-amber-100 text-amber-800',
  assigned: 'bg-blue-100 text-blue-800',
  open: 'bg-amber-100 text-amber-800',
  new: 'bg-blue-100 text-blue-800',
  draft: 'bg-gray-100 text-gray-700',
  paused: 'bg-gray-100 text-gray-700',
  dismissed: 'bg-gray-100 text-gray-700',
  ended: 'bg-gray-100 text-gray-700',
  duplicate: 'bg-gray-100 text-gray-700',
  hidden: 'bg-gray-100 text-gray-700',
  sent_back: 'bg-orange-100 text-orange-800',
  rejected: 'bg-red-100 text-red-800',
  removed: 'bg-red-100 text-red-800',
  suspended: 'bg-red-100 text-red-800',
  closed: 'bg-red-100 text-red-800',
};

export const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Stable placeholder colour + emoji so photo-less listings still look distinct. */
export function placeholderFor(seed: string, cuisineSlug?: string) {
  const EMOJI: Record<string, string> = {
    'north-indian': '🍛', rajasthani: '🫓', thali: '🍱', 'south-indian': '🥞', chinese: '🥡', 'fast-food': '🍔',
    'street-food': '🥙', sweets: '🍬', bakery: '🧁', 'chai-snacks': '☕', pizza: '🍕', 'ice-cream': '🍨', beverages: '🥤',
  };
  const hues = [8, 24, 38, 150, 200, 280, 330];
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = hues[h % hues.length];
  return {
    hue,
    background: `linear-gradient(135deg, hsl(${hue} 70% 92%), hsl(${(hue + 25) % 360} 65% 82%))`,
    emoji: (cuisineSlug && EMOJI[cuisineSlug]) || '🍽️',
  };
}

export const restaurantHref = (r: { slug: string; citySlug?: string | null }) => (r.citySlug ? `/r/${r.citySlug}/${r.slug}` : `/r/${r.slug}`);
