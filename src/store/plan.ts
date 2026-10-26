import type { Atlas } from "../atlas/types";
import type { Progress } from "./store";
import { dayKey } from "./store";

/** Calendar arithmetic uses date components so DST and timezone offsets cannot skip a day. */
export function calendarDistance(start: string, end: string) {
  const utc = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.floor((utc(end) - utc(start)) / 86400000);
}

export function fixedPlan(atlas: Atlas, p: Progress, today = dayKey()) {
  if (!atlas.plan) return null;
  const elapsed = p.planStarted
    ? Math.max(0, calendarDistance(p.planStarted, today))
    : -1;
  const days = atlas.plan.days.map((day, index) => {
    const done = day.ids.filter((id) => !!p.cards[id]).length;
    return {
      ...day,
      done,
      complete: done === day.ids.length,
      calendarUnlocked: elapsed >= index,
    };
  });
  // Missed tasks stay here until completed, even if several calendar days have elapsed.
  const current = days.find((d) => !d.complete);
  const available = !!current && current.calendarUnlocked && !!p.planStarted;
  const fresh = available ? current.ids.filter((id) => !p.cards[id]) : [];
  const unlocked = new Set(
    days
      .filter((d) => d.day <= (current?.day ?? Infinity) && d.calendarUnlocked)
      .flatMap((d) => d.ids),
  );
  return {
    days,
    current,
    available,
    fresh,
    unlocked,
    complete: !current,
    started: !!p.planStarted,
  };
}
