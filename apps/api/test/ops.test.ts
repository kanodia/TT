import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { prisma } from '../src/lib/db.js';
import { ADMIN, AGENT, NKT, PARTNER, call, closeApp, freshPhone, jpegDataUrl, login } from './helpers.js';

after(async () => {
  await closeApp();
  await prisma.$disconnect();
});

const nkt = () => prisma.city.findUniqueOrThrow({ where: { slug: 'neem-ka-thana' } });

describe('partner portal', () => {
  test('create → special hours → submit needs a storefront photo → admin approves → partner notified', async () => {
    const owner = await login(freshPhone(), 'New Owner');
    const city = await nkt();
    const created = await call('POST', '/v1/partner/restaurants', {
      token: owner.accessToken,
      body: { name: 'Test Thali House', cityId: city.id, addressLine: 'Station Road', lat: 27.739, lng: 75.774, costForTwo: 350, cuisineSlugs: ['thali'], knownFor: ['Thali'] },
    });
    assert.equal(created.status, 201);
    const id = created.body.id;
    const base = `/v1/partner/restaurants/${id}`;
    const profile = await call('GET', base, { token: owner.accessToken });
    assert.equal(profile.body.costForTwo, 350);

    await call('PUT', `${base}/hours`, { token: owner.accessToken, body: { shifts: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: '10:00', closesAt: '22:00' })) } });
    const future = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const sh = await call('PUT', `${base}/special-hours`, { token: owner.accessToken, body: { days: [{ date: future, isClosed: true, note: 'Family wedding' }] } });
    assert.equal(sh.status, 200);

    const noPhoto = await call('POST', `${base}/submit`, { token: owner.accessToken, body: { documents: ['/private/x.pdf'] } });
    assert.equal(noPhoto.status, 400);
    assert.match(noPhoto.body.error.message, /storefront/i);

    await call('POST', `${base}/photos`, { token: owner.accessToken, body: { url: '/uploads/front-md.webp', category: 'exterior' } });
    assert.equal((await call('POST', `${base}/submit`, { token: owner.accessToken, body: { documents: ['/private/x.pdf'] } })).status, 200);

    const admin = await login(ADMIN);
    const queue = await call('GET', '/v1/admin/verifications', { token: admin.accessToken });
    const request = queue.body.data.find((v: { restaurantId: string }) => v.restaurantId === id);
    assert.ok(request);
    assert.equal((await call('POST', `/v1/admin/verifications/${request.id}/approve`, { token: admin.accessToken, body: {} })).status, 200);
    const live = await call('GET', `/v1/restaurants/${id}`);
    assert.equal(live.status, 200);
    const inbox = await call('GET', '/v1/me/notifications', { token: owner.accessToken });
    assert.ok(inbox.body.data.some((n: { template: string }) => n.template === 'listing_approved'));
  });

  test('live name change needs approval; other fields apply at once', async () => {
    const p = await login(PARTNER);
    const mine = (await call('GET', '/v1/partner/restaurants', { token: p.accessToken })).body.data.find((r: { status: string }) => r.status === 'live');
    const res = await call('PATCH', `/v1/partner/restaurants/${mine.id}`, { token: p.accessToken, body: { name: 'Renamed Place', description: 'Updated description' } });
    assert.deepEqual(res.body.pendingCoreChange, { name: 'Renamed Place' });
    const after = await call('GET', `/v1/partner/restaurants/${mine.id}`, { token: p.accessToken });
    assert.equal(after.body.name, mine.name);
    assert.equal(after.body.description, 'Updated description');
  });

  test('CSV menu import handles quoted commas, variants and allergens', async () => {
    const p = await login(PARTNER);
    const mine = (await call('GET', '/v1/partner/restaurants', { token: p.accessToken })).body.data[0];
    const csv = 'section,name,price,diet,description,variants,allergens,tags\nImported,"Paneer, Butter Masala",240,veg,"Rich, creamy gravy",Half:150|Full:240,milk|nuts,bestseller\nImported,Plain Roti,10\n';
    const r = await call('POST', `/v1/partner/restaurants/${mine.id}/menu/import`, { token: p.accessToken, body: { csv } });
    assert.deepEqual(r.body, { created: 2, errors: [] });
    const menu = await call('GET', `/v1/partner/restaurants/${mine.id}/menu`, { token: p.accessToken });
    const item = menu.body.sections.flatMap((s: { items: { name: string }[] }) => s.items).find((i: { name: string }) => i.name === 'Paneer, Butter Masala');
    assert.equal(item.price, 240);
    assert.deepEqual(item.variants.map((v: { name: string; price: number }) => [v.name, v.price]), [['Half', 150], ['Full', 240]]);
    assert.deepEqual(item.allergens, ['milk', 'nuts']);
  });

  test('staff cannot manage offers; offers keep flat values in rupees', async () => {
    const p = await login(PARTNER);
    const mine = (await call('GET', '/v1/partner/restaurants', { token: p.accessToken })).body.data[0];
    const staffPhone = freshPhone();
    assert.equal((await call('POST', `/v1/partner/restaurants/${mine.id}/members`, { token: p.accessToken, body: { phone: staffPhone, role: 'staff' } })).status, 201);
    const staff = await login(staffPhone);
    assert.equal((await call('GET', `/v1/partner/restaurants/${mine.id}/offers`, { token: staff.accessToken })).status, 403);
    const o = await call('POST', `/v1/partner/restaurants/${mine.id}/offers`, {
      token: p.accessToken,
      body: { title: '₹50 off above ₹300', discountType: 'flat', value: 50, validFromTime: '15:00', validToTime: '18:00' },
    });
    assert.equal(o.body.value, 50);
    const stored = await prisma.offer.findUniqueOrThrow({ where: { id: o.body.id } });
    assert.equal(stored.value, 5000);
  });

  test('analytics include search appearances and a rating trend', async () => {
    const p = await login(PARTNER);
    const mine = (await call('GET', '/v1/partner/restaurants', { token: p.accessToken })).body.data[0];
    await call('GET', `/v1/restaurants?lat=${NKT.lat}&lng=${NKT.lng}&radius_km=50&limit=50`);
    const a = await call('GET', `/v1/partner/restaurants/${mine.id}/analytics?days=30`, { token: p.accessToken });
    assert.equal(a.status, 200);
    assert.equal(a.body.series.length, 30);
    assert.ok('searchImpressions' in a.body.totals);
    assert.ok(Array.isArray(a.body.ratingTrend));
  });
});

