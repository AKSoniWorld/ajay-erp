import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { isValidObjectId } from 'mongoose';
import { env } from '../../config';
import { AuditService } from '../audit/audit.service';
import { RefreshToken, UsersService } from '../users/users.service';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const MAX_SESSIONS = 5;

@Injectable()
export class AuthService {
  constructor(private users: UsersService, private jwt: JwtService, private audit: AuditService) {}

  async login(mobile: string, password: string, ip?: string) {
    const user = await this.users.findByMobileWithSecrets(mobile);
    const ok = !!user && user.active && (await argon2.verify(user.passwordHash, password));
    if (!ok) {
      await this.audit.log({ action: 'LOGIN_FAILED', entity: 'Auth', entityId: user ? String(user._id) : undefined, after: { mobile }, ip });
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.audit.log({ actorId: String(user._id), role: user.role, action: 'LOGIN', entity: 'Auth', entityId: String(user._id), ip });
    return this.issue(user, true);
  }

  /** Rotating refresh tokens with reuse detection: replaying a used token revokes all sessions. */
  async refresh(token: string, ip?: string) {
    const dot = token.indexOf('.');
    const id = token.slice(0, dot), raw = token.slice(dot + 1);
    if (dot < 0 || !isValidObjectId(id)) throw new UnauthorizedException();
    const user = await this.users.findByIdWithSecrets(id);
    if (!user || !user.active) throw new UnauthorizedException();
    const hash = sha256(raw);
    const idx = user.refreshTokens.findIndex(t => t.hash === hash);
    if (idx < 0) {
      await this.users.setRefreshTokens(id, []);
      await this.audit.log({ actorId: id, action: 'REFRESH_REUSE_DETECTED', entity: 'Auth', entityId: id, ip });
      throw new UnauthorizedException('Session revoked');
    }
    const entry = user.refreshTokens[idx];
    user.refreshTokens.splice(idx, 1);
    if (entry.expiresAt < new Date()) { await this.users.setRefreshTokens(id, user.refreshTokens); throw new UnauthorizedException(); }
    return this.issue(user);
  }

  async logout(token: string) {
    const dot = token.indexOf('.');
    const id = token.slice(0, dot);
    if (dot < 0 || !isValidObjectId(id)) return;
    const user = await this.users.findByIdWithSecrets(id);
    if (!user) return;
    const hash = sha256(token.slice(dot + 1));
    await this.users.setRefreshTokens(id, user.refreshTokens.filter(t => t.hash !== hash));
  }

  private async issue(user: { _id: unknown; name: string; role: string; branchIds: unknown[]; refreshTokens?: RefreshToken[] }, markLogin = false) {
    const id = String(user._id);
    const accessToken = this.jwt.sign({ sub: id, role: user.role, name: user.name, branchIds: user.branchIds.map(String) });
    const raw = randomBytes(48).toString('base64url');
    const now = new Date();
    const kept = (user.refreshTokens ?? []).filter(t => t.expiresAt > now).slice(-(MAX_SESSIONS - 1));
    kept.push({ hash: sha256(raw), expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 86_400_000) });
    await this.users.setRefreshTokens(id, kept, markLogin);
    return { accessToken, refreshToken: `${id}.${raw}`, expiresIn: env.ACCESS_TTL };
  }
}
