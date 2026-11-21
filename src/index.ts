import { projectIcon } from "./project-icon.ts";
import { BRIDGE_ACCOUNT_DATA, slackAccountAvatar } from "./slack-avatar.ts";
import {
  AWAITING,
  PROJECT_VISIBILITY_CHANNEL,
  projectDay,
  projectLabel,
  readProjectVisibility,
  workspace,
  type BridgedRoom,
  type Channel,
} from "./workspace.ts";
import type { HostModules, MatrixClient, MatrixEvent, ZamApi, ZamiApi } from "./zami.ts";

type Mode = "leon" | "zami";
type ClientModule = HostModules["$lib/matrix/client"];
interface WorkspaceModules {
  rooms: HostModules["$lib/stores/rooms.svelte"];
  ui: HostModules["$lib/stores/interface.svelte"]["interfaceState"];
  auth: HostModules["$lib/stores/auth.svelte"]["auth"];
  clientModule: ClientModule;
  notifications: HostModules["$lib/stores/notifications.svelte"];
  t: HostModules["$lib/i18n/index"]["t"];
  emojiForShortcode?: HostModules["$lib/data/emojiShortcodes"]["emojiForShortcode"];
}

const BRIDGE_EVENTS = ["m.bridge", "uk.half-shot.bridge"];
const ROOM_METADATA = new Set([...BRIDGE_EVENTS, "m.room.name", "m.room.topic"]);
const REGION = (name: string) => `[data-zam-region="${name}"]`;
const PRIORITIES = [
  "No priority",
  "Urgent priority",
  "High priority",
  "Medium priority",
  "Low priority",
];

function readBridges(matrix: ZamApi["matrix"], roomId: string) {
  return BRIDGE_EVENTS.flatMap((type) => matrix.listState(roomId, type));
}

function readRooms(matrix: ZamApi["matrix"], clientModule: ClientModule): BridgedRoom[] {
  return clientModule.getRooms().flatMap((room) => {
    if (room.isSpaceRoom()) return [];
    const bridges = readBridges(matrix, room.roomId);
    if (!bridges.length) return [];
    return [
      {
        roomId: room.roomId,
        name: room.name,
        topic: clientModule.getRoomTopic(room),
        bridges,
        archived: Object.hasOwn(room.tags ?? {}, "m.lowpriority"),
      },
    ];
  });
}

function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className: string,
  label?: string,
) {
  const node = document.createElement(tag);
  node.className = className;
  if (label) node.textContent = label;
  return node;
}

function button(className: string, label: string, action: () => void) {
  const node = element("button", className, label);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}

