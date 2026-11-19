import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { AuthUser } from '@ajay/shared';
import { CurrentUser, Roles } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

// Param is named :branchId so BranchScopeGuard enforces isolation automatically.
@Controller('branches')
export class BranchesController {
  constructor(private svc: BranchesService) {}

  @Post() @Roles('ADMIN')
  create(@Body() dto: CreateBranchDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u.id); }

  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.list(u); }

  @Get(':branchId') one(@Param('branchId', ParseObjectIdPipe) id: string) { return this.svc.findOne(id); }

  @Patch(':branchId') @Roles('ADMIN')
  async update(@Param('branchId', ParseObjectIdPipe) id: string, @Body() dto: UpdateBranchDto, @Req() req: any) {
    req.auditBefore = (await this.svc.findOne(id)).toJSON();
    return this.svc.update(id, dto);
  }
}
