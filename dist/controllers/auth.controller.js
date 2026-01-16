"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const auth_service_1 = require("../services/auth.service");
const redis_1 = __importDefault(require("../config/redis"));
const token_1 = require("../utils/token");
class AuthController {
    static async login(req, res) {
        try {
            const { username, password, role } = req.body;
            if (!username || !password) {
                return res.status(400).json({ code: 400, message: 'Missing username or password' });
            }
            const result = await auth_service_1.AuthService.login(username, password, role);
            res.json({
                code: 200,
                message: 'Login success',
                data: result,
            });
        }
        catch (error) {
            res.status(401).json({ code: 401, message: error.message || 'Login failed' });
        }
    }
    static async register(req, res) {
        try {
            const { username, password, role } = req.body;
            // In real scenario, would handle profile creation here too
            if (!username || !password || !role) {
                return res.status(400).json({ code: 400, message: 'Missing username, password, or role' });
            }
            const user = await auth_service_1.AuthService.register(username, password, role);
            res.json({
                code: 201,
                message: 'Register success',
                data: user,
            });
        }
        catch (error) {
            res.status(400).json({ code: 400, message: error.message || 'Register failed' });
        }
    }
    static async logout(req, res) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(400).json({ code: 400, message: 'Missing Bearer token' });
        }
        const token = authHeader.split(' ')[1];
        const ttl = (0, token_1.getTokenTtlSeconds)(token);
        try {
            if (ttl > 0 && redis_1.default.status === 'ready') {
                await redis_1.default.set(`blacklist:${token}`, '1', 'EX', ttl);
            }
            return res.json({ code: 200, message: 'Logout success' });
        }
        catch (error) {
            // Fail-open: client can discard token even if we cannot blacklist.
            return res.json({ code: 200, message: 'Logout success (blacklist unavailable)' });
        }
    }
}
exports.AuthController = AuthController;
