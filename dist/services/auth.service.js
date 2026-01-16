"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const server_1 = require("../server");
const token_1 = require("../utils/token");
// import bcrypt from 'bcrypt'; // TODO: Install bcrypt
class AuthService {
    /**
     * Mock Login for MVP (Real implementation needs bcrypt comparison)
     */
    static async login(username, role) {
        // 1. Find User
        const user = await server_1.prisma.user.findUnique({
            where: { username },
        });
        if (!user) {
            throw new Error('User not found');
        }
        // 2. Validate Role (Optional strict check)
        if (user.role !== role) {
            throw new Error('Role mismatch');
        }
        // 3. Generate Token
        const token = (0, token_1.generateToken)({
            userId: user.id,
            role: user.role,
            username: user.username,
        });
        return { token, user };
    }
    /**
     * Mock Register for MVP (Just creates base user)
     */
    static async register(username, role) {
        // Check if exists
        const existing = await server_1.prisma.user.findUnique({
            where: { username },
        });
        if (existing) {
            throw new Error('Username already exists');
        }
        // Create User
        const user = await server_1.prisma.user.create({
            data: {
                username,
                passwordHash: 'hashed_password_placeholder', // TODO: Use bcrypt
                role,
                status: 'ACTIVE',
            },
        });
        return user;
    }
}
exports.AuthService = AuthService;
