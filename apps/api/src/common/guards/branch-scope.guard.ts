import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '@ajay/shared';
import { IS_PUBLIC } from '../decorators';

/** Server-side branch isolation. Non-admins may only touch their own branches. */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    if (!user || user.role === 'ADMIN') return true;
    const requested = [req.params?.branchId, req.query?.branchId, req.body?.branchId]
      .filter(Boolean).map(String);
    if (requested.some(id => !user.branchIds.includes(id)))
      throw new ForbiddenException('Branch access denied');
    req.branchScope = user.branchIds;
    return true;
  }
}
