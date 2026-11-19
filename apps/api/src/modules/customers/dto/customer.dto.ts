import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { INDIAN_MOBILE_REGEX } from '@ajay/shared';

export class CreateCustomerDto {
  @IsString() @MinLength(2) name: string;
  @Matches(INDIAN_MOBILE_REGEX, { message: 'mobile must be a valid 10-digit Indian number' }) mobile: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}
