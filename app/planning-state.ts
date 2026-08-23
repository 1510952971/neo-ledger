"use client";

import { useEffect, useReducer, type SetStateAction } from "react";

export type StressEvents = {
  unemployment: boolean;
  crash: boolean;
  emergency: boolean;
};

export type PlanningState<Budget, Member, Fire, Economic> = {
  categoryBudgetList: Budget[];
  categoryBudgetPage: number;
  memberList: Member[];
  settlementPage: number;
  installmentPage: number;
  stressEvents: StressEvents;
  fireConfig: Fire;
  inflationConfig: Economic;
};

type PlanningAction<Budget, Member, Fire, Economic> =
  | {
      type: "field";
      key: keyof PlanningState<Budget, Member, Fire, Economic>;
      value: SetStateAction<PlanningState<Budget, Member, Fire, Economic>[keyof PlanningState<Budget, Member, Fire, Economic>]>;
    }
  | {
      type: "hydrate";
      categoryBudgets?: Budget[];
      members?: Member[];
      fireConfig: Fire;
      inflationConfig: Economic;
    };

export function initialPlanningState<Budget, Member, Fire, Economic>(input: {
  categoryBudgets?: Budget[];
  members?: Member[];
  fireConfig: Fire;
  inflationConfig: Economic;
}): PlanningState<Budget, Member, Fire, Economic> {
  return {
    categoryBudgetList: input.categoryBudgets ?? [],
    categoryBudgetPage: 1,
    memberList: input.members ?? [],
    settlementPage: 1,
    installmentPage: 1,
    stressEvents: { unemployment: false, crash: false, emergency: false },
    fireConfig: input.fireConfig,
    inflationConfig: input.inflationConfig,
  };
}

export function planningReducer<Budget, Member, Fire, Economic>(
  state: PlanningState<Budget, Member, Fire, Economic>,
  action: PlanningAction<Budget, Member, Fire, Economic>,
) {
  if (action.type === "hydrate")
    return {
      ...state,
      categoryBudgetList: action.categoryBudgets ?? [],
      categoryBudgetPage: 1,
      memberList: action.members ?? [],
      settlementPage: 1,
      fireConfig: action.fireConfig,
      inflationConfig: action.inflationConfig,
    };
  const current = state[action.key];
  const value = typeof action.value === "function"
    ? (action.value as (previous: typeof current) => typeof current)(current)
    : action.value;
  return { ...state, [action.key]: value };
}

export function usePlanningState<Budget, Member, Fire, Economic>(input: {
  categoryBudgets?: Budget[];
  members?: Member[];
  fireConfig: Fire;
  inflationConfig: Economic;
}) {
  const [state, dispatch] = useReducer(
    planningReducer<Budget, Member, Fire, Economic>,
    input,
    initialPlanningState<Budget, Member, Fire, Economic>,
  );
  useEffect(() => {
    dispatch({
      type: "hydrate",
      categoryBudgets: input.categoryBudgets,
      members: input.members,
      fireConfig: input.fireConfig,
      inflationConfig: input.inflationConfig,
    });
  }, [input.categoryBudgets, input.members, input.fireConfig, input.inflationConfig]);
  const setter = <Key extends keyof PlanningState<Budget, Member, Fire, Economic>>(key: Key) =>
    (value: SetStateAction<PlanningState<Budget, Member, Fire, Economic>[Key]>) =>
      dispatch({ type: "field", key, value } as PlanningAction<Budget, Member, Fire, Economic>);
  return {
    ...state,
    setCategoryBudgetList: setter("categoryBudgetList"),
    setCategoryBudgetPage: setter("categoryBudgetPage"),
    setMemberList: setter("memberList"),
    setSettlementPage: setter("settlementPage"),
    setInstallmentPage: setter("installmentPage"),
    setStressEvents: setter("stressEvents"),
    setFireConfig: setter("fireConfig"),
    setInflationConfig: setter("inflationConfig"),
  };
}
