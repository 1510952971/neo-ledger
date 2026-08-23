import assert from "node:assert/strict";
import test from "node:test";
import {
  billViewReducer,
  initialBillViewState,
} from "../app/bill-view-state.ts";

test("bill view starts with an unfiltered, monthly view", () => {
  assert.deepEqual(initialBillViewState(), {
    query: "",
    range: "all",
    anchorDate: "",
    startDate: "",
    endDate: "",
    page: { key: "", page: 1 },
    dimension: "月",
    dateLabels: {},
  });
});

test("bill filter reset clears query, range, dates and stale page together", () => {
  let state = initialBillViewState();
  state = billViewReducer(state, { type: "field", key: "query", value: "咖啡" });
  state = billViewReducer(state, { type: "field", key: "range", value: "custom" });
  state = billViewReducer(state, { type: "field", key: "startDate", value: "2026-08-01" });
  state = billViewReducer(state, { type: "field", key: "endDate", value: "2026-08-19" });
  state = billViewReducer(state, { type: "field", key: "page", value: { key: "filters", page: 4 } });
  state = billViewReducer(state, { type: "reset-filters" });
  assert.equal(state.query, "");
  assert.equal(state.range, "all");
  assert.equal(state.startDate, "");
  assert.equal(state.endDate, "");
  assert.deepEqual(state.page, { key: "", page: 1 });
});

test("bill view supports functional date-label updates without changing filters", () => {
  let state = initialBillViewState();
  state = billViewReducer(state, { type: "field", key: "query", value: "工资" });
  state = billViewReducer(state, {
    type: "field",
    key: "dateLabels",
    value: (previous) => ({ ...previous, 3: "2026/08/19 10:00" }),
  });
  assert.equal(state.query, "工资");
  assert.equal(state.dateLabels[3], "2026/08/19 10:00");
});
