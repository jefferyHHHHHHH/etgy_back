// Manual definition of Prisma Enums to unblock build
export enum UserRole {
  CHILD = 'CHILD',
  VOLUNTEER = 'VOLUNTEER',
  COLLEGE_ADMIN = 'COLLEGE_ADMIN',
  PLATFORM_ADMIN = 'PLATFORM_ADMIN'
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED'
}

export enum VolunteerStatus {
  IN_SCHOOL = 'IN_SCHOOL',
  GRADUATED = 'GRADUATED',
  SUSPENDED = 'SUSPENDED'
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  UNKNOWN = 'UNKNOWN'
}

export enum VideoStatus {
  DRAFT = 'DRAFT',
  REVIEW = 'REVIEW',
  PUBLISHED = 'PUBLISHED',
  REJECTED = 'REJECTED',
  OFFLINE = 'OFFLINE'
}

export enum LiveStatus {
  DRAFT = 'DRAFT',
  REVIEW = 'REVIEW',
  PASSED = 'PASSED',
  REJECTED = 'REJECTED',
  LIVING = 'LIVING',
  FINISHED = 'FINISHED',
  OFFLINE = 'OFFLINE'
}

export enum AuditAction {
  LOGIN = 'LOGIN',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  REVIEW_PASS = 'REVIEW_PASS',
  REVIEW_REJECT = 'REVIEW_REJECT',
  PUBLISH = 'PUBLISH',
  OFFLINE = 'OFFLINE'
}
