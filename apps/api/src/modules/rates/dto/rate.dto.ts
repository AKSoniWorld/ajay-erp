import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

export class SetRateDto {
  @IsIn(['GOLD', 'SILVER']) metal: 'GOLD' | 'SILVER';
  @IsOptional() @IsIn([24, 22, 18]) karat?: 24 | 22 | 18;           // required for GOLD, ignored for SILVER
  @IsIn(['SALE', 'EXCHANGE', 'MARKET']) kind: 'SALE' | 'EXCHANGE' | 'MARKET';
  @IsInt() @Min(1) ratePerGramPaise: number;
  @IsString() @MinLength(3) reason: string;
  @IsOptional() @IsBoolean() confirmLargeChange?: boolean;
}
export class RateHistoryQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['GOLD', 'SILVER']) metal?: string;
  @IsOptional() @Type(() => Number) @IsIn([24, 22, 18]) karat?: number;
  @IsOptional() @IsIn(['SALE', 'EXCHANGE', 'MARKET']) kind?: string;
}
