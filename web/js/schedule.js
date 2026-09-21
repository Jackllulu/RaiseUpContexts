/** Cadence and T0. Browser + Node (ESM). */

export function parseISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatISODate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso, n) {
  const dt = parseISODate(iso);
  dt.setDate(dt.getDate() + n);
  return formatISODate(dt);
}

export function addMonths(iso, n) {
  const dt = parseISODate(iso);
  const day = dt.getDate();
  dt.setDate(1);
  dt.setMonth(dt.getMonth() + n);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(day, last));
  return formatISODate(dt);
}

export function addYears(iso, n) {
  return addMonths(iso, n * 12);
}

export function diffDays(fromIso, toIso) {
  const a = parseISODate(fromIso);
  const b = parseISODate(toIso);
  return Math.round((b - a) / 86400000);
}

/** Assumption: EDD = gestational week 40 + 0 days. */
export function gestWeekOn(dueDate, onDate) {
  const daysToDue = diffDays(onDate, dueDate);
  const gestDays = 40 * 7 - daysToDue;
  return Math.floor(gestDays / 7);
}

export function ageMonthsOn(birthday, onDate) {
  const b = parseISODate(birthday);
  const o = parseISODate(onDate);
  let months = (o.getFullYear() - b.getFullYear()) * 12 + (o.getMonth() - b.getMonth());
  if (o.getDate() < b.getDate()) months -= 1;
  return months;
}

/**
 * Birthdate overrides due date once present.
 * Unborn: postnatal anchors use due date as expected birthday.
 */
export function childAnchorDate(child) {
  return child.birthday || child.dueDate || null;
}

export function t0ForItem(item, child) {
  const due = child.dueDate;
  const born = child.birthday;
  const expectedBirth = born || due;
  if (!expectedBirth && item.anchor.kind !== "gestWeek") return null;
  if (item.anchor.kind === "gestWeek") {
    if (!due && !born) return null;
    // After birth, gestational items are in the past relative to actual birth ≈ due.
    const edd = due || born;
    return addDays(edd, (item.anchor.n - 40) * 7);
  }
  if (item.anchor.kind === "ageMonths") return addMonths(expectedBirth, item.anchor.n);
  if (item.anchor.kind === "ageYears") return addYears(expectedBirth, item.anchor.n);
  if (item.anchor.kind === "dueOffsetDays") return addDays(expectedBirth, item.anchor.n);
  return null;
}

/**
 * Beats all ≤ T0.
 * skill: T-14, T-7, T0
 * science: every 3 days from T-14 through T0 (include T0 if the 3-day grid missed it)
 * other: T-14, T-7, plus T0 (assumption: v1 admin windows always need a T0 touch)
 */
export function beatsForType(type, t0) {
  const t14 = addDays(t0, -14);
  const t7 = addDays(t0, -7);
  if (type === "skill") return [t14, t7, t0];
  if (type === "science") {
    const out = [];
    for (let d = t14; ; d = addDays(d, 3)) {
      if (diffDays(d, t0) < 0) break;
      out.push(d);
      if (d === t0) break;
    }
    if (out[out.length - 1] !== t0) out.push(t0);
    return out;
  }
  return [t14, t7, t0];
}

export function deriveStage(child, today) {
  if (child.birthday) {
    const months = ageMonthsOn(child.birthday, today);
    if (months < 1) return { id: "newborn", label: "新生儿", group: "y0", detail: `${months} 月龄` };
    if (months < 12) return { id: "infant", label: "婴儿", group: "y0", detail: `${months} 月龄` };
    if (months < 36) return { id: "toddler", label: "幼儿", group: "y1to7", detail: `${months} 月龄` };
    if (months < 72) return { id: "preschool", label: "学龄前", group: "y1to7", detail: `${Math.floor(months / 12)} 岁` };
    return { id: "school", label: "小学低年级", group: "y1to7", detail: `${Math.floor(months / 12)} 岁` };
  }
  if (child.dueDate) {
    const w = gestWeekOn(child.dueDate, today);
    if (w < 0) return { id: "pre", label: "孕前", group: "early", detail: "未到孕期" };
    if (w < 14) return { id: "early", label: "孕早期", group: "early", detail: `孕 ${w} 周` };
    if (w < 28) return { id: "mid", label: "孕中期", group: "mid", detail: `孕 ${w} 周` };
    if (w < 37) return { id: "late", label: "孕晚期", group: "late", detail: `孕 ${w} 周` };
    return { id: "labor", label: "待产窗口", group: "late", detail: `孕 ${w} 周` };
  }
  return { id: "unknown", label: "未填锚点", group: null, detail: "" };
}

export function regionAllows(item, region) {
  if (item.region === "all") return true;
  return item.region === region;
}

export function scheduledItems(catalog, household, today) {
  if (!household?.child) return [];
  const { child, region } = household;
  const out = [];
  for (const item of catalog) {
    if (!regionAllows(item, region)) continue;
    const t0 = t0ForItem(item, child);
    if (!t0) continue;
    const beats = beatsForType(item.type, t0);
    const upcomingBeats = beats.filter((b) => diffDays(today, b) >= 0 && diffDays(b, t0) >= 0);
    const nextBeat = upcomingBeats[0] || null;
    const beatToday = beats.includes(today) && diffDays(today, t0) >= 0;
    const pastT0 = diffDays(t0, today) > 0;
    out.push({ item, t0, beats, nextBeat, beatToday, pastT0 });
  }
  return out;
}

export function todayMergedNotice(scheduled, today) {
  return scheduled.filter((s) => s.beatToday && !s.pastT0);
}

export function catchUpItems(scheduled, completions) {
  return scheduled.filter((s) => s.pastT0 && !completions[s.item.id]);
}

/** Night 21:00–8:00: delay to next morning; if delayed day > T0, do not push (catch-up instead). */
export function pushDayForHour(today, hour, t0) {
  const night = hour >= 21 || hour < 8;
  if (!night) return { sendOn: today, delayed: false, skippedPastT0: false };
  const nextMorning = addDays(today, hour >= 21 ? 1 : 0);
  if (diffDays(t0, nextMorning) > 0) {
    return { sendOn: null, delayed: true, skippedPastT0: true };
  }
  return { sendOn: nextMorning, delayed: true, skippedPastT0: false };
}
