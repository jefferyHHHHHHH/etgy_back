import { z } from 'zod';
import { LiveStatus, VideoStatus } from '../types/enums';

export const VideoMetricsSchema = z
	.object({
		playCount: z.number().int(),
		likeCount: z.number().int(),
		favCount: z.number().int(),
	})
	.openapi('VideoMetrics');

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
	})
	.openapi('Video');

export const LiveRoomSchema = z
	.object({
		id: z.number().int(),
		title: z.string(),
		intro: z.string().nullable().optional(),

		planStartTime: z.string().datetime(),
		planEndTime: z.string().datetime(),
		actualStart: z.string().datetime().nullable().optional(),
		actualEnd: z.string().datetime().nullable().optional(),

		status: z.nativeEnum(LiveStatus),
		rejectReason: z.string().nullable().optional(),

		pushUrl: z.string().nullable().optional(),
		pullUrl: z.string().nullable().optional(),

		anchorId: z.number().int(),
		collegeId: z.number().int(),
		anchor: z.any().optional(),
		college: z.any().optional(),
	})
	.openapi('LiveRoom');
