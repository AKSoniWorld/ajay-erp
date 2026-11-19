import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from '@ajay/shared';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateTransferDto, TransferNoteDto, TransferQueryDto, TransferReasonDto } from './dto/transfer.dto';
import { TransfersService } from './transfers.service';

const Id = () => Param('id', ParseObjectIdPipe);

@Controller('transfers')
export class TransfersController {
  constructor(private svc: TransfersService) {}

  @Post() @RequirePermission('transfer.create')
  create(@Body() dto: CreateTransferDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }

  @Get() @RequirePermission('transfer.create')
  list(@Query() q: TransferQueryDto, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }

  @Get(':id') @RequirePermission('transfer.create')
  one(@Id() id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }

  @Post(':id/approve') @HttpCode(200) @RequirePermission('transfer.approve')
  approve(@Id() id: string, @CurrentUser() u: AuthUser) { return this.svc.approve(id, u); }

  @Post(':id/reject') @HttpCode(200) @RequirePermission('transfer.approve')
  reject(@Id() id: string, @Body() dto: TransferReasonDto, @CurrentUser() u: AuthUser) { return this.svc.reject(id, dto.reason, u); }

  @Post(':id/cancel') @HttpCode(200) @RequirePermission('transfer.create')
  cancel(@Id() id: string, @Body() dto: TransferReasonDto, @CurrentUser() u: AuthUser) { return this.svc.cancel(id, dto.reason, u); }

  @Post(':id/dispatch') @HttpCode(200) @RequirePermission('transfer.create')
  dispatch(@Id() id: string, @Body() dto: TransferNoteDto, @CurrentUser() u: AuthUser) { return this.svc.dispatch(id, dto.note, u); }

  @Post(':id/receive') @HttpCode(200) @RequirePermission('transfer.create')
  receive(@Id() id: string, @Body() dto: TransferNoteDto, @CurrentUser() u: AuthUser) { return this.svc.receive(id, dto.note, u); }
}
