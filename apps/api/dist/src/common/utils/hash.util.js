"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.comparePassword = comparePassword;
const bcrypt = require("bcrypt");
const SALT_ROUNDS = 12;
async function hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
}
async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}
//# sourceMappingURL=hash.util.js.map