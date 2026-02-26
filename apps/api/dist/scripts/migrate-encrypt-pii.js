"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const crypto_service_1 = require("../src/common/crypto/crypto.service");
async function main() {
    const prisma = new client_1.PrismaClient();
    const crypto = new crypto_service_1.CryptoService();
    const users = await prisma.user.findMany({
        select: { id: true, email: true, emailHash: true, emailEncrypted: true },
    });
    let updated = 0;
    for (const u of users) {
        if (u.emailHash && u.emailEncrypted)
            continue;
        if (!u.email?.trim())
            continue;
        const emailHash = crypto.hashForLookup(u.email);
        const emailEncrypted = crypto.encrypt(u.email.trim());
        await prisma.user.update({
            where: { id: u.id },
            data: { emailHash, emailEncrypted },
        });
        updated++;
    }
    console.log(`PII migration: ${updated} users updated`);
    await prisma.$disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=migrate-encrypt-pii.js.map