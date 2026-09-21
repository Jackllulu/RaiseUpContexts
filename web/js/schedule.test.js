import assert from "node:assert/strict";
import {
  addDays,
  beatsForType,
  t0ForItem,
  gestWeekOn,
  pushDayForHour,
  catchUpItems,
  scheduledItems,
  todayMergedNotice,
} from "./schedule.js";

const due = "2026-11-13";
const today = "2026-09-18";
assert.equal(gestWeekOn(due, today), 32);

const t0 = t0ForItem({ anchor: { kind: "gestWeek", n: 32 } }, { dueDate: due });
assert.equal(t0, today);

const skill = beatsForType("skill", "2026-10-02");
assert.deepEqual(skill, ["2026-09-18", "2026-09-25", "2026-10-02"]);

const sci = beatsForType("science", "2026-10-02");
assert.ok(sci.includes("2026-09-18"));
assert.ok(sci.includes("2026-10-02"));
assert.equal(sci.length, 6);

const other = beatsForType("other", "2026-10-02");
assert.deepEqual(other, ["2026-09-18", "2026-09-25", "2026-10-02"]);

const night = pushDayForHour("2026-09-18", 22, "2026-09-20");
assert.equal(night.sendOn, "2026-09-19");
assert.equal(night.delayed, true);

const tooLate = pushDayForHour("2026-09-18", 22, "2026-09-18");
assert.equal(tooLate.skippedPastT0, true);

const catalog = [
  {
    id: "a",
    type: "skill",
    region: "all",
    anchor: { kind: "gestWeek", n: 30 },
  },
  {
    id: "b",
    type: "skill",
    region: "all",
    anchor: { kind: "gestWeek", n: 34 },
  },
];
const household = { region: "shanghai", child: { dueDate: due, birthday: null } };
const sched = scheduledItems(catalog, household, today);
assert.equal(sched.find((s) => s.item.id === "a").pastT0, true);
assert.equal(catchUpItems(sched, {}).length, 1);
assert.equal(catchUpItems(sched, { a: true }).length, 0);
assert.ok(todayMergedNotice(sched, today).every((s) => s.beatToday));

assert.equal(addDays("2026-01-31", 1), "2026-02-01");
console.log("schedule tests ok");