describe('field operations', () => {
  test('capture syncs idempotently, flags nearby duplicates, and approval publishes a listing', async () => {
    const agent = await login(AGENT);
    const city = await nkt();
    const clientUuid = randomUUID();
    const payload = {
      name: 'Gupta Mishthan Bhandar Branch',
      cityId: city.id,
      addressLine: 'Main Bazaar',
      lat: 27.7371,
      lng: 75.7808,
      costForTwo: 120,
      ownerConsent: true,
      wantsToManage: true,
      ownerPhone: '9811100999',
      photos: [{ dataUrl: await jpegDataUrl(), category: 'exterior', exif: { lat: 27.7371, lng: 75.7808 } }],
    };
    const near = await call('GET', `/v1/field/places/nearby?lat=${payload.lat}&lng=${payload.lng}&name=${encodeURIComponent('Gupta Mishthan')}`, { token: agent.accessToken });
    assert.ok(near.body.restaurants.some((r: { likelyDuplicate: boolean }) => r.likelyDuplicate), 'similar name within 50 m');

    const item = { clientUuid, capturedAt: new Date().toISOString(), gpsAccuracyM: 8, payload };
    const first = await call('POST', '/v1/field/submissions/sync', { token: agent.accessToken, body: { items: [item] } });
    assert.ok(first.body.results[0].id, JSON.stringify(first.body));
    const again = await call('POST', '/v1/field/submissions/sync', { token: agent.accessToken, body: { items: [item] } });
    assert.equal(again.body.results[0].duplicate, true);

    const admin = await login(ADMIN);
    const approved = await call('POST', `/v1/admin/field/submissions/${first.body.results[0].id}/approve`, { token: admin.accessToken, body: { edits: { name: 'Gupta Sweets (Branch)' } } });
    assert.equal(approved.status, 200);
    const r = await prisma.restaurant.findUniqueOrThrow({ where: { id: approved.body.restaurant.id }, include: { photos: true } });
    assert.equal(r.costForTwoPaise, 12000);
    assert.equal(r.source, 'field');
    assert.ok(r.photos[0].url.endsWith('-md.webp'));
    const invite = await prisma.notification.findFirst({ where: { template: 'owner_invite', to: '9811100999' } });
    assert.ok(invite, 'owner invite SMS queued');
  });

  test('visit log with a revisit date shows up as due', async () => {
    const agent = await login(AGENT);
    const lead = (await call('GET', '/v1/field/leads', { token: agent.accessToken })).body.data[0];
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const v = await call('POST', '/v1/field/visits', { token: agent.accessToken, body: { clientUuid: randomUUID(), leadId: lead.id, outcome: 'revisit', revisitOn: today, note: 'Owner away' } });
    assert.equal(v.status, 201);
    const stats = await call('GET', '/v1/field/me/stats', { token: agent.accessToken });
    assert.ok(stats.body.revisitsDue.some((r: { leadId: string }) => r.leadId === lead.id));
  });

  test('beats: supervisor view of agents and areas', async () => {
    const agent = await login(AGENT);
    const areas = await call('GET', '/v1/field/me/areas', { token: agent.accessToken });
    assert.equal(areas.body.data[0].name, 'Main Bazaar & Bus Stand');
    const admin = await login(ADMIN);
    const agents = await call('GET', '/v1/admin/field/agents', { token: admin.accessToken });
    assert.ok(agents.body.data.some((a: { areas: unknown[] }) => a.areas.length));
  });
});

