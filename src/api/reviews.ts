import { isTauri } from "@tauri-apps/api/core";
import { commands, type Review, type ReviewTarget, type Segment } from "../bindings";
import * as mockReviews from "./mockReviews";
import { unwrapResult } from "./result";

export async function getSegmentReview(date: string, segment: Segment): Promise<Review | null> {
  if (!isTauri()) return mockReviews.getSegmentReview(date, segment);
  return unwrapResult(await commands.getSegmentReview(date, segment));
}

export async function listGoalReviews(goalId: string): Promise<Review[]> {
  if (!isTauri()) return mockReviews.listGoalReviews(goalId);
  return unwrapResult(await commands.listGoalReviews(goalId));
}

export async function saveReview(target: ReviewTarget, note: string): Promise<Review> {
  if (!isTauri()) return mockReviews.saveReview(target, note);
  return unwrapResult(await commands.saveReview({ target, note }));
}

export async function updateReview(id: string, note: string): Promise<Review> {
  if (!isTauri()) return mockReviews.updateReview(id, note);
  return unwrapResult(await commands.updateReview(id, note));
}
