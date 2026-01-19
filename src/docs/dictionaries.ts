import { z } from 'zod';
import {
	AuditAction,
	Gender,
	LiveStatus,
	UserRole,
	UserStatus,
	VideoStatus,
	VolunteerStatus,
} from '../types/enums';

export const DictionaryItemSchema = z
	.object({
		value: z.string(),
		label: z.string(),
		description: z.string().optional(),
	})
	.openapi('DictionaryItem');

type DictionaryItem = z.infer<typeof DictionaryItemSchema>;

const buildEnumDictionary = <T extends Record<string, string>>(
	enumObj: T,
	labels: Record<T[keyof T], string>,
	descriptions?: Partial<Record<T[keyof T], string>>
): DictionaryItem[] => {
	const values = Object.values(enumObj) as Array<T[keyof T]>;
	return values.map((value) => ({
		value,
		label: labels[value] ?? String(value),
		description: descriptions?.[value],
	}));
};

export const UserRoleSchema = z.nativeEnum(UserRole).openapi('UserRole');
export const UserStatusSchema = z.nativeEnum(UserStatus).openapi('UserStatus');
export const VolunteerStatusSchema = z.nativeEnum(VolunteerStatus).openapi('VolunteerStatus');
export const GenderSchema = z.nativeEnum(Gender).openapi('Gender');
export const VideoStatusSchema = z.nativeEnum(VideoStatus).openapi('VideoStatus');
export const LiveStatusSchema = z.nativeEnum(LiveStatus).openapi('LiveStatus');
export const AuditActionSchema = z.nativeEnum(AuditAction).openapi('AuditAction');

export const dictionaries = {
	userRole: buildEnumDictionary(
		UserRole,
		{
			[UserRole.CHILD]: '儿童用户',
			[UserRole.VOLUNTEER]: '志愿者用户',
			[UserRole.COLLEGE_ADMIN]: '学院管理员/审核员',
			[UserRole.PLATFORM_ADMIN]: '平台管理员',
		},
		{
			[UserRole.CHILD]: '仅可观看已发布内容/直播，并使用 AI 辅导等功能',
			[UserRole.VOLUNTEER]: '上传视频、提交审核、直播申请、上架/下线（按权限）',
			[UserRole.COLLEGE_ADMIN]: '审核本学院志愿者的视频与直播申请，并管理志愿者账号',
			[UserRole.PLATFORM_ADMIN]: '全局配置与兜底风控（可强制下线任何内容）',
		}
	),
	userStatus: buildEnumDictionary(UserStatus, {
		[UserStatus.ACTIVE]: '已开通',
		[UserStatus.INACTIVE]: '未开通/未激活',
		[UserStatus.SUSPENDED]: '已停用',
	}, {
		[UserStatus.ACTIVE]: '账号可正常登录与使用功能',
		[UserStatus.INACTIVE]: '预建档/未完成首次登录激活',
		[UserStatus.SUSPENDED]: '账号被停用，禁止登录与操作',
	}),
	volunteerStatus: buildEnumDictionary(VolunteerStatus, {
		[VolunteerStatus.IN_SCHOOL]: '在校',
		[VolunteerStatus.GRADUATED]: '已毕业',
		[VolunteerStatus.SUSPENDED]: '停用',
	}, {
		[VolunteerStatus.IN_SCHOOL]: '志愿者在校状态',
		[VolunteerStatus.GRADUATED]: '志愿者已毕业状态',
		[VolunteerStatus.SUSPENDED]: '志愿者账号停用/冻结',
	}),
	gender: buildEnumDictionary(Gender, {
		[Gender.MALE]: '男',
		[Gender.FEMALE]: '女',
		[Gender.UNKNOWN]: '未知',
	}),
	videoStatus: buildEnumDictionary(VideoStatus, {
		[VideoStatus.DRAFT]: '草稿',
		[VideoStatus.REVIEW]: '待审核',
		[VideoStatus.APPROVED]: '审核已通过',
		[VideoStatus.REJECTED]: '已驳回',
		[VideoStatus.PUBLISHED]: '已上架（已发布）',
		[VideoStatus.OFFLINE]: '已下线',
	}, {
		[VideoStatus.DRAFT]: '志愿者创建的草稿，可编辑/删除',
		[VideoStatus.REVIEW]: '已提交审核，等待学院管理员处理',
		[VideoStatus.APPROVED]: '审核通过，等待志愿者执行上架',
		[VideoStatus.REJECTED]: '审核驳回，可修改后重新提交',
		[VideoStatus.PUBLISHED]: '已上架，对儿童端/小程序可见',
		[VideoStatus.OFFLINE]: '已下线，前台不可见（可由志愿者/管理员触发）',
	}),
	liveStatus: buildEnumDictionary(LiveStatus, {
		[LiveStatus.DRAFT]: '草稿',
		[LiveStatus.REVIEW]: '待审核',
		[LiveStatus.PASSED]: '审核已通过（待上架）',
		[LiveStatus.PUBLISHED]: '已上架（待开播）',
		[LiveStatus.REJECTED]: '已驳回',
		[LiveStatus.LIVING]: '直播中',
		[LiveStatus.FINISHED]: '已结束',
		[LiveStatus.OFFLINE]: '已下线/强制停止',
	}, {
		[LiveStatus.DRAFT]: '志愿者填写但尚未提交的申请草稿',
		[LiveStatus.REVIEW]: '直播申请单待审核',
		[LiveStatus.PASSED]: '审核通过，但尚未上架（仍不可在前台看到）',
		[LiveStatus.PUBLISHED]: '已上架，对前台可见（未到时间则待开播）',
		[LiveStatus.REJECTED]: '申请被驳回（需提供原因）',
		[LiveStatus.LIVING]: '直播正在进行中',
		[LiveStatus.FINISHED]: '直播自然结束',
		[LiveStatus.OFFLINE]: '直播被强制停止/下线',
	}),
	auditAction: buildEnumDictionary(AuditAction, {
		[AuditAction.LOGIN]: '登录',
		[AuditAction.CREATE]: '创建',
		[AuditAction.UPDATE]: '更新',
		[AuditAction.DELETE]: '删除',
		[AuditAction.REVIEW_PASS]: '审核通过',
		[AuditAction.REVIEW_REJECT]: '审核驳回',
		[AuditAction.PUBLISH]: '上架/发布',
		[AuditAction.OFFLINE]: '下线/下架/停止',
	}),
} as const;

export const DictionariesSchema = z
	.object({
		userRole: z.array(DictionaryItemSchema).describe('登录/鉴权角色字典'),
		userStatus: z.array(DictionaryItemSchema),
		volunteerStatus: z.array(DictionaryItemSchema),
		gender: z.array(DictionaryItemSchema),
		videoStatus: z.array(DictionaryItemSchema),
		liveStatus: z.array(DictionaryItemSchema),
		auditAction: z.array(DictionaryItemSchema),
	})
	.openapi('Dictionaries');
