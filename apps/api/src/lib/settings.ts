import { prisma } from './db.js';

export type Brand = {
  appName: string;
  shortName: string;
  tagline: string;
  taglineHi: string;
  primaryColor: string;
  logoUrl: string | null;
  iconUrl: string | null;
  supportEmail: string;
  supportPhone: string;
  webDomain: string | null;
};

// Rebrand readiness (spec 11.6): the name lives in brand_config, never in screens.
export const DEFAULT_BRAND: Brand = {
  appName: 'TwiggyTomato',
  shortName: 'TT',
  tagline: 'Find great food near you',
  taglineHi: 'अपने आस-पास का बढ़िया खाना खोजें',
  primaryColor: '#e23744',
  logoUrl: null,
  iconUrl: null,
  supportEmail: 'support@example.com',
  supportPhone: '+91-00000-00000',
  webDomain: null,
};

export type ReviewRules = {
  minChars: number;
  perDayLimit: number;
  cooldownDays: number;
  /** A burst of this many 5★ reviews in 24 h holds new ones for moderation (spec 6, fake review defences). */
  burstThreshold: number;
};

/** Feature flags and rules. Each has a global value and optional per-city overrides (spec 9.3). */
export const DEFAULT_FLAGS = {
  unclaimed_listings_enabled: true,
  sponsored_enabled: false,
  review_rules: { minChars: 20, perDayLimit: 10, cooldownDays: 30, burstThreshold: 5 } as ReviewRules,
};

export type Flags = typeof DEFAULT_FLAGS;
export type FlagKey = keyof Flags;
export const FLAG_KEYS = Object.keys(DEFAULT_FLAGS) as FlagKey[];

/** Effective flags: defaults ← global rows ← the city's rows. */
export async function getFlags(cityId?: string | null): Promise<Flags> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: FLAG_KEYS }, OR: [{ cityId: null }, ...(cityId ? [{ cityId }] : [])] },
  });
  const result = structuredClone(DEFAULT_FLAGS) as Record<string, unknown>;
  for (const row of rows.filter((r) => r.cityId === null)) result[row.key] = row.value;
  for (const row of rows.filter((r) => r.cityId !== null)) result[row.key] = row.value;
  return result as Flags;
}

/** Cities where a boolean flag resolves to `value`, given global + per-city rows. */
export async function citiesWhereFlag(key: 'unclaimed_listings_enabled' | 'sponsored_enabled', value: boolean) {
  const [global, overrides, cities] = await Promise.all([
    prisma.appSetting.findFirst({ where: { key, cityId: null } }),
    prisma.appSetting.findMany({ where: { key, cityId: { not: null } } }),
    prisma.city.findMany({ select: { id: true } }),
  ]);
  const globalValue = (global?.value as boolean | undefined) ?? DEFAULT_FLAGS[key];
  const byCity = new Map(overrides.map((o) => [o.cityId!, o.value as boolean]));
  return cities.filter((c) => (byCity.get(c.id) ?? globalValue) === value).map((c) => c.id);
}

export async function setFlag<K extends FlagKey>(key: K, value: Flags[K] | null, cityId: string | null, actorId: string) {
  const existing = await prisma.appSetting.findFirst({ where: { key, cityId } });
  if (value === null) {
    // Removing a city override falls back to the global value.
    if (existing && cityId) await prisma.appSetting.delete({ where: { id: existing.id } });
    return;
  }
  if (existing) await prisma.appSetting.update({ where: { id: existing.id }, data: { value, updatedBy: actorId } });
  else await prisma.appSetting.create({ data: { key, cityId, value, updatedBy: actorId } });
}

export async function getBrand(): Promise<Brand> {
  const row = await prisma.brandConfig.findFirst({ where: { active: true }, orderBy: { updatedAt: 'desc' } });
  if (!row) return DEFAULT_BRAND;
  const { id: _id, active: _active, updatedAt: _u, ...brand } = row;
  return brand;
}

export async function setBrand(brand: Brand) {
  const row = await prisma.brandConfig.findFirst({ where: { active: true } });
  if (row) await prisma.brandConfig.update({ where: { id: row.id }, data: brand });
  else await prisma.brandConfig.create({ data: brand });
}
