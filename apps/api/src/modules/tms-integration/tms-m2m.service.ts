import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateTmsM2mClientDto } from './dto/create-tms-m2m-client.dto';

const DEFAULT_SCOPES = ['tms:read', 'tms:write'] as const;

@Injectable()
export class TmsM2mService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private hashSecret(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex');
  }

  private generateClientSecret(): string {
    return `hs_tms_${randomBytes(32).toString('base64url')}`;
  }

  private parseScopes(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [...DEFAULT_SCOPES];
    return raw.filter((x): x is string => typeof x === 'string');
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.tmsM2mClient.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      publicId: r.publicId,
      label: r.label,
      scopes: this.parseScopes(r.scopes),
      revokedAt: r.revokedAt?.toISOString() ?? null,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async createForUser(userId: string, dto: CreateTmsM2mClientDto) {
    const scopes = dto.scopes?.length ? [...new Set(dto.scopes)] : [...DEFAULT_SCOPES];
    const publicId = randomUUID();
    const clientSecret = this.generateClientSecret();
    const secretHash = this.hashSecret(clientSecret);

    const row = await this.prisma.tmsM2mClient.create({
      data: {
        userId,
        label: dto.label?.trim() || null,
        publicId,
        secretHash,
        scopes,
      },
    });

    return {
      id: row.id,
      client_id: row.publicId,
      client_secret: clientSecret,
      label: row.label,
      scopes: this.parseScopes(row.scopes),
      created_at: row.createdAt.toISOString(),
    };
  }

  async revoke(userId: string, id: string): Promise<void> {
    const row = await this.prisma.tmsM2mClient.findFirst({ where: { id, userId } });
    if (!row) {
      throw new BadRequestException('Интеграция не найдена');
    }
    await this.prisma.tmsM2mClient.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
  }

  async exchangeClientCredentials(clientId: string, clientSecret: string) {
    const trimmedSecret = clientSecret.trim();
    if (!clientId || !trimmedSecret) {
      throw new UnauthorizedException('Неверные учётные данные клиента');
    }

    const row = await this.prisma.tmsM2mClient.findUnique({
      where: { publicId: clientId },
    });
    if (!row || row.revokedAt) {
      throw new UnauthorizedException('Неверные учётные данные клиента');
    }

    const expectedHash = this.hashSecret(trimmedSecret);
    if (expectedHash !== row.secretHash) {
      throw new UnauthorizedException('Неверные учётные данные клиента');
    }

    const scopes = this.parseScopes(row.scopes);
    const expiresIn = this.config.get<string>('TMS_M2M_TOKEN_EXPIRES_IN')?.trim() || '1h';
    const accessToken = this.jwtService.sign(
      {
        sub: row.userId,
        typ: 'tms_m2m',
        scope: scopes.join(' '),
        cid: row.publicId,
      },
      { expiresIn },
    );

    const expSec = this.jwtExpirySeconds(expiresIn);
    await this.prisma.tmsM2mClient.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expSec,
      scope: scopes.join(' '),
    };
  }

  /** Документация OpenAPI (без секретов). */
  getOpenApiYaml(): string {
    return TMS_EXTERNAL_OPENAPI_YAML;
  }

  private jwtExpirySeconds(expiresIn: string): number {
    const m = /^(\d+)([smhd])?$/i.exec(expiresIn.trim());
    if (!m) return 3600;
    const n = Number(m[1]);
    const u = (m[2] ?? 's').toLowerCase();
    const mult = u === 'd' ? 86400 : u === 'h' ? 3600 : u === 'm' ? 60 : 1;
    return Math.max(60, n * mult);
  }
}

const TMS_EXTERNAL_OPENAPI_YAML = String.raw`openapi: 3.0.3
info:
  title: HandySeller TMS External API
  version: 1.0.0
  description: |
    Machine-to-machine доступ к TMS через OAuth2 **client_credentials**.
    Базовый URL совпадает с вашим API HandySeller (префикс \`/api\`).

    Поток:
    1. В личном кабинете создайте интеграцию (получите \`client_id\` и \`client_secret\` один раз).
    2. \`POST /api/tms/oauth/token\` — обмен на короткоживущий JWT.
    3. Запросы к \`/api/tms/...\` на сервис tms-api (через тот же хост, что и веб-приложение) с \`Authorization: Bearer <access_token>\`.

servers:
  - url: https://api.handyseller.ru/api
    description: Production
  - url: http://localhost:4000/api
    description: Local API

paths:
  /tms/oauth/token:
    post:
      summary: Получить access token (client_credentials)
      tags: [OAuth2]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [grant_type, client_id, client_secret]
              properties:
                grant_type:
                  type: string
                  enum: [client_credentials]
                client_id:
                  type: string
                  format: uuid
                client_secret:
                  type: string
      responses:
        '200':
          description: Токен выдан
          content:
            application/json:
              schema:
                type: object
                properties:
                  access_token: { type: string }
                  token_type: { type: string, example: Bearer }
                  expires_in: { type: integer }
                  scope: { type: string }
        '401':
          description: Неверный client_id / client_secret

  /tms/overview:
    get:
      summary: Сводка TMS
      tags: [TMS]
      security: [bearerAuth]
      responses:
        '200':
          description: OK

  /tms/client-orders:
    get:
      summary: Заказы клиентов (TMS)
      tags: [TMS]
      security: [bearerAuth]

  /tms/shipment-requests:
    get:
      summary: Список заявок на перевозку
      tags: [TMS]
      security: [bearerAuth]
    post:
      summary: Создать заявку из заказа (scope tms:write)
      tags: [TMS]
      security: [bearerAuth]

  /tms/shipment-requests/{id}/quotes:
    get:
      summary: Котировки по заявке
      tags: [TMS]
      security: [bearerAuth]

  /tms/shipment-requests/{id}/quotes/refresh:
    post:
      summary: Обновить котировки (scope tms:write)
      tags: [TMS]
      security: [bearerAuth]

  /tms/shipment-requests/{id}/select-quote:
    post:
      summary: Выбрать котировку (scope tms:write)
      tags: [TMS]
      security: [bearerAuth]

  /tms/shipments:
    get:
      summary: Список перевозок
      tags: [TMS]
      security: [bearerAuth]

  /tms/shipments/{id}/tracking:
    get:
      summary: Трекинг перевозки
      tags: [TMS]
      security: [bearerAuth]

  /tms/shipments/{id}/documents:
    get:
      summary: Документы перевозки
      tags: [TMS]
      security: [bearerAuth]

  /tms/carriers:
    get:
      summary: Справочник перевозчиков
      tags: [TMS]
      security: [bearerAuth]

  /tms/routing-policies:
    get:
      summary: Политики маршрутизации
      tags: [TMS]
      security: [bearerAuth]

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
`;
