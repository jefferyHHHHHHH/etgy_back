"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fail = exports.ok = void 0;
const ok = (res, data, message = 'Success', code = 200) => {
    return res.status(code).json({ code, message, data });
};
exports.ok = ok;
const fail = (res, message, code = 400, data) => {
    return res.status(code).json({ code, message, data: data ?? null });
};
exports.fail = fail;
