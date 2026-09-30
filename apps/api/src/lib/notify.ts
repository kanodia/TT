import { json, prisma } from './db.js';

/** Message templates. Brand name is injected at send time so a rebrand needs no template change (spec 11.6). */
export const TEMPLATES = {
  otp: (p: { code: string }, brand: string) => ({ title: `${brand} code`, body: `${p.code} is your ${brand} sign-in code. It expires in 10 minutes.` }),
  review_new: (p: { restaurant: string; rating: number; excerpt: string }) => ({
    title: `New ${p.rating}★ review for ${p.restaurant}`,
    body: p.excerpt,
  }),
  review_digest: (p: { restaurant: string; count: number; average: number }) => ({
    title: `${p.count} new review${p.count > 1 ? 's' : ''} for ${p.restaurant}`,
    body: `Average ${p.average.toFixed(1)}★ in the last day. Reply to keep diners coming back.`,
  }),
  listing_approved: (p: { restaurant: string }) => ({ title: `${p.restaurant} is live`, body: 'Your listing passed verification and diners can now find it.' }),
  listing_rejected: (p: { restaurant: string; reason: string }) => ({ title: `${p.restaurant} needs changes`, body: `Verification was not approved: ${p.reason}` }),
  claim_approved: (p: { restaurant: string }) => ({ title: `You now manage ${p.restaurant}`, body: 'Your ownership claim was approved.' }),
  claim_rejected: (p: { restaurant: string; reason: string }) => ({ title: `Claim for ${p.restaurant} not approved`, body: p.reason }),
  change_approved: (p: { restaurant: string }) => ({ title: `Change approved for ${p.restaurant}`, body: 'Your name/address change is now live.' }),
  change_rejected: (p: { restaurant: string; reason: string }) => ({ title: `Change not approved for ${p.restaurant}`, body: p.reason }),
  correction_reported: (p: { restaurant: string; reason: string }) => ({ title: `A diner reported: ${p.reason}`, body: `Please check your ${p.restaurant} listing is correct.` }),
  hours_reminder: (p: { restaurant: string }) => ({ title: `Are ${p.restaurant}'s hours still right?`, body: "It's been 60 days since you confirmed them. One tap to confirm." }),
  menu_reminder: (p: { restaurant: string }) => ({ title: `Time to refresh your menu`, body: `${p.restaurant}'s menu hasn't changed in 4 months. Update prices and dishes.` }),
  owner_invite: (p: { restaurant: string; link: string }, brand: string) => ({
    title: `${p.restaurant} is on ${brand}`,
    body: `Our team listed ${p.restaurant} on ${brand}. Manage it free: ${p.link}`,
  }),
  team_invite: (p: { restaurant: string; role: string; link: string }, brand: string) => ({
    title: `Join ${p.restaurant} on ${brand}`,
    body: `You were added as ${p.role}. Sign in with this number: ${p.link}`,
  }),
  capture_sent_back: (p: { name: string; note: string }) => ({ title: `Fix needed: ${p.name}`, body: p.note }),
  revisit_due: (p: { name: string }) => ({ title: `Revisit today: ${p.name}`, body: 'You planned a revisit for today.' }),
  city_live: (p: { city: string }, brand: string) => ({ title: `${brand} is now in ${p.city}`, body: `Find great food near you in ${p.city}.` }),
  moderation_warning: (p: { reason: string }) => ({ title: 'A note from our moderators', body: `Your recent content broke our guidelines (${p.reason}). Repeated issues can lead to suspension.` }),
  photo_rejected: (p: { restaurant: string }) => ({ title: 'Photo not published', body: `A photo you added for ${p.restaurant} did not meet our guidelines.` }),
  review_published: (p: { restaurant: string }) => ({ title: 'Your review is live', body: `Thanks for reviewing ${p.restaurant}.` }),
  account_deletion: () => ({ title: 'Account deletion scheduled', body: 'Your account and personal data will be deleted in 7 days. Sign in again to cancel.' }),
} as const;

export type Template = keyof typeof TEMPLATES;
export type Channel = 'sms' | 'email' | 'push' | 'in_app';

type Prefs = { sms?: boolean; email?: boolean; push?: boolean; digest?: boolean };

/** Queue a message. Delivery happens in the worker (lib/worker.ts). */
export async function notify(opts: {
  userId?: string | null;
  to?: string | null;
  channel: Channel;
  template: Template;
  payload?: Record<string, unknown>;
  sendAfter?: Date;
}) {
  return prisma.notification.create({
    data: {
      userId: opts.userId ?? null,
      to: opts.to ?? null,
      channel: opts.channel,
      template: opts.template,
      payload: json(opts.payload ?? {}) as object,
      sendAfter: opts.sendAfter ?? new Date(),
      // In-app messages are "delivered" by being stored.
      ...(opts.channel === 'in_app' ? { status: 'sent', sentAt: new Date() } : {}),
    },
  });
}

/** Notify a restaurant's team (owners/managers by default) in-app, plus SMS where they opted in. */
export async function notifyTeam(
  restaurantId: string,
  template: Template,
  payload: Record<string, unknown>,
  opts: { roles?: string[]; sms?: boolean } = {},
) {
  const members = await prisma.restaurantMember.findMany({
    where: { restaurantId, status: 'active', role: { in: opts.roles ?? ['owner', 'manager'] } },
    include: { user: true },
  });
  for (const m of members) {
    const prefs = (m.user.notificationPrefs ?? {}) as Prefs;
    await notify({ userId: m.userId, channel: 'in_app', template, payload: { ...payload, restaurantId } });
    if (opts.sms && prefs.sms !== false) await notify({ userId: m.userId, to: m.user.phone, channel: 'sms', template, payload });
    if (m.user.email && prefs.email) await notify({ userId: m.userId, to: m.user.email, channel: 'email', template, payload });
  }
}
