import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDate, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Matches, Max,
  MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { GSTIN_REGEX, INDIAN_MOBILE_REGEX } from '@ajay/shared';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

export class CreateSupplierDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @Matches(INDIAN_MOBILE_REGEX) mobile?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @Matches(GSTIN_REGEX) gstin?: string;
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}
export class UpdateSupplierDto extends PartialType(CreateSupplierDto) { @IsOptional() @IsBoolean() active?: boolean; }

const PAY_MODES = ['CASH', 'UPI', 'CARD', 'BANK'];
export class SupplierPaymentDto {
  @IsMongoId() branchId: string;                     // which branch paid (voucher numbering)
  @IsInt() @Min(1) amountPaise: number;
  @IsIn(PAY_MODES) mode: string;
  @IsOptional() @IsString() @MaxLength(60) ref?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
  /** What this cash settles: CASH owed (default), or fine GOLD / SILVER owed — converted at the current 24K gold / silver market rate. */
  @IsOptional() @IsIn(['CASH', 'GOLD', 'SILVER']) settles?: 'CASH' | 'GOLD' | 'SILVER';
}
export class SupplierAdjustDto {
  @IsIn(['INCREASE', 'DECREASE']) type: 'INCREASE' | 'DECREASE';   // INCREASE = we owe more
  @IsInt() @Min(1) amountPaise: number;
  @IsString() @MinLength(3) reason: string;
}

export class PurchaseItemDto {
  @IsOptional() @IsMongoId() productId?: string;     // stock item → adds to branch stock
  @IsOptional() @IsString() @MaxLength(200) description?: string; // non-stock line (packing, etc.)
  @IsInt() @Min(1) @Max(10_000) qty: number;
  @IsInt() @Min(0) unitCostPaise: number;       // cash price per unit — or only the making/labour per unit when settled in fine
  /** Gold/silver stock item: owe the supplier its FINE weight (net × purity %) in metal; unitCostPaise is then the cash part only. */
  @IsOptional() @IsBoolean() settleInFine?: boolean;
}
export class InitialPaymentDto {
  @IsInt() @Min(1) amountPaise: number;
  @IsIn(PAY_MODES) mode: string;
  @IsOptional() @IsString() @MaxLength(60) ref?: string;
}
export class CreatePurchaseDto {
  @IsMongoId() supplierId: string;
  @IsMongoId() branchId: string;
  @IsOptional() @IsString() @MaxLength(60) billNo?: string;
  @Type(() => Date) @IsDate() billDate: Date;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PurchaseItemDto) items: PurchaseItemDto[];
  @IsOptional() @IsInt() @Min(0) gstPaise?: number;
  @IsOptional() @ValidateNested() @Type(() => InitialPaymentDto) payment?: InitialPaymentDto;
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}
export class CancelPurchaseDto { @IsString() @MinLength(3) reason: string; }
export class PurchaseQueryDto extends PageQueryDto {
  @IsOptional() @IsMongoId() branchId?: string;
  @IsOptional() @IsMongoId() supplierId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'CANCELLED']) status?: string;
}

/** We hand the supplier metal (fine gold / silver), optionally taken out of our raw inventory. */
export class MetalPaymentDto {
  @IsMongoId() branchId: string;
  @IsIn(['GOLD', 'SILVER']) metal: 'GOLD' | 'SILVER';
  @IsOptional() @IsInt() @Min(1) fineMg?: number;                         // give the fine weight directly…
  @IsOptional() @IsInt() @Min(1) netMg?: number;                          // …or net weight + purity (fine = net × purity %)
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100) purityPct?: number;
  @IsOptional() @IsBoolean() fromRawInventory?: boolean;                  // take it out of the branch's raw (old) metal stock
  @IsOptional() @IsString() @MaxLength(60) ref?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
/** "Rate cut": turn a cash balance into fine weight (or back) at the current market rate. */
export class ConvertDto {
  @IsIn(['CASH_TO_FINE', 'FINE_TO_CASH']) direction: 'CASH_TO_FINE' | 'FINE_TO_CASH';
  @IsIn(['GOLD', 'SILVER']) metal: 'GOLD' | 'SILVER';
  @IsOptional() @IsInt() @Min(1) amountPaise?: number;                    // for CASH_TO_FINE
  @IsOptional() @IsInt() @Min(1) fineMg?: number;                         // for FINE_TO_CASH
}
export class SupplierStatementQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['CASH', 'GOLD', 'SILVER']) account?: 'CASH' | 'GOLD' | 'SILVER';
}
