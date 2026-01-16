"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
// import OSS from 'ali-oss'; // Example dependency if using Aliyun
dotenv_1.default.config();
class OssService {
    constructor() {
        // Initialize OSS client here
    }
    async getUploadSignature() {
        // Return STS or presigned URL
        return {
            accessKeyId: process.env.OSS_ACCESS_KEY_ID,
            policy: 'todo',
            signature: 'todo'
        };
    }
    async deleteFile(key) {
        // Delete logic
        return true;
    }
}
exports.default = new OssService();
