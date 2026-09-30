import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOpenLateOn, localTime, openStatus, todayWindows, type Shift } from './hours.js';

// 2026-09-30 is a Wednesday (day 3). IST = UTC+5:30.
const ist = (hhmm: string, date = '2026-09-30') => new Date(`${date}T${hhmm}:00+05:30`);
const everyDay = (opensAt: string, closesAt: string): Shift[] =>
  [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, opensAt, closesAt }));

test('localTime reads the day and minutes in IST', () => {
  assert.deepEqual(localTime(ist('23:45')), { day: 3, minutes: 23 * 60 + 45 });
});

test('open within a normal shift, closing soon in the last hour', () => {
  const s = openStatus(everyDay('11:00', '22:30'), ist('21:45'));
  assert.deepEqual(s, { state: 'open', closesAt: '22:30', closesSoon: true, allDay: false });
});

test('closed between split shifts shows the next opening today', () => {
  const shifts = [...everyDay('11:00', '15:30'), ...everyDay('19:00', '22:30')];
  assert.deepEqual(openStatus(shifts, ist('16:00')), { state: 'closed', opensAt: '19:00', opensInDays: 0 });
});

test('overnight shift is open after midnight on the next calendar day', () => {
  const shifts = everyDay('06:00', '02:00');
  assert.equal(openStatus(shifts, ist('01:30')).state, 'open');
  assert.deepEqual(openStatus(shifts, ist('03:00')), { state: 'closed', opensAt: '06:00', opensInDays: 0 });
});

test('24-hour places are always open', () => {
  const s = openStatus(everyDay('00:00', '00:00'), ist('04:10'));
  assert.equal(s.state, 'open');
  assert.equal(s.state === 'open' && s.allDay, true);
});

test('weekly closing day skips to the next open day', () => {
  const shifts = everyDay('08:00', '22:00').filter((s) => s.dayOfWeek !== 4); // closed Thursday
  assert.deepEqual(openStatus(shifts, ist('22:30')), { state: 'closed', opensAt: '08:00', opensInDays: 2 });
});

test('temporary closure and missing hours', () => {
  const until = new Date(ist('12:00').getTime() + 864e5);
  assert.equal(openStatus(everyDay('08:00', '22:00'), ist('12:00'), until).state, 'temporarily_closed');
  assert.deepEqual(openStatus([], ist('12:00')), { state: 'unknown' });
});

test('open late means open at 23:00 or later', () => {
  assert.equal(isOpenLateOn(everyDay('11:00', '23:30'), 3), true);
  assert.equal(isOpenLateOn(everyDay('11:00', '22:00'), 3), false);
  assert.equal(isOpenLateOn(everyDay('06:00', '02:00'), 3), true);
});

test('a holiday closure overrides the weekly schedule and carries its note', () => {
  const specials = [{ date: '2026-09-30', isClosed: true, opensAt: null, closesAt: null, note: 'Closed for Navratri' }];
  assert.deepEqual(openStatus(everyDay('08:00', '22:00'), ist('12:00'), null, undefined, specials), {
    state: 'closed',
    opensAt: '08:00',
    opensInDays: 1,
    note: 'Closed for Navratri',
  });
});

test('special hours replace the day with one shift', () => {
  const specials = [{ date: '2026-09-30', isClosed: false, opensAt: '17:00', closesAt: '23:30' }];
  assert.deepEqual(openStatus(everyDay('08:00', '14:00'), ist('12:00'), null, undefined, specials), {
    state: 'closed',
    opensAt: '17:00',
    opensInDays: 0,
  });
  assert.equal(openStatus(everyDay('08:00', '14:00'), ist('18:00'), null, undefined, specials).state, 'open');
});

test('closure on a future date is skipped when finding the next opening', () => {
  const specials = [{ date: '2026-10-01', isClosed: true, opensAt: null, closesAt: null }];
  assert.deepEqual(openStatus(everyDay('08:00', '22:00'), ist('22:30'), null, undefined, specials), {
    state: 'closed',
    opensAt: '08:00',
    opensInDays: 2,
  });
});

test('todayWindows reports special hours', () => {
  const specials = [{ date: '2026-09-30', isClosed: false, opensAt: '10:00', closesAt: '13:00', note: 'Half day' }];
  assert.deepEqual(todayWindows(everyDay('08:00', '22:00'), specials, ist('09:00')), {
    windows: [{ opensAt: '10:00', closesAt: '13:00' }],
    note: 'Half day',
    isSpecial: true,
  });
});
