"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditAction = exports.LiveStatus = exports.VideoStatus = exports.Gender = exports.VolunteerStatus = exports.UserStatus = exports.UserRole = void 0;
// Manual definition of Prisma Enums to unblock build
var UserRole;
(function (UserRole) {
    UserRole["CHILD"] = "CHILD";
    UserRole["VOLUNTEER"] = "VOLUNTEER";
    UserRole["COLLEGE_ADMIN"] = "COLLEGE_ADMIN";
    UserRole["PLATFORM_ADMIN"] = "PLATFORM_ADMIN";
})(UserRole || (exports.UserRole = UserRole = {}));
var UserStatus;
(function (UserStatus) {
    UserStatus["ACTIVE"] = "ACTIVE";
    UserStatus["INACTIVE"] = "INACTIVE";
    UserStatus["SUSPENDED"] = "SUSPENDED";
})(UserStatus || (exports.UserStatus = UserStatus = {}));
var VolunteerStatus;
(function (VolunteerStatus) {
    VolunteerStatus["IN_SCHOOL"] = "IN_SCHOOL";
    VolunteerStatus["GRADUATED"] = "GRADUATED";
    VolunteerStatus["SUSPENDED"] = "SUSPENDED";
})(VolunteerStatus || (exports.VolunteerStatus = VolunteerStatus = {}));
var Gender;
(function (Gender) {
    Gender["MALE"] = "MALE";
    Gender["FEMALE"] = "FEMALE";
    Gender["UNKNOWN"] = "UNKNOWN";
})(Gender || (exports.Gender = Gender = {}));
var VideoStatus;
(function (VideoStatus) {
    VideoStatus["DRAFT"] = "DRAFT";
    VideoStatus["REVIEW"] = "REVIEW";
    VideoStatus["PUBLISHED"] = "PUBLISHED";
    VideoStatus["REJECTED"] = "REJECTED";
    VideoStatus["OFFLINE"] = "OFFLINE";
})(VideoStatus || (exports.VideoStatus = VideoStatus = {}));
var LiveStatus;
(function (LiveStatus) {
    LiveStatus["DRAFT"] = "DRAFT";
    LiveStatus["REVIEW"] = "REVIEW";
    LiveStatus["PASSED"] = "PASSED";
    LiveStatus["REJECTED"] = "REJECTED";
    LiveStatus["LIVING"] = "LIVING";
    LiveStatus["FINISHED"] = "FINISHED";
    LiveStatus["OFFLINE"] = "OFFLINE";
})(LiveStatus || (exports.LiveStatus = LiveStatus = {}));
var AuditAction;
(function (AuditAction) {
    AuditAction["LOGIN"] = "LOGIN";
    AuditAction["CREATE"] = "CREATE";
    AuditAction["UPDATE"] = "UPDATE";
    AuditAction["DELETE"] = "DELETE";
    AuditAction["REVIEW_PASS"] = "REVIEW_PASS";
    AuditAction["REVIEW_REJECT"] = "REVIEW_REJECT";
    AuditAction["PUBLISH"] = "PUBLISH";
    AuditAction["OFFLINE"] = "OFFLINE";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
