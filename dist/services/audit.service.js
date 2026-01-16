"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const server_1 = require("../server");
class AuditService {
    /**
     * Log an operational action
     */
    static async log(operatorId, action, targetId, targetType, detail, ip) {
        try {
            await server_1.prisma.auditLog.create({
                data: {
                    operatorId,
                    action,
                    targetId: targetId ? String(targetId) : null,
                    targetType,
                    detail,
                    clientIp: ip
                }
            });
        }
        catch (error) {
            console.error('Failed to create audit log:', error);
            // Non-blocking failure for audit logs usually
        }
    }
}
exports.AuditService = AuditService;
