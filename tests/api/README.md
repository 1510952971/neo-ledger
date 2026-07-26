# API 集成测试

直接调用 `app/api/**/route.ts` 导出的 `GET/POST/PUT/PATCH/DELETE` 函数，在真实 SQLite 上验证行为。不需要启动开发服务器，也不会碰你本机的账本数据库。

```bash
npm run test:api     # 只跑 API 套件（约 96 项断言）
npm test             # 构建 + 单元测试 + API 套件
```

## 组成

| 文件 | 作用 |
| --- | --- |
| `run.mjs` | 入口。为每个套件建独立临时数据库并按顺序在子进程中执行 |
| `register.mjs` / `resolver.mjs` | 模块解析钩子：把 `cloudflare:workers`、`next/server` 指向下面的替身，并补全 TS 的扩展名省略 |
| `shim-cloudflare-workers.mjs` | 用 `node:sqlite` 实现 D1 的 `prepare/bind/first/all/run/batch` 接口 |
| `shim-next-server.mjs` | `NextResponse` 的最小实现 |
| `lib.mjs` | 断言与请求辅助函数 |
| `suite1.mjs` | 核心记账链路：账本、账户、分类、流水、转账、预算、导出 |
| `suite2.mjs` | 业务模块：储蓄目标、订阅、分期、成员、资产、令牌、导入、P2P |
| `suite3.mjs` | 备份恢复回环、注册登录、鉴权边界、WebDAV 安全校验 |

套件 3 会读取套件 1 导出的备份快照，因此三者必须按顺序执行。

## 新增用例

在对应套件里追加即可：

```js
describe("你的模块");
const mod = await import("../../app/api/你的路由/route.ts");
const r = await call(mod, "POST", "/api/你的路由", { body: { ... } });
check("说明", r.status === 200, r.text);
```

`call()` 支持 `body`（自动转 JSON）、`cookie`、`headers`、`raw`，返回 `{ status, json, text, headers }`；路由抛异常时返回 `status: 599` 并带堆栈，方便定位崩溃。
