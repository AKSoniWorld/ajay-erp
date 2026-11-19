import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser, hasPermission, Permission, Role } from '@ajay/shared';
import { IS_PUBLIC, PERMS_KEY, ROLES_KEY } from '../decorators';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    const perms = this.reflector.getAllAndOverride<Permission[]>(PERMS_KEY, targets);
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new ForbiddenException();
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException('Insufficient role');
    if (perms?.length && !perms.every(p => hasPermission(user.role, p)))
      throw new ForbiddenException('Missing permission');
    return true;
  }
}
