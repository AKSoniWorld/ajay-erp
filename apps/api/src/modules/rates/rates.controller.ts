import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { AuthUser } from '@ajay/shared';
import { CurrentUser, RequirePermission, Roles } from '../../common/decorators';
import { RateHistoryQueryDto, SetRateDto } from './dto/rate.dto';
import { RatesService } from './rates.service';

@Controller('rates')
export class RatesController {
  constructor(private svc: RatesService) {}

  @Get('current') current() { return this.svc.current(); } // any signed-in user (POS needs it)

  @Get('history') @Roles('ADMIN', 'OWNER') history(@Query() q: RateHistoryQueryDto) { return this.svc.history(q); }

  @Post() @RequirePermission('rate.set')
  async set(@Body() dto: SetRateDto, @CurrentUser() u: AuthUser, @Req() req: any) {
    req.auditBefore = await this.svc.latest(dto.metal, dto.kind, dto.karat); // previous rate goes into the audit trail
    return this.svc.set(dto, u.id);
  }
}
