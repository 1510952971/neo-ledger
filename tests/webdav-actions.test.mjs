import assert from "node:assert/strict";
import test from "node:test";
import {
  downloadWebDavSnapshot,
  uploadWebDavSnapshot,
} from "../app/webdav-actions.ts";

function requestStub(data = {}) {
  const calls = [];
  const request = async (input, init, maxBytes) => {
    calls.push({ input, init, maxBytes });
    return { response: new Response(null, { status: 200 }), data };
  };
  request.calls = calls;
  return request;
}

const credentials = {
  url: "https://dav.example.com/ledger",
  username: "peng",
  password: "secret",
};

test("WebDAV upload keeps credentials scoped to the server action payload", async () => {
  const request = requestStub();
  await uploadWebDavSnapshot({ credentials, payload: "encrypted-payload", request });
  assert.equal(request.calls[0].input, "/api/webdav-sync");
  assert.equal(request.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(request.calls[0].init.body), {
    ...credentials,
    action: "upload",
    payload: "encrypted-payload",
  });
});

test("WebDAV download uses a finite response budget and no upload payload", async () => {
  const request = requestStub({ payload: "encrypted-payload" });
  await downloadWebDavSnapshot({ credentials, request });
  assert.deepEqual(JSON.parse(request.calls[0].init.body), {
    ...credentials,
    action: "download",
  });
  assert.equal(request.calls[0].maxBytes, 55 * 1024 * 1024);
});
