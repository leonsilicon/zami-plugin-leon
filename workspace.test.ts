import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { composerPlaceholder, isMatrixPreview, issueForLink, messageAuthor } from "./src/chat.ts";
import { slackAccountAvatar } from "./src/slack-avatar.ts";
import {
  projectDay,
  projectDayEnd,
  projectLabel,
  readProjectVisibility,
  workspace,
  type BridgedRoom,
} from "./src/workspace.ts";
import type { MatrixLink } from "./src/zami.ts";

const day = "2026-11-21";

void test("Home matches the Slack avatar to the room's bridge login", () => {
  const avatar = (id: string) => ({ remote_profile: { avatar: `mxc://beeper.test/${id}` } });
  const accountData = {
    bridges: {
      discordgo: { remoteState: { "TWORK-UONE": avatar("discord") } },
      slackgo: {
        remoteState: {
          "TWORK-UONE": avatar("first"),
          "TWORK-UTWO": avatar("second"),
          "TOTHER-UONE": avatar("other"),
        },
      },
    },
  };
  const bridge = (team: string, receiver?: string) => [
    {
      content: {
        protocol: { id: "slackgo" },
        "com.beeper.bridge_name": "slackgo",
        channel: { "fi.mau.receiver": receiver },
        network: { id: team },
      },
    },
  ];
  assert.equal(
    slackAccountAvatar(accountData, bridge("TWORK", "TWORK-UTWO")),
    "mxc://beeper.test/second",
  );
  assert.equal(slackAccountAvatar(accountData, bridge("TOTHER")), "mxc://beeper.test/other");
  assert.equal(slackAccountAvatar(accountData, bridge("TWORK")), null);
  assert.equal(slackAccountAvatar(accountData, bridge("TOTHER", "TOTHER-UMISSING")), null);
  assert.equal(slackAccountAvatar(null, bridge("TWORK", "TWORK-UTWO")), null);
});

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

function issueRoom(name: string, metadata: Record<string, unknown> = {}): BridgedRoom {
  const identifier = /leon-\d+/i.exec(name)![0].toUpperCase();
  const channelId = "C" + identifier.replace("-", "");
  return {
    ...room(name, null, "slackgo", { channel: { id: `TWORK-${channelId}` } }),
    issueMetadata: {
      version: 1,
      identifier,
      channelId,
      title: "Example issue",
      statusName: "Awaiting Leon",
      statusType: "started",
      statusColor: "#f2c94c",
      priority: 0,
      url: `https://linear.app/team/issue/${identifier}`,
      ...metadata,
    },
  };
}

void test("Slack channel links use synced issue details and fall back to the channel slug", () => {
  const issue = issueRoom("##leon-440-reply-to", {
    title: "Reply to Farhan Shaikh",
    priority: 2,
  });
  const data = workspace([issue, room("general")], day);
  const matrixLink = "https://matrix.to/#/!issue:beeper.com";
  const targets = new Map<string, MatrixLink>([
    [matrixLink, { kind: "room", roomId: issue.roomId }],
    ["matrix:roomid/other:beeper.com", { kind: "room", roomId: "!other:beeper.com" }],
    ["matrix:roomid/general:beeper.com", { kind: "room", roomId: "!general" }],
    ["matrix:roomid/native:example.org", { kind: "room", roomId: "!native:example.org" }],
    [
      "matrix:roomid/issue:beeper.com/e/test",
      { kind: "room", roomId: issue.roomId, eventId: "$test" },
    ],
  ]);
  const resolve = (href: string, label = "leon-440-reply-to") =>
    issueForLink(
      href,
      label,
      data,
      (url) => targets.get(url),
      (id) => id === "!native:example.org",
    );

  const synced = {
    identifier: "LEON-440",
    title: "Reply to Farhan Shaikh",
    status: "Awaiting Leon",
    statusType: "started",
    statusColor: "#f2c94c",
  };
  assert.deepEqual(resolve(matrixLink), synced);
  assert.deepEqual(resolve("https://leon.slack.com/archives/CLEON440", ""), synced);
  assert.deepEqual(resolve("https://app.slack.com/client/TWORK/CLEON440"), synced);
  assert.equal(
    resolve("matrix:roomid/other:beeper.com", "#leon-443-recurring-sleep-task")?.title,
    "Recurring sleep task",
  );
  assert.equal(resolve("matrix:roomid/general:beeper.com"), undefined);
  assert.equal(resolve("matrix:roomid/native:example.org"), undefined);
  assert.equal(resolve("matrix:roomid/issue:beeper.com/e/test"), undefined);
  assert.equal(resolve("https://leon.slack.com/archives/CLEON440/p123"), undefined);
  assert.equal(resolve("https://leon.slack.com.example.org/archives/CLEON440"), undefined);
});

