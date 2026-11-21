import type { BridgeState } from "./zami.ts";

export interface Channel {
  id: string;
  name: string;
  issue?: IssueDetails;
  project?: ProjectAppearance;
}

export interface ProjectAppearance {
  color: string | null;
  icon: string | null;
}

interface IssueDetails {
  title: string;
  priority: number | null;
  statusType: string;
  statusColor: string | null;
}

export interface BridgedRoom {
  roomId: string;
  name: string;
  topic: string | null;
  bridges: BridgeState[];
  isSpace?: boolean;
}

export const AWAITING = "Awaiting Leon";
const TASK = /^(leon-\d+)(?:-([a-z0-9_-]+))?$/;
const TOPIC_SEPARATOR = " · ";
const LINEAR_WORKFLOW = /^linear:v1 ([a-z_]+) (#[\da-f]{6}|-)(?: p([0-4]))?(?: |$)/i;
const PROJECT = /^project-[a-z0-9_-]+$/;
const PROJECT_TOPIC_SUFFIX =
  /(?:^| · )\[linear-project:v1 (#[\da-f]{6}|-)(?: ([^[\]\r\n]{1,80}))?\]$/i;
const TORONTO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const PROJECT_DATE_LABEL = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "2-digit",
});

export function projectDay(now = new Date()) {
  const fields = Object.fromEntries(
    TORONTO.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function projectLabel(name: string) {
  const slug = name.slice("project-".length);
  const [, datePart, suffix] =
    /^(\d{4}-\d{2}-\d{2}|\d{8})(?:-([2-9]|[1-9][0-9]+))?$/.exec(slug) ?? [];
  if (datePart) {
    const iso = datePart.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
    const date = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso) {
      const label = PROJECT_DATE_LABEL.format(date);
      return suffix ? `${label} (${suffix})` : label;
    }
  }

  return (
    slug
      .replace(/[-_]+/g, " ")
      .trim()
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) || slug
  );
}

function channelName(name: string) {
  return typeof name === "string" ? name.trim().replace(/^#/, "").toLowerCase() : "";
}

export function isSlackProtocol(id: unknown) {
  return typeof id === "string" && ["slack", "slackgo"].includes(id.toLowerCase());
}

function slackRoom(room: BridgedRoom) {
  if (room.isSpace) return false;
  return room.bridges.some(({ content }) => {
    const info = content.protocol;
    const protocol = info && typeof info === "object" && "id" in info ? info.id : undefined;
    const roomType = content["com.beeper.room_type.v2"];
    return (
      typeof protocol === "string" &&
      ["slack", "slackgo"].includes(protocol.toLowerCase()) &&
      content["com.beeper.room_type"] !== "dm" &&
      roomType !== "dm" &&
      roomType !== "group_dm" &&
      roomType !== "space"
    );
  });
}

function awaitingIssue(name: string, topic: string | null): IssueDetails | null {
  const match = TASK.exec(name);
  if (!match || !topic) return null;
  const [status, workflow, url, ...titleParts] = topic.split(TOPIC_SEPARATOR);
  if (status?.trim() !== AWAITING) return null;

  // Linear Sync puts the title last so it can contain the topic separator.
  const style = workflow?.match(LINEAR_WORKFLOW);
  const title = titleParts.join(TOPIC_SEPARATOR).trim();
  if (style && url && title) {
    return {
      title,
      priority: style[3] === undefined ? null : Number(style[3]),
      statusType: style[1]!.toLowerCase(),
      statusColor: style[2] === "-" ? null : style[2]!,
    };
  }

  const slug = match[2]?.replace(/[-_]+/g, " ").trim();
  return {
    title: slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : match[1]!.toUpperCase(),
    priority: null,
    statusType: "started",
    statusColor: null,
  };
}

function projectAppearance(topic: string | null): ProjectAppearance {
  const [, color, icon] = topic?.match(PROJECT_TOPIC_SUFFIX) ?? [];
  return { color: color === "-" ? null : (color ?? null), icon: icon ?? null };
}

export function workspace(rooms: BridgedRoom[], day: string) {
  const channels = new Map<string, Channel>();
  const awaiting: Channel[] = [];
  const projects: Channel[] = [];
  for (const room of rooms) {
    if (!slackRoom(room)) continue;
    const name = channelName(room.name);
    const issue = awaitingIssue(name, room.topic);
    const project = PROJECT.test(name) ? projectAppearance(room.topic) : null;
    const channel = { id: room.roomId, name, ...(issue && { issue }), ...(project && { project }) };
    channels.set(channel.id, channel);
    if (project) projects.push(channel);
    if (issue) awaiting.push(channel);
  }
  awaiting.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  const canonical = `project-${day}`;
  const undashed = canonical.replace(day, day.replaceAll("-", ""));
  const suffixed = new RegExp(`^${canonical}-([2-9]|[1-9][0-9]+)$`);
  const sameDay = (name: string) => {
    if (name === canonical) return 0;
    if (name === undashed) return 1;
    const suffix = suffixed.exec(name);
    return suffix ? Number(suffix[1]) : Infinity;
  };
  projects.sort((a, b) => sameDay(a.name) - sameDay(b.name) || a.name.localeCompare(b.name));
  const today = projects.find(({ name }) => Number.isFinite(sameDay(name))) ?? null;
  return { channels, awaiting, projects, today };
}
