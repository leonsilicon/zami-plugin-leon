import {
  composerPlaceholder,
  installChatPresentation,
  isMatrixPreview,
  issueForLink,
  issueStatusIcon,
  issueTitle,
  MESSAGE_STYLES,
} from "./chat.ts";
import {
  readLaunchWorkspace,
  saveLaunchWorkspace,
  withSavedRooms,
  type LaunchWorkspace,
} from "./launch-cache.ts";
import { projectIcon } from "./project-icon.ts";
import { BRIDGE_ACCOUNT_DATA, slackAccountAvatar } from "./slack-avatar.ts";
import { installTaskSummary, TASK_SUMMARY_STYLES } from "./task-summary.ts";
import {
  AWAITING,
  issueChannel,
  LINEAR_ISSUE_ACCOUNT_DATA,
  PROJECT_APPEARANCE_ACCOUNT_DATA,
  PROJECT_VISIBILITY_ACCOUNT_DATA,
  projectDay,
  projectDayEnd,
  projectLabel,
  readProjectVisibility,
  workspace,
  type BridgedRoom,
  type Channel,
} from "./workspace.ts";
import type { Component, HostModules, MatrixClient, MatrixEvent, ZamApi, ZamiApi } from "./zami.ts";

type Mode = "leon" | "zami";
type ClientModule = HostModules["$lib/matrix/client"];
interface WorkspaceModules {
  rooms: HostModules["$lib/stores/rooms.svelte"];
  ui: HostModules["$lib/stores/interface.svelte"]["interfaceState"];
  closeSidebar: HostModules["$lib/stores/interface.svelte"]["closeSidebar"];
  auth: HostModules["$lib/stores/auth.svelte"]["auth"];
  clientModule: ClientModule;
  avatar: Component;
  messageModule?: HostModules["$lib/matrix/pluginHost"];
  mxcToHttp: HostModules["$lib/matrix/media"]["mxcToHttp"];
  notifications: HostModules["$lib/stores/notifications.svelte"];
  t: HostModules["$lib/i18n/index"]["t"];
  parseMatrixLink?: HostModules["$lib/utils/matrixLinks"]["parseMatrixLink"];
  emojiForShortcode?: HostModules["$lib/data/emojiShortcodes"]["emojiForShortcode"];
}

const BRIDGE_EVENTS = ["m.bridge", "uk.half-shot.bridge"];
const ROOM_METADATA = new Set([...BRIDGE_EVENTS, "m.room.name"]);
const REGION = (name: string) => `[data-zam-region="${name}"]`;
const NATIVE_TIMELINE = `${REGION("timeline")}:not(.leon-home)`;
const NATIVE_MORE = ':scope > button[aria-haspopup="menu"][aria-expanded]:not(.leon-menu)';
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
        issueMetadata: matrix.getAccountData(LINEAR_ISSUE_ACCOUNT_DATA, room.roomId),
        projectMetadata: matrix.getAccountData(PROJECT_APPEARANCE_ACCOUNT_DATA, room.roomId),
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

