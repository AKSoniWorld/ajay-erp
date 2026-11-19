import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

export class CreateCategoryDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsInt() order?: number;
}
export class CreateSubcategoryDto extends CreateCategoryDto { @IsMongoId() categoryId: string; }
export class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

const METALS = ['GOLD', 'SILVER', 'DIAMOND'];
export class CreateProductDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() @MinLength(2) shortName?: string;
  @IsOptional() @Matches(/^[A-Za-z0-9-]{3,24}$/) sku?: string; // auto-generated when omitted
  @IsMongoId() categoryId: string;
  @IsMongoId() subcategoryId: string;
  @IsIn(METALS) metal: 'GOLD' | 'SILVER' | 'DIAMOND';
  @IsOptional() @IsIn([24, 22, 18]) karat?: 24 | 22 | 18;                       // required for GOLD
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) purityPct?: number; // gold: defaults from karat
  @IsInt() @Min(1) grossMg: number;
  @IsOptional() @IsInt() @Min(0) netMg?: number; // defaults to grossMg
  @IsIn(['PER_GRAM', 'FLAT', 'PERCENT']) makingType: 'PER_GRAM' | 'FLAT' | 'PERCENT';
  @IsInt() @Min(0) makingValue: number;
  @IsOptional() @IsInt() @Min(0) stoneValuePaise?: number;
  @IsOptional() @Matches(/^\d{4,8}$/) hsn?: string;
}
export class UpdateProductDto extends PartialType(CreateProductDto) {
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ProductQueryDto extends PageQueryDto {
  @IsOptional() @IsMongoId() categoryId?: string;
  @IsOptional() @IsMongoId() subcategoryId?: string;
  @IsOptional() @IsIn(METALS) metal?: string;
  @IsOptional() @Type(() => String) @IsIn(['true', 'false']) active?: string;
  @IsOptional() @IsMongoId() branchId?: string;   // adds stockQty for this branch to every item
}
