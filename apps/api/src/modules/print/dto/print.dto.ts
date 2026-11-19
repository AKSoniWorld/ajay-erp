import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsMongoId, IsOptional, Max, Min, ValidateNested } from 'class-validator';

export class TagItemDto {
  @IsMongoId() productId: string;
  @IsOptional() @IsInt() @Min(1) @Max(50) copies?: number;
}
export class TagPrintDto {
  @IsMongoId() branchId: string;                       // printer config + branch name on the tag
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => TagItemDto) items: TagItemDto[];
  @IsOptional() @IsIn(['ESCPOS', 'TSPL']) language?: 'ESCPOS' | 'TSPL';   // overrides the branch setting
  @IsOptional() @IsIn(['40x25', '50x25']) tagSize?: '40x25' | '50x25';
}
export class TagTestDto {
  @IsMongoId() branchId: string;
  @IsOptional() @IsIn(['ESCPOS', 'TSPL']) language?: 'ESCPOS' | 'TSPL';
  @IsOptional() @IsIn(['40x25', '50x25']) tagSize?: '40x25' | '50x25';
}
export class PdfQueryDto {
  @IsOptional() @IsIn(['1', 'true']) download?: string;
  @IsOptional() @IsIn(['A4', 'A5']) size?: 'A4' | 'A5';      // overrides the branch's default paper for this print
}
