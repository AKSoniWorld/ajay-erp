import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';
import { Roles } from '../../common/decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { AuditService } from './audit.service';

class AuditQueryDto extends PageQueryDto {
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsString() actorId?: string;
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
}

@Controller('audit')
@Roles('ADMIN')
export class AuditController {
  constructor(private svc: AuditService) {}
  @Get() list(@Query() q: AuditQueryDto) { return this.svc.list(q); }
}
