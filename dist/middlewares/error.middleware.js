"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.notFoundHandler = void 0;
const client_1 = require("@prisma/client");
const httpError_1 = require("../utils/httpError");
const logger_1 = require("../config/logger");
const notFoundHandler = (req, res) => {
    res.status(404).json({
        code: 404,
        message: 'Not Found',
        data: {
            path: req.originalUrl,
            method: req.method,
            requestId: req.requestId,
        },
    });
};
exports.notFoundHandler = notFoundHandler;
const errorHandler = (err, req, res, _next) => {
    // Prisma errors → map to user-friendly messages
    if (err instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        // e.g. P2002 unique constraint
        if (err.code === 'P2002') {
            return res.status(409).json({
                code: 409,
                message: 'Conflict: duplicate value',
                data: { requestId: req.requestId },
            });
        }
        return res.status(400).json({
            code: 400,
            message: 'Database error',
            data: { requestId: req.requestId, prismaCode: err.code },
        });
    }
    if (err instanceof httpError_1.HttpError) {
        return res.status(err.statusCode).json({
            code: err.statusCode,
            message: err.message,
            data: { requestId: req.requestId, errorCode: err.code ?? null },
        });
    }
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    logger_1.logger.error({ err, requestId: req.requestId }, 'Unhandled error');
    return res.status(500).json({
        code: 500,
        message,
        data: { requestId: req.requestId },
    });
};
exports.errorHandler = errorHandler;
