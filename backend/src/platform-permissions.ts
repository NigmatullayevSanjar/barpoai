import { type Db, type Row } from './db.js';
import { invariant } from './errors.js';
/**
 * Platforma rollari ruxsatlari (egasi qarori D21, 2026-10-22; D15 dagi qat'iy bo'linish o'rniga).
 * Ko'rish (kompaniyalar, tariflar, daromad, qarzdorlar, murojaatlar ro'yxati) barcha platforma xodimlariga ochiq;
 * bu ro'yxat — amallar. Platforma egasida hammasi doim bor va o'zgarmaydi; super admin va support uchun standart
 * qiymatlar shu yerda, sahifadan o'zgartirilgani `platform_role_permissions` jadvalida.
 */
export const platformPermissions = [
  'tenants.manage',
  'tenants.block',
  'plans.manage',
  'billing.manage',
  'users.reset',
  'tenants.correct',
  'audit.read',
  'support.reply',
  'diagnostics.read',
  'staff.manage',
  'permissions.manage',
] as const;
export type PlatformPermission = (typeof platformPermissions)[number];
export const platformStaff = ['platform_owner', 'super_admin', 'support'];
export const configurableRoles = ['super_admin', 'support'] as const;
export const platformDefaults: Record<(typeof configurableRoles)[number], readonly PlatformPermission[]> = {
  // Super admin — butun platforma admini (developer darajasi): egasining barcha amallari ham.
  super_admin: platformPermissions,
  // Support — hamma kompaniyalarga yordam: murojaatlar, diagnostika va kompaniya foydalanuvchisiga parol tiklash.
  support: ['users.reset', 'support.reply', 'diagnostics.read'],
};
/** Rolning samarali ruxsatlari: standart + jadvaldagi o'zgarishlar. */
export async function roleMatrix(db: Db) {
  const rows = (await db.query('SELECT role,permission,allowed FROM platform_role_permissions')).rows;
  const matrix = {} as Record<(typeof configurableRoles)[number], Record<PlatformPermission, boolean>>;
  for (const role of configurableRoles) {
    matrix[role] = {} as Record<PlatformPermission, boolean>;
    for (const p of platformPermissions)
      matrix[role][p] =
        rows.find((r) => r.role === role && r.permission === p)?.allowed ?? platformDefaults[role].includes(p);
  }
  return matrix;
}
export async function platformGranted(db: Db, actor: Row): Promise<PlatformPermission[]> {
  if (actor.tenant_id || !platformStaff.includes(actor.role)) return [];
  if (actor.role === 'platform_owner') return [...platformPermissions];
  const row = (await roleMatrix(db))[actor.role as (typeof configurableRoles)[number]];
  return platformPermissions.filter((p) => row[p]);
}
export async function platformAllowed(db: Db, actor: Row, permission: PlatformPermission) {
  return (await platformGranted(db, actor)).includes(permission);
}
export async function platformPermit(db: Db, actor: Row, permission: PlatformPermission) {
  invariant(await platformAllowed(db, actor, permission), 'FORBIDDEN', 403);
}
