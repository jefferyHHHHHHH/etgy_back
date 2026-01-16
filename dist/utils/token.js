"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenTtlSeconds = exports.verifyToken = exports.generateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_please_change';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const generateToken = (payload) => {
    return jsonwebtoken_1.default.sign({ ...payload }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
    });
};
exports.generateToken = generateToken;
const verifyToken = (token) => {
    return jsonwebtoken_1.default.verify(token, JWT_SECRET);
};
exports.verifyToken = verifyToken;
const getTokenTtlSeconds = (token) => {
    const decoded = jsonwebtoken_1.default.decode(token);
    if (!decoded?.exp) {
        // Fallback: 7 days
        return 7 * 24 * 60 * 60;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    return Math.max(decoded.exp - nowSeconds, 0);
};
exports.getTokenTtlSeconds = getTokenTtlSeconds;
