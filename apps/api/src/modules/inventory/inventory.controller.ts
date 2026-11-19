import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuthUser } from '@ajay/shared';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { AdjustDto, InventoryQueryDto, MovementQueryDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

const scopeOf = (u: AuthUser) => (u.role === 'ADMIN' ? undefined : u.branchIds);

// BranchScopeGuard already rejects any branchId (query/body) outside the user's branches.
@Controller('inventory')
export class InventoryController {
  constructor(private svc: InventoryService) {}

  @Get() @RequirePermission('product.read')
  list(@Query() q: InventoryQueryDto, @CurrentUser() u: AuthUser) {
    return this.svc.stockList(scopeOf(u), q.q, q.page, q.limit, q.branchId);
  }

  @Get('movements') @RequirePermission('inventory.write')
  movements(@Query() q: MovementQueryDto, @CurrentUser() u: AuthUser) { return this.svc.movements(q, scopeOf(u)); }

  @Post('adjust') @RequirePermission('inventory.write')
  adjust(@Body() dto: AdjustDto, @CurrentUser() u: AuthUser) { return this.svc.adjust(dto, u.id); }
}
