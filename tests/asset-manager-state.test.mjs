import assert from "node:assert/strict";
import test from "node:test";
import {
  assetManagerReducer,
  initialAssetManagerState,
} from "../app/asset-manager-state.ts";

const asset = { id: 4, name: "相机", currentValue: 120000 };

test("asset manager initializes safe editor and valuation defaults", () => {
  const state = initialAssetManagerState([asset]);
  assert.deepEqual(state.digitalAssetList, [asset]);
  assert.equal(state.digitalAssetPage, 1);
  assert.equal(state.assetType, "数码设备");
  assert.equal(state.assetValuationMode, "自动折旧");
  assert.equal(state.editingAsset, null);
  assert.equal(state.liquidatingAsset, null);
});

test("closing asset editor clears only editor state and error", () => {
  let state = initialAssetManagerState([asset]);
  state = assetManagerReducer(state, { type: "field", key: "assetOpen", value: true });
  state = assetManagerReducer(state, { type: "field", key: "editingAsset", value: asset });
  state = assetManagerReducer(state, { type: "field", key: "assetError", value: "估值失败" });
  state = assetManagerReducer(state, { type: "field", key: "liquidatingAsset", value: asset });
  state = assetManagerReducer(state, { type: "close-editor" });
  assert.equal(state.assetOpen, false);
  assert.equal(state.editingAsset, null);
  assert.equal(state.assetError, "");
  assert.equal(state.liquidatingAsset, asset);
});

test("closing liquidation does not alter the asset collection", () => {
  let state = initialAssetManagerState([asset]);
  state = assetManagerReducer(state, { type: "field", key: "liquidatingAsset", value: asset });
  state = assetManagerReducer(state, { type: "close-liquidation" });
  assert.equal(state.liquidatingAsset, null);
  assert.deepEqual(state.digitalAssetList, [asset]);
});
