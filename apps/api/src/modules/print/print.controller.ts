import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { RequirePermission, SkipAudit } from '../../common/decorators';
import { TagPrintDto, TagTestDto } from './dto/print.dto';
import { TagService } from './tag.service';

/** Returns printer-ready bytes (base64); the browser sends them to the printer over WebUSB / Web Bluetooth / a local agent. */
@Controller('print')
export class PrintController {
  constructor(private tags: TagService) {}

  @Post('tags') @HttpCode(200) @SkipAudit() @RequirePermission('product.read')
  tag(@Body() dto: TagPrintDto) { return this.tags.print(dto); }

  @Post('tags/test') @HttpCode(200) @SkipAudit() @RequirePermission('product.read')
  test(@Body() dto: TagTestDto) { return this.tags.test(dto); }
}
