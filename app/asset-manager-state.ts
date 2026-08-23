"use client";

import { useReducer, type SetStateAction } from "react";

export type AssetValuationMode = "自动折旧" | "手动估值";

export type AssetManagerState<Item> = {
  digitalAssetList: Item[];
  digitalAssetPage: number;
  assetOpen: boolean;
  editingAsset: Item | null;
  assetType: string;
  assetValuationMode: AssetValuationMode;
  assetError: string;
  liquidatingAsset: Item | null;
};

type AssetManagerAction<Item> =
  | {
      type: "field";
      key: keyof AssetManagerState<Item>;
      value: SetStateAction<AssetManagerState<Item>[keyof AssetManagerState<Item>]>;
    }
  | { type: "close-editor" }
  | { type: "close-liquidation" };

export function initialAssetManagerState<Item>(assets: Item[]): AssetManagerState<Item> {
  return {
    digitalAssetList: assets,
    digitalAssetPage: 1,
    assetOpen: false,
    editingAsset: null,
    assetType: "数码设备",
    assetValuationMode: "自动折旧",
    assetError: "",
    liquidatingAsset: null,
  };
}

export function assetManagerReducer<Item>(
  state: AssetManagerState<Item>,
  action: AssetManagerAction<Item>,
) {
  if (action.type === "close-editor")
    return { ...state, assetOpen: false, editingAsset: null, assetError: "" };
  if (action.type === "close-liquidation")
    return { ...state, liquidatingAsset: null, assetError: "" };
  const current = state[action.key];
  const value = typeof action.value === "function"
    ? (action.value as (previous: typeof current) => typeof current)(current)
    : action.value;
  return { ...state, [action.key]: value };
}

export function useAssetManagerState<Item>(assets: Item[]) {
  const [state, dispatch] = useReducer(
    assetManagerReducer<Item>,
    assets,
    initialAssetManagerState<Item>,
  );
  const setter = <Key extends keyof AssetManagerState<Item>>(key: Key) =>
    (value: SetStateAction<AssetManagerState<Item>[Key]>) =>
      dispatch({ type: "field", key, value } as AssetManagerAction<Item>);
  return {
    ...state,
    setDigitalAssetList: setter("digitalAssetList"),
    setDigitalAssetPage: setter("digitalAssetPage"),
    setAssetOpen: setter("assetOpen"),
    setEditingAsset: setter("editingAsset"),
    setAssetType: setter("assetType"),
    setAssetValuationMode: setter("assetValuationMode"),
    setAssetError: setter("assetError"),
    setLiquidatingAsset: setter("liquidatingAsset"),
    closeAssetEditorState: () => dispatch({ type: "close-editor" }),
    closeLiquidationState: () => dispatch({ type: "close-liquidation" }),
  };
}
