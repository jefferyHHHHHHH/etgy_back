export type RankingMetric =
  | 'score'
  | 'teachingMinutes'
  | 'liveFinishedCount'
  | 'auditPassRate'
  | 'childCompletionCount';

export type RankingScope = 'college' | 'school' | 'platform';

export type RankingPeriod = 'all' | 'month' | 'week';

export interface VolunteerMetricRow {
  volunteerUserId: number;
  realName: string;
  studentId: string;
  collegeId: number;
  collegeName: string;
  teachingMinutes: number;
  liveFinishedCount: number;
  auditPassRate: number | null;
  childCompletionCount: number;
  score: number;
}

export interface VolunteerRankingItem extends VolunteerMetricRow {
  rank: number;
}

export interface VolunteerRankingResult {
  scope: RankingScope;
  collegeId?: number;
  school?: string;
  metric: RankingMetric;
  period: RankingPeriod;
  periodKey?: string;
  total: number;
  items: VolunteerRankingItem[];
  myRank?: { rank: number; score: number };
  cachedAt?: string;
}

export interface CollegeMetricRow {
  collegeId: number;
  collegeName: string;
  volunteerActiveCount: number;
  publishedVideoCount: number;
  liveFinishedCount: number;
  totalTeachingMinutes: number;
  auditPassRate: number | null;
  childCompletionCount: number;
  score: number;
}

export interface CollegeRankingItem extends CollegeMetricRow {
  rank: number;
}

export interface CollegeRankingResult {
  metric: RankingMetric;
  period: RankingPeriod;
  periodKey?: string;
  total: number;
  items: CollegeRankingItem[];
  cachedAt?: string;
}

export interface VolunteerMeStats {
  teachingMinutes: number;
  liveFinishedCount: number;
  auditPassRate: number | null;
  childCompletionCount: number;
  ranks: {
    college: { rank: number; total: number } | null;
  };
}

export interface SchoolOption {
  school: string;
  childCount: number;
}
