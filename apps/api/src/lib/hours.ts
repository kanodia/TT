export const DEFAULT_TZ = 'Asia/Kolkata';

export type Shift = { dayOfWeek: number; opensAt: string; closesAt: string };
/** A holiday or one-off change for one date (YYYY-MM-DD, city timezone). */
export type Special = { date: string; isClosed: boolean; opensAt: string | null; closesAt: string | null; note?: string | null };

export type OpenStatus =
  | { state: 'unknown' }
  | { state: 'temporarily_closed'; until: string }
  | { state: 'open'; closesAt: string; closesSoon: boolean; allDay: boolean }
  | { state: 'closed'; opensAt: string | null; opensInDays: number | null; note?: string };

type Window = { opensAt: string; closesAt: string };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Day of week (0 = Sunday) and minutes since midnight in the given timezone. */
export function localTime(now: Date, tz = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    day: WEEKDAYS.indexOf(get('weekday')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export function localDate(now: Date, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now); // YYYY-MM-DD
}

/** "HH:MM" wall-clock time in the given timezone. */
export function localHHMM(now: Date, tz = DEFAULT_TZ) {
  const { minutes } = localTime(now, tz);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const isOvernight = (s: Window) => toMinutes(s.closesAt) <= toMinutes(s.opensAt);
const isAllDay = (s: Window) => s.opensAt === s.closesAt;

/** The opening windows for one calendar date: a special entry replaces the weekly schedule. */
function windowsOn(date: string, day: number, shifts: Shift[], specials: Special[]): { windows: Window[]; special?: Special } {
  const special = specials.find((s) => s.date === date);
  if (special) {
    return {
      special,
      windows: special.isClosed || !special.opensAt || !special.closesAt ? [] : [{ opensAt: special.opensAt, closesAt: special.closesAt }],
    };
  }
  return { windows: shifts.filter((s) => s.dayOfWeek === day) };
}

/** Today's opening windows (for "Open now · 11 am – 3:30 pm" on the detail page). */
export function todayWindows(shifts: Shift[], specials: Special[] = [], now = new Date(), tz = DEFAULT_TZ) {
  const { day } = localTime(now, tz);
  const r = windowsOn(localDate(now, tz), day, shifts, specials);
  return { windows: r.windows.map((w) => ({ opensAt: w.opensAt, closesAt: w.closesAt })).sort((a, b) => toMinutes(a.opensAt) - toMinutes(b.opensAt)), note: r.special?.note ?? null, isSpecial: !!r.special };
}

export function openStatus(
  shifts: Shift[],
  now = new Date(),
  temporarilyClosedUntil?: Date | null,
  tz = DEFAULT_TZ,
  specials: Special[] = [],
): OpenStatus {
  if (temporarilyClosedUntil && temporarilyClosedUntil > now) {
    return { state: 'temporarily_closed', until: temporarilyClosedUntil.toISOString() };
  }
  if (shifts.length === 0 && specials.length === 0) return { state: 'unknown' };

  const { day, minutes } = localTime(now, tz);
  const today = localDate(now, tz);
  const on = (offset: number) => windowsOn(addDays(today, offset), (day + offset + 7) % 7, shifts, specials);

  const candidates: { s: Window; minutesLeft: number }[] = [];
  for (const s of on(0).windows) {
    const opens = toMinutes(s.opensAt);
    const closes = toMinutes(s.closesAt);
    if (isAllDay(s) || (isOvernight(s) && minutes >= opens)) candidates.push({ s, minutesLeft: 24 * 60 - minutes + closes });
    else if (minutes >= opens && minutes < closes) candidates.push({ s, minutesLeft: closes - minutes });
  }
  // Yesterday's shift that runs past midnight.
  for (const s of on(-1).windows) {
    if (isOvernight(s) && !isAllDay(s) && minutes < toMinutes(s.closesAt)) candidates.push({ s, minutesLeft: toMinutes(s.closesAt) - minutes });
  }
  if (candidates.length) {
    const { s, minutesLeft } = candidates.sort((a, b) => b.minutesLeft - a.minutesLeft)[0];
    return { state: 'open', closesAt: s.closesAt, closesSoon: !isAllDay(s) && minutesLeft <= 60, allDay: isAllDay(s) };
  }

  const todayInfo = on(0);
  const note = todayInfo.special?.isClosed ? (todayInfo.special.note ?? 'Closed today') : undefined;
  for (let offset = 0; offset < 7; offset++) {
    const next = on(offset)
      .windows.filter((s) => offset > 0 || toMinutes(s.opensAt) > minutes)
      .sort((a, b) => toMinutes(a.opensAt) - toMinutes(b.opensAt));
    if (next.length) return { state: 'closed', opensAt: next[0].opensAt, opensInDays: offset, ...(note ? { note } : {}) };
  }
  return { state: 'closed', opensAt: null, opensInDays: null, ...(note ? { note } : {}) };
}

export function isOpenLateOn(shifts: Shift[], day: number) {
  // "Open late" = open at or after 23:00 on that day.
  return shifts.some(
    (s) => s.dayOfWeek === day && (isOvernight(s) || isAllDay(s) || toMinutes(s.closesAt) >= 23 * 60),
  );
}

export function isOpen24hOn(shifts: Shift[], day: number) {
  return shifts.some((s) => s.dayOfWeek === day && isAllDay(s));
}
