import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/** JSON column value from any serialisable input (undefined → SQL NULL). */
export function json(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}

/** Append-only audit trail with before/after values (spec 6). */
export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
) {
  await prisma.auditLog.create({
    data: { actorId, action, entityType, entityId, before: json(before), after: json(after) },
  });
}
