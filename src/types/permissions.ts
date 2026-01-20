import { UserRole } from './enums';

/**
 * Fine-grained permission points (PRD: video.create, video.review, live.apply.review ...).
 *
 * We keep this as a string union to stay flexible and avoid Prisma migrations at this stage.
 */
export enum Permission {
  // Colleges / org
  COLLEGE_MANAGE = 'college.manage',

  // Dashboard & audit
  DASHBOARD_VIEW = 'dashboard.view',
  AUDIT_VIEW = 'audit.view',

  // Users
  USER_CHILD_CREATE = 'user.child.create',
  USER_CHILD_VIEW = 'user.child.view',
  USER_CHILD_MANAGE = 'user.child.manage',
  USER_VOLUNTEER_CREATE = 'user.volunteer.create',
  USER_VOLUNTEER_MANAGE = 'user.volunteer.manage',
  USER_COLLEGE_ADMIN_CREATE = 'user.collegeAdmin.create',
  USER_COLLEGE_ADMIN_MANAGE = 'user.collegeAdmin.manage',

  // Videos
  VIDEO_CREATE = 'video.create',
  VIDEO_EDIT = 'video.edit',
  VIDEO_DELETE = 'video.delete',
  VIDEO_SUBMIT = 'video.submit',
  VIDEO_REVIEW = 'video.review',
  VIDEO_PUBLISH = 'video.publish',
  VIDEO_OFFLINE = 'video.offline',

  // Comments (optional feature in PRD)
  COMMENT_REVIEW = 'comment.review',

  // Live
  LIVE_CREATE = 'live.create',
  LIVE_SUBMIT = 'live.submit',
  LIVE_REVIEW = 'live.review',
  LIVE_OFFLINE = 'live.offline',
}

export const rolePermissions: Record<UserRole, Set<Permission>> = {
  [UserRole.CHILD]: new Set<Permission>([]),

  [UserRole.VOLUNTEER]: new Set<Permission>([
    Permission.VIDEO_CREATE,
    Permission.VIDEO_EDIT,
    Permission.VIDEO_DELETE,
    Permission.VIDEO_SUBMIT,
    Permission.VIDEO_PUBLISH,
    Permission.VIDEO_OFFLINE,
    Permission.LIVE_CREATE,
    Permission.LIVE_SUBMIT,
  ]),

  [UserRole.COLLEGE_ADMIN]: new Set<Permission>([
    Permission.DASHBOARD_VIEW,
    Permission.AUDIT_VIEW,
    Permission.USER_VOLUNTEER_CREATE,
    Permission.USER_VOLUNTEER_MANAGE,
    Permission.VIDEO_REVIEW,
    Permission.VIDEO_OFFLINE,
    Permission.COMMENT_REVIEW,
    Permission.LIVE_REVIEW,
    Permission.LIVE_OFFLINE,
  ]),

  [UserRole.PLATFORM_ADMIN]: new Set<Permission>([
    Permission.DASHBOARD_VIEW,
    Permission.AUDIT_VIEW,
    Permission.COLLEGE_MANAGE,
    Permission.USER_CHILD_CREATE,
    Permission.USER_CHILD_VIEW,
    Permission.USER_CHILD_MANAGE,
    Permission.USER_COLLEGE_ADMIN_CREATE,
    Permission.USER_COLLEGE_ADMIN_MANAGE,
    Permission.USER_VOLUNTEER_CREATE,
    Permission.USER_VOLUNTEER_MANAGE,
    Permission.VIDEO_OFFLINE,
    Permission.COMMENT_REVIEW,
    Permission.LIVE_OFFLINE,
  ]),
};

export const hasPermissions = (role: UserRole, required: Permission[]) => {
  const granted = rolePermissions[role] ?? new Set<Permission>();
  return required.every((p) => granted.has(p));
};
