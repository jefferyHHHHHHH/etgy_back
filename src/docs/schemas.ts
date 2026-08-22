import { z } from 'zod';
import { CommentStatus, LiveMessageType, LiveStatus, VideoStatus } from '../types/enums';

export const VideoMetricsSchema = z
	.object({
		playCount: z.number().int(),
		likeCount: z.number().int(),
		favCount: z.number().int(),
	})
	.openapi('VideoMetrics');

export const SignedPlayableUrlSchema = z
	.object({
		url: z.string(),
		sourceKey: z.string().nullable(),
		expiresInSeconds: z.number().int().nonnegative(),
		expiresAt: z.string().datetime().nullable(),
	})
	.openapi('SignedPlayableUrl');

export const VideoMediaUrlsSchema = z
	.object({
		url: z.string().describe('Presigned GET URL for video object'),
		sourceKey: z.string().nullable().describe('Source OSS key for the video object'),
		expiresInSeconds: z.number().int().nonnegative().describe('Presign expiration in seconds'),
		expiresAt: z.string().datetime().nullable().describe('Presigned URL expiration time (ISO)'),
		coverUrl: z.string().nullable().describe('Presigned GET URL for cover image object'),
		coverSourceKey: z.string().nullable().describe('Source OSS key for the cover image object'),
		coverExpiresInSeconds: z.number().int().nonnegative().describe('Presign expiration in seconds for cover image'),
		coverExpiresAt: z.string().datetime().nullable().describe('Presigned cover URL expiration time (ISO)'),
	})
	.openapi('VideoMediaUrls');

export const VideoSchema = z
	.object({
		id: z.number().int(),
		title: z.string(),
		intro: z.string().nullable().optional(),
		url: z.string(),
		coverUrl: z.string().nullable().optional(),
		duration: z.number().int().nullable().optional(),
		gradeRange: z.string().nullable().optional(),
		subjectTag: z.string().nullable().optional(),
		status: z.nativeEnum(VideoStatus),
		rejectReason: z.string().nullable().optional(),

		reviewedBy: z.number().int().nullable().optional(),
		reviewedAt: z.string().datetime().nullable().optional(),

		publishedBy: z.number().int().nullable().optional(),
		publishedAt: z.string().datetime().nullable().optional(),

		offlineBy: z.number().int().nullable().optional(),
		offlineAt: z.string().datetime().nullable().optional(),
		offlineReason: z.string().nullable().optional(),

		uploaderId: z.number().int(),
		collegeId: z.number().int(),

		createdAt: z.string().datetime(),
		updatedAt: z.string().datetime(),

		metrics: VideoMetricsSchema.nullable().optional(),
		// Relations (kept loose to avoid coupling API docs to Prisma include shapes)
		uploader: z.any().optional(),
		college: z.any().optional(),
		mediaUrls: VideoMediaUrlsSchema.optional(),
	})
	.openapi('Video');

export const LiveMetricsSchema = z
	.object({
		peakViewers: z.number().int().nonnegative(),
		averageViewers: z.number().int().nonnegative(),
		onlineCount: z.number().int().nonnegative().optional(),
	})
	.openapi('LiveMetrics');

export const LiveRoomSchema = z
	.object({
		id: z.number().int(),
		title: z.string(),
		intro: z.string().nullable().optional(),
		gradeRange: z.string().nullable().optional(),
		subjectTag: z.string().nullable().optional(),
		estimatedViewers: z.number().int().nullable().optional(),

		planStartTime: z.string().datetime(),
		planEndTime: z.string().datetime(),
		actualStart: z.string().datetime().nullable().optional(),
		actualEnd: z.string().datetime().nullable().optional(),

		status: z.nativeEnum(LiveStatus),
		rejectReason: z.string().nullable().optional(),

		reviewedBy: z.number().int().nullable().optional(),
		reviewedAt: z.string().datetime().nullable().optional(),

		publishedBy: z.number().int().nullable().optional(),
		publishedAt: z.string().datetime().nullable().optional(),

		offlineBy: z.number().int().nullable().optional(),
		offlineAt: z.string().datetime().nullable().optional(),
		offlineReason: z.string().nullable().optional(),

		pushUrl: z.string().nullable().optional(),
		pullUrl: z.string().nullable().optional(),

		replayVideoId: z.number().int().nullable().optional(),

		anchorId: z.number().int(),
		collegeId: z.number().int(),
		anchor: z.any().optional(),
		college: z.any().optional(),
		metrics: LiveMetricsSchema.nullable().optional(),

		createdAt: z.string().datetime().optional(),
		updatedAt: z.string().datetime().optional(),
	})
	.openapi('LiveRoom');

export const LiveRoomPagedResultSchema = z
	.object({
		items: z.array(LiveRoomSchema),
		total: z.number().int().nonnegative(),
		page: z.number().int().positive(),
		pageSize: z.number().int().positive(),
	})
	.openapi('LiveRoomPagedResult');

export const LiveStreamInfoSchema = z
	.object({
		liveId: z.number().int().positive(),
		pushUrl: z.string().nullable(),
		pullUrl: z.string().nullable(),
	})
	.openapi('LiveStreamInfo');

export const VideoCommentSchema = z
	.object({
		id: z.number().int(),
		videoId: z.number().int(),
		authorId: z.number().int(),
		content: z.string(),
		status: z.nativeEnum(CommentStatus),
		rejectReason: z.string().nullable().optional(),
		reviewedBy: z.number().int().nullable().optional(),
		reviewedAt: z.string().datetime().nullable().optional(),
		createdAt: z.string().datetime(),
		updatedAt: z.string().datetime(),
		author: z.any().optional(),
	})
	.openapi('VideoComment');

export const VideoWatchLogSchema = z
	.object({
		id: z.number().int(),
		videoId: z.number().int(),
		userId: z.number().int(),
		lastPositionSec: z.number().int(),
		watchedSeconds: z.number().int(),
		completed: z.boolean(),
		createdAt: z.string().datetime(),
		updatedAt: z.string().datetime(),
	})
	.openapi('VideoWatchLog');

export const LiveMessageSchema = z
	.object({
		id: z.number().int(),
		liveId: z.number().int(),
		senderId: z.number().int(),
		type: z.nativeEnum(LiveMessageType),
		content: z.string(),
		createdAt: z.string().datetime(),
		sender: z.any().optional(),
	})
	.openapi('LiveMessage');
