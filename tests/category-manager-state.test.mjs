import assert from "node:assert/strict";
import test from "node:test";
import {
  categoryManagerReducer,
  initialCategoryManagerState,
} from "../app/category-manager-state.ts";

const category = { id: 1, name: "餐饮", isActive: true };
const income = { id: 2, name: "薪资发放", isActive: true };

test("category manager initializes both expense and income collections", () => {
  const state = initialCategoryManagerState({ categories: [category], incomeCategories: [income] });
  assert.deepEqual(state.categoryList, [category]);
  assert.deepEqual(state.incomeCategoryList, [income]);
  assert.equal(state.categoryManagerOpen, false);
  assert.equal(state.incomeManagerOpen, false);
  assert.equal(state.editingCategory, null);
  assert.equal(state.editingIncomeCategory, null);
});

test("category manager closes editor and clears only its own error", () => {
  let state = initialCategoryManagerState({ categories: [category], incomeCategories: [income] });
  state = categoryManagerReducer(state, { type: "field", key: "editingCategory", value: category });
  state = categoryManagerReducer(state, { type: "field", key: "categoryError", value: "保存失败" });
  state = categoryManagerReducer(state, { type: "field", key: "incomeCategoryError", value: "收入错误" });
  state = categoryManagerReducer(state, { type: "close-category-editor" });
  assert.equal(state.editingCategory, null);
  assert.equal(state.categoryError, "");
  assert.equal(state.incomeCategoryError, "收入错误");
});

test("category manager supports functional list updates", () => {
  let state = initialCategoryManagerState({ categories: [category], incomeCategories: [income] });
  state = categoryManagerReducer(state, {
    type: "field",
    key: "categoryList",
    value: (previous) => [...previous, { id: 3, name: "交通", isActive: true }],
  });
  assert.equal(state.categoryList.length, 2);
  assert.equal(state.incomeCategoryList.length, 1);
});
