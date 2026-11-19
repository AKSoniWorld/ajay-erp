import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from '@ajay/shared';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CollectDto, CreateSchemeDto, DairyQueryDto, ManualAdjustDto } from './dto/dairy.dto';
import { PdfQueryDto } from '../print/dto/print.dto';
import { inr } from '../print/docs';
import { pdfFile } from '../print/pdf-response';
import { PdfService } from '../print/pdf.service';
import { DairyService } from './dairy.service';

@Controller('dairy')
export class DairyController {
  constructor(private svc: DairyService, private pdf: PdfService) {}

  @Post('schemes') @RequirePermission('dairy.create')
  create(@Body() dto: CreateSchemeDto, @CurrentUser() u: AuthUser) { return this.svc.createScheme(dto, u); }

  @Get('schemes') @RequirePermission('dairy.collect')
  list(@Query() q: DairyQueryDto, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }

  @Get('schemes/:id') @RequirePermission('dairy.collect')
  one(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }

  @Post('schemes/:id/payments') @RequirePermission('dairy.collect')
  collect(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CollectDto, @CurrentUser() u: AuthUser) { return this.svc.collect(id, dto, u); }

  /** POS: what this customer can use on a bill (any branch). */
  @Get('customer/:customerId/balance') @RequirePermission('invoice.create')
  balance(@Param('customerId', ParseObjectIdPipe) id: string) { return this.svc.balancesForCustomer(id); }

  @Get('receipts/:no') @RequirePermission('dairy.collect')
  receipt(@Param('no') no: string, @CurrentUser() u: AuthUser) { return this.svc.receipt(no, u); }

  @Get('receipts/:no/pdf') @RequirePermission('dairy.collect')
  async receiptPdf(@Param('no') no: string, @Query() q: PdfQueryDto, @CurrentUser() u: AuthUser) {
    const r = await this.svc.receipt(no, u), sym = this.pdf.symbol;
    const buffer = await this.pdf.render(this.pdf.receiptDoc({
      title: 'DAIRY (MONTHLY SAVINGS) RECEIPT', receiptNo: r.receiptNo, date: r.date, branch: r.branch, customer: r.customer,
      rows: [['Scheme no', r.schemeNo ?? ''], ['Payment mode', r.mode], ['Instalments covered', String(r.monthsCovered)],
        ['Instalments paid so far', `${r.installmentsPaid} of ${r.totalInstallments}`], ['Total deposited', inr(r.totalDepositedPaise, sym)]],
      amountPaise: r.amountPaise }, q.size ?? r.branch.receiptPaper));
    return pdfFile(buffer, `${no}.pdf`, !!q.download);
  }

  /** Admin-only ledger correction (audited). */
  @Post('adjustments') @RequirePermission('dairy.adjust')
  adjust(@Body() dto: ManualAdjustDto, @CurrentUser() u: AuthUser) { return this.svc.manualAdjust(dto, u); }
}
