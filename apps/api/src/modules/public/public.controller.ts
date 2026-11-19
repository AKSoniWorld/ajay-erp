import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { PublicQueryDto } from './public.dto';
import { PublicService } from './public.service';

/** Customer browsing mode: no login, read-only, rate-limited. */
@Controller('public')
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PublicController {
  constructor(private svc: PublicService) {}

  @Get('products') list(@Query() q: PublicQueryDto) { return this.svc.list(q); }
  @Get('products/:sku') one(@Param('sku') sku: string) { return this.svc.bySku(sku); }
  @Get('categories') categories() { return this.svc.categoryTree(); }
  @Get('branches') branches() { return this.svc.branchList(); }
}