function issuePriorityIcon(priority: number | null) {
  const icon = element("span", "leon-issue-priority", priority === 1 ? "!" : undefined);
  icon.dataset.priority = priority === null ? "unknown" : String(priority);
  if (priority !== 1) icon.append(element("span", ""), element("span", ""), element("span", ""));
  return icon;
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
      const item = button("leon-menu-item", label, () => {
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
  {
    rooms,
    ui,
    closeSidebar,
    auth,
    clientModule,
    avatar,
    messageModule,
    mxcToHttp,
    notifications,
    t,
    parseMatrixLink,
    emojiForShortcode,
  }: WorkspaceModules,
) {
  const state = rooms.roomsState;
  let mode: Mode = zam.storage.get("view") === "zami" ? "zami" : "leon";
  let day = projectDay();
  let data = workspace([], day);
  let activeAccount: string | null = null;
  let registeredHome: string | null = null;
  let dayEnd: { day: string; at: number } | undefined;
  let client: MatrixClient | null | undefined;
  let homeProfile: { userId: string; roomId: string | null; avatarUrl: string | null } | undefined;
  let followToday = true;
  let homeVisit = 0;
  let previousRoom: string | null = null;
  let selectedProject: string | null = null;
  let projectsExpanded = zam.storage.get("projectsExpanded") === true;
  let collapsed = false;
  let stopped = false;
  let queued = false;
  let refresh = true;
  // The workspace's rooms as an earlier launch left them (launch-cache.ts).
  let savedRooms: LaunchWorkspace | null | undefined;
  let roomsToSave: LaunchWorkspace | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let savedText: string | undefined;

  let app: HTMLElement | null = null;
  let main: HTMLElement | null = null;
  let nativeRail: HTMLElement | null = null;
  let nativeList: HTMLElement | null = null;
  let sidebar: HTMLElement | null = null;
  let header: HTMLElement | null = null;
  let timeline: HTMLElement | null = null;
  let composer: HTMLElement | null = null;
  let hiddenMenu: HTMLButtonElement | null = null;
  let mobile = ui.isMobile;
  let lastRail: string | undefined;
  let lastLists: string | undefined;
  let lastHomeTasks: string | undefined;
  let lastChatHeading: string | undefined;
  let markedReady = false;

  const accountAvatar = zami.patch.after(clientModule, "getOwnAvatarUrl", () => {
    if (homeProfile && homeProfile.userId === auth.userId)
      return homeProfile.avatarUrl ?? undefined;
  });
  const messageAvatar = zami.patch.after(clientModule, "getMemberAvatar", (_, [room, userId]) => {
    if (
      homeProfile?.roomId === room.roomId &&
      homeProfile.userId === userId &&
      userId === auth.userId
    )
      return homeProfile.avatarUrl ?? undefined;
  });

  const resolveIssue = (url: string, label: string) =>
    issueForLink(
      url,
      label,
      data,
      (href) => parseMatrixLink?.(href),
      (id) => Boolean(clientModule.getRoom(id)),
    );
  const preview =
    typeof clientModule.getUrlPreview === "function"
      ? zami.patch.instead(clientModule, "getUrlPreview", ([url], original) =>
          isMatrixPreview(url) || resolveIssue(url, "") ? Promise.resolve(null) : original(url),
        )
      : undefined;
  const roomNameToken = "LEON_ROOM_NAME";
  const chatPresentation = installChatPresentation(
    resolveIssue,
    composerPlaceholder(t("messageInput.message", { roomName: roomNameToken }), roomNameToken),
    (room, userId) => clientModule.getMemberAvatar(room, userId),
    (target, props) => zami.ui.render(target, avatar, props),
  );
  const taskSummary = installTaskSummary(clientModule);

  const rail = element("nav", "leon-rail");
  rail.setAttribute("aria-label", "Linear projects");
  const projectRows = element("div", "leon-project-rows");
  projectRows.id = "leon-project-rows";
  const railToggle = button("leon-rail-toggle", "", () => {
    projectsExpanded = !projectsExpanded;
    updateRailExpansion();
    zam.storage.set("projectsExpanded", projectsExpanded);
  });
  railToggle.setAttribute("aria-controls", projectRows.id);
  const chevrons = element("span", "leon-rail-chevrons");
  chevrons.setAttribute("aria-hidden", "true");
  railToggle.append(chevrons);
  rail.append(railToggle, projectRows);
  updateRailExpansion();
  const list = element("section", "leon-list");
  const placeholder = element("section", "leon-placeholder");
  const fallbackHeader = element("div", "leon-placeholder-header");
  fallbackHeader.append(element("h2", "", "Home"));
  const chatHeading = element("h2", "leon-chat-heading");
  const status = element("p", "leon-status");
  status.setAttribute("role", "status");
  placeholder.append(fallbackHeader, status);

  const home = element("section", "leon-home");
  home.setAttribute("aria-label", AWAITING);
  const homeTasks = element("div", "leon-home-tasks");
  const taskList = element("ul", "leon-home-task-list");
  const emptyTasks = element("p", "leon-empty", "No issues awaiting Leon");
  homeTasks.append(element("h3", "leon-home-title", AWAITING), taskList, emptyTasks);
  home.append(homeTasks);

  const moreOptions = element("div", "leon-home-more-options");
  moreOptions.id = "leon-home-more-options";
  moreOptions.popover = "auto";
  const more = button("leon-home-more", "…", () => {
    if (!header || moreOptions.matches(":popover-open")) return;
    const options = [...header.querySelectorAll<HTMLButtonElement>(":scope > button[title]")]
      .filter(
        (action) =>
          action !== menu &&
          action !== hiddenMenu &&
          action !== more &&
          action.title !== t("messageArea.searchMessages") &&
          !action.querySelector(":is(.lucide-phone, .lucide-maximize-2)"),
      )
      .map((action) => {
        const option = button("leon-menu-item", action.title, () => {
          moreOptions.hidePopover();
          action.click();
        });
        option.disabled = action.disabled;
        return option;
      });
    moreOptions.replaceChildren(...options);
    const { right, bottom } = more.getBoundingClientRect();
    moreOptions.style.left = `${Math.max(8, right - 220)}px`;
    moreOptions.style.top = `${bottom + 6}px`;
  });
  more.title = t("messageArea.moreRoomOptions");
  more.setAttribute("aria-label", more.title);
  more.setAttribute("popovertarget", moreOptions.id);

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
  badge.hidden = true;
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
    registerHome();
    // Update the switch anchor before returning focus from the dropdown.
    render();
  }
  const switcher = makeSwitcher(() => mode, selectMode);

  function sidebarNeedsHistory() {
    return ui.sidebar === "pinned" || ui.sidebar === "notifications";
  }

  function resetLanding() {
    if (mode === "leon" && sidebarNeedsHistory()) closeSidebar?.();
    previousRoom = state.activeRoomId;
    followToday = true;
    homeVisit++;
    selectedProject = null;
    collapsed = false;
  }

  function openRoom(id: string) {
    if (state.activeSpaceId !== null) rooms.setActiveSpace(null);
    if (
      state.activeRoomId !== id ||
      state.showInbox ||
      state.showSpaceHome ||
      state.draftDm ||
      ui.callViewRoomId === id
    ) {
      rooms.setActiveRoom(id);
    } else if (ui.isMobile) {
      ui.leftOpen = false;
    }
    previousRoom = id;
  }

  function openHome() {
    resetLanding();
    if (data.today) openRoom(data.today.id);
    else if (ui.isMobile) ui.leftOpen = false;
    render();
  }

  function choose(channel: Channel, isProject: boolean) {
    selectedProject = isProject ? channel.id : null;
    followToday = false;
    openRoom(channel.id);
    render();
  }

  function projectOpenInHome(roomId: string) {
    const project = data.today;
    if (
      project?.id === roomId &&
      state.activeRoomId === roomId &&
      !state.showInbox &&
      !state.showSpaceHome &&
      !state.draftDm &&
      mode === "leon" &&
      followToday &&
      composer?.isConnected &&
      !stopped
    ) {
      return project;
    }
  }

  // Sending from Home opens today's chat once the message is on its way: one sent directly,
  // and one Zami's outbox held until sync delivered the room (a launch's first moments).
  function followHomeSend(roomId: string, content: Record<string, unknown>, sent: Promise<string>) {
    if (!projectOpenInHome(roomId) || content.msgtype !== "m.text") return;
    const relation = content["m.relates_to"] as { rel_type?: unknown } | undefined;
    if (relation?.rel_type === "m.thread" || relation?.rel_type === "m.replace") return;
    const visit = homeVisit;
    const sendingAccount = auth.userId;
    const sendingClient = zam.unsafe.getClient();
    void sent
      .then(
        () => {
          if (
            homeVisit !== visit ||
            auth.userId !== sendingAccount ||
            zam.unsafe.getClient() !== sendingClient
          )
            return;
          const project = projectOpenInHome(roomId);
          if (!project) return;
          const history = timeline;
          choose(project, true);
          // The composer tried to scroll while Home still hid the timeline.
          if (history?.isConnected) history.scrollTop = history.scrollHeight;
        },
        () => {},
      )
      .catch((error) => console.error("[leon] Failed to open today's chat after send", error));
  }
  const homeSend =
    messageModule && typeof messageModule.sendEventContent === "function"
      ? zami.patch.after(messageModule, "sendEventContent", (sent, [roomId, content]) =>
          followHomeSend(roomId, content, sent),
        )
      : undefined;
  const queuedHomeSend =
    typeof clientModule.sendOutboxMessage === "function"
      ? zami.patch.after(clientModule, "sendOutboxMessage", (sent, [roomId, content]) =>
          followHomeSend(roomId, content, sent),
        )
      : undefined;

  // Zami opens on today's project: it shows the room as it last looked the moment the app
  // opens, and lands in it. The registration ends with the day, so tomorrow's first launch
  // doesn't open on today's chat.
  function registerHome() {
    const home = zami.app.home;
    if (!home) return;
    if (mode !== "leon") {
      // Original Zami opens where it was left.
      if (registeredHome !== "") home.clear();
      registeredHome = "";
      return;
    }
    // Until today's channel has synced, the last registration stands (or has expired).
    // (Nor in the seconds after midnight before the day here has caught up.)
    if (!data.today || projectDay() !== day) return;
    if (dayEnd?.day !== day) dayEnd = { day, at: projectDayEnd() };
    const until = dayEnd.at;
    const key = `${activeAccount} ${data.today.id} ${until}`;
    if (key !== registeredHome && home.set({ roomId: data.today.id, until })) registeredHome = key;
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
    // These room actions can jump to messages, so show the full chat when they open.
    if (followToday && id !== null && id === data.today?.id && sidebarNeedsHistory()) {
      followToday = false;
      selectedProject = id;
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

  function updateRailExpansion() {
    const label = projectsExpanded ? "Collapse project names" : "Expand project names";
    rail.toggleAttribute("data-expanded", projectsExpanded);
    railToggle.setAttribute("aria-expanded", String(projectsExpanded));
    railToggle.setAttribute("aria-label", label);
    railToggle.title = label;
  }

  function renderRail(project: Channel | undefined) {
    const signature = JSON.stringify([followToday, project?.id, data.projects, data.today?.id]);
    if (signature === lastRail) return;

    const home = button("leon-project", "", openHome);
    home.append(
      projectIcon({ icon: "home", color: null }, emojiForShortcode),
      element("span", "leon-project-name", "Home"),
    );
    home.setAttribute("aria-label", "Home");
    home.title = "Home";
    home.setAttribute("aria-pressed", String(followToday));
    const rows = [home];
    for (const entry of data.projects) {
      const title = projectTitle(entry);
      const item = button("leon-project", "", () => choose(entry, true));
      item.append(
        projectIcon(entry.project, emojiForShortcode),
        element("span", "leon-project-name", title),
      );
      item.setAttribute("aria-label", title);
      item.title = title;
      item.setAttribute("aria-pressed", String(project?.id === entry.id));
      rows.push(item);
    }
    projectRows.replaceChildren(...rows);
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
      const priorityIcon = issuePriorityIcon(priority);
      priorityIcon.setAttribute("aria-hidden", "true");
      item.append(
        priorityIcon,
        issueStatusIcon(statusType, statusColor),
        element("span", "leon-issue-title", title),
      );
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

  function renderHomeTasks() {
    const signature = JSON.stringify(data.awaiting);
    if (lastHomeTasks === signature) return;
    taskList.replaceChildren(
      ...data.awaiting.map((entry) => {
        const item = element("li", "");
        item.append(channelButton(entry, false));
        return item;
      }),
    );
    taskList.hidden = data.awaiting.length === 0;
    emptyTasks.hidden = data.awaiting.length > 0;
    lastHomeTasks = signature;
  }

  function renderChatHeader(chat: Channel | undefined, atHome: boolean) {
    const task = !atHome && chat ? issueChannel(chat.name) : undefined;
    const identifier = task?.identifier.toUpperCase();
    const details = task ? chat?.issue : undefined;
    const roomTitle = atHome ? "Home" : chat?.project ? projectTitle(chat) : undefined;
    const title = task ? issueTitle(details, task.slug) || identifier : roomTitle;
    if (!header || !title) {
      chatHeading.remove();
      return;
    }

    const appearance = atHome ? undefined : chat?.project;
    const signature = JSON.stringify([title, appearance, identifier, details]);
    if (signature !== lastChatHeading) {
      chatHeading.title = title;
      chatHeading.toggleAttribute("data-leon-issue", Boolean(identifier));
      chatHeading.replaceChildren(element("span", "leon-issue-title", title));
      if (identifier) {
        const priority = details?.priority ?? null;
        const priorityIcon = issuePriorityIcon(priority);
        priorityIcon.title = PRIORITIES[priority ?? -1] ?? "Priority unavailable";
        priorityIcon.setAttribute("role", "img");
        priorityIcon.setAttribute("aria-label", priorityIcon.title);

        const statusName = details?.statusName ?? "Status unavailable";
        const status = element("span", "leon-issue-title", statusName);
        status.title = statusName;
        const metadata = element("span", "leon-chat-issue-meta");
        metadata.append(
          element("span", "leon-chat-issue-id", identifier),
          priorityIcon,
          issueStatusIcon(details?.statusType, details?.statusColor),
          status,
        );
        chatHeading.prepend(metadata);
      } else if (appearance) {
        chatHeading.prepend(projectIcon(appearance, emojiForShortcode));
      }
      lastChatHeading = signature;
    }
    if (chatHeading.previousElementSibling !== menu) menu.after(chatHeading);
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
    taskSummary.setRoom(null);
    chatPresentation.setMessageRoom(null, null, state.roomsTick);
    app?.removeAttribute("data-leon-mounted");
    app?.removeAttribute("data-leon-ready");
    app?.removeAttribute("data-leon-home");
    app?.removeAttribute("data-leon-collapsed");
    app?.removeAttribute("data-zami-launch-skip");
    sidebar?.removeAttribute("data-leon-sidebar");
    hiddenMenu?.removeAttribute("data-leon-hidden");
    hiddenMenu = null;
    rail.remove();
    list.remove();
    placeholder.remove();
    home.remove();
    more.remove();
    moreOptions.remove();
    menu.remove();
    chatHeading.remove();
    switcher.attach(null);
  }

  function render() {
    const custom = mode === "leon";
    const atHome = custom && followToday;
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
    timeline = main.querySelector(NATIVE_TIMELINE);
    composer = atHome ? (timeline?.parentElement?.querySelector(REGION("composer")) ?? null) : null;
    if (atHome && ui.sidebar === "search") closeSidebar?.();
    const originalLabel = t("common.openRoomList");
    const escapedLabel = CSS.escape(originalLabel);
    const nativeMenu = mobile
      ? (header ?? main).querySelector<HTMLButtonElement>(
          `button[title="${escapedLabel}"], button[aria-label="${escapedLabel}"]:not(.leon-menu)`,
        )
      : null;
    const hasChat = Boolean(chat && (!atHome || (header && timeline)));
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
        const message = data.today
          ? "Opening Today…"
          : auth.syncState === "SYNCING"
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
      const badgeText = count > 0 ? String(count) : "";
      if (badge.textContent !== badgeText) badge.textContent = badgeText;
      badge.hidden = count === 0;
      menu.setAttribute(
        "aria-label",
        count > 0 ? `Open room list, ${count} ${AWAITING}` : originalLabel,
      );
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
    if (atHome) {
      renderHomeTasks();
      const next = hasChat ? timeline : status;
      if (next && home.nextElementSibling !== next) next.before(home);
      // The launch page waits for the visible timeline before handing off typed text.
      // Here the task list fills that region once its matching room composer has mounted.
      if (hasChat && composer) home.dataset.zamRegion = "timeline";
      else home.removeAttribute("data-zam-region");
    } else {
      home.remove();
    }
    if (atHome && hasChat && header && !header.querySelector(NATIVE_MORE)) {
      if (more.parentNode !== header) header.append(more, moreOptions);
    } else {
      more.remove();
      moreOptions.remove();
    }
    renderChatHeader(hasChat ? chat : undefined, atHome && hasChat);
    taskSummary.setRoom(timeline, atHome ? undefined : chat);
    chatPresentation.setMessageRoom(
      hasChat && chat ? clientModule.getRoom(chat.id) : null,
      auth.userId,
      state.roomsTick,
    );
    if (sidebar?.parentElement === app) sidebar.dataset.leonSidebar = "";
    app.toggleAttribute("data-leon-ready", hasChat);
    // Zami saves what the app shows for the next launch to open on, and that's Home: the
    // open chat of today's project isn't it, nor is Home before it has its composer.
    app.toggleAttribute("data-zami-launch-skip", custom && !(atHome && hasChat && composer));
    if (!markedReady && hasChat && (!atHome || composer)) {
      // On the performance timeline next to Zam's own `zam-boot:` marks.
      markedReady = true;
      try {
        performance.mark("leon:ready");
      } catch {
        // No User Timing API.
      }
    }
    app.toggleAttribute("data-leon-home", atHome);
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
    const avatarMxc =
      client?.getUserId() === userId
        ? slackAccountAvatar(
            zam.matrix.getAccountData(BRIDGE_ACCOUNT_DATA),
            bridgeRoomId ? readBridges(zam.matrix, bridgeRoomId) : [],
          )
        : null;
    const avatarUrl = avatarMxc ? (mxcToHttp?.(avatarMxc) ?? null) : null;
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
    const type = event.getType();
    if (
      type === LINEAR_ISSUE_ACCOUNT_DATA ||
      type === PROJECT_APPEARANCE_ACCOUNT_DATA ||
      type === PROJECT_VISIBILITY_ACCOUNT_DATA
    )
      schedule(true);
    else if (type === BRIDGE_ACCOUNT_DATA) schedule();
  }

  function onState(event: MatrixEvent) {
    const type = event.getType();
    if (ROOM_METADATA.has(type)) schedule(true);
    if (type === "m.room.member" && event.getRoomId() === state.activeRoomId) {
      queueMicrotask(() => {
        if (stopped) return;
        chatPresentation.refreshMessages();
        taskSummary.refresh();
      });
    }
  }

  function onTags() {
    schedule(true);
  }

  function update() {
    queued = false;
    if (stopped) return;
    const currentClient = zam.unsafe.getClient();
    if (currentClient !== client) {
      client?.off("RoomState.events", onState);
      client?.off("Room.tags", onTags);
      client?.off("accountData", onAccountData);
      client?.off("Room.accountData", onAccountData);
      client = currentClient;
      client?.on("RoomState.events", onState);
      client?.on("Room.tags", onTags);
      client?.on("accountData", onAccountData);
      client?.on("Room.accountData", onAccountData);
      refresh = true;
    }
    if (auth.userId !== activeAccount) {
      activeAccount = auth.userId;
      data = workspace([], day);
      resetLanding();
      refresh = true;
    }
    if (refresh) {
      let bridgedRooms = activeAccount ? readRooms(zam.matrix, clientModule) : [];
      let visibilityData = activeAccount
        ? zam.matrix.getAccountData(PROJECT_VISIBILITY_ACCOUNT_DATA)
        : null;
      if (activeAccount && clientModule.isRoomListFromCache?.()) {
        // Sync hasn't delivered every room yet: the rest are as they were last saved.
        if (savedRooms?.account !== activeAccount)
          savedRooms = readLaunchWorkspace(zam.storage, activeAccount);
        if (savedRooms) {
          bridgedRooms = withSavedRooms(bridgedRooms, savedRooms.rooms, savedRoomNow);
          visibilityData ??= savedRooms.visibility;
        }
      } else if (activeAccount && (auth.syncState === "SYNCING" || auth.syncState === "PREPARED")) {
        saveRoomsSoon({ account: activeAccount, rooms: bridgedRooms, visibility: visibilityData });
      }
      data = workspace(bridgedRooms, day, readProjectVisibility(visibilityData));
      chatPresentation.refreshIssues();
      if (selectedProject && !data.projects.some(({ id }) => id === selectedProject)) {
        selectedProject = null;
      }
      refresh = false;
    }
    if (mode === "leon") updateNavigation();
    registerHome();
    render();
  }

  /** What Zami's saved room list holds of a room the workspace was saved with. */
  function savedRoomNow(roomId: string) {
    if (!clientModule.getRoom(roomId)) return null;
    return {
      issueMetadata: zam.matrix.getAccountData(LINEAR_ISSUE_ACCOUNT_DATA, roomId),
      projectMetadata: zam.matrix.getAccountData(PROJECT_APPEARANCE_ACCOUNT_DATA, roomId),
    };
  }

  function saveRooms() {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!roomsToSave) return;
    try {
      savedText = saveLaunchWorkspace(zam.storage, roomsToSave, savedText);
    } catch (error) {
      console.error("[leon] Failed to save the workspace for the next launch", error);
    }
    roomsToSave = undefined;
  }

  function saveRoomsSoon(rooms: LaunchWorkspace) {
    roomsToSave = rooms;
    saveTimer ??= setTimeout(saveRooms, 2000);
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
    // Leaving the app: what it shows now is what the next launch opens on.
    if (document.visibilityState === "hidden") saveRooms();
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
      ui.sidebar,
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
      (!header && main?.querySelector(REGION("room-header"))) ||
      (timeline ? !timeline.isConnected : main.querySelector(NATIVE_TIMELINE)) ||
      (app.hasAttribute("data-leon-home") &&
        ((composer && !composer.isConnected) ||
          (!composer && timeline?.parentElement?.querySelector(REGION("composer"))))) ||
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
    client?.off("accountData", onAccountData);
    client?.off("Room.accountData", onAccountData);
    roomWatch.dispose();
    viewWatch.dispose();
    accountAvatar.dispose();
    messageAvatar.dispose();
    homeSend?.dispose();
    queuedHomeSend?.dispose();
    saveRooms();
    preview?.dispose();
    chatPresentation.dispose();
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
    const [
      rooms,
      { interfaceState: ui, closeSidebar },
      { auth },
      clientModule,
      avatar,
      messageModule,
      media,
      notifications,
      { t },
      matrixLinks,
      emoji,
    ] = await Promise.all([
      zami.import("$lib/stores/rooms.svelte"),
      zami.import("$lib/stores/interface.svelte"),
      zami.import("$lib/stores/auth.svelte"),
      zami.import("$lib/matrix/client"),
      zami.components.get("Avatar"),
      zami.import("$lib/matrix/pluginHost").catch(() => undefined),
      zami.import("$lib/matrix/media").catch(() => undefined),
      zami.import("$lib/stores/notifications.svelte"),
      zami.import("$lib/i18n/index"),
      zami.import("$lib/utils/matrixLinks").catch(() => undefined),
      zami.import("$lib/data/emojiShortcodes").catch(() => undefined),
    ]);
    dispose = install(zam, zami, {
      rooms,
      ui,
      closeSidebar,
      auth,
      clientModule,
      avatar,
      messageModule,
      mxcToHttp: media?.mxcToHttp ?? clientModule.mxcToHttp,
      notifications,
      t,
      parseMatrixLink: matrixLinks?.parseMatrixLink,
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
${TASK_SUMMARY_STYLES}
${MESSAGE_STYLES}
/* Cards mounted before the plugin loaded, including the saved launch page. */
:is([data-zam-region="app"], [data-zami-launch-region="app"]) [data-event-id] div.mt-2:has(> a.no-underline:is(
  [href="https://matrix.to" i], [href="http://matrix.to" i],
  [href^="https://matrix.to/" i], [href^="http://matrix.to/" i]
) > div.bg-zam-accent) {
  display: none;
}
.leon-inline-issue {
  padding: .14em .4em;
  border-radius: 4px;
  background: var(--zam-bg-tertiary);
  color: var(--zam-text-primary);
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
.message-body a:has(> .leon-inline-issue) { text-decoration: none; }
.message-body a:is(:hover, :focus-visible) > .leon-inline-issue {
  background: var(--zam-bg-selected);
}
.leon-inline-issue-id {
  white-space: nowrap;
  color: var(--zam-text-secondary);
  font-size: .9em;
  font-weight: 650;
}
.leon-inline-issue-id > .leon-issue-status {
  display: inline-block;
  width: .95em;
  height: .95em;
  margin-inline-end: .35em;
  vertical-align: -.08em;
}
.leon-inline-issue-status-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

[data-leon-mounted] :is([data-zam-region="space-sidebar"], [data-zam-region="room-list"], [data-leon-hidden]),
[data-leon-mounted][data-leon-collapsed] > [data-leon-sidebar],
[data-leon-mounted]:not([data-leon-ready]) > main > :not(.leon-placeholder) {
  display: none !important;
}

.leon-rail, .leon-list, .leon-switcher, .leon-placeholder {
  color: var(--zam-text-primary);
}
.leon-rail {
  /* Match Zami's 32px footer avatar and its 0.5rem padding on each side. */
  --leon-rail-compact-width: calc(32px + 1rem);
  --leon-rail-inset: 6px;
  inline-size: var(--leon-rail-compact-width);
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-block: 6px;
  background: var(--zam-bg-tertiary);
}
.leon-rail[data-expanded] {
  inline-size: min(10rem, 54%);
}
.leon-project-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden auto;
  scrollbar-width: thin;
  padding-inline: var(--leon-rail-inset);
}
.leon-rail-toggle, .leon-project {
  flex: none;
  border-radius: 6px;
}
.leon-rail-toggle {
  align-self: start;
  display: grid;
  place-items: center;
  inline-size: calc(var(--leon-rail-compact-width) - 2 * var(--leon-rail-inset));
  max-inline-size: calc(100% - 2 * var(--leon-rail-inset));
  margin-inline: var(--leon-rail-inset);
  color: var(--zam-text-secondary);
}
.leon-rail-chevrons {
  position: relative;
  inline-size: 18px;
  block-size: 18px;
}
.leon-rail-chevrons::before, .leon-rail-chevrons::after {
  content: "";
  position: absolute;
  top: 5px;
  left: 3px;
  width: 8px;
  height: 8px;
  border: solid currentColor;
  border-width: 2px 2px 0 0;
  transform: rotate(45deg);
}
.leon-rail-chevrons::after {
  left: 8px;
}
.leon-rail-toggle[aria-expanded="true"] .leon-rail-chevrons {
  transform: scaleX(-1);
}
.leon-project {
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  min-block-size: 42px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
  text-align: start;
}
.leon-rail-toggle, .leon-rail:not([data-expanded]) .leon-project {
  box-sizing: border-box;
  aspect-ratio: 1;
  min-block-size: 0;
  padding: 0;
}
.leon-rail:not([data-expanded]) .leon-project {
  inline-size: 100%;
  justify-content: center;
}
.leon-rail:not([data-expanded]) .leon-project-name {
  display: none;
}
.leon-rail-toggle:hover, .leon-project:hover, .leon-project[aria-pressed="true"] {
  background: var(--zam-bg-selected);
  color: var(--zam-text-primary);
}
.leon-project[aria-pressed="true"] {
  box-shadow: inset 2px 0 var(--zam-accent-text);
}
.leon-project-icon {
  display: inline-grid;
  place-items: center;
  flex: none;
  inline-size: 24px;
  block-size: 24px;
  color: var(--leon-project-color, currentColor);
}
.leon-project-emoji {
  font-size: 15px;
  line-height: 1;
}
.leon-project-name {
  min-inline-size: 0;
  overflow-wrap: anywhere;
}
[data-leon-mounted][data-leon-ready] [data-zam-region="room-header"] > :is(
  span:has(> .lucide-lock),
  button:has(> :is(.lucide-phone, .lucide-maximize-2))
),
[data-zam-region="room-header"]:has(> .leon-chat-heading) > :is(
  h2:not(.leon-chat-heading),
  :is(span, svg):has(+ h2:not(.leon-chat-heading))
),
[data-zam-region="room-header"]:has(> .leon-chat-heading[data-leon-issue]) > :is(
  div.w-px.bg-zam-divider,
  div.w-px.bg-zam-divider + :is(p, button),
  div.flex-1
) {
  display: none !important;
}
.leon-chat-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--zam-text-primary);
  font-weight: 650;
}
.leon-chat-heading .leon-project-icon {
  inline-size: 20px;
  block-size: 20px;
  font-size: 18px;
  line-height: 20px;
}
[data-zam-region="room-header"]:has(> .leon-chat-heading[data-leon-issue]) {
  height: auto;
  min-height: 3rem;
  padding-block: 6px;
}
.leon-chat-heading[data-leon-issue] {
  display: grid;
  flex: 1;
  gap: 2px;
  font-size: 14px;
  line-height: 18px;
}
.leon-chat-heading[data-leon-issue] > .leon-issue-title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
  white-space: normal;
}
.leon-chat-issue-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--zam-text-secondary);
  font-size: 11px;
  font-weight: 500;
  line-height: 14px;
}
.leon-chat-issue-id {
  flex: none;
  font-weight: 650;
  white-space: nowrap;
}
@media (max-width: 360px) {
  [data-zam-region="room-header"]:has(> .leon-chat-heading[data-leon-issue]) {
    padding-inline: 10px;
    column-gap: 8px;
  }
  .leon-chat-issue-meta { gap: 5px; }
}
[data-leon-home] [data-zam-region="room-header"] > :not(
  .leon-menu, .leon-chat-heading, .leon-home-more, .leon-home-more-options,
  button[aria-haspopup="menu"][aria-expanded]
) {
  display: none !important;
}
[data-leon-home] .leon-chat-heading { flex: 1; }
[data-leon-home] [data-zam-region="timeline"]:not(.leon-home),
[data-leon-home] [data-zam-region="timeline"]:not(.leon-home) ~ .absolute {
  display: none !important;
}
.leon-home {
  flex: 1 1 0;
  min-block-size: 0;
  min-inline-size: 0;
  padding-inline: 16px;
  color: var(--zam-text-primary);
}
.leon-home-tasks {
  display: flex;
  flex-direction: column;
  block-size: 50%;
  min-block-size: min(100%, 7rem);
  max-inline-size: 48rem;
  margin-inline: auto;
}
.leon-home-title {
  flex: none;
  padding: 16px 8px 8px;
  font-size: 14px;
  font-weight: 650;
}
.leon-home-task-list {
  overflow-y: auto;
  overscroll-behavior-y: contain;
  list-style: none;
  margin: 0;
  padding: 0;
}
.leon-home-task-list .leon-channel { min-block-size: 42px; }
.leon-home-more {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: var(--zam-text-muted);
  font-size: 20px;
  line-height: 1;
}
.leon-home-more-options {
  width: min(220px, calc(100vw - 16px));
  max-block-size: calc(100dvh - 72px);
  overflow-y: auto;
  inset: auto;
  margin: 0;
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
.leon-issue-status[data-status="unknown"] { color: var(--zam-text-muted); }
.leon-issue-status[data-status="started"]::after {
  content: "";
  position: absolute;
  inset: 1.5px;
  border-radius: 50%;
  background: conic-gradient(currentColor 50%, transparent 0);
}
.leon-issue-status:is([data-status="completed"], [data-status="canceled"], [data-status="duplicate"])::after {
  content: "";
  position: absolute;
  inset: 38% 20% auto;
  border-bottom: 1px solid currentColor;
}
.leon-issue-status[data-status="completed"]::after {
  height: 35%;
  inset-block-start: 23%;
  border-inline-start: 1px solid currentColor;
  transform: rotate(-45deg);
}
.leon-issue-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.leon-channel:hover, .leon-channel[aria-current], .leon-menu:hover, .leon-menu-item:hover,
.leon-home-more:hover {
  background: var(--zam-bg-selected);
  color: var(--zam-text-primary);
}
.leon-empty, .leon-status {
  color: var(--zam-text-muted);
  font-size: 13px;
  padding: 8px;
}
.leon-placeholder {
  display: flex;
  flex-direction: column;
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
.leon-switcher, .leon-home-more-options {
  position: fixed;
  padding: 5px;
  border: 1px solid var(--zam-divider);
  border-radius: 10px;
  background: var(--zam-bg-tertiary);
  color: var(--zam-text-primary);
  box-shadow: 0 8px 24px #0005;
}
.leon-switcher {
  z-index: 2147483000;
  min-width: 175px;
}
.leon-menu-item {
  display: block;
  width: 100%;
  text-align: start;
  padding: 9px 12px;
  border-radius: 6px;
  font-size: 13px;
}
.leon-menu-item[aria-checked="true"] {
  color: var(--zam-accent-text);
  font-weight: 650;
}
.leon-menu:focus-visible, .leon-rail-toggle:focus-visible, .leon-project:focus-visible,
.leon-channel:focus-visible, .leon-menu-item:focus-visible, .leon-home-more:focus-visible {
  outline: 2px solid var(--zam-accent-text);
  outline-offset: -2px;
}
`;
