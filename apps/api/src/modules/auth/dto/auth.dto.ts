import { IsString, Matches, MinLength } from 'class-validator';
import { INDIAN_MOBILE_REGEX } from '@ajay/shared';

export class LoginDto {
  @Matches(INDIAN_MOBILE_REGEX) mobile: string;
  @IsString() @MinLength(1) password: string;
}
export class RefreshDto { @IsString() @MinLength(10) refreshToken: string; }
