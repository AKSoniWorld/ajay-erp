import { IsIn, IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

export class AdvanceDto {
  @IsMongoId() branchId: string;                 // receipt numbering
  @IsInt() @Min(1) amountPaise: number;
  @IsIn(['CASH', 'UPI', 'CARD']) mode: 'CASH' | 'UPI' | 'CARD';
  @IsOptional() @IsString() @MaxLength(60) ref?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
export class AdvanceRefundDto {
  @IsInt() @Min(1) amountPaise: number;
  @IsIn(['CASH', 'UPI', 'CARD']) mode: 'CASH' | 'UPI' | 'CARD';
  @IsString() @MinLength(3) reason: string;
}
export class DuePaymentDto {
  @IsMongoId() branchId: string;
  @IsInt() @Min(1) amountPaise: number;
  @IsIn(['CASH', 'UPI', 'CARD']) mode: 'CASH' | 'UPI' | 'CARD';
  @IsOptional() @IsString() @MaxLength(60) ref?: string;
}
export class AccountAdjustDto {
  @IsIn(['ADVANCE', 'DUE']) account: 'ADVANCE' | 'DUE';
  @IsIn(['INCREASE', 'DECREASE']) type: 'INCREASE' | 'DECREASE';   // DECREASE on DUE = write-off
  @IsInt() @Min(1) amountPaise: number;
  @IsString() @MinLength(3) reason: string;
}
export class StatementQueryDto extends PageQueryDto {
  @IsIn(['ADVANCE', 'DUE', 'DAIRY', 'PURCHASES', 'EXCHANGES']) account: 'ADVANCE' | 'DUE' | 'DAIRY' | 'PURCHASES' | 'EXCHANGES';
}
