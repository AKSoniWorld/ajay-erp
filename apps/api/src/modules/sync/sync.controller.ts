import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from '@ajay/shared';
import { CurrentUser, RequirePermission, Roles, SkipAudit } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { OpsQueryDto, PullQueryDto, PushDto, ResolveDto } from './dto/sync.dto';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private svc: SyncService) {}

  /** Devices send queued operations here (each op is its own record in the sync log, so the request body is not audited again). */
  @Post('push') @HttpCode(200) @SkipAudit() @RequirePermission('invoice.create')
  push(@Body() dto: PushDto, @CurrentUser() u: AuthUser) { return this.svc.push(u, dto); }

  @Get('pull/:collection') @RequirePermission('product.read')
  pull(@Param('collection') c: string, @Query() q: PullQueryDto, @CurrentUser() u: AuthUser) { return this.svc.pull(u, c, q); }

  /** Review queue: synced operations that could not be finished automatically. */
  @Get('ops') @Roles('ADMIN', 'OWNER')
  ops(@Query() q: OpsQueryDto, @CurrentUser() u: AuthUser) { return this.svc.listOps(u, q); }

  @Post('ops/:id/resolve') @HttpCode(200) @Roles('ADMIN', 'OWNER')
  resolve(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: ResolveDto, @CurrentUser() u: AuthUser) { return this.svc.resolve(id, dto.note, u); }
}
