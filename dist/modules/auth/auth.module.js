"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authModule = void 0;
const auth_routes_1 = __importDefault(require("../../routes/auth.routes"));
exports.authModule = {
    name: 'auth',
    basePath: '/api/auth',
    router: auth_routes_1.default,
};
exports.default = exports.authModule;
