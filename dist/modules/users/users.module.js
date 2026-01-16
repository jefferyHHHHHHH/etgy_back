"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersModule = void 0;
const user_routes_1 = __importDefault(require("../../routes/user.routes"));
exports.usersModule = {
    name: 'users',
    basePath: '/api/users',
    router: user_routes_1.default,
};
exports.default = exports.usersModule;
