// Structural types for the pieces of Zam and Zami's runtime APIs this plugin uses.
export interface BridgeState {
  content: Record<string, unknown>;
}

interface Room {
  roomId: string;
  name: string;
  tags?: Record<string, unknown>;
  isSpaceRoom(): boolean;
}

export interface MatrixEvent {
  getType(): string;
  getRoomId(): string | undefined;
}

type ObservedMatrixEvent = "RoomState.events" | "accountData" | "Room.timeline" | "Event.decrypted";

export interface MatrixClient {
  getUserId(): string | null;
  on(event: ObservedMatrixEvent, listener: (event: MatrixEvent) => void): void;
  on(event: "Room.tags", listener: () => void): void;
  off(event: ObservedMatrixEvent, listener: (event: MatrixEvent) => void): void;
  off(event: "Room.tags", listener: () => void): void;
}

interface Disposable {
  dispose(): void;
}

export interface HostModules {
  "$lib/stores/rooms.svelte": {
    roomsState: {
      activeRoomId: string | null;
      activeSpaceId: string | null;
      showInbox: boolean;
      showSpaceHome: boolean;
      draftDm: object | null;
      roomsTick: number;
      unreadTick: number;
    };
    setActiveRoom(id: string): void;
    setActiveSpace(id: string | null): void;
  };
  "$lib/stores/interface.svelte": {
    interfaceState: {
      isMobile: boolean;
      leftOpen: boolean;
    };
  };
  "$lib/stores/auth.svelte": {
    auth: {
      userId: string | null;
      syncState: string;
    };
  };
  "$lib/stores/notifications.svelte": {
    notificationsState: { tick: number };
    hasLoudInRoom(roomId: string): boolean;
  };
  "$lib/matrix/client": {
    getRoom(roomId: string): Room | null;
    getRooms(): Room[];
    getRoomTopic(room: Room): string | null;
    getRoomUnreadInfo(room: Room): { unread: boolean; highlight: number };
    roomHasThreadUnread(room: Room): boolean;
    getOwnAvatarUrl(): string | null;
    getMemberAvatar(room: Room, userId: string): string | null;
    mxcToHttp?(this: void, mxc: string): string | null;
  };
  "$lib/matrix/media": {
    mxcToHttp?(this: void, mxc: string): string | null;
  };
  "$lib/i18n/index": {
    t(this: void, key: "common.openRoomList"): string;
  };
  "$lib/data/emojiShortcodes": {
    emojiForShortcode(this: void, code: string): string | undefined;
  };
}

type ClientModule = HostModules["$lib/matrix/client"];
type AvatarFunction = "getOwnAvatarUrl" | "getMemberAvatar";

export interface ZamiApi {
  import<Key extends keyof HostModules>(id: Key): Promise<HostModules[Key]>;
  app: {
    loadEarly(): void;
    /** The room Zami opens on. Absent in Zami builds from before launch pages. */
    home?: {
      set(home: { roomId: string; until?: number }): boolean;
      clear(): void;
    };
  };
  styles: { add(css: string): Disposable };
  patch: {
    after<Key extends AvatarFunction>(
      target: ClientModule,
      method: Key,
      hook: (
        result: string | null,
        args: Parameters<ClientModule[Key]>,
      ) => string | null | undefined,
    ): Disposable;
  };
  runes: {
    watch<T>(read: () => T, onChange: (value: T) => void): Disposable;
  };
}

export interface ZamApi {
  zami?: ZamiApi;
  storage: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
  };
  unsafe: { getClient(): MatrixClient | null | undefined };
  matrix: {
    listState(roomId: string, type: string): BridgeState[];
    getAccountData(type: string): Record<string, unknown> | null;
    getRecentMessages(roomId: string): { body: string; timestamp: number }[];
  };
}
