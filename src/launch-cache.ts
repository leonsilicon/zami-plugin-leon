// What the workspace is built from, kept between launches. At launch Zami shows rooms from
// its saved room list before Matrix sync has delivered them, and that list holds no bridge
// state, so none of them would read as a Slack channel: today's project would be unknown,
// and its composer hidden, until sync caught up. With the rooms as they last were, Home is
// there from the first frame.
import { slackChannelRooms, type BridgedRoom } from "./workspace.ts";

const KEY = "launchWorkspace";
const VERSION = 1;

interface Storage {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export interface LaunchWorkspace {
  account: string;
  rooms: BridgedRoom[];
  /** The project visibility account data, as it was read. */
  visibility: Record<string, unknown> | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRoom(value: unknown): value is BridgedRoom {
  return (
    isRecord(value) &&
    typeof value.roomId === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.bridges) &&
    value.bridges.every((bridge) => isRecord(bridge) && isRecord(bridge.content))
  );
}

export function readLaunchWorkspace(storage: Storage, account: string): LaunchWorkspace | null {
  const saved = storage.get(KEY);
  if (!isRecord(saved) || saved.version !== VERSION || saved.account !== account) return null;
  if (!Array.isArray(saved.rooms) || !saved.rooms.every(isRoom)) return null;
  return {
    account,
    rooms: saved.rooms,
    visibility: isRecord(saved.visibility) ? saved.visibility : null,
  };
}

/** Saves the workspace's rooms when they changed; returns the saved text. */
export function saveLaunchWorkspace(
  storage: Storage,
  { account, rooms, visibility }: LaunchWorkspace,
  previous?: string,
): string {
  const saved = { version: VERSION, account, rooms: slackChannelRooms(rooms), visibility };
  const text = JSON.stringify(saved);
  if (text !== previous) storage.set(KEY, saved);
  return text;
}

/**
 * The rooms to build the workspace from while the room list is still Zami's saved one: the
 * rooms sync has delivered, and for the rest what was saved of them. `current` gives what
 * the saved room list does hold of a room (its name and account data), or null for a room
 * that's gone.
 */
export function withSavedRooms(
  live: BridgedRoom[],
  saved: readonly BridgedRoom[],
  current: (roomId: string) => Partial<BridgedRoom> | null,
): BridgedRoom[] {
  const known = new Set(live.map(({ roomId }) => roomId));
  const rooms = [...live];
  for (const room of saved) {
    if (known.has(room.roomId)) continue;
    const now = current(room.roomId);
    if (!now) continue;
    const fresh = Object.fromEntries(
      Object.entries(now).filter(([, value]) => value !== undefined && value !== null),
    );
    rooms.push({ ...room, ...fresh, bridges: room.bridges });
  }
  return rooms;
}
