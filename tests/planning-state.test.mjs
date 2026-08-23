import assert from "node:assert/strict";
import test from "node:test";
import { initialPlanningState, planningReducer } from "../app/planning-state.ts";

const fire = { monthlyExpense: 100, annualReturnBps: 500 };
const economic = { inflationBps: 250 };

test("planning state starts with safe pages and stress switches", () => {
  const state = initialPlanningState({
    categoryBudgets: [{ category: "餐饮" }],
    members: [{ id: 1 }],
    fireConfig: fire,
    inflationConfig: economic,
  });
  assert.equal(state.categoryBudgetPage, 1);
  assert.equal(state.settlementPage, 1);
  assert.equal(state.installmentPage, 1);
  assert.deepEqual(state.stressEvents, { unemployment: false, crash: false, emergency: false });
});

test("planning reducer supports functional updates without cross-domain resets", () => {
  let state = initialPlanningState({ categoryBudgets: [], members: [], fireConfig: fire, inflationConfig: economic });
  state = planningReducer(state, { type: "field", key: "categoryBudgetPage", value: 3 });
  state = planningReducer(state, { type: "field", key: "memberList", value: (items) => [...items, { id: 2 }] });
  state = planningReducer(state, { type: "field", key: "stressEvents", value: (events) => ({ ...events, crash: true }) });
  assert.equal(state.categoryBudgetPage, 3);
  assert.deepEqual(state.memberList, [{ id: 2 }]);
  assert.equal(state.stressEvents.crash, true);
  assert.equal(state.stressEvents.emergency, false);
});

test("planning reducer rehydrates server data and resets only stale pagination", () => {
  let state = initialPlanningState({ categoryBudgets: [{ category: "餐饮" }], members: [{ id: 1 }], fireConfig: fire, inflationConfig: economic });
  state = planningReducer(state, { type: "field", key: "categoryBudgetPage", value: 4 });
  state = planningReducer(state, { type: "field", key: "settlementPage", value: 2 });
  state = planningReducer(state, { type: "hydrate", categoryBudgets: [{ category: "交通" }], members: [{ id: 2 }], fireConfig: { ...fire, monthlyExpense: 200 }, inflationConfig: { inflationBps: 300 } });
  assert.deepEqual(state.categoryBudgetList, [{ category: "交通" }]);
  assert.deepEqual(state.memberList, [{ id: 2 }]);
  assert.equal(state.categoryBudgetPage, 1);
  assert.equal(state.settlementPage, 1);
  assert.equal(state.fireConfig.monthlyExpense, 200);
});
