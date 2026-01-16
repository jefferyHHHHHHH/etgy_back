"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const auth_service_1 = require("../services/auth.service");
class AuthController {
    static async login(req, res) {
        try {
            const { username, role } = req.body;
            if (!username || !role) {
                return res.status(400).json({ code: 400, message: 'Missing username or role' });
            }
            const result = await auth_service_1.AuthService.login(username, role);
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
            const { username, role } = req.body;
            // In real scenario, would handle profile creation here too
            const user = await auth_service_1.AuthService.register(username, role);
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
}
exports.AuthController = AuthController;
