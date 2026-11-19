import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthUser } from '@ajay/shared';
import { CurrentUser, Roles } from '../../common/decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private svc: UsersService) {}

  @Post() create(@Body() dto: CreateUserDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u.id); }
  @Get() list(@Query() q: PageQueryDto) { return this.svc.list(q.page, q.limit, q.q); }
  @Get(':id') one(@Param('id', ParseObjectIdPipe) id: string) { return this.svc.findOne(id); }

  @Patch(':id')
  async update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser, @Req() req: any) {
    if (id === actor.id && (dto.active === false || (dto.role && dto.role !== 'ADMIN')))
      throw new ForbiddenException('You cannot deactivate or demote yourself');
    req.auditBefore = (await this.svc.findOne(id)).toJSON();
    return this.svc.update(id, dto);
  }
}
