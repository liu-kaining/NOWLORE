export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function isoNow(clock: Clock = systemClock): string {
  return clock.now().toISOString();
}

export function hoursBetween(earlier: string, later: string): number {
  return Math.max(0, (Date.parse(later) - Date.parse(earlier)) / 3_600_000);
}
