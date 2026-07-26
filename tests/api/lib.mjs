export const results = [];
let section = "";
export function describe(name) { section = name; }
export function check(name, ok, detail = "") {
  results.push({ section, name, ok: !!ok, detail: String(detail).slice(0, 260) });
  if (!ok) console.log(`  ✗ [${section}] ${name} :: ${String(detail).slice(0, 260)}`);
}
export async function call(mod, method, url, { body, cookie, headers = {}, raw } = {}) {
  const init = { method, headers: new Headers(headers) };
  if (cookie) init.headers.set("cookie", cookie);
  if (raw !== undefined) { init.body = raw; }
  else if (body !== undefined) {
    init.headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }
  const request = new Request(new URL(url, "http://localhost:3000"), init);
  const handler = mod[method];
  if (typeof handler !== "function") return { status: -1, json: null, error: `no ${method}` };
  try {
    const response = await handler(request);
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: response.status, json, text, headers: response.headers };
  } catch (error) {
    return { status: 599, json: null, text: String(error && error.stack || error), crashed: true };
  }
}
export function summary(label) {
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log(`\n== ${label}: ${pass} 通过 / ${fail} 失败 / 共 ${results.length} ==`);
  for (const r of results.filter(r => !r.ok)) console.log(`FAIL|${r.section}|${r.name}|${r.detail}`);
  return fail;
}
