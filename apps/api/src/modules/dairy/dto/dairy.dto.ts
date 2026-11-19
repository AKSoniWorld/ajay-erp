import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

export class CreateSchemeDto {
  @IsMongoId() customerId: string;
  @IsMongoId() branchId: string;
  @Type(() => Date) @IsDate() startDate: Date;
  @IsInt() @Min(10_000) monthlyPaise: number;               // ≥ ₹100, whole rupees (checked in service)
  @IsIn([6, 11, 12]) durationMonths: 6 | 11 | 12;
  @IsIn(['NORMAL', 'BONUS']) type: 'NORMAL' | 'BONUS';
  @IsOptional() @IsInt() @Min(1) @Max(3) bonusInstallments?: number; // BONUS only (default 1)
}
export class CollectDto {
  @IsInt() @Min(1) amountPaise: number;                      // must be a whole number of monthly installments
  @IsIn(['CASH', 'UPI', 'CARD']) mode: 'CASH' | 'UPI' | 'CARD';
  @IsOptional() @IsString() @MaxLength(60) ref?: string;
}
export class ManualAdjustDto {
  @IsMongoId() schemeId: string;
  @IsIn(['CREDIT', 'DEBIT']) type: 'CREDIT' | 'DEBIT';
  @IsInt() @Min(1) amountPaise: number;
  @IsString() @MinLength(3) reason: string;
}
export class DairyQueryDto extends PageQueryDto {
  @IsOptional() @IsMongoId() branchId?: string;
  @IsOptional() @IsMongoId() customerId?: string;
}
/** Dairy balance applied to a POS bill. */
export class DairyUseDto {
  @IsMongoId() schemeId: string;
  @IsInt() @Min(1) amountPaise: number;
  /** Needed when using this scheme before it is complete, because that cancels its bonus. */
  @IsOptional() @IsBoolean() confirmForfeitBonus?: boolean;
}
