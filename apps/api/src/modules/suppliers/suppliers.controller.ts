import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthUser } from '@ajay/shared';
import { CurrentUser, RequirePermission, Roles } from '../../common/decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CancelPurchaseDto, CreatePurchaseDto, CreateSupplierDto, PurchaseQueryDto, SupplierAdjustDto, SupplierPaymentDto, UpdateSupplierDto, MetalPaymentDto, ConvertDto, SupplierStatementQueryDto,
} from './dto/supplier.dto';
import { PurchasesService } from './purchases.service';
import { SuppliersService } from './suppliers.service';

const Id = () => Param('id', ParseObjectIdPipe);

@Controller('suppliers')
@RequirePermission('supplier.manage')
export class SuppliersController {
  constructor(private svc: SuppliersService) {}

  @Post() create(@Body() dto: CreateSupplierDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u.id); }
  @Get() list(@Query() q: PageQueryDto) { return this.svc.list(q.page, q.limit, q.q); }
  @Get(':id') one(@Id() id: string) { return this.svc.profile(id); }

  @Patch(':id')
  async update(@Id() id: string, @Body() dto: UpdateSupplierDto, @Req() req: any) {
    req.auditBefore = (await this.svc.findOne(id)).toJSON();
    return this.svc.update(id, dto);
  }

  @Post(':id/payments') pay(@Id() id: string, @Body() dto: SupplierPaymentDto, @CurrentUser() u: AuthUser) { return this.svc.pay(id, dto, u); }
  /** We hand over fine gold / silver (optionally from raw inventory). */
  @Post(':id/metal-payments') payMetal(@Id() id: string, @Body() dto: MetalPaymentDto, @CurrentUser() u: AuthUser) { return this.svc.payMetal(id, dto, u); }

  /** "Rate cut": convert the balance between cash and fine at the current 24K gold / silver market rate. */
  @Post(':id/convert') convert(@Id() id: string, @Body() dto: ConvertDto, @CurrentUser() u: AuthUser) { return this.svc.convert(id, dto, u); }

  @Get(':id/ledger') ledger(@Id() id: string, @Query() q: SupplierStatementQueryDto) { return this.svc.statement(id, q); }

  /** Admin-only correction (audited). */
  @Post(':id/adjustments') @Roles('ADMIN')
  adjust(@Id() id: string, @Body() dto: SupplierAdjustDto, @CurrentUser() u: AuthUser) { return this.svc.adjust(id, dto, u); }
}

@Controller('purchases')
@RequirePermission('supplier.manage')
export class PurchasesController {
  constructor(private svc: PurchasesService) {}

  @Post() create(@Body() dto: CreatePurchaseDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }
  @Get() list(@Query() q: PurchaseQueryDto, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }
  @Get(':id') one(@Id() id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }

  @Post(':id/cancel') @Roles('ADMIN')
  cancel(@Id() id: string, @Body() dto: CancelPurchaseDto, @CurrentUser() u: AuthUser) { return this.svc.cancel(id, dto, u); }
}
