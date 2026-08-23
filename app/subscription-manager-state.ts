"use client";

import { useReducer, type SetStateAction } from "react";

export type SubscriptionCategoryDraft = {
  name: string;
  icon: string;
  color: string;
};

export type SubscriptionManagerState<Item> = {
  subscriptionList: Item[];
  subscriptionPage: number;
  subscriptionOpen: boolean;
  editingSubscription: Item | null;
  subscriptionError: string;
  subscriptionCategory: string;
  subscriptionCategoryOpen: boolean;
  subscriptionCategoryError: string;
  subscriptionCategoryDraft: SubscriptionCategoryDraft;
};

type SubscriptionManagerAction<Item> =
  | {
      type: "field";
      key: keyof SubscriptionManagerState<Item>;
      value: SetStateAction<SubscriptionManagerState<Item>[keyof SubscriptionManagerState<Item>]>;
    }
  | { type: "open"; item: Item | null; category: string }
  | { type: "close" }
  | { type: "reset-category-draft" };

const emptyCategoryDraft = (): SubscriptionCategoryDraft => ({
  name: "",
  icon: "📦",
  color: "#8f91b8",
});

export function initialSubscriptionManagerState<Item>(items: Item[]): SubscriptionManagerState<Item> {
  return {
    subscriptionList: items,
    subscriptionPage: 1,
    subscriptionOpen: false,
    editingSubscription: null,
    subscriptionError: "",
    subscriptionCategory: "",
    subscriptionCategoryOpen: false,
    subscriptionCategoryError: "",
    subscriptionCategoryDraft: emptyCategoryDraft(),
  };
}

export function subscriptionManagerReducer<Item>(
  state: SubscriptionManagerState<Item>,
  action: SubscriptionManagerAction<Item>,
): SubscriptionManagerState<Item> {
  if (action.type === "open") {
    return {
      ...state,
      subscriptionOpen: true,
      editingSubscription: action.item,
      subscriptionError: "",
      subscriptionCategory: action.category,
      subscriptionCategoryOpen: false,
      subscriptionCategoryError: "",
    };
  }
  if (action.type === "close") {
    return {
      ...state,
      subscriptionOpen: false,
      editingSubscription: null,
      subscriptionError: "",
      subscriptionCategoryOpen: false,
      subscriptionCategoryError: "",
    };
  }
  if (action.type === "reset-category-draft") {
    return { ...state, subscriptionCategoryDraft: emptyCategoryDraft() };
  }
  const current = state[action.key];
  const value = typeof action.value === "function"
    ? (action.value as (previous: typeof current) => typeof current)(current)
    : action.value;
  return { ...state, [action.key]: value };
}

export function useSubscriptionManagerState<Item>(items: Item[]) {
  const [state, dispatch] = useReducer(
    subscriptionManagerReducer<Item>,
    items,
    initialSubscriptionManagerState<Item>,
  );
  const setter = <Key extends keyof SubscriptionManagerState<Item>>(key: Key) =>
    (value: SetStateAction<SubscriptionManagerState<Item>[Key]>) =>
      dispatch({ type: "field", key, value } as SubscriptionManagerAction<Item>);
  return {
    ...state,
    setSubscriptionList: setter("subscriptionList"),
    setSubscriptionPage: setter("subscriptionPage"),
    setSubscriptionOpen: setter("subscriptionOpen"),
    setEditingSubscription: setter("editingSubscription"),
    setSubscriptionError: setter("subscriptionError"),
    setSubscriptionCategory: setter("subscriptionCategory"),
    setSubscriptionCategoryOpen: setter("subscriptionCategoryOpen"),
    setSubscriptionCategoryError: setter("subscriptionCategoryError"),
    setSubscriptionCategoryDraft: setter("subscriptionCategoryDraft"),
    openSubscriptionEditor: (item: Item | null, category: string) =>
      dispatch({ type: "open", item, category }),
    closeSubscriptionEditor: () => dispatch({ type: "close" }),
    resetSubscriptionCategoryDraft: () => dispatch({ type: "reset-category-draft" }),
  };
}