describe('admin console', () => {
  test('per-city flag hides unclaimed listings only in that city', async () => {
    const admin = await login(ADMIN);
    const city = await nkt();
    const before = await call('GET', `/v1/restaurants?lat=${NKT.lat}&lng=${NKT.lng}&radius_km=100&count_only=1`);
    await call('PUT', '/v1/admin/settings', { token: admin.accessToken, body: { cityId: city.id, unclaimed_listings_enabled: false } });
    const hidden = await call('GET', `/v1/restaurants?lat=${NKT.lat}&lng=${NKT.lng}&radius_km=100&count_only=1`);
    assert.ok(hidden.body.total < before.body.total);
    await call('PUT', '/v1/admin/settings', { token: admin.accessToken, body: { cityId: city.id, unclaimed_listings_enabled: null } });
    const restored = await call('GET', `/v1/restaurants?lat=${NKT.lat}&lng=${NKT.lng}&radius_km=100&count_only=1`);
    assert.equal(restored.body.total, before.body.total);
  });

  test('diner info correction is applied in one click', async () => {
    const diner = await login(freshPhone());
    const r = (await call('GET', '/v1/restaurants/chai-adda-3')).body;
    const rep = await call('POST', '/v1/reports', { token: diner.accessToken, body: { targetType: 'restaurant', targetId: r.id, reason: 'wrong_phone', proposed: { phone: '9876543210' } } });
    assert.equal(rep.status, 201);
    const admin = await login(ADMIN);
    assert.equal((await call('POST', `/v1/admin/reports/${rep.body.id}/resolve`, { token: admin.accessToken, body: { action: 'apply_correction' } })).status, 200);
    assert.equal((await call('GET', '/v1/restaurants/chai-adda-3')).body.phone, '9876543210');
  });

  test('held reviews can be published, and a device cluster bulk-hidden', async () => {
    const admin = await login(ADMIN);
    const held = await call('GET', '/v1/admin/reviews?status=pending', { token: admin.accessToken });
    assert.ok(held.body.data.length > 0);
    const clusters = await call('GET', '/v1/admin/reviews/clusters', { token: admin.accessToken });
    assert.ok(clusters.body.devices.some((d: { deviceId: string }) => d.deviceId === 'device-abcdef123'));
    const hid = await call('POST', '/v1/admin/reviews/bulk-hide', { token: admin.accessToken, body: { deviceId: 'device-abcdef123' } });
    assert.ok(hid.body.hidden >= 1);
  });

  test('catalogue: add a town and locality; launching notifies the waitlist', async () => {
    const admin = await login(ADMIN);
    await call('POST', '/v1/geo/waitlist', { body: { phone: '9811100777', lat: 27.9, lng: 76.0 } });
    const city = await call('POST', '/v1/admin/catalog/cities', { token: admin.accessToken, body: { name: `Udaipurwati ${Date.now() % 1000}`, state: 'Rajasthan', lat: 27.9, lng: 75.99 } });
    assert.equal(city.status, 201);
    const loc = await call('POST', '/v1/admin/catalog/localities', { token: admin.accessToken, body: { cityId: city.body.id, name: 'Sabzi Mandi', lat: 27.901, lng: 75.991 } });
    assert.equal(loc.status, 201);
    await call('PATCH', `/v1/admin/catalog/cities/${city.body.id}`, { token: admin.accessToken, body: { isLive: true } });
    assert.ok(await prisma.notification.findFirst({ where: { template: 'city_live', to: '9811100777' } }));
  });

  test('collections: create, publish and read', async () => {
    const admin = await login(ADMIN);
    const city = await nkt();
    const r = await prisma.restaurant.findFirstOrThrow({ where: { slug: 'cafe-aroma-4' } });
    const c = await call('POST', '/v1/admin/collections', { token: admin.accessToken, body: { title: 'Cosy cafés', cityId: city.id, isPublished: true, restaurantIds: [r.id] } });
    assert.equal(c.status, 201);
    const pub = await call('GET', `/v1/collections/${c.body.slug}`);
    assert.equal(pub.body.items[0].id, r.id);
  });

  test('non-admins are kept out', async () => {
    const diner = await login(freshPhone());
    assert.equal((await call('GET', '/v1/admin/settings', { token: diner.accessToken })).status, 403);
    const agent = await login(AGENT);
    assert.equal((await call('GET', '/v1/admin/verifications', { token: agent.accessToken })).status, 403);
  });
});
