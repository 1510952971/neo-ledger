import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function luminance(hex) {
  const channels = [1, 3, 5].map(
    (index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255,
  );
  return channels
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
      0,
    );
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("fixed light cards keep readable text in every theme", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /--light-card-text:#2f392f/);
  assert.match(css, /--light-card-muted:#596159/);
  assert.match(css, /\.finance-shell \.account-card\.investment/);
  assert.match(css, /\.finance-shell \.goal-card/);

  const backgrounds = ["#edf5ee", "#fffefa", "#f3e1d4", "#fff9ef", "#e7eadc"];
  for (const background of backgrounds) {
    assert.ok(contrast(background, "#2f392f") >= 4.5);
    assert.ok(contrast(background, "#596159") >= 4.5);
  }
  assert.ok(contrast("#edf5ee", "#36724f") >= 4.5);
  for (const background of ["#a8b8aa", "#d2ddd2"]) {
    assert.ok(contrast(background, "#243229") >= 4.5);
    assert.ok(contrast(background, "#35443b") >= 4.5);
  }
  for (const [background, foreground] of [
    ["#e98668", "#3d231b"],
    ["#9cff57", "#10230b"],
    ["#62aee2", "#17313f"],
    ["#ff765f", "#43201a"],
    ["#dce9dc", "#2c3a30"],
    ["#dff0e3", "#294332"],
    ["#fff2d8", "#70460c"],
    ["#f4dfbe", "#65420e"],
    ["#dae9ed", "#315665"],
    ["#ffe0ce", "#7d3524"],
    ["#e9e5da", "#4f4a43"],
    ["#fffaf2", "#704332"],
    ["#f7e6df", "#7a3d2d"],
    ["#e8eddf", "#45553d"],
    ["#f5e9c8", "#68480d"],
    ["#f2ded2", "#713b2e"],
    ["#f2ede3", "#565047"],
    ["#f2eee5", "#565047"],
    ["#fff9f1", "#704332"],
    ["#f5e7df", "#7a3d2d"],
    ["#e4efe5", "#355c42"],
    ["#fffefa", "#793e2e"],
    ["#e9ded0", "#69422f"],
    ["#eef6ef", "#355c42"],
    ["#eadfd2", "#6b4030"],
    ["#f5e5e1", "#773d35"],
    ["#eadbc9", "#6d402d"],
    ["#3f91d1", "#0b2430"],
    ["#ffe8e3", "#81392f"],
  ]) {
    assert.ok(contrast(background, foreground) >= 4.5);
  }
});
