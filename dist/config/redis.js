"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("./env");
const redisClient = new ioredis_1.default({
    host: env_1.env.REDIS_HOST,
    port: env_1.env.REDIS_PORT,
    password: env_1.env.REDIS_PASSWORD || undefined,
    lazyConnect: true // Connect manually or on first use
});
redisClient.on('connect', () => {
    console.log('✅ Redis connected');
});
redisClient.on('error', (err) => {
    console.error('❌ Redis error:', err);
});
exports.default = redisClient;
