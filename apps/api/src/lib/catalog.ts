import { randomBytes } from 'node:crypto';
import { prisma } from './db.js';
import { badRequest, slugify } from './http.js';

export const priceBandFor = (cost: number) => (cost < 300 ? 1 : cost < 600 ? 2 : cost < 1200 ? 3 : 4);

export async function uniqueSlug(name: string) {
  const base = slugify(name) || 'restaurant';
  for (;;) {
    const slug = `${base}-${randomBytes(2).toString('hex')}`;
    if (!(await prisma.restaurant.findUnique({ where: { slug } }))) return slug;
  }
}

/** Replaces a restaurant's cuisines and/or attributes; the first cuisine is primary. */
export async function applyTaxonomy(restaurantId: string, cuisineSlugs?: string[], attributeKeys?: string[]) {
  if (cuisineSlugs) {
    const cuisines = await prisma.cuisine.findMany({ where: { slug: { in: cuisineSlugs } } });
    await prisma.restaurantCuisine.deleteMany({ where: { restaurantId } });
    await prisma.restaurantCuisine.createMany({
      data: cuisineSlugs
        .map((slug) => cuisines.find((c) => c.slug === slug))
        .filter((c) => !!c)
        .map((c, i) => ({ restaurantId, cuisineId: c.id, isPrimary: i === 0 })),
    });
  }
  if (attributeKeys) {
    const attributes = await prisma.attribute.findMany({ where: { key: { in: attributeKeys } } });
    await prisma.restaurantAttribute.deleteMany({ where: { restaurantId } });
    await prisma.restaurantAttribute.createMany({
      data: attributes.map((a) => ({ restaurantId, attributeId: a.id })),
    });
  }
}

export async function typeIdFor(slug?: string | null) {
  if (!slug) return null;
  const t = await prisma.establishmentType.findUnique({ where: { slug } });
  if (!t) throw badRequest(`Unknown establishment type ${slug}`);
  return t.id;
}
