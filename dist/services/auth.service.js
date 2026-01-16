"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const prisma_1 = require("../config/prisma");
const token_1 = require("../utils/token");
// import { UserRole } from '@prisma/client';
const enums_1 = require("../types/enums");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
class AuthService {
    /**
     * Password-based login
     */
    static async login(username, password, role) {
        // 1. Find User
        const user = await prisma_1.prisma.user.findUnique({
            where: { username },
        });
        if (!user) {
            throw new Error('User not found');
        }
        // 2. Optional strict check if role is provided by client
        if (role && user.role !== role) {
            throw new Error('Role mismatch');
        }
        // 3. Validate Password
        const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!ok) {
            throw new Error('Invalid credentials');
        }
        // 4. Generate Token
        const token = (0, token_1.generateToken)({
            userId: user.id,
            role: user.role,
            username: user.username,
        });
        return { token, user };
    }
    /**
     * Register base user (Dev helper).
     */
    static async register(username, password, role) {
        // Check if exists
        const existing = await prisma_1.prisma.user.findUnique({
            where: { username },
        });
        if (existing) {
            throw new Error('Username already exists');
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        // Create User
        const user = await prisma_1.prisma.user.create({
            data: {
                username,
                passwordHash,
                role,
                status: enums_1.UserStatus.ACTIVE,
            },
        });
        return user;
    }
}
exports.AuthService = AuthService;
