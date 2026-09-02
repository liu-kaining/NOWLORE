import type { Signal, Topic } from "../domain/schemas.js";
import { hoursBetween } from "../lib/time.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

export function scoreTopic(signals: Signal[], now: string): Pick<Topic,
  "heuristicScore" | "freshnessScore" | "engagementScore" | "diversityScore" | "velocityScore" | "sourceCount"
> {
  const sourceCount = new Set(signals.map((signal) => signal.source)).size;
  const freshestHours = Math.min(...signals.map((signal) => hoursBetween(signal.publishedAt, now)));
  const freshnessScore = clamp(100 * Math.pow(0.5, freshestHours / 18));
  const rawEngagement = signals.reduce((sum, signal) => sum + Object.values(signal.metrics).reduce((a, b) => a + b, 0), 0);
  const engagementScore = clamp(Math.log10(1 + rawEngagement) * 18);
  const diversityScore = clamp((sourceCount / 3) * 100);
  const recentCount = signals.filter((signal) => hoursBetween(signal.publishedAt, now) <= 6).length;
  const velocityScore = clamp((recentCount / 4) * 100);
  const predictionBonus = signals.some((signal) => signal.sourceType === "polymarket") ? 8 : 0;
  const heuristicScore = clamp(
    freshnessScore * 0.35 + engagementScore * 0.25 + diversityScore * 0.22 + velocityScore * 0.18 + predictionBonus,
  );
  return { sourceCount, freshnessScore, engagementScore, diversityScore, velocityScore, heuristicScore };
}
