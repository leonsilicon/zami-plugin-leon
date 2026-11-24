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
  statusName: string;
  statusType: string;
  statusColor: string | null;
}

export interface BridgedRoom {
  roomId: string;
  name: string;
  topic: string | null;
  issueMetadata?: Record<string, unknown> | null;
  bridges: BridgeState[];
  isSpace?: boolean;
  archived?: boolean;
}

export const AWAITING = "Awaiting Leon";
export const LINEAR_ISSUE_ACCOUNT_DATA = "ai.leonsilicon.linear.issue";
export const PROJECT_VISIBILITY_ACCOUNT_DATA = "ai.leonsilicon.linear.project_visibility";
const TASK = /^(leon-\d+)(?:-([a-z0-9_-]+))?$/;
const LINEAR_ISSUE = /^https:\/\/linear\.app\/[^/<>\s]+\/issue\/(leon-\d+)(?:[/?#][^<>\s]*)?$/i;
const CLOSED_STATUS_TYPES = new Set(["completed", "canceled", "duplicate"]);
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

/** The first instant after `now` that belongs to another project day: midnight in Toronto. */
export function projectDayEnd(now = new Date()) {
  const day = projectDay(now);
  let same = now.getTime();
  // A day is 23 to 25 hours long.
  let next = same + 26 * 60 * 60 * 1000;
  while (next - same > 1) {
    const middle = Math.floor((same + next) / 2);
    if (projectDay(new Date(middle)) === day) same = middle;
    else next = middle;
  }
  return next;
}

export function projectLabel(name: string) {
  const slug = name.slice("project-".length);
  const dated = datedProject(name);
  if (dated) {
    const label = PROJECT_DATE_LABEL.format(dated.date);
    return dated.suffix ? `${label} (${dated.suffix})` : label;
  }

  return (
    slug
      .replace(/[-_]+/g, " ")
      .trim()
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) || slug
  );
}

function datedProject(name: string) {
  const [, datePart, suffix] =
    /^project-(\d{4}-\d{2}-\d{2}|\d{8})(?:-([2-9]|[1-9][0-9]+))?$/.exec(name) ?? [];
  if (!datePart) return null;
  const iso = datePart.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== iso) return null;
  return { date, iso, suffix };
}

