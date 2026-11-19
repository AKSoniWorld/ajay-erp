import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsMongoId, IsObject, IsOptional, IsString, IsUUID,
  Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { INDIAN_MOBILE_REGEX } from '@ajay/shared';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { PaymentDto, QuoteDto } from '../../pos/dto/pos.dto';
import { SYNC_STATUSES } from '../sync.schema';

export class SyncOpDto {
  @IsUUID() clientUuid: string;
  @IsIn(['SALE', 'DAIRY_PAYMENT']) type: 'SALE' | 'DAIRY_PAYMENT';
  @IsObject() payload: Record<string, unknown>;   // validated per type when the operation is processed
}
export class PushDto {
  @IsString() @MinLength(3) @MaxLength(60) deviceId: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => SyncOpDto) ops: SyncOpDto[];
}

export class ClientTotalsDto { @IsInt() finalPayable: number; }
export class InlineCustomerDto {
  @IsString() @MinLength(2) name: string;
  @Matches(INDIAN_MOBILE_REGEX) mobile: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
}
/** A sale rung up on a device while offline. Same lines/exchange/dairy/advance fields as a normal quote. */
export class OfflineSaleDto extends QuoteDto {
  @IsISO8601() offlineAt: string;                                     // when the customer was served — rates of that moment apply
  @IsString() @MaxLength(60) provisionalNo: string;                   // the temporary receipt number printed on the device
  @IsOptional() @ValidateNested() @Type(() => InlineCustomerDto) customer?: InlineCustomerDto;   // new customer made offline
  @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentDto) payments: PaymentDto[];
  @IsOptional() @IsBoolean() allowDue?: boolean;
  @ValidateNested() @Type(() => ClientTotalsDto) clientTotals: ClientTotalsDto;   // what the customer was charged on the device
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}
export class OfflineDairyDto {
  @IsMongoId() schemeId: string;
  @IsInt() @Min(1) amountPaise: number;
  @IsIn(['CASH', 'UPI', 'CARD']) mode: 'CASH' | 'UPI' | 'CARD';
  @IsOptional() @IsString() @MaxLength(60) ref?: string;
}

export class PullQueryDto {
  @IsOptional() @IsISO8601() since?: string;
  @IsOptional() @IsMongoId() branchId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2000) limit?: number;
}
export class OpsQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(SYNC_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @IsMongoId() branchId?: string;
}
export class ResolveDto { @IsString() @MinLength(3) @MaxLength(300) note: string; }
