import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mergeMap, Observable } from 'rxjs';
import { AuditService, redact } from '../../modules/audit/audit.service';
import { SKIP_AUDIT } from '../decorators';

/** Writes an audit row for every successful non-GET request (awaited before the response is sent). */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private audit: AuditService, private reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next.handle();
    if (this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT, [ctx.getHandler(), ctx.getClass()]))
      return next.handle();
    const entity = ctx.getClass().name.replace(/Controller$/, '');
    const action = `${req.method} ${ctx.getHandler().name}`;
    return next.handle().pipe(mergeMap(async (res: any) => {
      await this.audit.log({
        actorId: req.user?.id, role: req.user?.role, branchId: req.user?.branchIds?.[0],
        action, entity,
        entityId: String(req.params?.id ?? req.params?.branchId ?? req.params?.customerId ?? res?._id ?? res?.id ?? ''),
        before: req.auditBefore, after: redact(req.body), ip: req.ip,
      });
      return res;
    }));
  }
}
