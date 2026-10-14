export function scheduleIndexFor(schedule, now = new Date()) {
  return schedule?.mode === "weekly" ? (now.getDay() + 6) % 7 : schedule?.cursor || 0;
}
