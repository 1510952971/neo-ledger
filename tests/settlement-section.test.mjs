import assert from "node:assert/strict";
import test from "node:test";
import { settlementPresentation } from "../app/settlement-presentation.js";

test("positive settlement balance is money owed to the user", () => {
  assert.deepEqual(settlementPresentation(12345, "小明"), {
    amount: 12345,
    className: "",
    message: "目前「小明」应给你转账",
  });
});

test("negative settlement balance is money the user owes", () => {
  assert.deepEqual(settlementPresentation(-5000, "小红"), {
    amount: 5000,
    className: "owe",
    message: "你还欠「小红」",
  });
});
