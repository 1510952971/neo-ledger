"use client";

import { useReducer, type SetStateAction } from "react";

export type CategoryManagerState<Item> = {
  categoryList: Item[];
  categoryManagerOpen: boolean;
  editingCategory: Item | null;
  categoryError: string;
  incomeCategoryList: Item[];
  incomeManagerOpen: boolean;
  editingIncomeCategory: Item | null;
  incomeCategoryError: string;
};

type CategoryManagerAction<Item> =
  | {
      type: "field";
      key: keyof CategoryManagerState<Item>;
      value: SetStateAction<CategoryManagerState<Item>[keyof CategoryManagerState<Item>]>;
    }
  | { type: "close-category-editor" }
  | { type: "close-income-editor" };

export function initialCategoryManagerState<Item>(input: {
  categories: Item[];
  incomeCategories: Item[];
}): CategoryManagerState<Item> {
  return {
    categoryList: input.categories,
    categoryManagerOpen: false,
    editingCategory: null,
    categoryError: "",
    incomeCategoryList: input.incomeCategories,
    incomeManagerOpen: false,
    editingIncomeCategory: null,
    incomeCategoryError: "",
  };
}

export function categoryManagerReducer<Item>(
  state: CategoryManagerState<Item>,
  action: CategoryManagerAction<Item>,
) {
  if (action.type === "close-category-editor")
    return { ...state, editingCategory: null, categoryError: "" };
  if (action.type === "close-income-editor")
    return { ...state, editingIncomeCategory: null, incomeCategoryError: "" };
  const current = state[action.key];
  const value = typeof action.value === "function"
    ? (action.value as (previous: typeof current) => typeof current)(current)
    : action.value;
  return { ...state, [action.key]: value };
}

export function useCategoryManagerState<Item>(input: {
  categories: Item[];
  incomeCategories: Item[];
}) {
  const [state, dispatch] = useReducer(
    categoryManagerReducer<Item>,
    input,
    initialCategoryManagerState<Item>,
  );
  const setter = <Key extends keyof CategoryManagerState<Item>>(key: Key) =>
    (value: SetStateAction<CategoryManagerState<Item>[Key]>) =>
      dispatch({ type: "field", key, value } as CategoryManagerAction<Item>);
  return {
    ...state,
    setCategoryList: setter("categoryList"),
    setCategoryManagerOpen: setter("categoryManagerOpen"),
    setEditingCategory: setter("editingCategory"),
    setCategoryError: setter("categoryError"),
    setIncomeCategoryList: setter("incomeCategoryList"),
    setIncomeManagerOpen: setter("incomeManagerOpen"),
    setEditingIncomeCategory: setter("editingIncomeCategory"),
    setIncomeCategoryError: setter("incomeCategoryError"),
    closeCategoryEditor: () => dispatch({ type: "close-category-editor" }),
    closeIncomeEditor: () => dispatch({ type: "close-income-editor" }),
  };
}
