import { prisma } from '../server';
import { AuditAction } from '../types/enums';

export class AuditService {
  /**
   * Log an operational action
   */
  static async log(
    operatorId: number, 
    action: AuditAction, 
    targetId?: string, 
    targetType?: string, 
    detail?: string,
    ip?: string
  ) {
    try {
      await prisma.auditLog.create({
        data: {
          operatorId,
          action,
          targetId: targetId ? String(targetId) : null,
          targetType,
          detail,
          clientIp: ip
        }
      });
    } catch (error) {
      console.error('Failed to create audit log:', error);
      // Non-blocking failure for audit logs usually
    }
  }
}
