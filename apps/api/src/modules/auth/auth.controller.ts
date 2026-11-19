import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '@ajay/shared';
import { env } from '../../config';
import { CurrentUser, Public, SkipAudit } from '../../common/decorators';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto/auth.dto';

// Login/refresh write their own audit rows inside AuthService.
@Controller('auth')
export class AuthController {
  constructor(private svc: AuthService) {}

  @Public() @SkipAudit() @HttpCode(200)
  @Throttle({ default: { limit: env.LOGIN_RATE_LIMIT, ttl: 60_000 } })
  @Post('login') login(@Body() dto: LoginDto, @Req() req: any) { return this.svc.login(dto.mobile, dto.password, req.ip); }

  @Public() @SkipAudit() @HttpCode(200)
  @Throttle({ default: { limit: env.LOGIN_RATE_LIMIT * 4, ttl: 60_000 } })
  @Post('refresh') refresh(@Body() dto: RefreshDto, @Req() req: any) { return this.svc.refresh(dto.refreshToken, req.ip); }

  @Public() @SkipAudit() @HttpCode(204)
  @Post('logout') async logout(@Body() dto: RefreshDto) { await this.svc.logout(dto.refreshToken); }

  @Get('me') me(@CurrentUser() u: AuthUser) { return u; }
}
