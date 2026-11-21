// Generated from src/index.ts by vp build.
// src/project-icon.ts
var SVG_NS = "http://www.w3.org/2000/svg";
var CUBE = "M12 3 3.5 7.75v8.5L12 21l8.5-4.75v-8.5L12 3Z M3.5 7.75 12 12.5l8.5-4.75 M12 12.5V21";
var ICON_PATHS = {
	book: "M4 5c3-1.5 5.5-1 8 1v14c-2.5-2-5-2.5-8-1V5Zm16 0c-3-1.5-5.5-1-8 1v14c2.5-2 5-2.5 8-1V5Z",
	briefcase: "M3 8h18v12H3z M8 8V4h8v4 M3 13h18 M10 13v2h4v-2",
	calendar: "M4 6h16v14H4z M8 4v4 M16 4v4 M4 10h16 M8 14h2 M14 14h2",
	code: "m8 7-5 5 5 5m8-10 5 5-5 5m-2-13-4 16",
	flag: "M5 21V4m0 1c5-4 9 4 14 0v9c-5 4-9-4-14 0",
	globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c-4 3.5-4 14.5 0 18 4-3.5 4-14.5 0-18ZM3 12h18",
	home: "m3 10 9-7 9 7 M5 9v12h14V9 M9 21v-7h6v7",
	rocket: "M9 16c-1-1-2-2-3-2 1-3 2-5 5-7 4-3 8-3 9-3 0 1 0 5-3 9-2 3-4 4-7 5 0-1-1-2-1-2Zm0-6H5l-2 4 3 1m8 0v4l-4 2-1-3m6-8h.01M7 18l-3 2 1-3",
	star: "m12 3 2.75 5.5 6.25.9-4.5 4.35 1.05 6.15L12 17l-5.55 2.9 1.05-6.15L3 9.4l6.25-.9L12 3Z",
	target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 5h.01"
};
function projectIcon(appearance, emojiForShortcode) {
	const icon = appearance?.icon ?? "";
	const shortcode = /^:([\w+-]+):$/.exec(icon)?.[1];
	const emoji = shortcode ? emojiForShortcode?.(shortcode) : /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(icon) ? icon : void 0;
	if (emoji) {
		const element = document.createElement("span");
		element.className = "leon-project-icon";
		element.setAttribute("aria-hidden", "true");
		element.textContent = emoji;
		return element;
	}
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.classList.add("leon-project-icon");
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	if (appearance?.color) svg.style.color = appearance.color;
	const shape = icon.replace(/^icon[-_]?/i, "").toLowerCase();
	const path = document.createElementNS(SVG_NS, "path");
	path.setAttribute("d", Object.hasOwn(ICON_PATHS, shape) ? ICON_PATHS[shape] : CUBE);
	svg.append(path);
	return svg;
}
// src/workspace.ts
var AWAITING = "Awaiting Leon";
var PROJECT_VISIBILITY_PREFIX = "zami-projects:v1";
var TASK = /^(leon-\d+)(?:-[a-z0-9_-]+)?$/;
var TOPIC_SEPARATOR = " · ";
var LINEAR_WORKFLOW = /^linear:v1 ([a-z_]+) (#[\da-f]{6}|-)(?: p([0-4]))?(?: |$)/i;
var LINEAR_ISSUE = /^https:\/\/linear\.app\/[^/<>\s]+\/issue\/(leon-\d+)(?:[/?#][^<>\s]*)?$/i;
var SLACK_LINK = /^<([^|<>\s]+)(?:\|[^<>]+)?>$/;
var CLOSED_STATUS_TYPES = /* @__PURE__ */ new Set([
	"completed",
	"canceled",
	"duplicate"
]);
var PROJECT = /^project-[a-z0-9_-]+$/;
var PROJECT_TOPIC_SUFFIX = /(?:^| · )\[linear-project:v1 (#[\da-f]{6}|-)(?: ([^[\]\r\n]{1,80}))?\]$/i;
var TORONTO = new Intl.DateTimeFormat("en-CA", {
	timeZone: "America/Toronto",
	year: "numeric",
	month: "2-digit",
	day: "2-digit"
});
var PROJECT_DATE_LABEL = new Intl.DateTimeFormat("en-US", {
	timeZone: "UTC",
	month: "short",
	day: "2-digit"
});
function projectDay(now = /* @__PURE__ */ new Date()) {
	const fields = Object.fromEntries(TORONTO.formatToParts(now).map(({ type, value }) => [type, value]));
	return `${fields.year}-${fields.month}-${fields.day}`;
}
function projectLabel(name) {
	const slug = name.slice(8);
	const dated = datedProject(name);
	if (dated) {
		const label = PROJECT_DATE_LABEL.format(dated.date);
		return dated.suffix ? `${label} (${dated.suffix})` : label;
	}
	return slug.replace(/[-_]+/g, " ").trim().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) || slug;
}
function datedProject(name) {
	const [, datePart, suffix] = /^project-(\d{4}-\d{2}-\d{2}|\d{8})(?:-([2-9]|[1-9][0-9]+))?$/.exec(name) ?? [];
	if (!datePart) return null;
	const iso = datePart.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
	const date = /* @__PURE__ */ new Date(`${iso}T00:00:00Z`);
	if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== iso) return null;
	return {
		date,
		iso,
		suffix
	};
}
function channelName(name) {
	return typeof name === "string" ? name.trim().replace(/^#/, "").toLowerCase() : "";
}
function isSlackProtocol(id) {
	return typeof id === "string" && ["slack", "slackgo"].includes(id.toLowerCase());
}
function slackBridges(room) {
	if (room.isSpace) return [];
	return room.bridges.filter(({ content }) => {
		const info = content.protocol;
		const protocol = info && typeof info === "object" && "id" in info ? info.id : void 0;
		const roomType = content["com.beeper.room_type.v2"];
		return isSlackProtocol(protocol) && content["com.beeper.room_type"] !== "dm" && roomType !== "dm" && roomType !== "group_dm" && roomType !== "space";
	});
}
function slackAddress(bridges) {
	for (const { content } of bridges) {
		const channel = content.channel;
		const id = channel && typeof channel === "object" && "id" in channel && channel.id;
		if (typeof id !== "string") continue;
		const [, team, channelId] = /^(T[A-Z0-9]+)-([CG][A-Z0-9]+)$/.exec(id) ?? [];
		if (team && channelId) return {
			team,
			channelId
		};
		const network = content.network;
		const networkId = network && typeof network === "object" && "id" in network && network.id;
		if (typeof networkId === "string" && /^[CG][A-Z0-9]+$/.test(id)) return {
			team: networkId,
			channelId: id
		};
	}
	return null;
}
function readProjectVisibility(room, readMessages) {
	const address = slackAddress(slackBridges(room));
	if (!address) return null;
	for (const { body, timestamp } of [...readMessages(room.roomId)].reverse()) {
		const [prefix, ...ids] = body.trim().split(" ");
		if (prefix === PROJECT_VISIBILITY_PREFIX && ids.every((id) => /^[CG][A-Z0-9]+$/.test(id))) return {
			team: address.team,
			closed: new Set(ids),
			timestamp
		};
	}
	return null;
}
function linearIssue(name, topic) {
	const identifier = TASK.exec(name)?.[1];
	if (!identifier || !topic) return null;
	const [status, workflow, link, ...titleParts] = topic.split(TOPIC_SEPARATOR);
	const [, type, color, priority] = workflow?.match(LINEAR_WORKFLOW) ?? [];
	const linkedIssue = (link?.match(SLACK_LINK)?.[1] ?? link)?.match(LINEAR_ISSUE)?.[1]?.toLowerCase();
	const statusName = status?.trim();
	const title = titleParts.join(TOPIC_SEPARATOR).trim();
	if (!statusName || !type || !color || !title || linkedIssue !== identifier) return null;
	return {
		title,
		priority: priority === void 0 ? null : Number(priority),
		statusName,
		statusType: type.toLowerCase(),
		statusColor: color === "-" ? null : color
	};
}
function projectAppearance(topic) {
	const [, color, icon] = topic?.match(PROJECT_TOPIC_SUFFIX) ?? [];
	return {
		color: color === "-" ? null : color ?? null,
		icon: icon ?? null
	};
}
function workspace(rooms, day, visibility = /* @__PURE__ */ new Map()) {
	const channels = /* @__PURE__ */ new Map();
	const awaiting = [];
	const projects = [];
	for (const room of rooms) {
		const bridges = slackBridges(room);
		if (!bridges.length) continue;
		const name = channelName(room.name);
		if (name === "zami-project-visibility") continue;
		const issue = linearIssue(name, room.topic);
		const project = PROJECT.test(name) ? projectAppearance(room.topic) : null;
		const channel = {
			id: room.roomId,
			name,
			...issue && { issue },
			...project && { project }
		};
		channels.set(channel.id, channel);
		if (project && !room.archived) {
			const address = slackAddress(bridges);
			const snapshot = address ? visibility.get(address.team) : void 0;
			if (!(snapshot && address ? snapshot.closed.has(address.channelId) : (datedProject(name)?.iso ?? day) < day)) projects.push(channel);
		}
		if (issue?.statusName === "Awaiting Leon" && !CLOSED_STATUS_TYPES.has(issue.statusType)) awaiting.push(channel);
	}
	awaiting.sort((a, b) => (a.issue?.priority || 5) - (b.issue?.priority || 5) || a.name.localeCompare(b.name, "en", { numeric: true }));
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
	return {
		channels,
		awaiting,
		projects,
		today: projects.find(({ name }) => Number.isFinite(sameDay(name))) ?? null
	};
}
// src/slack-avatar.ts
var BRIDGE_ACCOUNT_DATA = "com.beeper.bridge_state";
function record(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function slackAccountAvatar(accountData, roomBridges) {
	const room = roomBridges.find(({ content }) => isSlackProtocol(record(content.protocol)?.id));
	const bridgeName = room?.content["com.beeper.bridge_name"];
	const receiver = record(room?.content.channel)?.["fi.mau.receiver"];
	const network = record(room?.content.network)?.id;
	const accounts = Object.entries(record(record(accountData)?.bridges) ?? {}).flatMap(([name, value]) => {
		const bridge = record(value);
		if (typeof bridgeName === "string" && name !== bridgeName) return [];
		if (!isSlackProtocol(name) && !isSlackProtocol(record(bridge?.bridgeState)?.bridgeType)) return [];
		return Object.entries(record(bridge?.remoteState) ?? {}).flatMap(([id, value]) => {
			const account = record(value);
			if (!account || account.state_event === "LOGGED_OUT" || account.state_event === "UNCONFIGURED") return [];
			return [{
				id,
				avatar: record(account.remote_profile)?.avatar
			}];
		});
	});
	const exact = accounts.filter(({ id }) => id === receiver);
	const workspace = typeof network === "string" ? network.toUpperCase() : null;
	const matches = exact.length || typeof receiver === "string" && /^T[A-Z0-9]+-/i.test(receiver) ? exact : accounts.filter(({ id }) => !workspace || id.toUpperCase().split("-")[0] === workspace);
	const avatar = matches.length === 1 ? matches[0]?.avatar : void 0;
	return typeof avatar === "string" && avatar.startsWith("mxc://") ? avatar : null;
}
// src/index.ts
var BRIDGE_EVENTS = ["m.bridge", "uk.half-shot.bridge"];
var ROOM_METADATA = /* @__PURE__ */ new Set([
	...BRIDGE_EVENTS,
	"m.room.name",
	"m.room.topic"
]);
var REGION = (name) => `[data-zam-region="${name}"]`;
var PRIORITIES = [
	"No priority",
	"Urgent priority",
	"High priority",
	"Medium priority",
	"Low priority"
];
function readBridges(matrix, roomId) {
	return BRIDGE_EVENTS.flatMap((type) => matrix.listState(roomId, type));
}
function readRooms(matrix, clientModule) {
	return clientModule.getRooms().flatMap((room) => {
		if (room.isSpaceRoom()) return [];
		const bridges = readBridges(matrix, room.roomId);
		if (!bridges.length) return [];
		return [{
			roomId: room.roomId,
			name: room.name,
			topic: clientModule.getRoomTopic(room),
			bridges,
			archived: Object.hasOwn(room.tags ?? {}, "m.lowpriority")
		}];
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
	const options = {
		capture: true,
		signal: listeners.signal
	};
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
		for (const [mode, label] of [["leon", "Leon workspace"], ["zami", "Original Zami"]]) {
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
		popup.querySelector("[aria-checked=\"true\"]")?.focus();
	}
	document.addEventListener("pointerdown", (event) => {
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
				suppressClickUntil = performance.now() + 1e3;
				show();
			}, 500)
		};
	}, options);
	document.addEventListener("pointermove", (event) => {
		if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) cancelPress();
	}, options);
	document.addEventListener("pointerup", (event) => {
		if (press?.id !== event.pointerId) return;
		if (popup) suppressClickUntil = performance.now() + 1e3;
		cancelPress();
	}, options);
	document.addEventListener("pointercancel", cancelPress, options);
	document.addEventListener("click", (event) => {
		if (!(event.target instanceof Node) || !anchor?.contains(event.target) || performance.now() >= suppressClickUntil) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	}, options);
	document.addEventListener("contextmenu", (event) => {
		if (!(event.target instanceof Node) || !anchor?.contains(event.target)) return;
		event.preventDefault();
		cancelPress();
		suppressClickUntil = performance.now() + 1e3;
		show();
	}, options);
	document.addEventListener("keydown", (event) => {
		if (event.shiftKey && event.key === "F10" && event.target instanceof Node && anchor?.contains(event.target)) {
			event.preventDefault();
			show();
		} else if (popup && event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			close(true);
		} else if (popup && ["ArrowDown", "ArrowUp"].includes(event.key)) {
			const items = [...popup.querySelectorAll("button")];
			const step = event.key === "ArrowDown" ? 1 : -1;
			items[(items.findIndex((item) => item === document.activeElement) + step + items.length) % items.length]?.focus();
			event.preventDefault();
		} else if (popup && event.key === "Tab") close(true);
	}, options);
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
		}
	};
}
function install(zam, zami, { rooms, ui, auth, clientModule, notifications, t, emojiForShortcode }) {
	const root = document.documentElement;
	const state = rooms.roomsState;
	let mode = zam.storage.get("view") === "zami" ? "zami" : "leon";
	let day = projectDay();
	let data = workspace([], day);
	const projectVisibility = /* @__PURE__ */ new Map();
	const visibilityRooms = /* @__PURE__ */ new Set();
	let activeAccount = null;
	let client;
	let homeProfile;
	let followToday = true;
	let previousRoom = null;
	let selectedProject = null;
	let collapsed = false;
	let stopped = false;
	let queued = false;
	let refresh = true;
	let app = null;
	let main = null;
	let nativeRail = null;
	let nativeList = null;
	let sidebar = null;
	let header = null;
	let hiddenMenu = null;
	let mobile = ui.isMobile;
	let lastRail;
	let lastLists;
	let lastProjectHeading;
	const accountAvatar = zami.patch.after(clientModule, "getOwnAvatarUrl", () => {
		if (homeProfile && homeProfile.userId === auth.userId) return homeProfile.avatarUrl;
	});
	const messageAvatar = zami.patch.after(clientModule, "getMemberAvatar", (_, [room, userId]) => {
		if (homeProfile?.roomId === room.roomId && homeProfile.userId === userId && userId === auth.userId) return homeProfile.avatarUrl;
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
		if (ui.isMobile) ui.leftOpen = !ui.leftOpen;
		else if (mode === "leon") {
			collapsed = !collapsed;
			render();
		} else switcher.show();
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
		if (state.activeRoomId !== id || state.showInbox || state.showSpaceHome || state.draftDm) rooms.setActiveRoom(id);
		else if (ui.isMobile) ui.leftOpen = false;
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
		if (id !== null && id !== previousRoom && data.channels.has(id) && (!followToday || data.today?.id === previousRoom)) {
			followToday = false;
			selectedProject = data.projects.some((project) => project.id === id) ? id : null;
		}
		const activeSlack = id !== null && data.channels.has(id) && !state.showInbox && !state.draftDm;
		if (data.today && (followToday || !activeSlack)) {
			if (!followToday) resetLanding();
			if (id !== data.today.id || !activeSlack || state.activeSpaceId !== null) openRoom(data.today.id);
		}
		previousRoom = state.activeRoomId;
	}
	function projectTitle(channel) {
		return channel.id === data.today?.id ? "Today" : projectLabel(channel.name);
	}
	function renderRail(project) {
		const signature = JSON.stringify([
			project?.id,
			data.projects,
			data.today?.id
		]);
		if (signature === lastRail) return;
		lastRail = signature;
		const home = button("leon-project", "", openHome);
		home.append(projectIcon({
			icon: "home",
			color: null
		}, emojiForShortcode), element("span", "leon-project-name", "Home"));
		home.setAttribute("aria-pressed", String(!project));
		rail.replaceChildren(home);
		for (const entry of data.projects) {
			const item = button("leon-project", "", () => choose(entry, true));
			item.append(projectIcon(entry.project, emojiForShortcode), element("span", "leon-project-name", projectTitle(entry)));
			item.title = `#${entry.name}`;
			item.setAttribute("aria-pressed", String(project?.id === entry.id));
			rail.append(item);
		}
	}
	function channelButton(row, isProject) {
		const item = button("leon-channel", "", () => choose(row, isProject));
		if (row.issue) {
			const { title, priority, statusName, statusType, statusColor } = row.issue;
			const priorityLabel = PRIORITIES[priority ?? -1] ?? "Priority unavailable";
			item.classList.add("leon-issue");
			item.title = title;
			item.setAttribute("aria-label", `${title}, ${priorityLabel}, ${statusName}`);
			const priorityIcon = element("span", "leon-issue-priority", priority === 1 ? "!" : void 0);
			priorityIcon.dataset.priority = priority === null ? "unknown" : String(priority);
			priorityIcon.setAttribute("aria-hidden", "true");
			if (priority !== 1) priorityIcon.append(element("span", ""), element("span", ""), element("span", ""));
			const circle = element("span", "leon-issue-status");
			circle.dataset.status = statusType;
			circle.setAttribute("aria-hidden", "true");
			if (statusColor) circle.style.color = statusColor;
			item.append(priorityIcon, circle, element("span", "leon-issue-title", title));
		} else item.textContent = `#${row.name}`;
		if (state.activeRoomId === row.id) item.setAttribute("aria-current", "true");
		return item;
	}
	function isUnread(roomId) {
		const room = clientModule.getRoom(roomId);
		if (!room) return false;
		const { unread, highlight } = clientModule.getRoomUnreadInfo(room);
		return unread || highlight > 0 || notifications.hasLoudInRoom(roomId) || clientModule.roomHasThreadUnread(room);
	}
	function renderLists(project) {
		const unread = [];
		const read = [];
		if (!project) for (const row of data.awaiting) (isUnread(row.id) ? unread : read).push(row);
		const signature = JSON.stringify([
			project,
			unread,
			read,
			state.activeRoomId
		]);
		if (signature === lastLists) return;
		lastLists = signature;
		const title = element("h2", "leon-list-title", project ? "Project channel" : AWAITING);
		const scroll = element("div", "leon-list-scroll");
		if (project) scroll.append(channelButton(project, true));
		else for (const [label, rows] of [["Unread", unread], ["Read", read]]) {
			const group = element("section", "leon-list-group");
			group.setAttribute("aria-label", label);
			group.append(element("h3", "leon-list-group-title", label));
			for (const row of rows) group.append(channelButton(row, false));
			if (!rows.length) group.append(element("p", "leon-empty", `No ${label.toLowerCase()} issues`));
			scroll.append(group);
		}
		const scrollTop = list.lastElementChild?.scrollTop ?? 0;
		list.replaceChildren(title, scroll);
		scroll.scrollTop = scrollTop;
	}
	function renderProjectHeader(chat) {
		if (!header || !chat?.project) {
			projectHeading.remove();
			return;
		}
		const title = projectTitle(chat);
		const signature = JSON.stringify([title, chat.project]);
		if (signature !== lastProjectHeading) {
			lastProjectHeading = signature;
			projectHeading.title = title;
			projectHeading.replaceChildren(projectIcon(chat.project, emojiForShortcode), element("span", "leon-chat-project-title", title));
		}
		if (projectHeading.previousElementSibling !== menu) menu.after(projectHeading);
	}
	function bindApp() {
		const next = document.querySelector(REGION("app"));
		if (next !== app) {
			sidebar?.removeAttribute("data-leon-sidebar");
			app?.removeAttribute("data-leon-ready");
			app?.removeAttribute("data-leon-collapsed");
			app = next;
		}
		main = app?.querySelector(":scope > main") ?? null;
		nativeRail = app?.querySelector(REGION("space-sidebar")) ?? null;
		nativeList = app?.querySelector(REGION("room-list")) ?? null;
		sidebar = nativeRail?.parentElement?.parentElement ?? null;
		if (sidebar && sidebar.parentElement === app) sidebar.dataset.leonSidebar = "";
		mobile = ui.isMobile;
	}
	function render() {
		const custom = mode === "leon";
		const activeRoomId = state.activeRoomId;
		const chat = custom && activeRoomId !== null && !state.showInbox && !state.draftDm && (!followToday || data.today?.id === activeRoomId) ? data.channels.get(activeRoomId) : void 0;
		updateHomeProfile(custom && selectedProject === null ? auth.userId : null, chat?.id ?? null);
		bindApp();
		if (!app || !main || !nativeRail || !nativeList) {
			projectHeading.remove();
			switcher.attach(null);
			return;
		}
		header = main.querySelector(REGION("room-header"));
		const originalLabel = t("common.openRoomList");
		const escapedLabel = CSS.escape(originalLabel);
		const nativeMenu = mobile ? (header ?? main).querySelector(`button[title="${escapedLabel}"], button[aria-label="${escapedLabel}"]:not(.leon-menu)`) : null;
		const hasChat = Boolean(chat);
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
			renderRail(project);
			renderLists(project);
			if (!hasChat) {
				if (placeholder.parentNode !== main) main.append(placeholder);
				const message = auth.syncState === "SYNCING" ? `Waiting for #project-${day} to appear in Beeper.` : `Looking for #project-${day} in Beeper…`;
				if (status.textContent !== message) status.textContent = message;
			} else placeholder.remove();
			const chatHeader = header ?? nativeMenu?.parentElement;
			const mount = hasChat ? chatHeader ?? main : fallbackHeader;
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
	}
	function updateHomeProfile(userId, roomId) {
		if (!userId) {
			if (homeProfile) {
				homeProfile = void 0;
				state.roomsTick++;
			}
			return;
		}
		const bridgeRoomId = roomId ?? data.today?.id;
		const avatarUrl = client?.getUserId() === userId ? clientModule.mxcToHttp(slackAccountAvatar(zam.matrix.getAccountData(BRIDGE_ACCOUNT_DATA), bridgeRoomId ? readBridges(zam.matrix, bridgeRoomId) : [])) : null;
		if (homeProfile?.userId === userId && homeProfile.roomId === roomId && homeProfile.avatarUrl === avatarUrl) return;
		homeProfile = {
			userId,
			roomId,
			avatarUrl
		};
		state.roomsTick++;
	}
	function onAccountData(event) {
		if (event.getType() === "com.beeper.bridge_state") schedule();
	}
	function onState(event) {
		if (ROOM_METADATA.has(event.getType())) schedule(true);
	}
	function onTags() {
		schedule(true);
	}
	function onProjectVisibility(event) {
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
					if (room.name.trim().replace(/^#/, "").toLowerCase() !== "zami-project-visibility") continue;
					visibilityRooms.add(room.roomId);
					const snapshot = readProjectVisibility(room, (id) => zam.matrix.getRecentMessages(id));
					if (snapshot && snapshot.timestamp >= (projectVisibility.get(snapshot.team)?.timestamp ?? 0)) projectVisibility.set(snapshot.team, snapshot);
				}
				data = workspace(bridgedRooms, day, projectVisibility);
				if (selectedProject && !data.projects.some(({ id }) => id === selectedProject)) selectedProject = null;
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
	const roomWatch = zami.runes.watch(() => [
		auth.userId,
		auth.syncState,
		state.roomsTick
	], () => schedule(true));
	const viewWatch = zami.runes.watch(() => [
		state.activeRoomId,
		state.activeSpaceId,
		state.showInbox,
		state.showSpaceHome,
		state.draftDm,
		state.unreadTick,
		notifications.notificationsState.tick,
		ui.isMobile
	], () => schedule());
	const observer = new MutationObserver(() => {
		if (!app?.isConnected || !nativeRail?.isConnected || !nativeList?.isConnected || header && !header.isConnected || !header && app.hasAttribute("data-leon-ready") && main?.querySelector(REGION("room-header")) || mobile !== ui.isMobile) schedule();
	});
	observer.observe(document.body, {
		childList: true,
		subtree: true
	});
	const timer = setInterval(checkDay, 15e3);
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
		switcher.dispose();
		rail.remove();
		list.remove();
		placeholder.remove();
		menu.remove();
		projectHeading.remove();
		hiddenMenu?.removeAttribute("data-leon-hidden");
		delete root.dataset.leonView;
		app?.removeAttribute("data-leon-ready");
		app?.removeAttribute("data-leon-collapsed");
		sidebar?.removeAttribute("data-leon-sidebar");
		style.dispose();
	};
}
var dispose;
var src_default = {
	async onload(zam) {
		const zami = zam.zami;
		if (!zami) throw new Error("Leon requires the Zami plugin API.");
		const [rooms, { interfaceState: ui }, { auth }, clientModule, notifications, { t }, emoji] = await Promise.all([
			zami.import("$lib/stores/rooms.svelte"),
			zami.import("$lib/stores/interface.svelte"),
			zami.import("$lib/stores/auth.svelte"),
			zami.import("$lib/matrix/client"),
			zami.import("$lib/stores/notifications.svelte"),
			zami.import("$lib/i18n/index"),
			zami.import("$lib/data/emojiShortcodes").catch(() => void 0)
		]);
		dispose = install(zam, zami, {
			rooms,
			ui,
			auth,
			clientModule,
			notifications,
			t,
			emojiForShortcode: emoji?.emojiForShortcode
		});
		zami.app.loadEarly();
	},
	onunload() {
		dispose?.();
		dispose = void 0;
	}
};
var STYLES = `
html[data-leon-view="leon"] :is([data-zam-region="space-sidebar"], [data-zam-region="room-list"], [data-leon-hidden]),
html[data-leon-view="leon"] [data-leon-collapsed] > [data-leon-sidebar],
html[data-leon-view="leon"] [data-zam-region="app"]:not([data-leon-ready]) > main > :not(.leon-placeholder) {
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
export { src_default as default };
