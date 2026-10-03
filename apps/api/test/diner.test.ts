import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { prisma } from '../src/lib/db.js';
import { notify } from '../src/lib/notify.js';
import { NKT, call, closeApp, freshPhone, login } from './helpers.js';

after(async () => {
  await closeApp();
  await prisma.$disconnect();
});

const q = (params: Record<string, string | number>) => new URLSearchParams({ lat: String(NKT.lat), lng: String(NKT.lng), ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) }).toString();

describe('auth', () => {
  test('OTP sign-in returns an access + refresh pair, and refresh rotates', async () => {
    const phone = freshPhone();
    const req = await call('POST', '/v1/auth/otp/request', { body: { phone } });
    assert.equal(req.status, 200);
    assert.match(req.body.devCode, /^\d{6}$/);
    const v = await call('POST', '/v1/auth/otp/verify', { body: { phone, code: req.body.devCode } });
    assert.equal(v.status, 200);
    assert.ok(v.body.accessToken && v.body.refreshToken);
    assert.equal((await call('GET', '/v1/me', { token: v.body.accessToken })).status, 200);

    const r1 = await call('POST', '/v1/auth/refresh', { body: { refreshToken: v.body.refreshToken } });
    assert.equal(r1.status, 200);
    assert.notEqual(r1.body.refreshToken, v.body.refreshToken);
    // Re-using the rotated token is treated as theft: it fails and revokes the family.
    assert.equal((await call('POST', '/v1/auth/refresh', { body: { refreshToken: v.body.refreshToken } })).status, 401);
    assert.equal((await call('POST', '/v1/auth/refresh', { body: { refreshToken: r1.body.refreshToken } })).status, 401);
  });

  test('logout revokes the refresh token', async () => {
    const t = await login(freshPhone());
    assert.equal((await call('POST', '/v1/auth/logout', { body: { refreshToken: t.refreshToken } })).status, 200);
    assert.equal((await call('POST', '/v1/auth/refresh', { body: { refreshToken: t.refreshToken } })).status, 401);
  });

  test('on staging, dev sign-in needs the DEV_OTP_KEY header', async () => {
    process.env.DEV_OTP_KEY = 'staging-secret';
    try {
      const phone = freshPhone();
      const open = await call('POST', '/v1/auth/otp/request', { body: { phone } });
      assert.equal(open.body.devCode, undefined, 'no code leaked without the key');
      assert.equal((await call('POST', '/v1/auth/otp/verify', { body: { phone, code: '123456' } })).status, 400);
      const headers = { 'x-dev-otp-key': 'staging-secret' };
      const keyed = await call('POST', '/v1/auth/otp/request', { body: { phone }, headers });
      assert.match(keyed.body.devCode, /^\d{6}$/);
      assert.equal((await call('POST', '/v1/auth/otp/verify', { body: { phone, code: '123456' }, headers })).status, 200);
    } finally {
      delete process.env.DEV_OTP_KEY;
    }
  });

  test('wrong OTP is rejected', async () => {
    assert.equal((await call('POST', '/v1/auth/otp/verify', { body: { phone: freshPhone(), code: '000000' } })).status, 400);
  });
});

