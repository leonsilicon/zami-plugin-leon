const AWAITING = "Awaiting Leon";
const TASK = /^leon-[a-z0-9_-]+$/;
const PROJECT = /^project-[a-z0-9_-]+$/;
const BRIDGE_EVENTS = ["m.bridge", "uk.half-shot.bridge"];
const ROOM_METADATA = new Set([...BRIDGE_EVENTS, "m.room.name", "m.room.topic"]);
const REGION = (name) => `[data-zam-region="${name}"]`;
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

function channelName(name) {
  return typeof name === "string" ? name.trim().replace(/^#/, "").toLowerCase() : "";
}

function slackRoom(room) {
  if (room.isSpace) return false;
  return room.bridges.some(({ content }) => {
    const protocol = content.protocol?.id;
    return (
      typeof protocol === "string" &&
      ["slack", "slackgo"].includes(protocol.toLowerCase()) &&
      content["com.beeper.room_type"] !== "dm" &&
      !["dm", "group_dm", "space"].includes(content["com.beeper.room_type.v2"])
    );
  });
}

export function workspace(rooms, day) {
  const channels = new Map();
  const awaiting = [];
  const projects = [];
  for (const room of rooms) {
    if (!slackRoom(room)) continue;
    const name = channelName(room.name);
    const channel = { id: room.roomId, name };
    channels.set(channel.id, channel);
    if (PROJECT.test(name)) projects.push(channel);
    if (TASK.test(name) && room.topic?.split(" · ", 1)[0].trim() === AWAITING) {
      awaiting.push(channel);
    }
  }
  awaiting.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  const canonical = `project-${day}`;
  const undashed = canonical.replace(day, day.replaceAll("-", ""));
  const suffixed = new RegExp(`^${canonical}-([2-9]|[1-9][0-9]+)$`);
  const sameDay = (name) => {
    if (name === canonical) return 0;
    if (name === undashed) return 1;
    const suffix = suffixed.exec(name);
    return suffix ? Number(suffix[1]) : Infinity;
  };
  projects.sort((a, b) => sameDay(a.name) - sameDay(b.name) || a.name.localeCompare(b.name));
  const today = projects.find(({ name }) => Number.isFinite(sameDay(name))) ?? null;
  return { channels, awaiting, projects, today };
}

function readRooms(matrix, clientModule) {
  return clientModule.getRooms().flatMap((room) => {
    if (room.isSpaceRoom()) return [];
    const bridges = BRIDGE_EVENTS.flatMap((type) => matrix.listState(room.roomId, type));
    if (!bridges.length) return [];
    return [
      {
        roomId: room.roomId,
        name: room.name,
        topic: clientModule.getRoomTopic(room),
        bridges,
      },
    ];
  });
}

function element(tag, className, label) {
  const node = document.createElement(tag);
  node.className = className;
  if (label) node.textContent = label;
  return node;
}

function button(className, label, action) {
  const node = element("button", className, label);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}

function makeSwitcher(currentMode, setMode) {
  let anchor = null;
  let popup = null;
  let press = null;
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
    ]) {
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
    popup.querySelector('[aria-checked="true"]').focus();
  }

  document.addEventListener(
    "pointerdown",
    (event) => {
      cancelPress();
      if (popup && !popup.contains(event.target)) close();
      if (!anchor?.contains(event.target) || event.button !== 0) return;
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
      if (!anchor?.contains(event.target) || performance.now() >= suppressClickUntil) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    options,
  );
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (!anchor?.contains(event.target)) return;
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
      if (event.shiftKey && event.key === "F10" && anchor?.contains(event.target)) {
        event.preventDefault();
        show();
      } else if (popup && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      } else if (popup && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        const items = [...popup.children];
        const step = event.key === "ArrowDown" ? 1 : -1;
        const index = items.indexOf(document.activeElement);
        items[(index + step + items.length) % items.length].focus();
        event.preventDefault();
      } else if (popup && event.key === "Tab") {
        close(true);
      }
    },
    options,
  );

  return {
    show,
    attach(next) {
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

function install(zam, { rooms, ui, auth, clientModule, t }) {
  const zami = zam.zami;
  const root = document.documentElement;
  const state = rooms.roomsState;
  let mode = zam.storage.get("view") === "zami" ? "zami" : "leon";
  let day = projectDay();
  let data = workspace([], day);
  let activeAccount = null;
  let client = null;
  let followToday = true;
  let previousRoom = null;
  let selectedProject = null;
  let collapsed = false;
  let stopped = false;
  let queued = false;
  let refresh = true;

  let app;
  let main;
  let nativeRail;
  let nativeList;
  let sidebar;
  let header;
  let hiddenMenu;
  let mobile;
  let lastLists;

  const rail = element("nav", "leon-rail");
  rail.setAttribute("aria-label", "Linear projects");
  const list = element("section", "leon-list");
  const placeholder = element("section", "leon-placeholder");
  const fallbackHeader = element("div", "leon-placeholder-header", "Today");
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

  function selectMode(next) {
    if (next === mode) return;
    mode = next;
    zam.storage.set("view", mode);
    root.dataset.leonView = mode;
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

  function openRoom(id) {
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

  function choose(channel, isProject) {
    selectedProject = isProject ? channel.id : null;
    followToday = false;
    openRoom(channel.id);
    render();
  }

  function updateNavigation() {
    const id = state.activeRoomId;
    if (
      id !== previousRoom &&
      data.channels.has(id) &&
      (!followToday || data.today?.id === previousRoom)
    ) {
      followToday = false;
      selectedProject = data.projects.some((project) => project.id === id) ? id : null;
    }
    const activeSlack = data.channels.has(id) && !state.showInbox && !state.draftDm;
    if (data.today && (followToday || !activeSlack)) {
      if (!followToday) resetLanding();
      if (id !== data.today.id || !activeSlack || state.activeSpaceId !== null)
        openRoom(data.today.id);
    }
    previousRoom = state.activeRoomId;
  }

  function renderLists(project) {
    const rows = project ? [project] : data.awaiting;
    const signature = JSON.stringify([
      project,
      data.projects,
      data.today?.id,
      rows,
      state.activeRoomId,
    ]);
    if (signature === lastLists) return;
    lastLists = signature;

    const home = button("leon-project", "Home", openHome);
    home.setAttribute("aria-pressed", String(!project));
    const projectsLabel = element("div", "leon-rail-label", "Projects");
    rail.replaceChildren(home, projectsLabel);
    for (const entry of data.projects) {
      const label = entry.name.slice("project-".length);
      const initials =
        entry.id === data.today?.id
          ? "Today"
          : /^\d{4}-\d{2}-\d{2}$/.test(label)
            ? label.slice(5)
            : label
                .split("-")
                .slice(0, 2)
                .map((word) => word[0])
                .join("")
                .toUpperCase();
      const item = button("leon-project", initials, () => choose(entry, true));
      item.title = `#${entry.name}`;
      item.setAttribute("aria-label", item.title);
      item.setAttribute("aria-pressed", String(project?.id === entry.id));
      rail.append(item);
    }

    const title = element("h2", "leon-list-title", project ? "Project channel" : AWAITING);
    const scroll = element("div", "leon-list-scroll");
    for (const row of rows) {
      const item = button("leon-channel", `#${row.name}`, () => choose(row, Boolean(project)));
      if (state.activeRoomId === row.id) item.setAttribute("aria-current", "true");
      scroll.append(item);
    }
    if (!rows.length) scroll.append(element("p", "leon-empty", "No channels awaiting you"));
    const scrollTop = list.lastElementChild?.scrollTop ?? 0;
    list.replaceChildren(title, scroll);
    scroll.scrollTop = scrollTop;
  }

  function bindApp() {
    const next = document.querySelector(REGION("app"));
    if (next !== app) {
      sidebar?.removeAttribute("data-leon-sidebar");
      app?.removeAttribute("data-leon-ready");
      app?.removeAttribute("data-leon-collapsed");
      app = next;
    }
    main = app?.querySelector(":scope > main");
    nativeRail = app?.querySelector(REGION("space-sidebar"));
    nativeList = app?.querySelector(REGION("room-list"));
    sidebar = nativeRail?.parentElement?.parentElement;
    if (sidebar?.parentElement === app) sidebar.dataset.leonSidebar = "";
    mobile = ui.isMobile;
  }

  function render() {
    bindApp();
    if (!app || !main || !nativeRail || !nativeList) {
      switcher.attach(null);
      return;
    }

    header = main.querySelector(REGION("room-header"));
    const originalLabel = t("common.openRoomList");
    const escapedLabel = CSS.escape(originalLabel);
    const nativeMenu =
      mobile &&
      (header ?? main).querySelector(
        `button[title="${escapedLabel}"], button[aria-label="${escapedLabel}"]:not(.leon-menu)`,
      );
    const custom = mode === "leon";
    const hasChat =
      custom &&
      Boolean(
        data.channels.has(state.activeRoomId) &&
        !state.showInbox &&
        !state.draftDm &&
        (!followToday || data.today?.id === state.activeRoomId),
      );
    app.toggleAttribute("data-leon-ready", hasChat);
    app.toggleAttribute("data-leon-collapsed", custom && !mobile && collapsed);

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
  }

  function onState(event) {
    if (ROOM_METADATA.has(event.getType())) schedule(true);
  }

  function update() {
    queued = false;
    if (stopped) return;
    const currentClient = zam.unsafe.getClient();
    if (currentClient !== client) {
      client?.off("RoomState.events", onState);
      client = currentClient;
      client?.on("RoomState.events", onState);
      refresh = true;
    }
    if (auth.userId !== activeAccount) {
      activeAccount = auth.userId;
      data = workspace([], day);
      resetLanding();
      refresh = true;
    }
    if (mode === "leon") {
      if (refresh) {
        data = workspace(activeAccount ? readRooms(zam.matrix, clientModule) : [], day);
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
    queueMicrotask(update);
  }

  function checkDay() {
    const next = projectDay();
    if (next === day) return;
    day = next;
    schedule(true);
  }

  root.dataset.leonView = mode;
  const style = zami.styles.add(STYLES);
  const roomWatch = zami.runes.watch(
    () => [auth.userId, auth.syncState, state.roomsTick],
    () => schedule(true),
  );
  const navigationWatch = zami.runes.watch(
    () => [
      state.activeRoomId,
      state.activeSpaceId,
      state.showInbox,
      state.showSpaceHome,
      state.draftDm,
      ui.isMobile,
    ],
    () => schedule(),
  );
  // Account and responsive layout changes can replace the app shell. Ignore
  // ordinary mutations in an already-mounted timeline.
  const observer = new MutationObserver(() => {
    if (
      !app?.isConnected ||
      !nativeRail?.isConnected ||
      !nativeList?.isConnected ||
      (header && !header.isConnected) ||
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
    roomWatch.dispose();
    navigationWatch.dispose();
    switcher.dispose();
    rail.remove();
    list.remove();
    placeholder.remove();
    menu.remove();
    hiddenMenu?.removeAttribute("data-leon-hidden");
    delete root.dataset.leonView;
    app?.removeAttribute("data-leon-ready");
    app?.removeAttribute("data-leon-collapsed");
    sidebar?.removeAttribute("data-leon-sidebar");
    style.dispose();
  };
}

let dispose;
export default {
  async onload(zam) {
    if (!zam.zami) throw new Error("Leon requires the Zami plugin API.");
    const [rooms, { interfaceState: ui }, { auth }, clientModule, { t }] = await Promise.all(
      [
        "$lib/stores/rooms.svelte",
        "$lib/stores/interface.svelte",
        "$lib/stores/auth.svelte",
        "$lib/matrix/client",
        "$lib/i18n/index",
      ].map((id) => zam.zami.import(id)),
    );
    dispose = install(zam, { rooms, ui, auth, clientModule, t });
    zam.zami.app.loadEarly();
  },
  onunload() {
    dispose?.();
    dispose = undefined;
  },
};

const STYLES = `
html[data-leon-view="leon"] :is([data-zam-region="space-sidebar"], [data-zam-region="room-list"], [data-leon-hidden]),
html[data-leon-view="leon"] [data-leon-collapsed] > [data-leon-sidebar],
html[data-leon-view="leon"] [data-zam-region="app"]:not([data-leon-ready]) > main > :not(.leon-placeholder) {
  display: none !important;
}

.leon-rail, .leon-list, .leon-switcher, .leon-placeholder {
  color: var(--zam-text-primary);
}
.leon-rail {
  width: 4.5rem;
  flex: none;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
  padding: 10px 5px;
  background: var(--zam-bg-tertiary);
  scrollbar-width: thin;
}
.leon-rail-label {
  padding-top: 10px;
  color: var(--zam-text-muted);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: .035em;
}
.leon-project {
  flex: none;
  width: 48px;
  min-height: 42px;
  border-radius: 11px;
  background: var(--zam-bg-secondary);
  font-size: 12px;
  font-weight: 700;
}
.leon-project[aria-pressed="true"] {
  background: var(--zam-accent-fill);
  color: white;
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
