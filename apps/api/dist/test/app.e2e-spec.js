"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const request = require("supertest");
const cookieParser = require('cookie-parser');
const app_module_1 = require("../src/app.module");
describe('AppController (e2e)', () => {
    let app;
    beforeAll(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        app.use(cookieParser());
        app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
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
    });
});
//# sourceMappingURL=app.e2e-spec.js.map