import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { projectDay, workspace, type BridgedRoom } from "./src/workspace.ts";

const day = "2026-11-21";
function room(
  name: string,
  topic: string | null = null,
  protocol = "slack",
  extra: Record<string, unknown> = {},
): BridgedRoom {
  return {
    roomId: "!" + name,
    name,
    topic,
    bridges: [{ content: { protocol: { id: protocol }, ...extra } }],
  };
}

void test("only Slack issue channels with the exact Linear status appear in Home", () => {
  const data = workspace(
    [
      room("leon-12-review", "Awaiting Leon · https://linear.app/team/issue/LEON-12"),
      room("#leon-2-invoice", "Awaiting Leon"),
      room("leon-3-start", "Awaiting Start · due: Awaiting Leon"),
      room("leon-4-clarify", "Awaiting Leon Again"),
      room("leon-5-no-topic", null),
      room("leon-6-sms", "Awaiting Leon", "sms"),
      room("leon-7-dm", "Awaiting Leon", "slack", { "com.beeper.room_type": "dm" }),
      room("general", "Awaiting Leon"),
      room("project-demo", "Awaiting Leon"),
    ],
    day,
  );

  assert.deepEqual(
    data.awaiting.map(({ name }) => name),
    ["leon-2-invoice", "leon-12-review"],
  );
  assert.deepEqual(
    data.projects.map(({ name }) => name),
    ["project-demo"],
  );
  assert.equal(data.today, null);
  assert.equal(data.channels.has("!general"), true);
  assert.equal(data.channels.has("!leon-6-sms"), false);
});

void test("today's project handles channel naming collisions and early dailylinear names", () => {
  const names = [
    room("project-2026-11-20"),
    room("project-2026-11-21-10"),
    room("#project-2026-11-21-2", null, "slackgo"),
    room("project-20261121"),
    room("project-2026-11-21", null, "slack"),
  ];
  assert.equal(workspace(names, day).today?.name, "project-2026-11-21");
  assert.equal(workspace(names.slice(0, -1), day).today?.name, "project-20261121");
  assert.equal(workspace(names.slice(0, -2), day).today?.name, "project-2026-11-21-2");
  assert.equal(workspace(names, "2026-11-22").today, null);
});

void test("the project date rolls over at midnight in Toronto in both seasons", () => {
  assert.equal(projectDay(new Date("2026-11-22T04:59:59Z")), "2026-11-21");
  assert.equal(projectDay(new Date("2026-11-22T05:00:00Z")), "2026-11-22");
  assert.equal(projectDay(new Date("2026-07-02T03:59:59Z")), "2026-07-01");
  assert.equal(projectDay(new Date("2026-07-02T04:00:00Z")), "2026-07-02");
});

void test("the repo index points to a self-contained Zami plugin bundle", async () => {
  const index: { schema: number; plugins: ({ path: string } & Record<string, unknown>)[] } =
    JSON.parse(await readFile(new URL("./index.json", import.meta.url), "utf8"));
  assert.equal(index.schema, 1);
  const [entry] = index.plugins;
  assert.ok(entry);
  const { path, ...listing } = entry;
  const manifest: { entry: string } & Record<string, unknown> = JSON.parse(
    await readFile(new URL(`./${path}/manifest.json`, import.meta.url), "utf8"),
  );
  for (const [key, value] of Object.entries(listing)) assert.equal(manifest[key], value);
  // Zami imports the bundle from a blob URL. A data URL provides the same
  // standalone ESM check in Node, including rejection of relative imports.
  const code = await readFile(new URL(`./${path}/${manifest.entry}`, import.meta.url));
  const bundle = await import(`data:text/javascript;base64,${code.toString("base64")}`);
  assert.equal(typeof bundle.default?.onload, "function");
});
