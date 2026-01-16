"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateParams = exports.validateQuery = exports.validateBody = void 0;
const zod_1 = require("zod");
const formatZodError = (error) => {
    return error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
    }));
};
const validateBody = (schema) => {
    return (req, res, next) => {
        try {
            req.body = schema.parse(req.body);
            return next();
        }
        catch (err) {
            if (err instanceof zod_1.ZodError) {
                return res.status(400).json({
                    code: 400,
                    message: 'Invalid request body',
                    data: { issues: formatZodError(err), requestId: req.requestId },
                });
            }
            return next(err);
        }
    };
};
exports.validateBody = validateBody;
const validateQuery = (schema) => {
    return (req, res, next) => {
        try {
            req.query = schema.parse(req.query);
            return next();
        }
        catch (err) {
            if (err instanceof zod_1.ZodError) {
                return res.status(400).json({
                    code: 400,
                    message: 'Invalid query params',
                    data: { issues: formatZodError(err), requestId: req.requestId },
                });
            }
            return next(err);
        }
    };
};
exports.validateQuery = validateQuery;
const validateParams = (schema) => {
    return (req, res, next) => {
        try {
            req.params = schema.parse(req.params);
            return next();
        }
        catch (err) {
            if (err instanceof zod_1.ZodError) {
                return res.status(400).json({
                    code: 400,
                    message: 'Invalid route params',
                    data: { issues: formatZodError(err), requestId: req.requestId },
                });
            }
            return next(err);
        }
    };
};
exports.validateParams = validateParams;
