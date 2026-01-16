"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loggerMiddleware = void 0;
const pino_http_1 = __importDefault(require("pino-http"));
const logger_1 = require("../config/logger");
const crypto_1 = require("crypto");
exports.loggerMiddleware = (0, pino_http_1.default)({
    logger: logger_1.logger,
    quietReqLogger: true,
    genReqId: (req, res) => {
        // We already set x-request-id in requestIdMiddleware; reuse it.
        const existing = req.requestId;
        const fromHeader = req.headers['x-request-id'];
        return existing || fromHeader || (0, crypto_1.randomUUID)();
    },
    customProps: (req) => ({
        requestId: req.requestId,
        userId: req.user?.userId,
    }),
});
