// API 层集成测试入口：直接驱动 app/api 下的路由处理函数，
// 用 node:sqlite 顶替 Cloudflare D1，不需要起服务、不碰真实数据库。
//
// 每个套件跑在独立子进程与独立数据库文件里，避免互相污染。
// 单独运行：npm run test:api

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workDir = mkdtempSync(path.join(tmpdir(), "neo-ledger-api-"));
const snapshot = path.join(workDir, "export-snapshot.json");

const suites = ["suite1.mjs", "suite2.mjs", "suite3.mjs"];

function runSuite(file, index) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        "--no-warnings",
        "--import",
        path.join(here, "register.mjs"),
        path.join(here, file),
      ],
      {
        cwd: here,
        stdio: "inherit",
        env: {
          ...process.env,
          TZ: "Asia/Shanghai",
          NL_DB: path.join(workDir, `suite${index + 1}.sqlite`),
          NL_SNAPSHOT: snapshot,
        },
      },
    );
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

let failed = 0;
for (const [index, file] of suites.entries()) {
  // 套件 3 依赖套件 1 导出的备份快照，必须按顺序执行。
  failed += (await runSuite(file, index)) === 0 ? 0 : 1;
}

rmSync(workDir, { recursive: true, force: true });

if (failed) {
  console.error(`\nAPI 集成测试：${failed} 个套件失败`);
  process.exit(1);
}
console.log("\nAPI 集成测试：全部套件通过");
