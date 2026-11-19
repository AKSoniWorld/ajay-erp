import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from '@ajay/shared';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { inr } from '../print/docs';
import { PdfQueryDto } from '../print/dto/print.dto';
import { pdfFile } from '../print/pdf-response';
import { PdfService } from '../print/pdf.service';
import { AccountsService } from './accounts.service';
import { AccountAdjustDto, AdvanceDto, AdvanceRefundDto, DuePaymentDto, StatementQueryDto } from './dto/accounts.dto';

const Cid = () => Param('customerId', ParseObjectIdPipe);

@Controller('customers/:customerId')
export class AccountsController {
  constructor(private svc: AccountsService, private pdf: PdfService) {}

  @Get('account') @RequirePermission('invoice.create')
  summary(@Cid() id: string, @CurrentUser() u: AuthUser) { return this.svc.summary(id, u); }

  @Get('statement') @RequirePermission('invoice.create')
  statement(@Cid() id: string, @Query() q: StatementQueryDto, @CurrentUser() u: AuthUser) { return this.svc.statement(id, q, u); }

  @Post('advance') @RequirePermission('invoice.create')
  advance(@Cid() id: string, @Body() dto: AdvanceDto, @CurrentUser() u: AuthUser) { return this.svc.receiveAdvance(id, dto, u); }

  @Post('advance/refund') @RequirePermission('invoice.void')
  refund(@Cid() id: string, @Body() dto: AdvanceRefundDto, @CurrentUser() u: AuthUser) { return this.svc.refundAdvance(id, dto, u); }

  @Post('dues/payments') @RequirePermission('invoice.create')
  payDue(@Cid() id: string, @Body() dto: DuePaymentDto, @CurrentUser() u: AuthUser) { return this.svc.collectDue(id, dto, u); }

  @Get('receipts/:no/pdf') @RequirePermission('invoice.create')
  async receiptPdf(@Cid() id: string, @Param('no') no: string, @Query() q: PdfQueryDto, @CurrentUser() u: AuthUser) {
    const r = await this.svc.receipt(id, no, u), sym = this.pdf.symbol, adv = r.kind === 'ADVANCE_RECEIPT';
    const rows: [string, string][] = [['Payment mode', r.mode ?? ''], ...(r.ref ? [['Reference', r.ref] as [string, string]] : []),
      [adv ? 'Advance balance' : 'Balance due', inr(r.balanceAfter, sym)]];
    const buffer = await this.pdf.render(this.pdf.receiptDoc({ title: adv ? 'ADVANCE RECEIPT' : 'PAYMENT RECEIPT (DUE)',
      receiptNo: r.receiptNo, date: r.date, branch: r.branch, customer: r.customer, rows, amountPaise: r.amountPaise }, q.size ?? r.branch.receiptPaper));
    return pdfFile(buffer, `${no}.pdf`, !!q.download);
  }

  /** Admin-only correction / write-off (audited). */
  @Post('adjustments') @RequirePermission('dairy.adjust')
  adjust(@Cid() id: string, @Body() dto: AccountAdjustDto, @CurrentUser() u: AuthUser) { return this.svc.adjust(id, dto, u); }
}
