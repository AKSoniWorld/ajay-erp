import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PublicQueryDto {
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @IsOptional() @IsMongoId() categoryId?: string;
  @IsOptional() @IsMongoId() subcategoryId?: string;
  @IsOptional() @IsIn(['GOLD', 'SILVER', 'DIAMOND']) metal?: string;
  @IsOptional() @IsMongoId() branchId?: string;                 // only pieces available at this branch
  @IsOptional() @IsIn(['true', 'false']) inStock?: string;       // only pieces available somewhere
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit: number = 24;
}