void test("Matrix web previews are suppressed without matching other sites", () => {
  assert.equal(isMatrixPreview("https://matrix.to/#/!room:beeper.com"), true);
  assert.equal(isMatrixPreview("https://matrix.to/"), true);
  assert.equal(isMatrixPreview("https://matrix.to.example.org/"), false);
  assert.equal(isMatrixPreview("https://example.org/matrix.to"), false);
});

void test("composer removes extra room sigils using the translated template", () => {
  const normalize = composerPlaceholder("Message #ROOM", "ROOM");
  assert.equal(normalize("Message ##project-example"), "Message #project-example");
  assert.equal(normalize("Message #project-example"), "Message #project-example");
  assert.equal(normalize("Reply to ##matrix"), "Reply to ##matrix");
  const chinese = composerPlaceholder("给 #ROOM 发消息", "ROOM");
  assert.equal(chinese("给 ###project-example 发消息"), "给 #project-example 发消息");
});

void test("chat distinguishes Hermes, other Slack bots, and people", () => {
  const ownUserId = "@me:example.org";
  assert.equal(messageAuthor(ownUserId, ownUserId, "Me"), "own");
  assert.equal(messageAuthor("@hermes:example.org", ownUserId, "Hermes (bot)"), "hermes");
  assert.equal(messageAuthor("@hermes:example.org", ownUserId, "Captain Claude (Slack)"), "hermes");
  assert.equal(messageAuthor("@linear:example.org", ownUserId, "Linear Sync (bot)"), "bot");
  assert.equal(messageAuthor("@person:example.org", ownUserId, "Someone (Slack)"), undefined);
});

