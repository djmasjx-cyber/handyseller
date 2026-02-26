"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = () => ({
    jwt: {
        secret: process.env.JWT_SECRET ?? 'change-me-in-production',
        expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    },
    jwtRefresh: {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    },
});
//# sourceMappingURL=security.config.js.map