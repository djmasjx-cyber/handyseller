import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

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
    if (payload.typ === 'wms_m2m') {
      return {
        userId: payload.sub,
        m2m: true,
        scopes: (payload.scope ?? '').split(/\s+/).filter(Boolean),
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
