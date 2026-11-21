// Structural types for the pieces of Zam and Zami's runtime APIs this plugin uses.
export interface BridgeState {
  content: Record<string, unknown>;
}

interface Room {
  roomId: string;
  name: string;
  isSpaceRoom(): boolean;
}

export interface MatrixEvent {
  getType(): string;
}

export interface MatrixClient {
  on(event: "RoomState.events", listener: (event: MatrixEvent) => void): void;
  off(event: "RoomState.events", listener: (event: MatrixEvent) => void): void;
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
  "$lib/matrix/client": {
    getRooms(): Room[];
    getRoomTopic(room: Room): string | null;
  };
  "$lib/i18n/index": {
    t(this: void, key: "common.openRoomList"): string;
  };
}

export interface ZamiApi {
  import<Key extends keyof HostModules>(id: Key): Promise<HostModules[Key]>;
  app: { loadEarly(): void };
  styles: { add(css: string): Disposable };
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
  matrix: { listState(roomId: string, type: string): BridgeState[] };
}