describe('listing and search', () => {
  test('radius search returns rupee costs, distances and an opaque cursor', async () => {
    const r = await call('GET', `/v1/restaurants?${q({ radius_km: 25, limit: 3, sort: 'distance' })}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.length, 3);
    const d = r.body.data.map((c: { distanceM: number }) => c.distanceM);
    assert.deepEqual(d, [...d].sort((a, b) => a - b));
    assert.equal(r.body.data[0].costForTwo % 1, 0);
    assert.ok(r.body.nextCursor);
    const page2 = await call('GET', `/v1/restaurants?${q({ radius_km: 25, limit: 3, sort: 'distance', cursor: r.body.nextCursor })}`);
    assert.notEqual(page2.body.data[0].id, r.body.data[0].id);
  });

  test('radius excludes towns outside it', async () => {
    const near = await call('GET', `/v1/restaurants?${q({ radius_km: 3, count_only: 1 })}`);
    const far = await call('GET', `/v1/restaurants?${q({ radius_km: 100, count_only: 1 })}`);
    assert.ok(near.body.total < far.body.total);
  });

  test('typos and synonyms still find dishes', async () => {
    const paneer = await call('GET', `/v1/restaurants?${q({ q: 'panner' })}`);
    assert.ok(paneer.body.total >= 1, 'panner → paneer');
    const biryani = await call('GET', `/v1/restaurants?${q({ q: 'biriyani' })}`);
    assert.ok(biryani.body.total >= 1, 'biriyani → biryani');
  });

  test('attributes: OR within a group, AND across groups', async () => {
    const or = await call('GET', `/v1/restaurants?${q({ attributes: 'pure_veg,jain', count_only: 1 })}`);
    const vegOnly = await call('GET', `/v1/restaurants?${q({ attributes: 'pure_veg', count_only: 1 })}`);
    const and = await call('GET', `/v1/restaurants?${q({ attributes: 'pure_veg,breakfast', count_only: 1 })}`);
    assert.ok(or.body.total >= vegOnly.body.total);
    assert.ok(and.body.total <= vegOnly.body.total);
  });

  test('cost filter is in rupees', async () => {
    const r = await call('GET', `/v1/restaurants?${q({ cost_max: 200, radius_km: 100 })}`);
    assert.ok(r.body.data.length > 0);
    for (const c of r.body.data) assert.ok(c.costForTwo <= 200);
  });

  test('type-ahead groups restaurants, cuisines and dishes; empty box returns trending', async () => {
    const r = await call('GET', `/v1/search?q=dosa&lat=${NKT.lat}&lng=${NKT.lng}`);
    assert.ok(r.body.dishes.some((d: { name: string }) => /dosa/i.test(d.name)));
    const empty = await call('GET', '/v1/search?q=');
    assert.ok(Array.isArray(empty.body.trending));
  });

  test('detail page carries highlights, holiday hours and rupee menu with variants', async () => {
    const d = await call('GET', `/v1/restaurants/cafe-aroma-4?lat=${NKT.lat}&lng=${NKT.lng}`);
    assert.equal(d.status, 200);
    assert.ok(d.body.highlights.greatFor.includes('Date night'));
    assert.equal(d.body.specialHours[0].note, 'Closed for Dussehra');
    assert.ok(d.body.travel.minutes > 0);
    const menu = await call('GET', '/v1/restaurants/highway-king-dhaba-1/menu');
    const withVariants = menu.body.sections.flatMap((s: { items: { variants: unknown[] }[] }) => s.items).find((i: { variants: unknown[] }) => i.variants.length);
    assert.ok(withVariants, 'some dish has Half/Full variants');
  });
});

describe('reviews', () => {
  test('publishes a review, recalculates rating and enforces the 30-day cooldown', async () => {
    const t = await login(freshPhone(), 'Review Tester');
    const before = (await call('GET', '/v1/restaurants/madras-dosa-corner-7')).body;
    const body = { rating: 5, text: 'Crisp dosa, great chutneys and very quick service on a busy morning.', foodRating: 5 };
    const r = await call('POST', `/v1/restaurants/${before.id}/reviews`, { token: t.accessToken, body });
    assert.equal(r.status, 201);
    assert.equal(r.body.status, 'published');
    const afterDetail = (await call('GET', '/v1/restaurants/madras-dosa-corner-7')).body;
    assert.equal(afterDetail.reviewCount, before.reviewCount + 1);
    const again = await call('POST', `/v1/restaurants/${before.id}/reviews`, { token: t.accessToken, body });
    assert.equal(again.status, 409);
  });

  test('profanity and links hold a review for moderation instead of publishing', async () => {
    const t = await login(freshPhone());
    const id = (await call('GET', '/v1/restaurants/chai-adda-3')).body.id;
    const r = await call('POST', `/v1/restaurants/${id}/reviews`, {
      token: t.accessToken,
      body: { rating: 1, text: 'Total bakwas, visit www.example.com for the real deal instead.' },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.status, 'pending');
    assert.ok(r.body.flagReasons.includes('link'));
  });

  test('the same device reviewing from a second account is flagged', async () => {
    const id = (await call('GET', '/v1/restaurants/kwality-ice-cream-parlour-8')).body.id;
    const headers = { 'x-device-id': 'device-abcdef123' };
    const text = 'Kulfi falooda was rich and cold, perfect after a hot day in the market.';
    const a = await login(freshPhone());
    const b = await login(freshPhone());
    assert.equal((await call('POST', `/v1/restaurants/${id}/reviews`, { token: a.accessToken, headers, body: { rating: 4, text } })).body.status, 'published');
    const second = await call('POST', `/v1/restaurants/${id}/reviews`, { token: b.accessToken, headers, body: { rating: 4, text } });
    assert.equal(second.body.status, 'pending');
    assert.ok(second.body.flagReasons.includes('shared_device'));
  });

  test('reviews can be filtered by keyword and carry reviewer levels', async () => {
    const id = (await call('GET', '/v1/restaurants/shree-balaji-bhojanalaya-0')).body.id;
    const r = await call('GET', `/v1/restaurants/${id}/reviews?q=fresh`);
    assert.equal(r.status, 200);
    for (const rv of r.body.data) assert.match(rv.text, /fresh/i);
    if (r.body.data[0]) assert.ok(r.body.data[0].user.level >= 1);
  });
});

describe('lists and privacy', () => {
  test('heart saves to "Want to go"; custom lists can be shared publicly', async () => {
    const t = await login(freshPhone());
    const id = (await call('GET', '/v1/restaurants/cafe-aroma-4')).body.id;
    assert.equal((await call('PUT', `/v1/me/saved/${id}`, { token: t.accessToken })).status, 200);
    const ids = await call('GET', '/v1/me/saved/ids', { token: t.accessToken });
    assert.deepEqual(ids.body.data, [id]);
    const lists = await call('GET', '/v1/me/lists', { token: t.accessToken });
    assert.deepEqual(lists.body.data.map((l: { kind: string }) => l.kind).sort(), ['favourites', 'want_to_go']);

    const custom = await call('POST', '/v1/me/lists', { token: t.accessToken, body: { name: 'Date spots', isPublic: true } });
    await call('POST', `/v1/me/lists/${custom.body.id}/items`, { token: t.accessToken, body: { restaurantId: id } });
    const shared = await call('GET', `/v1/lists/${custom.body.shareSlug}`);
    assert.equal(shared.status, 200);
    assert.equal(shared.body.items[0].id, id);
  });

  test('data export and account deletion (DPDP)', async () => {
    const t = await login(freshPhone(), 'Leaving Soon');
    const exp = await call('GET', '/v1/me/export', { token: t.accessToken });
    assert.equal(exp.body.profile.name, 'Leaving Soon');
    const del = await call('DELETE', '/v1/me', { token: t.accessToken });
    assert.equal(del.status, 200);
    assert.equal((await call('POST', '/v1/auth/refresh', { body: { refreshToken: t.refreshToken } })).status, 401);
  });

  test('saved addresses', async () => {
    const t = await login(freshPhone());
    const a = await call('POST', '/v1/me/addresses', { token: t.accessToken, body: { label: 'home', addressText: 'Near Clock Tower', lat: 27.73, lng: 75.78, isDefault: true } });
    assert.equal(a.status, 201);
    const list = await call('GET', '/v1/me/addresses', { token: t.accessToken });
    assert.equal(list.body.data[0].label, 'home');
  });

  test('events drop precise coordinates', async () => {
    const id = (await call('GET', '/v1/restaurants/cafe-aroma-4')).body.id;
    const r = await call('POST', '/v1/events', { body: { events: [{ name: 'card_tap', restaurantId: id, props: { lat: 27.1, lng: 75.2, position: 3 } }] } });
    assert.equal(r.body.accepted, 1);
    const e = await prisma.event.findFirst({ where: { name: 'card_tap', restaurantId: id }, orderBy: { createdAt: 'desc' } });
    assert.deepEqual(e?.props, { position: 3 });
  });
});

describe('push notifications', () => {
  test('a registered phone gets a push copy of in-app notices until it signs out', async () => {
    const me = await login(freshPhone(), 'Push Tester');
    const token = `ExponentPushToken[test-${Date.now()}]`;
    const bad = await call('PUT', '/v1/me/push-tokens', { token: me.accessToken, body: { token: 'nope', platform: 'android', app: 'diner' } });
    assert.equal(bad.status, 400);
    const ok = await call('PUT', '/v1/me/push-tokens', { token: me.accessToken, body: { token, platform: 'android', app: 'diner' } });
    assert.equal(ok.status, 200);

    await notify({ userId: me.user.id, channel: 'in_app', template: 'review_published', payload: { restaurant: 'Test Dhaba' } });
    const push = await prisma.notification.findFirst({ where: { userId: me.user.id, channel: 'push' } });
    assert.equal(push?.template, 'review_published');
    assert.equal(push?.status, 'pending');
    // Push rows never show in the in-app list.
    const list = await call('GET', '/v1/me/notifications', { token: me.accessToken });
    assert.equal(list.body.data.length, 1);

    // Turning push off in preferences stops new push copies.
    await prisma.user.update({ where: { id: me.user.id }, data: { notificationPrefs: { push: false } } });
    await notify({ userId: me.user.id, channel: 'in_app', template: 'review_published', payload: { restaurant: 'Test Dhaba' } });
    assert.equal(await prisma.notification.count({ where: { userId: me.user.id, channel: 'push' } }), 1);

    await call('POST', '/v1/auth/logout', { body: { refreshToken: me.refreshToken, pushToken: token } });
    assert.equal(await prisma.pushToken.count({ where: { token } }), 0);
    await prisma.notification.deleteMany({ where: { userId: me.user.id } });
  });
});

describe('rate limits', () => {
  test('anonymous callers get a 429 with a readable error once over the limit', async () => {
    // Uses the OTP route's own tighter limit (10/hour per IP) rather than the global one.
    let last = { status: 0, body: null as { error: { code: string; message: string } } | null };
    for (let i = 0; i < 12; i++) last = await call('POST', '/v1/auth/otp/request', { body: { phone: freshPhone() } });
    assert.equal(last.status, 429);
    assert.equal(last.body!.error.code, 'rate_limited');
    assert.match(last.body!.error.message, /Try again/);
  });
});
