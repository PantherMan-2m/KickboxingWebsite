import { dayOfWeekFor, addDaysIso } from './dates.js';

// Expands a list of active class_templates rows across `dates`, producing one entry per
// date whose day-of-week the template matches, sorted by date+startTime. Shared by
// student/upcoming.js and coach/next-class.js so "which classes occur on which dates"
// has exactly one implementation -- previously duplicated (see T2.4's amended note).
// `templates` rows need at minimum { id, dayOfWeek, name, startTime, endTime }.
export function expandTemplates(templates, dates) {
  const expanded = [];
  for (const date of dates) {
    const dow = dayOfWeekFor(date);
    for (const t of templates) {
      if (t.dayOfWeek !== dow) continue;
      expanded.push({
        templateId: t.id,
        date,
        name: t.name,
        startTime: t.startTime,
        endTime: t.endTime,
      });
    }
  }
  expanded.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  return expanded;
}

// The earliest (date, start_time) among `templates` over the next `windowDays` days from
// `today`, where a class on `today` itself only counts if `nowTime` hasn't passed it yet.
// A class starting this exact minute still counts (`>=`, not `>`) -- deliberate, per T2.4's
// amended note. Pure function of its arguments (no clock reads) so the SAST-vs-UTC
// rollover this depends on (via the caller's `today`/`nowTime`, from sastNowParts) can be
// pinned in a unit test instead of only hoped-for.
export function selectNextClass(templates, today, nowTime, windowDays) {
  const dates = Array.from({ length: windowDays }, (_, i) => addDaysIso(today, i));
  const expanded = expandTemplates(templates, dates).filter((e) => !(e.date === today && e.startTime < nowTime));
  return expanded[0] || null;
}
