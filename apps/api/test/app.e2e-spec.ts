import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET)', () => request(app.getHttpServer()).get('/health').expect(200));

  it('/auth/register (POST) - full flow', async () => {
    const email = `e2e-${Date.now()}@test.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Test123!', name: 'E2E User' })
      .expect(201);

    expect(registerRes.body.accessToken).toBeDefined();
    const cookies = registerRes.headers['set-cookie'];
    expect(cookies).toBeDefined();

    const profileRes = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${registerRes.body.accessToken}`)
      .expect(200);

    expect(profileRes.body.email).toBe(email);

    const searchRes = await request(app.getHttpServer())
      .get('/products/search?q=')
      .set('Authorization', `Bearer ${registerRes.body.accessToken}`)
      .expect(200);
    expect(Array.isArray(searchRes.body)).toBe(true);
    expect(searchRes.body).toHaveLength(0);

    const searchWithQ = await request(app.getHttpServer())
      .get('/products/search?q=test')
      .set('Authorization', `Bearer ${registerRes.body.accessToken}`)
      .expect(200);
    expect(Array.isArray(searchWithQ.body)).toBe(true);

    // sales-sources: GET empty, POST create, GET list, POST upsert
    const listRes = await request(app.getHttpServer())
      .get('/sales-sources')
      .set('Authorization', `Bearer ${registerRes.body.accessToken}`)
      .expect(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body).toHaveLength(0);

    const createRes = await request(app.getHttpServer())
      .post('/sales-sources')
      .set('Authorization', `Bearer ${registerRes.body.accessToken}`)
      .send({ name: 'авито' })
      .expect(201);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.name).toBe('Авито');

    const listAfterRes = await request(app.getHttpServer())
      .get('/sales-sources')
      .set('Authorization', `Bearer ${registerRes.body.accessToken}`)
      .expect(200);
    expect(listAfterRes.body).toHaveLength(1);
    expect(listAfterRes.body[0].name).toBe('Авито');

    const upsertRes = await request(app.getHttpServer())
      .post('/sales-sources')
      .set('Authorization', `Bearer ${registerRes.body.accessToken}`)
      .send({ name: 'АВИТО' })
      .expect(201);
    expect(upsertRes.body.id).toBe(createRes.body.id);
  });
});