export function channelName(name: string) {
  return typeof name === "string" ? name.trim().replace(/^#+/, "").toLowerCase() : "";
}

export function issueChannel(name: string) {
  const [, identifier, slug] = TASK.exec(channelName(name)) ?? [];
  if (identifier) return { identifier, slug };
}

export function linearIssueIdentifier(url: string) {
  return url.match(LINEAR_ISSUE)?.[1]?.toLowerCase();
}

export function isSlackProtocol(id: unknown) {
  return typeof id === "string" && ["slack", "slackgo"].includes(id.toLowerCase());
}

function slackBridges(room: BridgedRoom) {
  if (room.isSpace) return [];
  return room.bridges.filter(({ content }) => {
    const info = content.protocol;
    const protocol = info && typeof info === "object" && "id" in info ? info.id : undefined;
    const roomType = content["com.beeper.room_type.v2"];
    return (
      isSlackProtocol(protocol) &&
      content["com.beeper.room_type"] !== "dm" &&
      roomType !== "dm" &&
      roomType !== "group_dm" &&
      roomType !== "space"
    );
  });
}

function slackAddress(bridges: BridgeState[]) {
  for (const { content } of bridges) {
    const channel = content.channel;
    const id = channel && typeof channel === "object" && "id" in channel && channel.id;
    if (typeof id !== "string") continue;
    const [, team, channelId] = /^(T[A-Z0-9]+)-([CG][A-Z0-9]+)$/.exec(id) ?? [];
    if (team && channelId) return { team, channelId };
    const network = content.network;
    const networkId = network && typeof network === "object" && "id" in network && network.id;
    if (typeof networkId === "string" && /^[CG][A-Z0-9]+$/.test(id)) {
      return { team: networkId, channelId: id };
    }
  }
  return null;
}

interface ProjectVisibility {
  teamId: string;
  closed: ReadonlySet<string>;
}

export function readProjectVisibility(
  data: Record<string, unknown> | null,
): ProjectVisibility | null {
  if (!data || data.version !== 1) return null;
  const { teamId, closedChannelIds } = data;
  if (
    typeof teamId !== "string" ||
    !/^T[A-Z0-9]+$/.test(teamId) ||
    !Array.isArray(closedChannelIds) ||
    !closedChannelIds.every((id) => typeof id === "string" && /^[CG][A-Z0-9]+$/.test(id))
  )
    return null;
  return { teamId, closed: new Set(closedChannelIds) };
}

function issueFromAccountData(
  name: string,
  address: ReturnType<typeof slackAddress>,
  metadata: BridgedRoom["issueMetadata"],
): IssueDetails | null {
  const identifier = issueChannel(name)?.identifier;
  if (
    !address ||
    !identifier ||
    metadata?.version !== 1 ||
    metadata.channelId !== address.channelId ||
    typeof metadata.identifier !== "string" ||
    metadata.identifier.toLowerCase() !== identifier
  )
    return null;
  if (metadata.deleted === true) return null;
  const { title, priority, statusName, statusType, statusColor, url } = metadata;
  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof statusName !== "string" ||
    !statusName.trim() ||
    typeof statusType !== "string" ||
    !/^[a-z_]+$/i.test(statusType) ||
    typeof url !== "string" ||
    linearIssueIdentifier(url) !== identifier
  )
    return null;
  return {
    title,
    priority: typeof priority === "number" && /^[0-4]$/.test(String(priority)) ? priority : null,
    statusName,
    statusType: statusType.toLowerCase(),
    statusColor:
      typeof statusColor === "string" && /^#[a-f0-9]{6}$/i.test(statusColor) ? statusColor : null,
  };
}

function projectAppearance(topic: string | null): ProjectAppearance {
  const [, color, icon] = topic?.match(PROJECT_TOPIC_SUFFIX) ?? [];
  return { color: color === "-" ? null : (color ?? null), icon: icon ?? null };
}

export function workspace(
  rooms: BridgedRoom[],
  day: string,
  visibility: ProjectVisibility | null = null,
) {
  const channels = new Map<string, Channel>();
  const slackIssues = new Map<string, { team: string; channel: Channel }[]>();
  const awaiting: Channel[] = [];
  const projects: Channel[] = [];
  for (const room of rooms) {
    const bridges = slackBridges(room);
    if (!bridges.length) continue;
    const name = channelName(room.name);
    const address = slackAddress(bridges);
    const issue = issueFromAccountData(name, address, room.issueMetadata);
    const project = PROJECT.test(name) ? projectAppearance(room.topic) : null;
    const channel = { id: room.roomId, name, ...(issue && { issue }), ...(project && { project }) };
    channels.set(channel.id, channel);
    if (TASK.test(name)) {
      if (address) {
        const matches = slackIssues.get(address.channelId) ?? [];
        matches.push({ team: address.team, channel });
        slackIssues.set(address.channelId, matches);
      }
    }
    if (project && !room.archived) {
      // Dailylinear closes past days. The snapshot can also show a manually reopened day.
      const closed =
        visibility && address?.team === visibility.teamId
          ? visibility.closed.has(address.channelId)
          : (datedProject(name)?.iso ?? day) < day;
      if (!closed) projects.push(channel);
    }
    if (issue?.statusName === AWAITING && !CLOSED_STATUS_TYPES.has(issue.statusType))
      awaiting.push(channel);
  }
  // Linear's zero and missing priorities both sort after Low.
  awaiting.sort(
    (a, b) =>
      (a.issue?.priority || 5) - (b.issue?.priority || 5) ||
      a.name.localeCompare(b.name, "en", { numeric: true }),
  );
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
  return { channels, slackIssues, awaiting, projects, today };
}
