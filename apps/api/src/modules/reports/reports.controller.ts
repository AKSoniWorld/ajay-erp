import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { AuthUser } from '@ajay/shared';
import { CurrentUser, RequirePermission, Roles } from '../../common/decorators';
import { pdfFile } from '../print/pdf-response';
import { PdfService } from '../print/pdf.service';
import { DashboardService } from './dashboard.service';
import { reportPdfDoc, toCsv } from './report-formats';
import { Report } from './report.types';
import { ReportQueryDto } from './reports.dto';
import { ReportsService } from './reports.service';

@Controller()
export class ReportsController {
  constructor(private svc: ReportsService, private dash: DashboardService, private pdf: PdfService) {}

  /** json (default) · csv (rupees/grams, opens in Excel) · pdf (landscape A4). */
  private async out(r: Report, q: ReportQueryDto, slug: string) {
    const name = `${slug}-${r.period?.from ?? ''}_${r.period?.to ?? ''}`.replace(/[^A-Za-z0-9._-]/g, '_');
    if (q.format === 'csv')
      return new StreamableFile(Buffer.from(toCsv(r), 'utf8'), { type: 'text/csv; charset=utf-8', disposition: `attachment; filename="${name}.csv"` });
    if (q.format === 'pdf')
      return pdfFile(await this.pdf.render(reportPdfDoc(r, { symbol: this.pdf.symbol, font: this.pdf.font })), `${name}.pdf`, true);
    return r;
  }

  // Sales: staff see their own sales only; owners their branches; admin everything.
  @Get('reports/sales') @RequirePermission('report.view')
  async sales(@Query() q: ReportQueryDto, @CurrentUser() u: AuthUser) { return this.out(await this.svc.sales(q, u), q, 'sales'); }

  @Get('reports/branch-comparison') @RequirePermission('report.all')
  async comparison(@Query() q: ReportQueryDto) { return this.out(await this.svc.branchComparison(q), q, 'branch-comparison'); }

  @Get('reports/old-gold') @RequirePermission('report.view') @Roles('ADMIN', 'OWNER')
  async oldGold(@Query() q: ReportQueryDto, @CurrentUser() u: AuthUser) { return this.out(await this.svc.oldMetal('GOLD', q, u), q, 'old-gold'); }

  @Get('reports/old-silver') @RequirePermission('report.view') @Roles('ADMIN', 'OWNER')
  async oldSilver(@Query() q: ReportQueryDto, @CurrentUser() u: AuthUser) { return this.out(await this.svc.oldMetal('SILVER', q, u), q, 'old-silver'); }

  @Get('reports/dairy-collection') @RequirePermission('report.view') @Roles('ADMIN', 'OWNER')
  async dairy(@Query() q: ReportQueryDto, @CurrentUser() u: AuthUser) { return this.out(await this.svc.dairyCollection(q, u), q, 'dairy-collection'); }

  @Get('reports/stock-movement') @RequirePermission('report.view') @Roles('ADMIN', 'OWNER')
  async stock(@Query() q: ReportQueryDto, @CurrentUser() u: AuthUser) { return this.out(await this.svc.stockMovement(q, u), q, 'stock-movement'); }

  @Get('reports/customer-ledger') @RequirePermission('report.view') @Roles('ADMIN', 'OWNER')
  async customer(@Query() q: ReportQueryDto, @CurrentUser() u: AuthUser) { return this.out(await this.svc.customerLedger(q, u), q, 'customer-ledger'); }

  @Get('reports/supplier-ledger') @RequirePermission('report.view') @Roles('ADMIN', 'OWNER')
  async supplier(@Query() q: ReportQueryDto, @CurrentUser() u: AuthUser) { return this.out(await this.svc.supplierLedger(q, u), q, 'supplier-ledger'); }

  /** Head-office dashboard (admin). */
  @Get('dashboard/head-office') @RequirePermission('dashboard.ho')
  headOffice(@Query() q: ReportQueryDto) { return this.dash.headOffice(q); }
}
