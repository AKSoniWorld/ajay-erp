import type { Permission, Role } from '@ajay/shared';
import { hasPermission } from '@ajay/shared';
import { ArrowLeftRight, BarChart3, Boxes, Building2, Coins, FileText, Gem, LayoutDashboard, PiggyBank, Receipt, RefreshCw, ScrollText, Truck, UserCog, Users } from 'lucide-react';
//import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

//export interface NavItem { to: string; label: string; icon: ComponentType<{ size?: number }>; perm?: Permission; roles?: Role[]; hint?: string }
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  perm?: Permission;
  roles?: Role[];
  hint?: string;
}

export interface NavGroup { title: string; items: NavItem[] }

/** Grouped by what the person is doing, not by how the system is built. */
export const NAV: NavGroup[] = [
  { title: 'Today', items: [{ to: '/', label: 'Home', icon: LayoutDashboard }] },
  { title: 'Sell', items: [
    { to: '/pos', label: 'New bill', icon: Receipt, perm: 'invoice.create', hint: 'F1' },
    { to: '/invoices', label: 'Bills', icon: FileText, perm: 'invoice.create' },
    { to: '/customers', label: 'Customers', icon: Users, perm: 'invoice.create' },
    { to: '/dairy', label: 'Dairy savings', icon: PiggyBank, perm: 'dairy.collect' }] },
  { title: 'Stock', items: [
    { to: '/products', label: 'Products', icon: Gem, perm: 'product.read' },
    { to: '/inventory', label: 'Stock by branch', icon: Boxes, perm: 'product.read' },
    { to: '/transfers', label: 'Transfers', icon: ArrowLeftRight, perm: 'transfer.create' },
    { to: '/suppliers', label: 'Suppliers & purchases', icon: Truck, perm: 'supplier.manage' }] },
  { title: 'Money', items: [
    { to: '/rates', label: 'Rates', icon: Coins },
    { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'report.view' }] },
  { title: 'Admin', items: [
    { to: '/branches', label: 'Branches', icon: Building2, perm: 'branch.manage' },
    { to: '/users', label: 'Staff', icon: UserCog, perm: 'user.manage' },
    { to: '/sync', label: 'Sync review', icon: RefreshCw, roles: ['ADMIN', 'OWNER'] },
    { to: '/audit', label: 'Audit trail', icon: ScrollText, perm: 'audit.view' }] },
];

export const canSee = (i: NavItem, role: Role) => (!i.perm || hasPermission(role, i.perm)) && (!i.roles || i.roles.includes(role));
export const visibleNav = (role: Role): NavGroup[] =>
  NAV.map(g => ({ ...g, items: g.items.filter(i => canSee(i, role)) })).filter(g => g.items.length);
