// Structural types for the pieces of Zam and Zami's runtime APIs this plugin uses.
export interface BridgeState {
  content: Record<string, unknown>;
}

export interface Room {
  roomId: string;
  name: string;
  tags?: Record<string, unknown>;
  getMember(userId: string): { rawDisplayName?: string; name?: string } | null;
  isSpaceRoom(): boolean;
}

export type MatrixLink =
  | { kind: "room"; roomId: string; eventId?: string }
  | { kind: "alias"; alias: string; eventId?: string }
  | { kind: "user" };

export interface MatrixEvent {
  getType(): string;
  getRoomId(): string | undefined;
}

type ObservedMatrixEvent =
  | "RoomState.events"
  | "Room.accountData"
  | "accountData"
  | "Room.timeline"
  | "Event.decrypted";

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

export type Component = (anchor: Node, props: Record<string, unknown>) => unknown;

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
      sidebar?: string | null;
      callViewRoomId?: string | null;
    };
    closeSidebar?(this: void): void;
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
    getRoomUnreadInfo(room: Room): { unread: boolean; highlight: number };
    roomHasThreadUnread(room: Room): boolean;
    getOwnAvatarUrl(): string | null;
    getMemberAvatar(room: Room, userId: string): string | null;
    getUrlPreview?(url: string): Promise<unknown>;
    mxcToHttp?(this: void, mxc: string): string | null;
  };
  "$lib/matrix/media": {
    mxcToHttp?(this: void, mxc: string): string | null;
  };
  "$lib/matrix/pluginHost": {
    sendEventContent(roomId: string, content: Record<string, unknown>): Promise<string>;
  };
  "$lib/i18n/index": {
    t(
      this: void,
      key:
        | "common.openRoomList"
        | "messageArea.moreRoomOptions"
        | "messageArea.searchMessages"
        | "messageInput.message",
      vars?: { roomName: string },
    ): string;
  };
  "$lib/utils/matrixLinks": {
    parseMatrixLink(this: void, url: string): MatrixLink | null;
  };
  "$lib/data/emojiShortcodes": {
    emojiForShortcode(this: void, code: string): string | undefined;
  };
}

type ClientModule = HostModules["$lib/matrix/client"];
type AvatarFunction = "getOwnAvatarUrl" | "getMemberAvatar";
type MessageModule = HostModules["$lib/matrix/pluginHost"];

export interface ZamiApi {
  import<Key extends keyof HostModules>(id: Key): Promise<HostModules[Key]>;
  components: { get(name: string): Promise<Component> };
  ui: {
    render(target: HTMLElement, component: Component, props: Record<string, unknown>): Disposable;
  };
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
    after(
      target: MessageModule,
      method: "sendEventContent",
      hook: (result: Promise<string>, args: Parameters<MessageModule["sendEventContent"]>) => void,
    ): Disposable;
    instead(
      target: ClientModule,
      method: "getUrlPreview",
      hook: (args: [string], original: (url: string) => Promise<unknown>) => Promise<unknown>,
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
    getAccountData(type: string, roomId?: string): Record<string, unknown> | null;
    getRecentMessages(roomId: string): { body: string; timestamp: number }[];
  };
}
