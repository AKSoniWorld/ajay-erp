import { OmitType, PartialType } from '@nestjs/mapped-types';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { INDIAN_MOBILE_REGEX, ROLES, Role } from '@ajay/shared';

export class CreateUserDto {
  @IsString() @MinLength(2) name: string;
  @Matches(INDIAN_MOBILE_REGEX, { message: 'mobile must be a valid 10-digit Indian number' }) mobile: string;
  @IsString() @MinLength(8) password: string;
  @IsIn(ROLES as unknown as string[]) role: Role;
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) branchIds?: string[];
}
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['mobile'] as const)) {
  @IsOptional() @IsBoolean() active?: boolean;
}
