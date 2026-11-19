export const ROLES = ['ADMIN', 'OWNER', 'STAFF'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'branch.manage', 'user.manage', 'rate.set', 'audit.view', 'dashboard.ho',
  'report.view', 'report.all',
  'product.read', 'product.write', 'inventory.write',
  'invoice.create', 'invoice.finalize', 'invoice.void', 'exchange.edit',
  'transfer.create', 'transfer.approve',
  'dairy.create', 'dairy.collect', 'dairy.adjust',
  'supplier.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ADMIN_ONLY: Permission[] = ['branch.manage', 'user.manage', 'rate.set', 'audit.view',
  'dashboard.ho', 'report.all', 'dairy.adjust'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  OWNER: PERMISSIONS.filter(p => !ADMIN_ONLY.includes(p)),
  STAFF: ['invoice.create', 'invoice.finalize', 'product.read', 'dairy.collect', 'report.view'],
};

export const hasPermission = (role: Role, p: Permission) => ROLE_PERMISSIONS[role].includes(p);

export interface AuthUser { id: string; name: string; role: Role; branchIds: string[] }

export const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;
export const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

export * from './pricing';