function makeSwitcher(currentMode: () => Mode, setMode: (mode: Mode) => void) {
  let anchor: HTMLButtonElement | null = null;
  let popup: HTMLDivElement | null = null;
  let press: { x: number; y: number; id: number; timer: ReturnType<typeof setTimeout> } | null =
    null;
  let suppressClickUntil = 0;
  const listeners = new AbortController();
  const options = { capture: true, signal: listeners.signal };

  function cancelPress() {
    clearTimeout(press?.timer);
    press = null;
  }

  function close(restoreFocus = false) {
    if (!popup) return;
    popup.remove();
    popup = null;
    anchor?.setAttribute("aria-expanded", "false");
    if (restoreFocus) anchor?.focus();
  }

  function show() {
    if (!anchor?.isConnected || popup) return;
    popup = element("div", "leon-switcher");
    popup.setAttribute("role", "menu");
    popup.setAttribute("aria-label", "Interface");
    for (const [mode, label] of [
      ["leon", "Leon workspace"],
      ["zami", "Original Zami"],
    ] as const) {
      const item = button("leon-switcher-item", label, () => {
        close();
        setMode(mode);
        anchor?.focus();
      });
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", String(currentMode() === mode));
      popup.append(item);
    }
    document.body.append(popup);
    const rect = anchor.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - popup.offsetHeight - 8))}px`;
    anchor.setAttribute("aria-expanded", "true");
    popup.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }

  document.addEventListener(
    "pointerdown",
    (event) => {
      cancelPress();
      const target = event.target instanceof Node ? event.target : null;
      if (popup && !popup.contains(target)) close();
      if (!anchor?.contains(target) || event.button !== 0) return;
      suppressClickUntil = 0;
      press = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
        timer: setTimeout(() => {
          suppressClickUntil = performance.now() + 1000;
          show();
        }, 500),
      };
    },
    options,
  );
  document.addEventListener(
    "pointermove",
    (event) => {
      if (
        press?.id === event.pointerId &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10
      )
        cancelPress();
    },
    options,
  );
  document.addEventListener(
    "pointerup",
    (event) => {
      if (press?.id !== event.pointerId) return;
      if (popup) suppressClickUntil = performance.now() + 1000;
      cancelPress();
    },
    options,
  );
  document.addEventListener("pointercancel", cancelPress, options);
  document.addEventListener(
    "click",
    (event) => {
      if (
        !(event.target instanceof Node) ||
        !anchor?.contains(event.target) ||
        performance.now() >= suppressClickUntil
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    options,
  );
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (!(event.target instanceof Node) || !anchor?.contains(event.target)) return;
      event.preventDefault();
      cancelPress();
      suppressClickUntil = performance.now() + 1000;
      show();
    },
    options,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.shiftKey &&
        event.key === "F10" &&
        event.target instanceof Node &&
        anchor?.contains(event.target)
      ) {
        event.preventDefault();
        show();
      } else if (popup && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      } else if (popup && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        const items = [...popup.querySelectorAll("button")];
        const step = event.key === "ArrowDown" ? 1 : -1;
        const index = items.findIndex((item) => item === document.activeElement);
        items[(index + step + items.length) % items.length]?.focus();
        event.preventDefault();
      } else if (popup && event.key === "Tab") {
        close(true);
      }
    },
    options,
  );

  return {
    show,
    attach(next: HTMLButtonElement | null) {
      if (next === anchor) return;
      cancelPress();
      close();
      anchor?.removeAttribute("data-leon-switch-anchor");
      anchor?.removeAttribute("aria-haspopup");
      anchor?.removeAttribute("aria-expanded");
      anchor = next;
      anchor?.setAttribute("data-leon-switch-anchor", "");
      anchor?.setAttribute("aria-haspopup", "menu");
      anchor?.setAttribute("aria-expanded", "false");
    },
    dispose() {
      this.attach(null);
      listeners.abort();
    },
  };
}

function install(
  zam: ZamApi,
  zami: ZamiApi,
  { rooms, ui, auth, clientModule, notifications, t, emojiForShortcode }: WorkspaceModules,
) {
  const state = rooms.roomsState;
  let mode: Mode = zam.storage.get("view") === "zami" ? "zami" : "leon";
  let day = projectDay();
  let data = workspace([], day);
  const projectVisibility = new Map<
    string,
    NonNullable<ReturnType<typeof readProjectVisibility>>
  >();
  const visibilityRooms = new Set<string>();
  let activeAccount: string | null = null;
  let client: MatrixClient | null | undefined;
  let homeProfile: { userId: string; roomId: string | null; avatarUrl: string | null } | undefined;
  let followToday = true;
  let previousRoom: string | null = null;
  let selectedProject: string | null = null;
  let collapsed = false;
  let stopped = false;
  let queued = false;
  let refresh = true;

  let app: HTMLElement | null = null;
  let main: HTMLElement | null = null;
  let nativeRail: HTMLElement | null = null;
  let nativeList: HTMLElement | null = null;
  let sidebar: HTMLElement | null = null;
  let header: HTMLElement | null = null;
  let hiddenMenu: HTMLButtonElement | null = null;
  let mobile = ui.isMobile;
  let lastRail: string | undefined;
  let lastLists: string | undefined;
  let lastProjectHeading: string | undefined;

  const accountAvatar = zami.patch.after(clientModule, "getOwnAvatarUrl", () => {
    if (homeProfile && homeProfile.userId === auth.userId) return homeProfile.avatarUrl;
  });
  const messageAvatar = zami.patch.after(clientModule, "getMemberAvatar", (_, [room, userId]) => {
    if (
      homeProfile?.roomId === room.roomId &&
      homeProfile.userId === userId &&
      userId === auth.userId
    )
      return homeProfile.avatarUrl;
  });

  const rail = element("nav", "leon-rail");
  rail.setAttribute("aria-label", "Linear projects");
  const list = element("section", "leon-list");
  const placeholder = element("section", "leon-placeholder");
  const fallbackHeader = element("div", "leon-placeholder-header", "Today");
  const projectHeading = element("h2", "leon-chat-project");
  const status = element("p", "leon-status");
  status.setAttribute("role", "status");
  placeholder.append(fallbackHeader, status);

  const menu = button("leon-menu", "", () => {
    if (ui.isMobile) {
      ui.leftOpen = !ui.leftOpen;
    } else if (mode === "leon") {
      collapsed = !collapsed;
      render();
    } else {
      switcher.show();
    }
  });
  menu.title = "Open room list. Hold to switch interface.";
  const menuIcon = element("span", "leon-menu-icon");
  menuIcon.setAttribute("aria-hidden", "true");
  const badge = element("span", "leon-badge");
  badge.setAttribute("aria-hidden", "true");
  menu.append(menuIcon, badge);

  function selectMode(next: Mode) {
    if (next === mode) return;
    mode = next;
    zam.storage.set("view", mode);
    if (mode === "leon") {
      resetLanding();
      schedule(true);
    }
    // Update the switch anchor before returning focus from the dropdown.
    render();
  }
  const switcher = makeSwitcher(() => mode, selectMode);

  function resetLanding() {
    previousRoom = state.activeRoomId;
    followToday = true;
    selectedProject = null;
    collapsed = false;
  }

  function openRoom(id: string) {
    if (state.activeSpaceId !== null) rooms.setActiveSpace(null);
    if (state.activeRoomId !== id || state.showInbox || state.showSpaceHome || state.draftDm) {
      rooms.setActiveRoom(id);
    } else if (ui.isMobile) {
      ui.leftOpen = false;
    }
    previousRoom = id;
  }

  function openHome() {
    resetLanding();
    if (data.today) openRoom(data.today.id);
    render();
  }

  function choose(channel: Channel, isProject: boolean) {
    selectedProject = isProject ? channel.id : null;
    followToday = false;
    openRoom(channel.id);
    render();
  }

  function updateNavigation() {
    const id = state.activeRoomId;
    if (
      id !== null &&
      id !== previousRoom &&
      data.channels.has(id) &&
      (!followToday || data.today?.id === previousRoom)
    ) {
      followToday = false;
      selectedProject = data.projects.some((project) => project.id === id) ? id : null;
    }
    const activeSlack = id !== null && data.channels.has(id) && !state.showInbox && !state.draftDm;
    if (data.today && (followToday || !activeSlack)) {
      if (!followToday) resetLanding();
      if (id !== data.today.id || !activeSlack || state.activeSpaceId !== null)
        openRoom(data.today.id);
    }
    previousRoom = state.activeRoomId;
  }

  function projectTitle(channel: Channel) {
    return channel.id === data.today?.id ? "Today" : projectLabel(channel.name);
  }

  function renderRail(project: Channel | undefined) {
    const signature = JSON.stringify([project?.id, data.projects, data.today?.id]);
    if (signature === lastRail) return;

    const home = button("leon-project", "", openHome);
    home.append(
      projectIcon({ icon: "home", color: null }, emojiForShortcode),
      element("span", "leon-project-name", "Home"),
    );
    home.setAttribute("aria-pressed", String(!project));
    rail.replaceChildren(home);
    for (const entry of data.projects) {
      const item = button("leon-project", "", () => choose(entry, true));
      item.append(
        projectIcon(entry.project, emojiForShortcode),
        element("span", "leon-project-name", projectTitle(entry)),
      );
      item.title = `#${entry.name}`;
      item.setAttribute("aria-pressed", String(project?.id === entry.id));
      rail.append(item);
    }
    lastRail = signature;
  }

  function channelButton(row: Channel, isProject: boolean) {
    const item = button("leon-channel", "", () => choose(row, isProject));
    if (row.issue) {
      const { title, priority, statusName, statusType, statusColor } = row.issue;
      const priorityLabel = PRIORITIES[priority ?? -1] ?? "Priority unavailable";
      item.classList.add("leon-issue");
      item.title = title;
      item.setAttribute("aria-label", `${title}, ${priorityLabel}, ${statusName}`);
      const priorityIcon = element("span", "leon-issue-priority", priority === 1 ? "!" : undefined);
      priorityIcon.dataset.priority = priority === null ? "unknown" : String(priority);
      priorityIcon.setAttribute("aria-hidden", "true");
      if (priority !== 1)
        priorityIcon.append(element("span", ""), element("span", ""), element("span", ""));
      const circle = element("span", "leon-issue-status");
      circle.dataset.status = statusType;
      circle.setAttribute("aria-hidden", "true");
      if (statusColor) circle.style.color = statusColor;
      item.append(priorityIcon, circle, element("span", "leon-issue-title", title));
    } else {
      item.textContent = `#${row.name}`;
    }
    if (state.activeRoomId === row.id) item.setAttribute("aria-current", "true");
    return item;
  }

  function isUnread(roomId: string) {
    const room = clientModule.getRoom(roomId);
    if (!room) return false;
    const { unread, highlight } = clientModule.getRoomUnreadInfo(room);
    return (
      unread ||
      highlight > 0 ||
      notifications.hasLoudInRoom(roomId) ||
      clientModule.roomHasThreadUnread(room)
    );
  }

  function renderLists(project: Channel | undefined) {
    const unread: Channel[] = [];
    const read: Channel[] = [];
    if (!project) {
      for (const row of data.awaiting) {
        const group = isUnread(row.id) ? unread : read;
        group.push(row);
      }
    }
    const signature = JSON.stringify([project, unread, read, state.activeRoomId]);
    if (signature === lastLists) return;

    const title = element("h2", "leon-list-title", project ? "Project channel" : AWAITING);
    const scroll = element("div", "leon-list-scroll");
    if (project) {
      scroll.append(channelButton(project, true));
    } else {
      for (const [label, rows] of [
        ["Unread", unread],
        ["Read", read],
      ] as const) {
        const group = element("section", "leon-list-group");
        group.setAttribute("aria-label", label);
        group.append(element("h3", "leon-list-group-title", label));
        for (const row of rows) group.append(channelButton(row, false));
        if (!rows.length)
          group.append(element("p", "leon-empty", `No ${label.toLowerCase()} issues`));
        scroll.append(group);
      }
    }
    const scrollTop = list.lastElementChild?.scrollTop ?? 0;
    list.replaceChildren(title, scroll);
    scroll.scrollTop = scrollTop;
    lastLists = signature;
  }

  function renderProjectHeader(chat: Channel | undefined) {
    if (!header || !chat?.project) {
      projectHeading.remove();
      return;
    }

    const title = projectTitle(chat);
    const signature = JSON.stringify([title, chat.project]);
    if (signature !== lastProjectHeading) {
      projectHeading.title = title;
      projectHeading.replaceChildren(
        projectIcon(chat.project, emojiForShortcode),
        element("span", "leon-chat-project-title", title),
      );
      lastProjectHeading = signature;
    }
    if (projectHeading.previousElementSibling !== menu) menu.after(projectHeading);
  }

  function bindApp() {
    const next = document.querySelector<HTMLElement>(REGION("app"));
    if (next !== app) {
      resetApp();
      app = next;
    }
    main = app?.querySelector(":scope > main") ?? null;
    nativeRail = app?.querySelector(REGION("space-sidebar")) ?? null;
    nativeList = app?.querySelector(REGION("room-list")) ?? null;
    const nextSidebar = nativeRail?.parentElement?.parentElement ?? null;
    if (sidebar !== nextSidebar) sidebar?.removeAttribute("data-leon-sidebar");
    sidebar = nextSidebar;
    mobile = ui.isMobile;
  }

  function resetApp() {
    app?.removeAttribute("data-leon-mounted");
    app?.removeAttribute("data-leon-ready");
    app?.removeAttribute("data-leon-collapsed");
    sidebar?.removeAttribute("data-leon-sidebar");
    hiddenMenu?.removeAttribute("data-leon-hidden");
    hiddenMenu = null;
    rail.remove();
    list.remove();
    placeholder.remove();
    menu.remove();
    projectHeading.remove();
    switcher.attach(null);
  }

  function render() {
    const custom = mode === "leon";
    const activeRoomId = state.activeRoomId;
    const chat =
      custom &&
      activeRoomId !== null &&
      !state.showInbox &&
      !state.draftDm &&
      (!followToday || data.today?.id === activeRoomId)
        ? data.channels.get(activeRoomId)
        : undefined;
    updateHomeProfile(custom && selectedProject === null ? auth.userId : null, chat?.id ?? null);

    bindApp();
    if (!app || !main || !nativeRail || !nativeList) {
      resetApp();
      return;
    }

    header = main.querySelector(REGION("room-header"));
    const originalLabel = t("common.openRoomList");
    const escapedLabel = CSS.escape(originalLabel);
    const nativeMenu = mobile
      ? (header ?? main).querySelector<HTMLButtonElement>(
          `button[title="${escapedLabel}"], button[aria-label="${escapedLabel}"]:not(.leon-menu)`,
        )
      : null;
    const hasChat = Boolean(chat);
    const nativeToHide = custom && nativeMenu ? nativeMenu : null;
    if (hiddenMenu !== nativeToHide) {
      hiddenMenu?.removeAttribute("data-leon-hidden");
      hiddenMenu = nativeToHide;
      hiddenMenu?.setAttribute("data-leon-hidden", "");
    }
    if (custom) {
      if (rail.nextElementSibling !== nativeRail) nativeRail.before(rail);
      if (list.nextElementSibling !== nativeList) nativeList.before(list);
      const project = data.projects.find(({ id }) => id === selectedProject);
      renderRail(project);
      renderLists(project);
      if (!hasChat) {
        if (placeholder.parentNode !== main) main.append(placeholder);
        const message =
          auth.syncState === "SYNCING"
            ? `Waiting for #project-${day} to appear in Beeper.`
            : `Looking for #project-${day} in Beeper…`;
        if (status.textContent !== message) status.textContent = message;
      } else {
        placeholder.remove();
      }
      const chatHeader = header ?? nativeMenu?.parentElement;
      const mount = hasChat ? (chatHeader ?? main) : fallbackHeader;
      if (menu.parentNode !== mount) mount.prepend(menu);
      menu.classList.toggle("leon-menu-overlay", hasChat && !chatHeader);
      switcher.attach(menu);
      const count = data.awaiting.length;
      if (badge.textContent !== String(count)) badge.textContent = String(count);
      badge.hidden = false;
      menu.setAttribute("aria-label", `Open room list, ${count} ${AWAITING}`);
    } else {
      rail.remove();
      list.remove();
      placeholder.remove();
      badge.hidden = true;
      if (nativeMenu) {
        menu.remove();
        switcher.attach(nativeMenu);
      } else {
        const mount = mobile ? main : nativeRail;
        if (menu.parentNode !== mount) mount.prepend(menu);
        menu.classList.toggle("leon-menu-overlay", mobile);
        menu.setAttribute("aria-label", mobile ? originalLabel : "Switch interface");
        switcher.attach(menu);
      }
    }
    renderProjectHeader(chat);
    if (sidebar?.parentElement === app) sidebar.dataset.leonSidebar = "";
    app.toggleAttribute("data-leon-ready", hasChat);
    app.toggleAttribute("data-leon-collapsed", custom && !mobile && collapsed);
    app.toggleAttribute("data-leon-mounted", custom);
  }

  function updateHomeProfile(userId: string | null, roomId: string | null) {
    if (!userId) {
      if (homeProfile) {
        homeProfile = undefined;
        state.roomsTick++;
      }
      return;
    }
    const bridgeRoomId = roomId ?? data.today?.id;
    const avatarUrl =
      client?.getUserId() === userId
        ? clientModule.mxcToHttp(
            slackAccountAvatar(
              zam.matrix.getAccountData(BRIDGE_ACCOUNT_DATA),
              bridgeRoomId ? readBridges(zam.matrix, bridgeRoomId) : [],
            ),
          )
        : null;
    if (
      homeProfile?.userId === userId &&
      homeProfile.roomId === roomId &&
      homeProfile.avatarUrl === avatarUrl
    )
      return;
    homeProfile = { userId, roomId, avatarUrl };
    // The host's account footer and message rows re-read their avatars on this tick.
    state.roomsTick++;
  }

  function onAccountData(event: MatrixEvent) {
    if (event.getType() === BRIDGE_ACCOUNT_DATA) schedule();
  }

  function onState(event: MatrixEvent) {
    if (ROOM_METADATA.has(event.getType())) schedule(true);
  }

  function onTags() {
    schedule(true);
  }

  function onProjectVisibility(event: MatrixEvent) {
    const id = event.getRoomId();
    if (id && visibilityRooms.has(id)) schedule(true);
  }

  function update() {
    queued = false;
    if (stopped) return;
    const currentClient = zam.unsafe.getClient();
    if (currentClient !== client) {
      client?.off("RoomState.events", onState);
      client?.off("Room.tags", onTags);
      client?.off("Room.timeline", onProjectVisibility);
      client?.off("Event.decrypted", onProjectVisibility);
      client?.off("accountData", onAccountData);
      client = currentClient;
      client?.on("RoomState.events", onState);
      client?.on("Room.tags", onTags);
      client?.on("Room.timeline", onProjectVisibility);
      client?.on("Event.decrypted", onProjectVisibility);
      client?.on("accountData", onAccountData);
      refresh = true;
    }
    if (auth.userId !== activeAccount) {
      activeAccount = auth.userId;
      data = workspace([], day);
      projectVisibility.clear();
      visibilityRooms.clear();
      resetLanding();
      refresh = true;
    }
    if (mode === "leon") {
      if (refresh) {
        const bridgedRooms = activeAccount ? readRooms(zam.matrix, clientModule) : [];
        visibilityRooms.clear();
        for (const room of bridgedRooms) {
          if (room.name.trim().replace(/^#/, "").toLowerCase() !== PROJECT_VISIBILITY_CHANNEL)
            continue;
          visibilityRooms.add(room.roomId);
          const snapshot = readProjectVisibility(room, (id) => zam.matrix.getRecentMessages(id));
          if (
            snapshot &&
            snapshot.timestamp >= (projectVisibility.get(snapshot.team)?.timestamp ?? 0)
          )
            projectVisibility.set(snapshot.team, snapshot);
        }
        data = workspace(bridgedRooms, day, projectVisibility);
        if (selectedProject && !data.projects.some(({ id }) => id === selectedProject)) {
          selectedProject = null;
        }
        refresh = false;
      }
      updateNavigation();
    }
    render();
  }

  function schedule(invalidateRooms = false) {
    refresh ||= invalidateRooms;
    if (queued || stopped) return;
    queued = true;
    queueMicrotask(() => {
      try {
        update();
      } catch (error) {
        // Restore Zam's controls if a host change or malformed room breaks Leon's render.
        resetApp();
        throw error;
      }
    });
  }

  function checkDay() {
    const next = projectDay();
    if (next === day) return;
    day = next;
    schedule(true);
  }

  const style = zami.styles.add(STYLES);
  const roomWatch = zami.runes.watch(
    () => [auth.userId, auth.syncState, state.roomsTick],
    () => schedule(true),
  );
  const viewWatch = zami.runes.watch(
    () => [
      state.activeRoomId,
      state.activeSpaceId,
      state.showInbox,
      state.showSpaceHome,
      state.draftDm,
      state.unreadTick,
      notifications.notificationsState.tick,
      ui.isMobile,
    ],
    () => schedule(),
  );
  // Account and responsive layout changes can replace the app shell. Ignore
  // ordinary mutations in an already-mounted timeline.
  const observer = new MutationObserver(() => {
    if (
      !app?.isConnected ||
      !main?.isConnected ||
      !nativeRail?.isConnected ||
      !nativeList?.isConnected ||
      (header && !header.isConnected) ||
      (!header &&
        app.hasAttribute("data-leon-ready") &&
        main?.querySelector(REGION("room-header"))) ||
      mobile !== ui.isMobile
    )
      schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const timer = setInterval(checkDay, 15_000);
  document.addEventListener("visibilitychange", checkDay);
  schedule(true);

  return () => {
    stopped = true;
    observer.disconnect();
    clearInterval(timer);
    document.removeEventListener("visibilitychange", checkDay);
    client?.off("RoomState.events", onState);
    client?.off("Room.tags", onTags);
    client?.off("Room.timeline", onProjectVisibility);
    client?.off("Event.decrypted", onProjectVisibility);
    client?.off("accountData", onAccountData);
    roomWatch.dispose();
    viewWatch.dispose();
    accountAvatar.dispose();
    messageAvatar.dispose();
    if (homeProfile) state.roomsTick++;
    resetApp();
    switcher.dispose();
    style.dispose();
  };
}

let dispose: (() => void) | undefined;
export default {
  async onload(zam: ZamApi) {
    const zami = zam.zami;
    if (!zami) throw new Error("Leon requires the Zami plugin API.");
    const [rooms, { interfaceState: ui }, { auth }, clientModule, notifications, { t }, emoji] =
      await Promise.all([
        zami.import("$lib/stores/rooms.svelte"),
        zami.import("$lib/stores/interface.svelte"),
        zami.import("$lib/stores/auth.svelte"),
        zami.import("$lib/matrix/client"),
        zami.import("$lib/stores/notifications.svelte"),
        zami.import("$lib/i18n/index"),
        zami.import("$lib/data/emojiShortcodes").catch(() => undefined),
      ]);
    dispose = install(zam, zami, {
      rooms,
      ui,
      auth,
      clientModule,
      notifications,
      t,
      emojiForShortcode: emoji?.emojiForShortcode,
    });
    zami.app.loadEarly();
  },
  onunload() {
    dispose?.();
    dispose = undefined;
  },
};

const STYLES = `
[data-leon-mounted] :is([data-zam-region="space-sidebar"], [data-zam-region="room-list"], [data-leon-hidden]),
[data-leon-mounted][data-leon-collapsed] > [data-leon-sidebar],
[data-leon-mounted]:not([data-leon-ready]) > main > :not(.leon-placeholder) {
  display: none !important;
}

.leon-rail, .leon-list, .leon-switcher, .leon-placeholder {
  color: var(--zam-text-primary);
}
.leon-rail {
  width: 7.5rem;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  padding: 10px 8px;
  background: var(--zam-bg-tertiary);
  scrollbar-width: thin;
}
.leon-project {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  min-height: 42px;
  padding: 7px 8px;
  border-radius: 5px;
  background: var(--zam-bg-secondary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
  text-align: start;
  white-space: normal;
  overflow-wrap: anywhere;
}
.leon-project[aria-pressed="true"] {
  background: var(--zam-accent-fill);
  color: white;
}
.leon-project-icon {
  flex: none;
  inline-size: 16px;
  block-size: 16px;
  font-size: 14px;
  line-height: 16px;
  color: var(--zam-text-muted);
}
.leon-project[aria-pressed="true"] .leon-project-icon {
  color: inherit;
}
.leon-project-name {
  min-width: 0;
}
[data-zam-region="room-header"]:has(> .leon-chat-project) > :is(
  h2:not(.leon-chat-project),
  :is(span, svg):has(+ h2:not(.leon-chat-project)),
  span:has(> .lucide-lock),
  button:has(> :is(.lucide-phone, .lucide-maximize-2))
) {
  display: none !important;
}
.leon-chat-project {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--zam-text-primary);
  font-weight: 650;
}
.leon-chat-project .leon-project-icon {
  inline-size: 20px;
  block-size: 20px;
  font-size: 18px;
  line-height: 20px;
}
.leon-chat-project-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.leon-list {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--zam-bg-secondary);
}
.leon-list-title, .leon-placeholder-header {
  height: 3rem;
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid var(--zam-divider);
  font-weight: 650;
}
.leon-list-scroll {
  overflow-y: auto;
  padding: 8px;
}
.leon-list-group + .leon-list-group {
  margin-top: 12px;
  padding-top: 4px;
  border-top: 1px solid var(--zam-divider);
}
.leon-list-group-title {
  padding: 6px 8px;
  color: var(--zam-text-secondary);
  font-size: 12px;
  font-weight: 650;
}
.leon-channel {
  display: block;
  width: 100%;
  text-align: start;
  padding: 9px 8px;
  border-radius: 7px;
  overflow-wrap: anywhere;
  font-size: 13px;
  color: var(--zam-text-secondary);
}
.leon-issue {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding-block: 6px;
  color: var(--zam-text-primary);
}
.leon-issue-priority {
  flex: none;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  width: 14px;
  height: 13px;
  color: var(--zam-text-secondary);
}
.leon-issue-priority > span {
  width: 3px;
  height: 5px;
  border-radius: 1px;
  background: currentColor;
}
.leon-issue-priority > :nth-child(2) { height: 8px; }
.leon-issue-priority > :nth-child(3) { height: 11px; }
.leon-issue-priority[data-priority="3"] > :nth-child(3),
.leon-issue-priority[data-priority="4"] > :nth-child(n+2) { opacity: .3; }
.leon-issue-priority:is([data-priority="0"], [data-priority="unknown"]) {
  align-items: center;
  color: var(--zam-text-muted);
  opacity: .7;
}
.leon-issue-priority:is([data-priority="0"], [data-priority="unknown"]) > span { height: 2px; }
.leon-issue-priority[data-priority="1"] {
  align-items: center;
  border-radius: 3px;
  background: #b73449;
  color: white;
  font-size: 11px;
  font-weight: 750;
  line-height: 1;
}
.leon-issue-status {
  position: relative;
  flex: none;
  box-sizing: border-box;
  width: 14px;
  height: 14px;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  color: #e8b510;
}
.leon-issue-status[data-status="backlog"] { border-style: dashed; }
.leon-issue-status[data-status="started"]::after {
  content: "";
  position: absolute;
  inset: 1.5px;
  border-radius: 50%;
  background: conic-gradient(currentColor 50%, transparent 0);
}
.leon-issue-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.leon-channel:hover, .leon-channel[aria-current], .leon-menu:hover, .leon-switcher-item:hover {
  background: var(--zam-bg-selected);
  color: var(--zam-text-primary);
}
.leon-empty, .leon-status {
  color: var(--zam-text-muted);
  font-size: 13px;
  padding: 8px;
}
.leon-placeholder {
  flex: 1;
  min-width: 0;
}
.leon-status {
  padding: 24px;
}
.leon-menu {
  position: relative;
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: var(--zam-text-muted);
  border-radius: 6px;
}
.leon-menu-overlay {
  position: absolute;
  inset: 8px auto auto 8px;
  z-index: 2;
}
.leon-menu-icon {
  width: 17px;
  height: 2px;
  background: currentColor;
  border-radius: 1px;
  box-shadow: 0 -5px currentColor, 0 5px currentColor;
}
[data-leon-switch-anchor] {
  -webkit-touch-callout: none;
  touch-action: manipulation;
  user-select: none;
}
.leon-badge {
  position: absolute;
  z-index: 1;
  inset: -4px -6px auto auto;
  min-width: 16px;
  padding: 0 4px;
  border-radius: 999px;
  color: white;
  background: var(--zam-accent-fill);
  font-size: 10px;
  font-weight: 750;
  line-height: 16px;
  text-align: center;
  pointer-events: none;
}
.leon-switcher {
  position: fixed;
  z-index: 2147483000;
  min-width: 175px;
  padding: 5px;
  border: 1px solid var(--zam-divider);
  border-radius: 10px;
  background: var(--zam-bg-tertiary);
  box-shadow: 0 8px 24px #0005;
}
.leon-switcher-item {
  display: block;
  width: 100%;
  text-align: start;
  padding: 9px 12px;
  border-radius: 6px;
  font-size: 13px;
}
.leon-switcher-item[aria-checked="true"] {
  color: var(--zam-accent-text);
  font-weight: 650;
}
.leon-menu:focus-visible, .leon-project:focus-visible, .leon-channel:focus-visible,
.leon-switcher-item:focus-visible {
  outline: 2px solid var(--zam-accent-text);
  outline-offset: -2px;
}
`;
