import assert from "node:assert/strict";
import test from "node:test";
import { createMember } from "../app/member-actions.ts";

test("member creation keeps ledger scope and derived icon payload", async () => {
  const calls = [];
  const request = async (input, init) => {
    calls.push({ input, init });
    return {
      response: new Response(null, { status: 201 }),
      data: { id: 17, name: "室友", isMe: false },
    };
  };
  const result = await createMember({ ledgerId: 4, name: "室友", icon: "🧑‍🤝‍🧑", request });
  assert.equal(result.data.id, 17);
  assert.equal(calls[0].input, "/api/members");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    ledgerId: 4,
    name: "室友",
    icon: "🧑‍🤝‍🧑",
  });
});
