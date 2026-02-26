"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = require("dotenv");
const path = require("path");
const client_1 = require("@prisma/client");
const bcrypt = require("bcrypt");
const crypto_service_1 = require("../src/common/crypto/crypto.service");
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.secrets'), override: true });
const prisma = new client_1.PrismaClient();
const crypto = new crypto_service_1.CryptoService();
async function main() {
    const email = process.env.ADMIN_EMAIL?.trim();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
        throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set (e.g. in .env or .env.secrets)');
    }
    const emailNorm = email.toLowerCase();
    const emailHash = crypto.hashForLookup(email);
    const emailEncrypted = crypto.encrypt(emailNorm);
    const passwordHash = await bcrypt.hash(password, 10);
    const encryptedName = crypto.encryptOptional('Администратор');
    let user = await prisma.user.findFirst({
        where: { OR: [{ emailHash }, { email: emailNorm }] },
    });
    if (user) {
        user = await prisma.user.update({
            where: { id: user.id },
            data: { role: 'ADMIN', passwordHash, emailHash, emailEncrypted },
        });
    }
    else {
        user = await prisma.user.create({
            data: {
                emailHash,
                emailEncrypted,
                passwordHash,
                name: encryptedName,
                role: 'ADMIN',
                subscription: { create: { plan: 'FREE' } },
            },
        });
    }
    const displayEmail = user.emailEncrypted ? crypto.decrypt(user.emailEncrypted) : user.email;
    console.log('Seed OK:', displayEmail, 'role:', user.role);
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=seed-database.js.map