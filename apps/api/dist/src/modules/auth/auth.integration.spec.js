"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const request = require("supertest");
const cookieParser = require('cookie-parser');
const app_module_1 = require("../../app.module");
const prisma_service_1 = require("../../common/database/prisma.service");
describe('Auth (integration)', () => {
    let app;
    let prisma;
    beforeAll(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        app.use(cookieParser());
        app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(prisma_service_1.PrismaService);
    });
    afterAll(async () => {
        await app.close();
    });
    const cleanUser = async (email) => {
        await prisma.user.deleteMany({ where: { email } }).catch(() => { });
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
//# sourceMappingURL=auth.integration.spec.js.map