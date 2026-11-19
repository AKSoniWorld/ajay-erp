import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { MOVEMENT_TYPES, MovementType } from '../stock.schema';

export class AdjustDto {
  @IsMongoId() productId: string;
  @IsMongoId() branchId: string;
  @Type(() => Number) @IsInt() qty: number;
  @IsOptional() @IsIn(['OPENING', 'ADJUST']) type: 'OPENING' | 'ADJUST' = 'ADJUST';
  @ValidateIf(o => o.type !== 'OPENING') @IsString() @MinLength(3, { message: 'a reason (note) is required for adjustments' })
  note?: string;
}
export class InventoryQueryDto extends PageQueryDto { @IsOptional() @IsMongoId() branchId?: string; }
export class MovementQueryDto extends InventoryQueryDto {
  @IsOptional() @IsMongoId() productId?: string;
  @IsOptional() @IsIn(MOVEMENT_TYPES as unknown as string[]) type?: MovementType;
}
