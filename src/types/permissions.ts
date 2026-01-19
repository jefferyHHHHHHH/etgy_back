import { UserRole } from './enums';

/**
 * Fine-grained permission points (PRD: video.create, video.review, live.apply.review ...).
 *
 * We keep this as a string union to stay flexible and avoid Prisma migrations at this stage.
 */
export enum Permission {
  // Colleges / org
  COLLEGE_MANAGE = 'college.manage',

  // Users
  USER_CHILD_CREATE = 'user.child.create',
  USER_VOLUNTEER_CREATE = 'user.volunteer.create',
  USER_COLLEGE_ADMIN_CREATE = 'user.collegeAdmin.create',

  // Videos
  VIDEO_CREATE = 'video.create',
  VIDEO_SUBMIT = 'video.submit',
  VIDEO_REVIEW = 'video.review',
  VIDEO_PUBLISH = 'video.publish',
  VIDEO_OFFLINE = 'video.offline',

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
    Permission.VIDEO_SUBMIT,
    Permission.VIDEO_PUBLISH,
    Permission.VIDEO_OFFLINE,
    Permission.LIVE_CREATE,
    Permission.LIVE_SUBMIT,
  ]),

  [UserRole.COLLEGE_ADMIN]: new Set<Permission>([
    Permission.USER_VOLUNTEER_CREATE,
    Permission.VIDEO_REVIEW,
    Permission.VIDEO_OFFLINE,
    Permission.LIVE_REVIEW,
    Permission.LIVE_OFFLINE,
  ]),

  [UserRole.PLATFORM_ADMIN]: new Set<Permission>([
    Permission.COLLEGE_MANAGE,
    Permission.USER_CHILD_CREATE,
    Permission.USER_COLLEGE_ADMIN_CREATE,
    Permission.USER_VOLUNTEER_CREATE,
    Permission.VIDEO_OFFLINE,
    Permission.LIVE_OFFLINE,
  ]),
};

export const hasPermissions = (role: UserRole, required: Permission[]) => {
  const granted = rolePermissions[role] ?? new Set<Permission>();
  return required.every((p) => granted.has(p));
};
