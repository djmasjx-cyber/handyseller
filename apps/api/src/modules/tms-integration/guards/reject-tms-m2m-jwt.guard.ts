import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/** Запрещает доступ по M2M JWT (только интерактивная сессия ЛК). */
@Injectable()
export class RejectTmsM2mJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as { tokenTyp?: string };
    if (user?.tokenTyp === 'tms_m2m') {
      throw new ForbiddenException(
        'Этот ресурс доступен только из личного кабинета, не по токену внешней интеграции.',
      );
    }
    return true;
  }
}
