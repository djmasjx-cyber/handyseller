import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WMS_ACCESS_KEY, WmsAccessLevel } from './wms-access.metadata';

function scopeAllows(scopes: string[], level: WmsAccessLevel): boolean {
  if (scopes.includes('*')) return true;
  if (level === 'read') {
    return scopes.includes('wms:read') || scopes.includes('wms:write') || scopes.includes('wms:admin');
  }
  if (level === 'write') {
    return scopes.includes('wms:write') || scopes.includes('wms:admin');
  }
  return scopes.includes('wms:admin');
}

@Injectable()
export class WmsScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as { m2m?: boolean; scopes?: string[] };
    if (!user?.m2m) return true;
    const level =
      this.reflector.getAllAndOverride<WmsAccessLevel>(WMS_ACCESS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'read';
    if (scopeAllows(user.scopes ?? [], level)) return true;
    throw new ForbiddenException('Недостаточно областей доступа (scope) для этого метода WMS API.');
  }
}
