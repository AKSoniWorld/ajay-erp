import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthUser } from '@ajay/shared';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Controller('customers')
@RequirePermission('invoice.create')
export class CustomersController {
  constructor(private svc: CustomersService) {}
  @Post() create(@Body() dto: CreateCustomerDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u.id); }
  @Get() list(@Query() q: PageQueryDto) { return this.svc.list(q.page, q.limit, q.q); }
  @Get(':id') one(@Param('id', ParseObjectIdPipe) id: string) { return this.svc.findOne(id); }
  @Patch(':id')
  async update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateCustomerDto, @Req() req: any) {
    req.auditBefore = (await this.svc.findOne(id)).toJSON();
    return this.svc.update(id, dto);
  }
}
