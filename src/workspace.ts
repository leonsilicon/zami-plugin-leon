import type { BridgeState } from "./zami.ts";

export interface Channel {
  id: string;
  name: string;
}

export interface BridgedRoom {
  roomId: string;
  name: string;
  topic: string | null;
  bridges: BridgeState[];
  isSpace?: boolean;
}

export const AWAITING = "Awaiting Leon";
const TASK = /^leon-[a-z0-9_-]+$/;
const PROJECT = /^project-[a-z0-9_-]+$/;
const TORONTO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function projectDay(now = new Date()) {
  const fields = Object.fromEntries(
    TORONTO.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function channelName(name: string) {
  return typeof name === "string" ? name.trim().replace(/^#/, "").toLowerCase() : "";
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

export function workspace(rooms: BridgedRoom[], day: string) {
  const channels = new Map<string, Channel>();
  const awaiting: Channel[] = [];
  const projects: Channel[] = [];
  for (const room of rooms) {
    if (!slackRoom(room)) continue;
    const name = channelName(room.name);
    const channel = { id: room.roomId, name };
    channels.set(channel.id, channel);
    if (PROJECT.test(name)) projects.push(channel);
    if (TASK.test(name) && room.topic?.split(" · ", 1)[0]?.trim() === AWAITING) {
      awaiting.push(channel);
    }
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
