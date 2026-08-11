import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

// Basic, single-team auth: one shared username/password from env, issues a
// JWT on success. No user table, no roles — matches "basic authentication is
// enough" from the assignment. Swap for real user records if this grows
// beyond the assignment's scope.
@Injectable()
export class AuthService {
  constructor(private jwt: JwtService) {}

  login(username: string, password: string) {
    const validUsername = process.env.AUTH_USERNAME ?? 'admin';
    const validPassword = process.env.AUTH_PASSWORD ?? 'change_me';

    if (username !== validUsername || password !== validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.jwt.sign({ sub: username });
    return { accessToken: token };
  }
}