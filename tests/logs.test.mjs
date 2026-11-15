import test from "node:test";
import assert from "node:assert/strict";
import { parseLogs, filterLogs, summarize } from "../src/logs.ts";
const row = { deviceId: "doorlock-01", eventId: "boot-1", uid: "40DE91A1", granted: false, receivedAt: 1794753858656 };
test("sorterar efter receivedAt, inte slumpmässigt eventId", () => {
  const logs = parseLogs({ logs: [{ ...row, eventId: "z-1" }, { ...row, eventId: "a-1", receivedAt: row.receivedAt + 1000 }] });
  assert.equal(logs[0].eventId, "a-1");
});
test("false förblir nekad och strängen false avvisas", () => {
  assert.equal(parseLogs({ logs: [row] })[0].granted, false);
  assert.throws(() => parseLogs({ logs: [{ ...row, granted: "false" }] }));
});
test("avvisar saknade eller ogiltiga tidsstämplar", () => {
  for (const receivedAt of [undefined, "1794753858656", NaN, Infinity, 0]) {
    assert.throws(() => parseLogs({ logs: [{ ...row, receivedAt }] }));
  }
});
test("kombinerar UID-sökning och statusfilter", () => {
  const logs = [row, { ...row, uid: "ABC123", granted: true }];
  assert.equal(filterLogs(logs, " 40de ", "denied").length, 1);
  assert.equal(filterLogs(logs, "40de", "granted").length, 0);
  assert.deepEqual(summarize(logs), { total: 2, granted: 1, denied: 1 });
});
test("tom databas är tillåten, felaktigt API-format ger fel", () => {
  assert.deepEqual(parseLogs({ logs: [] }), []);
  assert.throws(() => parseLogs({ message: "failure" }));
});
