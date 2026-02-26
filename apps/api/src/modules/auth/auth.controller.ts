import { Body, Controller, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { LoggerService } from '../../common/logger/logger.service';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_MAX_AGE_DAYS = 7 * 24 * 60 * 60 * 1000; // 7 дней в мс

function getClientIp(req: Request): string | undefined {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket?.remoteAddress
  );
}

function getCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict' as const,
    maxAge: REFRESH_MAX_AGE_DAYS,
    path: '/',
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private logger: LoggerService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'];
    try {
      const result = await this.authService.register(dto, ip, userAgent);
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getCookieOptions(process.env.NODE_ENV === 'production'));
      return { accessToken: result.accessToken, user: result.user };
    } catch (err) {
      this.logger.error('Register failed', {
        ip,
        email: dto.email,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'];

    try {
      const result = await this.authService.login(dto.email, dto.password, ip, userAgent);
      if (!result) throw new UnauthorizedException('Неверный email или пароль');

      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getCookieOptions(process.env.NODE_ENV === 'production'));
      return { accessToken: result.accessToken, user: result.user };
    } catch (e) {
      if (e instanceof Error && e.message === 'BLOCKED') {
        throw new UnauthorizedException('Слишком много неудачных попыток. Попробуйте через 15 минут.');
      }
      throw e;
    }
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'];

    const result = await this.authService.refresh(token, ip, userAgent);
    if (!result) throw new UnauthorizedException('Сессия истекла. Войдите снова.');

    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getCookieOptions(process.env.NODE_ENV === 'production'));
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'];

    await this.authService.logout(token, undefined, ip, userAgent);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/', httpOnly: true });
    return { success: true };
  }
}
