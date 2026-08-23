import assert from "node:assert/strict";
import test from "node:test";
import { savingsGoalPresentation } from "../app/savings-goal-presentation.js";

test("savings goal presentation clamps progress and reports deadline state", () => {
  assert.deepEqual(
    savingsGoalPresentation({ savedAmount: 2500, targetAmount: 10000, deadline: "2026-08-24" }, "2026-08-17"),
    { percent: 25, completed: false, daysLeft: 7, overdue: false },
  );
  assert.deepEqual(
    savingsGoalPresentation({ savedAmount: 12000, targetAmount: 10000, deadline: "2026-08-10" }, "2026-08-17"),
    { percent: 100, completed: true, daysLeft: -7, overdue: true },
  );
  assert.equal(savingsGoalPresentation({ savedAmount: -10, targetAmount: 0, deadline: "bad" }, "2026-08-17").percent, 0);
});
