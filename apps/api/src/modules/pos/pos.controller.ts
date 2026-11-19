import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthUser } from '@ajay/shared';
import { CurrentUser, RequirePermission, SkipAudit } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CancelDto, CreateDraftDto, CreditNoteDto, FinalizeDto, InvoiceQueryDto, QuoteDto, SearchQueryDto, UpdateDraftDto,
} from './dto/pos.dto';
import { PdfQueryDto } from '../print/dto/print.dto';
import { pdfFile } from '../print/pdf-response';
import { PosService } from './pos.service';

const Id = () => Param('id', ParseObjectIdPipe);

@Controller('pos')
export class PosController {
  constructor(private svc: PosService) {}

  @Get('search') @RequirePermission('product.read')
  search(@Query() q: SearchQueryDto, @CurrentUser() u: AuthUser) { return this.svc.search(q, u); }

  @Post('quote') @HttpCode(200) @SkipAudit() @RequirePermission('invoice.create')
  quote(@Body() dto: QuoteDto, @CurrentUser() u: AuthUser) { return this.svc.quote(dto, u); }

  @Post('invoices') @RequirePermission('invoice.create')
  create(@Body() dto: CreateDraftDto, @CurrentUser() u: AuthUser) { return this.svc.createDraft(dto, u); }

  @Get('invoices') @RequirePermission('invoice.create')
  list(@Query() q: InvoiceQueryDto, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }

  @Get('invoices/:id') @RequirePermission('invoice.create')
  one(@Id() id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }

  @Patch('invoices/:id') @RequirePermission('invoice.create')
  async update(@Id() id: string, @Body() dto: UpdateDraftDto, @CurrentUser() u: AuthUser, @Req() req: any) {
    req.auditBefore = (await this.svc.get(id, u)).toJSON(); // exchange edits are audited with before/after
    return this.svc.updateDraft(id, dto, u);
  }

  @Post('invoices/:id/finalize') @HttpCode(200) @RequirePermission('invoice.finalize')
  finalize(@Id() id: string, @Body() dto: FinalizeDto, @CurrentUser() u: AuthUser) { return this.svc.finalize(id, dto, u); }

  @Post('invoices/:id/cancel') @HttpCode(200) @RequirePermission('invoice.create')
  cancel(@Id() id: string, @Body() dto: CancelDto, @CurrentUser() u: AuthUser) { return this.svc.cancelDraft(id, dto, u); }

  @Post('invoices/:id/credit-note') @RequirePermission('invoice.void')
  creditNote(@Id() id: string, @Body() dto: CreditNoteDto, @CurrentUser() u: AuthUser) { return this.svc.creditNote(id, dto, u); }

  @Get('invoices/:id/customer-view') @RequirePermission('invoice.create')
  customerView(@Id() id: string, @CurrentUser() u: AuthUser) { return this.svc.customerView(id, u); }

  @Get('invoices/:id/pdf') @RequirePermission('invoice.create')
  async pdf(@Id() id: string, @Query() q: PdfQueryDto, @CurrentUser() u: AuthUser) {
    const { buffer, filename } = await this.svc.pdfFor(id, u, q.size);
    return pdfFile(buffer, filename, !!q.download);
  }

  @Get('invoices/:id/verify') @RequirePermission('invoice.void')
  verify(@Id() id: string, @CurrentUser() u: AuthUser) { return this.svc.verify(id, u); }
}
