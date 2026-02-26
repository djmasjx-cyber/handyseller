import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');
import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/database/prisma.service';

describe('Auth (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const cleanUser = async (email: string) => {
    await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  };

  describe('POST /auth/register', () => {
    const email = `test-${Date.now()}@example.com`;

    afterAll(() => cleanUser(email));

    it('should register and return accessToken', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'password123', name: 'Test' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(email);
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject invalid email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-email', password: 'pass123' })
        .expect(400);
    });

    it('should reject short password', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'a@b.com', password: '123' })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    const email = `login-${Date.now()}@example.com`;

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'secret123', name: 'User' });
    });

    afterAll(() => cleanUser(email));

    it('should login and return tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'secret123' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(email);
    });

    it('should reject wrong password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'wrong' })
        .expect(401);
    });
  });

  describe('GET /health', () => {
    it('should return 200', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
    });
  });
});
