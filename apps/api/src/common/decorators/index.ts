import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission, Role } from '@ajay/shared';

export const IS_PUBLIC = 'isPublic';
export const ROLES_KEY = 'roles';
export const PERMS_KEY = 'permissions';
export const SKIP_AUDIT = 'skipAudit';

export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const RequirePermission = (...p: Permission[]) => SetMetadata(PERMS_KEY, p);
export const SkipAudit = () => SetMetadata(SKIP_AUDIT, true);
export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest().user);
