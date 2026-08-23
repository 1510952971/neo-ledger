import {
  PASSWORD_DENYLIST_ENTRIES,
  PASSWORD_DENYLIST_SIZE,
  PASSWORD_DENYLIST_VERSION,
} from "../app/password-denylist.js";

if (!/^20\d\d-\d\d-[a-z0-9-]+$/u.test(PASSWORD_DENYLIST_VERSION))
  throw new Error("password denylist version must be reviewable and date-prefixed");
if (PASSWORD_DENYLIST_ENTRIES.length < 50 || PASSWORD_DENYLIST_SIZE !== PASSWORD_DENYLIST_ENTRIES.length)
  throw new Error("password denylist is unexpectedly small or contains duplicate entries");
if (PASSWORD_DENYLIST_ENTRIES.some((value) => typeof value !== "string" || value.length < 8 || value.length > 72))
  throw new Error("password denylist entries must fit the server password length policy");
if (new Set(PASSWORD_DENYLIST_ENTRIES).size !== PASSWORD_DENYLIST_ENTRIES.length)
  throw new Error("password denylist contains duplicate entries");
console.log(`PASS password denylist ${PASSWORD_DENYLIST_VERSION} (${PASSWORD_DENYLIST_SIZE} entries)`);