void test("Home uses Matrix status for matching Slack issue rooms", () => {
  const data = workspace(
    [
      issueRoom("leon-12-review"),
      issueRoom("#leon-2-invoice"),
      issueRoom("leon-3-start", { statusName: "Awaiting Start" }),
      issueRoom("leon-4-clarify", { statusName: "Awaiting Leon Again" }),
      room("leon-5-no-metadata"),
      room("leon-6-sms", null, "sms"),
      room("leon-7-dm", null, "slack", { "com.beeper.room_type": "dm" }),
      issueRoom("leon-8-completed", { statusType: "completed" }),
      issueRoom("leon-9-canceled", { statusType: "canceled" }),
      issueRoom("leon-10-wrong-link", { url: "https://linear.app/team/issue/LEON-90" }),
      room("leon-lounge"),
      room("general"),
      room("project-demo"),
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
  assert.equal(data.channels.has("!leon-9-canceled"), true);
});

void test("Issue rooms ignore Slack topics and update when Matrix account data arrives", () => {
  const task = issueRoom("leon-12-review", {
    title: "Full title ".repeat(30).trim(),
    priority: 1,
  });
  task.topic =
    "Awaiting Leon · linear:v1 started #f2c94c p2 · https://linear.app/team/issue/LEON-12 · Stale topic";
  const details = task.issueMetadata!;

  for (const issueMetadata of [
    null,
    { ...details, channelId: "CWRONG" },
    { ...details, deleted: true },
  ]) {
    const data = workspace([{ ...task, issueMetadata }], day);
    assert.equal(data.channels.get(task.roomId)?.issue, undefined);
    assert.deepEqual(data.awaiting, []);
  }

  const data = workspace([task], day);
  assert.equal(data.awaiting[0]?.issue?.title, details.title);
  assert.equal(data.awaiting[0]?.issue?.priority, 1);
  const moved = workspace(
    [{ ...task, issueMetadata: { ...details, statusName: "Awaiting Hermes" } }],
    day,
  );
  assert.deepEqual(moved.awaiting, []);
});

void test("issue rows read the synced title, priority, and status appearance", () => {
  const data = workspace(
    [
      issueRoom("leon-4-cancel-fongo", { title: "Cancel Fongo Works · Montréal", priority: 2 }),
      issueRoom("leon-5-done", { title: "Done item", statusType: "completed", priority: 1 }),
      issueRoom("leon-6-unprioritized", {
        title: "Unprioritized item",
        statusType: "unstarted",
        priority: null,
      }),
      issueRoom("leon-7-no-priority", { title: "No priority yet" }),
      issueRoom("leon-8-invalid", { title: "Malformed priority", priority: 20 }),
    ],
    day,
  );
  assert.deepEqual(
    data.awaiting.map(({ issue }) => issue),
    [
      {
        title: "Cancel Fongo Works · Montréal",
        priority: 2,
        statusName: "Awaiting Leon",
        statusType: "started",
        statusColor: "#f2c94c",
      },
      {
        title: "Unprioritized item",
        priority: null,
        statusName: "Awaiting Leon",
        statusType: "unstarted",
        statusColor: "#f2c94c",
      },
      {
        title: "No priority yet",
        priority: 0,
        statusName: "Awaiting Leon",
        statusType: "started",
        statusColor: "#f2c94c",
      },
      {
        title: "Malformed priority",
        priority: null,
        statusName: "Awaiting Leon",
        statusType: "started",
        statusColor: "#f2c94c",
      },
    ],
  );
});

void test("awaiting issues sort by Linear priority, then issue number", () => {
  const issues = [
    { number: 1, priority: 4 },
    { number: 2, priority: 0 },
    { number: 3, priority: 3 },
    { number: 21, priority: 2 },
    { number: 5, priority: null },
    { number: 6, priority: 1 },
    { number: 7, priority: 2 },
  ];
  const { awaiting } = workspace(
    issues.map(({ number, priority }) => issueRoom(`leon-${number}-example`, { priority })),
    day,
  );

  assert.deepEqual(
    awaiting.map(({ name }) => name),
    [6, 7, 21, 3, 1, 2, 5].map((number) => `leon-${number}-example`),
  );
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

void test("the rail excludes Beeper archives and closed Slack projects for the matching workspace", () => {
  const slack = (name: string, id: string, team = "TWORK") =>
    room(name, null, "slackgo", { channel: { id: `${team}-${id}` } });
  const statusRoom = slack("#zami-project-visibility", "GFEED");
  const snapshot = readProjectVisibility(statusRoom, () => [
    { body: "zami-projects:v1 COPEN", timestamp: 1 },
    { body: "zami-projects:v1 CARCHIVED CDONE CTODAY", timestamp: 2 },
    { body: "zami-projects:v1 invalid snapshot", timestamp: 3 },
  ]);
  assert.ok(snapshot);
  assert.deepEqual([...snapshot.closed], ["CARCHIVED", "CDONE", "CTODAY"]);
  const data = workspace(
    [
      statusRoom,
      slack("project-2026-11-21", "CTODAY"),
      slack("project-2026-11-21-2", "CTODAYSECOND"),
      slack("project-archived", "CARCHIVED"),
      slack("project-done", "CDONE"),
      slack("project-same-channel-id", "CDONE", "TOTHER"),
      slack("project-open", "COPEN"),
      slack("project-2026-11-19", "CREOPENED"),
      { ...slack("project-beeper-archive", "CBEEPER"), archived: true },
    ],
    day,
    new Map([[snapshot.team, snapshot]]),
  );
  assert.equal(data.today?.name, "project-2026-11-21-2");
  assert.deepEqual(
    data.projects.map(({ name }) => name),
    ["project-2026-11-21-2", "project-2026-11-19", "project-open", "project-same-channel-id"],
  );
  assert.equal(data.channels.has(statusRoom.roomId), false);
  assert.equal(data.channels.has("!project-done"), true);
  assert.deepEqual(
    readProjectVisibility(statusRoom, () => [{ body: "zami-projects:v1", timestamp: 4 }])?.closed,
    new Set(),
  );
});

void test("past daily projects stay out of the rail while project visibility syncs", () => {
  const data = workspace(
    [
      room("project-2026-11-20"),
      room("project-20261119"),
      room("project-2026-11-20-2"),
      room("project-2026-11-21"),
      room("project-2026-11-22"),
      room("project-open"),
    ],
    day,
  );
  assert.deepEqual(
    data.projects.map(({ name }) => name),
    ["project-2026-11-21", "project-2026-11-22", "project-open"],
  );
});

void test("the project date rolls over at midnight in Toronto in both seasons", () => {
  assert.equal(projectDay(new Date("2026-11-22T04:59:59Z")), "2026-11-21");
  assert.equal(projectDay(new Date("2026-11-22T05:00:00Z")), "2026-11-22");
  assert.equal(projectDay(new Date("2026-07-02T03:59:59Z")), "2026-07-01");
  assert.equal(projectDay(new Date("2026-07-02T04:00:00Z")), "2026-07-02");
});

void test("a project day ends at the next midnight in Toronto, daylight saving changes included", () => {
  const end = (now: string) => new Date(projectDayEnd(new Date(now))).toISOString();
  assert.equal(end("2026-11-21T21:30:00Z"), "2026-11-22T05:00:00.000Z");
  assert.equal(end("2026-11-22T04:59:59.999Z"), "2026-11-22T05:00:00.000Z");
  assert.equal(end("2026-11-22T05:00:00Z"), "2026-11-23T05:00:00.000Z");
  // 2026-11-01 has 25 hours in Toronto, 2026-03-08 has 23.
  assert.equal(end("2026-11-01T04:00:00Z"), "2026-11-02T05:00:00.000Z");
  assert.equal(end("2026-03-08T05:00:00Z"), "2026-03-09T04:00:00.000Z");
});

void test("projects use the icon and color appended to their bridged topics", () => {
  const { projects, today } = workspace(
    [
      room("project-2026-11-21", "[linear-project:v1 #e8b510]"),
      room("project-ironman", "Training plan · [linear-project:v1 #5e6ad2 :runner:]"),
      room("project-university", "Original topic"),
      room("project-taxes", "[linear-project:v1 bad-color IconBook]"),
    ],
    day,
  );
  assert.deepEqual(today?.project, { color: "#e8b510", icon: null });
  assert.deepEqual(
    projects.slice(1).map(({ project }) => project),
    [
      { color: "#5e6ad2", icon: ":runner:" },
      { color: null, icon: null },
      { color: null, icon: null },
    ],
  );
});

void test("project labels show full names and format dates without shifting the day", () => {
  assert.equal(projectLabel("project-universe-mobile-redesign"), "Universe Mobile Redesign");
  assert.equal(projectLabel("project-campus_app"), "Campus App");
  assert.equal(projectLabel("project-2026-11-20"), "Nov 20");
  assert.equal(projectLabel("project-20261109"), "Nov 09");
  assert.equal(projectLabel("project-2026-11-20-2"), "Nov 20 (2)");
  assert.equal(projectLabel("project-2026-02-30"), "2026 02 30");
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
