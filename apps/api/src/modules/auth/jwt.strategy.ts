import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '@ajay/shared';
import { env } from '../../config';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private users: UsersService) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: env.JWT_ACCESS_SECRET });
  }
  /** Re-checks the DB each request so deactivation / role or branch changes take effect immediately. */
  async validate(payload: { sub: string }): Promise<AuthUser> {
    const u = await this.users.findActiveById(payload.sub);
    if (!u) throw new UnauthorizedException();
    return { id: String(u._id), name: u.name, role: u.role, branchIds: u.branchIds.map(String) };
  }
}
