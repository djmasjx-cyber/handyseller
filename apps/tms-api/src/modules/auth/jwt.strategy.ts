import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');
    if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
      throw new Error('JWT_SECRET required in production (min 32 chars)');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret ?? 'dev-only-jwt-secret-change-me',
    });
  }

  validate(payload: {
    sub: string;
    email?: string;
    role?: string;
    typ?: string;
    scope?: string;
    cid?: string;
  }) {
    if (payload.typ === 'tms_m2m') {
      const scopes = (payload.scope ?? '').split(/\s+/).filter(Boolean);
      return {
        userId: payload.sub,
        m2m: true,
        scopes,
        clientId: payload.cid,
      };
    }
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      m2m: false,
      scopes: ['*'],
      clientId: undefined,
    };
  }
}
