import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDate, IsIn, IsInt, IsMongoId, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
  MinLength, ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { DairyUseDto } from '../../dairy/dto/dairy.dto';
import { ExchangeItemDto } from '../../exchange/dto/exchange.dto';

export class LineDto {
  @IsMongoId() productId: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) qty?: number;
}
export class QuoteDto {
  @IsMongoId() branchId: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LineDto) lines: LineDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ExchangeItemDto) exchanges?: ExchangeItemDto[];
  @IsOptional() @IsMongoId() customerId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => DairyUseDto) dairy?: DairyUseDto[];
  @IsOptional() @IsInt() @Min(0) advancePaise?: number;   // customer advance to apply
}
export class CreateDraftDto extends QuoteDto {
  @IsOptional() @IsMongoId() customerId?: string;
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
  @IsOptional() @IsUUID() clientUuid?: string;
}
export class UpdateDraftDto {
  @IsOptional() @IsMongoId() customerId?: string;
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LineDto) lines?: LineDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ExchangeItemDto) exchanges?: ExchangeItemDto[]; // [] clears
  @IsOptional() @IsArray() @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => DairyUseDto) dairy?: DairyUseDto[]; // [] clears
  @IsOptional() @IsInt() @Min(0) advancePaise?: number;
}
export class PaymentDto {
  @IsIn(['CASH', 'UPI', 'CARD']) mode: 'CASH' | 'UPI' | 'CARD';
  @IsInt() @Min(1) amountPaise: number;
  @IsOptional() @IsString() @MaxLength(60) ref?: string;
}
export class FinalizeDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentDto) payments: PaymentDto[];
  @IsOptional() @IsBoolean() allowDue?: boolean;          // owner/admin: leave the unpaid balance as customer due
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}
export class CancelDto { @IsString() @MinLength(3) reason: string; }
export class CreditNoteDto {
  @IsString() @MinLength(3) reason: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentDto) refunds: PaymentDto[];
}
export class SearchQueryDto {
  @IsMongoId() branchId: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() code?: string;      // scanned QR text (AJ:<SKU>) or SKU
}
export class InvoiceQueryDto extends PageQueryDto {
  @IsOptional() @IsMongoId() branchId?: string;
  @IsOptional() @IsIn(['DRAFT', 'FINAL', 'CANCELLED']) status?: string;
  @IsOptional() @IsIn(['SALE', 'CREDIT_NOTE']) type?: string;
  @IsOptional() @IsIn(['GST', 'NON_GST']) taxMode?: string;
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
}
