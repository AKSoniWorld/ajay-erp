import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { AuthUser } from '@ajay/shared';
import { CurrentUser, RequirePermission, Roles, SkipAudit } from '../../common/decorators';
import { priceExchangeItems, summarizeExchange } from '../../engines/exchange';
import { RatesService } from '../rates/rates.service';
import { ExchangePreviewDto, ExchangeQueryDto, RawAdjustDto, RawMovementQueryDto, RawStockQueryDto } from './dto/exchange.dto';
import { ExchangeService } from './exchange.service';
import { RawInventoryService } from './raw-inventory.service';

const scopeOf = (u: AuthUser) => (u.role === 'ADMIN' ? undefined : u.branchIds);

@Controller('exchange')
export class ExchangeController {
  constructor(private svc: ExchangeService, private rates: RatesService) {}

  /** Shows fine weight and value for the POS exchange drawer. Nothing is saved. */
  @Post('preview') @HttpCode(200) @SkipAudit() @RequirePermission('invoice.create')
  async preview(@Body() dto: ExchangePreviewDto) {
    try {
      const items = priceExchangeItems(dto.exchanges, await this.rates.currentByKind('EXCHANGE'));
      return { items, totals: summarizeExchange(items) };
    } catch (e: any) { throw new BadRequestException(e.message); }
  }

  @Get() @Roles('ADMIN', 'OWNER')
  list(@Query() q: ExchangeQueryDto, @CurrentUser() u: AuthUser) { return this.svc.list(q, scopeOf(u)); }
}

@Controller('raw-inventory')
export class RawInventoryController {
  constructor(private svc: RawInventoryService) {}

  @Get() @Roles('ADMIN', 'OWNER')
  stock(@Query() q: RawStockQueryDto, @CurrentUser() u: AuthUser) { return this.svc.list(scopeOf(u), q.branchId); }

  @Get('movements') @Roles('ADMIN', 'OWNER')
  movements(@Query() q: RawMovementQueryDto, @CurrentUser() u: AuthUser) { return this.svc.movements(q, scopeOf(u)); }

  @Post('adjust') @RequirePermission('inventory.write')
  adjust(@Body() dto: RawAdjustDto, @CurrentUser() u: AuthUser) { return this.svc.adjust(dto, u.id); }
}
