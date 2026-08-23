import assert from "node:assert/strict";
import test from "node:test";
import {
  initialSavingsGoalManagerState,
  savingsGoalManagerReducer,
} from "../app/savings-goal-manager-state.ts";

const goal = { id: 2, name: "旅行", savedAmount: 3000 };

test("savings goal manager initializes closed with the first page", () => {
  const state = initialSavingsGoalManagerState([goal]);
  assert.deepEqual(state.goalList, [goal]);
  assert.equal(state.goalPage, 1);
  assert.equal(state.goalOpen, false);
  assert.equal(state.savingGoal, null);
});

test("opening a new or existing goal clears stale errors atomically", () => {
  let state = initialSavingsGoalManagerState([goal]);
  state = savingsGoalManagerReducer(state, { type: "field", key: "goalError", value: "存入失败" });
  state = savingsGoalManagerReducer(state, { type: "open", goal });
  assert.equal(state.goalOpen, true);
  assert.equal(state.savingGoal, goal);
  assert.equal(state.goalError, "");
  state = savingsGoalManagerReducer(state, { type: "open", goal: null });
  assert.equal(state.savingGoal, null);
});

test("closing a goal editor removes transient target but preserves collection pagination", () => {
  let state = initialSavingsGoalManagerState([goal]);
  state = savingsGoalManagerReducer(state, { type: "field", key: "goalPage", value: 2 });
  state = savingsGoalManagerReducer(state, { type: "open", goal });
  state = savingsGoalManagerReducer(state, { type: "close" });
  assert.equal(state.goalOpen, false);
  assert.equal(state.savingGoal, null);
  assert.equal(state.goalPage, 2);
  assert.deepEqual(state.goalList, [goal]);
});
