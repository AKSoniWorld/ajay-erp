import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { TRANSFER_STATUSES } from '../transfer.schema';

export class TransferItemDto {
  @IsMongoId() productId: string;
  @IsInt() @Min(1) @Max(1000) qty: number;
}
export class CreateTransferDto {
  @IsMongoId() fromBranchId: string;
  @IsMongoId() toBranchId: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => TransferItemDto) items: TransferItemDto[];
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class TransferNoteDto { @IsOptional() @IsString() @MaxLength(200) note?: string; }
export class TransferReasonDto { @IsString() @MinLength(3) @MaxLength(200) reason: string; }
export class TransferQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(TRANSFER_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @IsMongoId() branchId?: string;   // either side of the transfer
}
