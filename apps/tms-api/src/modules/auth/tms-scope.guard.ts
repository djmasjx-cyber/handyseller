import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TMS_ACCESS_KEY, TmsAccessLevel } from './tms-access.metadata';

function scopeAllows(scopes: string[], level: TmsAccessLevel): boolean {
  if (scopes.includes('*')) return true;
  if (level === 'read') {
    return scopes.includes('tms:read') || scopes.includes('tms:write');
  }
  return scopes.includes('tms:write');
}

@Injectable()
export class TmsScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as { m2m?: boolean; scopes?: string[] };
    if (!user?.m2m) return true;
    const level =
      this.reflector.getAllAndOverride<TmsAccessLevel>(TMS_ACCESS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'read';
    const scopes = user.scopes ?? [];
    if (scopeAllows(scopes, level)) return true;
    throw new ForbiddenException(
      'Недостаточно областей доступа (scope) для этого метода TMS API.',
    );
  }
}
