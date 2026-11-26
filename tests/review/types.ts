/** 契约 0.2.2 里复盘命令用到的形状。不从产品源码推导。 */

export type Id = string;
export type LocalDate = string;
export type Timestamp = string;

export type Segment = "morning" | "afternoon" | "evening";

export type ReviewTarget =
  | { type: "segment"; date: LocalDate; segment: Segment }
  | { type: "goal"; goalId: Id };

export type ReviewStats = {
  planned: number;
  done: number;
  skipped: number;
  overdue: number;
  focusMinutes: number;
};

export type Review = {
  id: Id;
  target: ReviewTarget;
  note: string;
  stats: ReviewStats;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
