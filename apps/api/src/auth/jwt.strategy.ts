import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change_me',
    });
  }

  // Basic auth per the assignment's explicit "basic authentication is
  // enough" — no roles/permissions, just a valid-token check.
  async validate(payload: { sub: string }) {
    return { userId: payload.sub };
  }
}