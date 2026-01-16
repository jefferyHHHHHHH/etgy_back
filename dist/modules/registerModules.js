"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerModules = void 0;
const auth_module_1 = __importDefault(require("./auth/auth.module"));
const users_module_1 = __importDefault(require("./users/users.module"));
const videos_module_1 = __importDefault(require("./videos/videos.module"));
const modules = [auth_module_1.default, users_module_1.default, videos_module_1.default];
const registerModules = (app) => {
    for (const mod of modules) {
        app.use(mod.basePath, mod.router);
    }
};
exports.registerModules = registerModules;
