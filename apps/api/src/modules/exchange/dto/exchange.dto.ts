import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
  MinLength, ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

/** No rate field on purpose: the exchange rate is admin-controlled and applied server-side. */
export class ExchangeItemDto {
  @IsIn(['GOLD', 'SILVER']) metal: 'GOLD' | 'SILVER';
  @IsInt() @Min(1) grossMg: number;
  @IsInt() @Min(0) lessMg: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100) purityPct: number;
  @IsOptional() @IsString() @MaxLength(200) remarks?: string;
}
export class ExchangePreviewDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ExchangeItemDto) exchanges: ExchangeItemDto[];
}
export class ExchangeQueryDto extends PageQueryDto { @IsOptional() @IsMongoId() branchId?: string; }
export class RawMovementQueryDto extends ExchangeQueryDto { @IsOptional() @IsIn(['GOLD', 'SILVER']) metal?: string; }
export class RawStockQueryDto { @IsOptional() @IsMongoId() branchId?: string; }
export class RawAdjustDto {
  @IsMongoId() branchId: string;
  @IsIn(['GOLD', 'SILVER']) metal: 'GOLD' | 'SILVER';
  @IsIn(['MELT_OUT', 'ADJUST']) type: 'MELT_OUT' | 'ADJUST';
  @IsInt() netMg: number;   // signed (MELT_OUT must be negative)
  @IsInt() fineMg: number;  // signed
  @IsString() @MinLength(3) note: string;
}
