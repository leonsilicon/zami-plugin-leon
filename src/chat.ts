import { issueChannel, type Channel, type workspace } from "./workspace.ts";
import type { MatrixLink, Room } from "./zami.ts";

type IssueLinks = Pick<ReturnType<typeof workspace>, "channels" | "slackIssues">;

export function issueTitle(issue: Channel["issue"], slug: string | undefined) {
  const words = slug?.replace(/[-_]+/g, " ").trim();
  return (
    issue?.title.replace(/\s+`\{[^`]*\}`$/, "") ||
    (words ? words.charAt(0).toUpperCase() + words.slice(1) : "")
  );
}

function webUrl(href: string) {
  if (!/^https?:\/\//i.test(href)) return;
  try {
    return new URL(href);
  } catch {
    return;
  }
}

export function isMatrixPreview(href: string) {
  return webUrl(href)?.hostname === "matrix.to";
}

export function issueForLink(
  href: string,
  label: string,
  { channels, slackIssues }: IssueLinks,
  parseMatrixLink: (href: string) => MatrixLink | null | undefined,
  hasRoom: (id: string) => boolean,
) {
  let channel: Channel | undefined;
  const url = webUrl(href);
  if (url?.hostname === "slack.com" || url?.hostname.endsWith(".slack.com")) {
    const [, team, clientChannel] =
      /^\/client\/(T[A-Z0-9]+)\/([CG][A-Z0-9]+)\/?$/.exec(url.pathname) ?? [];
    const [, webChannel] = /^\/(?:archives|messages)\/([CG][A-Z0-9]+)\/?$/.exec(url.pathname) ?? [];
    const id = clientChannel ?? webChannel;
    if (!id) return;
    const matches = slackIssues.get(id) ?? [];
    channel = team
      ? matches.find((match) => match.team === team)?.channel
      : matches.length === 1
        ? matches[0]?.channel
        : undefined;
  } else if (url?.hostname === "matrix.to" || href.startsWith("matrix:")) {
    const target = parseMatrixLink(href);
    if (!target || target.kind === "user" || target.eventId) return;
    if (target.kind === "room") {
      channel = channels.get(target.roomId);
      if (!channel && hasRoom(target.roomId)) return;
    }
  } else {
    return;
  }

  const issue = issueChannel(channel?.name ?? label);
  if (!issue) return;
  return {
    identifier: issue.identifier.toUpperCase(),
    title: issueTitle(channel?.issue, issue.slug),
    status: channel?.issue?.statusName,
    statusType: channel?.issue?.statusType,
    statusColor: channel?.issue?.statusColor,
  };
}

export function composerPlaceholder(template: string, token: string) {
  const [prefix, suffix, extra] = template.split(token);
  return (value: string) => {
    if (
      !prefix?.endsWith("#") ||
      suffix === undefined ||
      extra !== undefined ||
      !value.startsWith(prefix) ||
      !value.endsWith(suffix)
    )
      return value;
    return prefix + value.slice(prefix.length).replace(/^#+/, "");
  };
}

const LINK = '[data-zam-region="app"] .message-body a[href]';
const EDITOR = '[data-zam-region="composer"] [role="textbox"][placeholder]';
const EDITOR_ATTRIBUTES = ["placeholder", "aria-label"] as const;
const MESSAGE = '[data-zam-region="app"] > main [data-event-id][data-sender]';
const AUTHOR_ATTRIBUTE = "data-leon-author";
const HERMES_NAME = /^(?:hermes|captain claude)(?: \((?:slack|bot)\))*$/i;
const BOT_NAME = / \(bot\)(?: \(slack\))?$/i;
const MESSAGE_CONTENT = "> .swipe-shift > .min-w-0";
const MESSAGE_BODY = "> :is(.contents, .forward-block)";
const TEXT_BUBBLE = "> :is(.contents, .own-bubble, .other-bubble):has(> .message-body)";
const BOT_AVATAR = "leon-bot-avatar";
const BOT_AVATAR_SIZE = 18;
const BOT_ROW = `[${AUTHOR_ATTRIBUTE}="bot"]`;

export function messageAuthor(sender: string, ownUserId: string | null, displayName: string) {
  if (sender === ownUserId) return "own";
  if (HERMES_NAME.test(displayName)) return "hermes";
  if (BOT_NAME.test(displayName)) return "bot";
}

export function issueStatusIcon(statusType = "unknown", statusColor?: string | null) {
  const icon = document.createElement("span");
  icon.className = "leon-issue-status";
  icon.dataset.status = statusType;
  icon.setAttribute("aria-hidden", "true");
  if (statusColor) icon.style.color = statusColor;
  return icon;
}

function issueChip(issue: NonNullable<ReturnType<typeof issueForLink>>) {
  const chip = document.createElement("span");
  chip.className = "leon-inline-issue";

  const id = document.createElement("span");
  id.className = "leon-inline-issue-id";
  id.append(issueStatusIcon(issue.statusType, issue.statusColor), issue.identifier);
  chip.append(id);
  if (issue.title) chip.append(` ${issue.title}`);
  if (issue.status) {
    const status = document.createElement("span");
    status.className = "leon-inline-issue-status-label";
    status.textContent = `, ${issue.status}`;
    chip.append(status);
  }
  return chip;
}

export function installChatPresentation(
  resolveIssue: (href: string, label: string) => ReturnType<typeof issueForLink>,
  normalizePlaceholder: (value: string) => string,
  getMemberAvatar: (room: Room, userId: string) => string | null,
  renderAvatar: (
    target: HTMLElement,
    props: { id: string; name: string; src: string | null; size: number },
  ) => { dispose(): void },
) {
  const links = new WeakMap<Element, { original: Node[]; chip: HTMLElement; key: string }>();
  const editors = new WeakMap<Element, Map<string, { original: string; normalized: string }>>();
  const avatars = new Map<
    Element,
    { target: HTMLElement; key: string; view: { dispose(): void } }
  >();
  let messageRoom: Room | null = null;
  let ownUserId: string | null = null;
  let roomsTick: number | undefined;

  function removeAvatar(row: Element) {
    const avatar = avatars.get(row);
    if (!avatar) return;
    avatars.delete(row);
    avatar.view.dispose();
    avatar.target.remove();
  }

  function updateBotAvatar(row: Element, room: Room, sender: string, name: string) {
    const body = row.querySelector(`:scope ${MESSAGE_CONTENT} ${MESSAGE_BODY}`);
    // Keep link previews outside text bubbles. Media and custom renderers use the body wrapper.
    const bubble = body?.querySelector(`:scope ${TEXT_BUBBLE}`) ?? body;
    if (!bubble) {
      removeAvatar(row);
      return;
    }
    const src = getMemberAvatar(room, sender);
    const key = JSON.stringify([sender, name, src]);
    const current = avatars.get(row);
    if (current?.target.parentElement === bubble && current.key === key) return;

    removeAvatar(row);
    const target = document.createElement("div");
    target.className = BOT_AVATAR;
    target.title = name;
    target.setAttribute("role", "img");
    target.setAttribute("aria-label", name);
    const view = renderAvatar(target, { id: sender, name, src, size: BOT_AVATAR_SIZE });
    bubble.append(target);
    avatars.set(row, { target, key, view });
  }

  function updateMessage(row: Element) {
    const sender = row.getAttribute("data-sender");
    const room = messageRoom;
    const member = room && sender ? room.getMember(sender) : null;
    const name = (member?.rawDisplayName || member?.name || "").trim();
    const author = room && sender ? messageAuthor(sender, ownUserId, name) : undefined;
    if (row.getAttribute(AUTHOR_ATTRIBUTE) !== (author ?? null)) {
      if (author) row.setAttribute(AUTHOR_ATTRIBUTE, author);
      else row.removeAttribute(AUTHOR_ATTRIBUTE);
    }
    if (author === "bot" && room && sender) updateBotAvatar(row, room, sender, name);
    else removeAvatar(row);
  }

  function refreshMessages() {
    document.querySelectorAll(MESSAGE).forEach(updateMessage);
  }

  function updateLink(link: Element) {
    const saved = links.get(link);
    const decorated = saved && link.childNodes.length === 1 && link.firstChild === saved.chip;
    const original = decorated ? saved.original : Array.from(link.childNodes);
    const label = original.map((node) => node.textContent).join("");
    const issue = resolveIssue(link.getAttribute("href") ?? "", label);
    if (!issue) {
      links.delete(link);
      if (decorated) link.replaceChildren(...original);
      return;
    }
    const key = JSON.stringify(issue);
    if (decorated && key === saved.key) return;
    const chip = issueChip(issue);
    links.set(link, { original, chip, key });
    link.replaceChildren(chip);
  }

  function updateEditor(editor: Element) {
    const saved = editors.get(editor) ?? new Map();
    for (const name of EDITOR_ATTRIBUTES) {
      const original = editor.getAttribute(name);
      if (original === saved.get(name)?.normalized) continue;
      saved.delete(name);
      if (original === null) continue;
      const normalized = normalizePlaceholder(original);
      if (normalized === original) continue;
      saved.set(name, { original, normalized });
      editor.setAttribute(name, normalized);
    }
    if (saved.size) editors.set(editor, saved);
  }

  function scan(root: Document | Element) {
    if (root instanceof Element) {
      if (root.matches(LINK)) updateLink(root);
      if (root.matches(EDITOR)) updateEditor(root);
      if (messageRoom && root.matches(MESSAGE)) updateMessage(root);
    }
    root.querySelectorAll(LINK).forEach(updateLink);
    root.querySelectorAll(EDITOR).forEach(updateEditor);
    if (messageRoom) root.querySelectorAll(MESSAGE).forEach(updateMessage);
  }

  const observer = new MutationObserver((mutations) => {
    let removedNodes = false;
    for (const mutation of mutations) {
      removedNodes ||= mutation.removedNodes.length > 0;
      const { target } = mutation;
      if (!(target instanceof Element) || !target.isConnected) continue;
      if (target.closest(`.${BOT_AVATAR}`)) continue;
      if (target.matches(EDITOR)) updateEditor(target);
      if (target.matches(LINK)) updateLink(target);
      if (
        mutation.attributeName === "data-sender" &&
        (target.matches(MESSAGE) || target.hasAttribute(AUTHOR_ATTRIBUTE))
      )
        updateMessage(target);
      if (mutation.type === "childList") {
        const row = target.closest(BOT_ROW);
        if (row) updateMessage(row);
      }
      for (const node of mutation.addedNodes) {
        if (node instanceof Element && node.isConnected) scan(node);
      }
    }
    if (removedNodes) {
      for (const row of avatars.keys()) {
        if (row.isConnected && row.matches(MESSAGE)) continue;
        removeAvatar(row);
        row.removeAttribute(AUTHOR_ATTRIBUTE);
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "data-sender", ...EDITOR_ATTRIBUTES],
  });
  scan(document);

  return {
    refreshIssues: () => document.querySelectorAll(LINK).forEach(updateLink),
    setMessageRoom(room: Room | null, userId: string | null, tick: number) {
      if (messageRoom === room && (!room || (ownUserId === userId && roomsTick === tick))) return;
      messageRoom = room;
      ownUserId = userId;
      roomsTick = tick;
      refreshMessages();
    },
    refreshMessages,
    dispose() {
      observer.disconnect();
      avatars.forEach((_, row) => removeAvatar(row));
      document.querySelectorAll(`[${AUTHOR_ATTRIBUTE}]`).forEach((row) => {
        row.removeAttribute(AUTHOR_ATTRIBUTE);
      });
      document.querySelectorAll(LINK).forEach((link) => {
        const saved = links.get(link);
        if (saved && link.childNodes.length === 1 && link.firstChild === saved.chip)
          link.replaceChildren(...saved.original);
      });
      document.querySelectorAll(EDITOR).forEach((editor) => {
        for (const [name, { original, normalized }] of editors.get(editor) ?? []) {
          if (editor.getAttribute(name) === normalized) editor.setAttribute(name, original);
        }
      });
    },
  };
}

const LEON_CHAT = "[data-leon-mounted][data-leon-ready]";
const AUTHORS = `${LEON_CHAT} [${AUTHOR_ATTRIBUTE}]`;
const OWN_CONTENT = `${LEON_CHAT} [${AUTHOR_ATTRIBUTE}="own"] ${MESSAGE_CONTENT}`;
const HERMES_CONTENT = `${LEON_CHAT} [${AUTHOR_ATTRIBUTE}="hermes"] ${MESSAGE_CONTENT}`;
const BOT_CONTENT = `${LEON_CHAT} ${BOT_ROW}:not([data-leon-task-summary]) ${MESSAGE_CONTENT}`;
const OWN_BUBBLE = `${OWN_CONTENT} ${MESSAGE_BODY} ${TEXT_BUBBLE}`;
const BOT_BUBBLE = `${BOT_CONTENT} div:has(> .${BOT_AVATAR})`;

export const MESSAGE_STYLES = `
${AUTHORS} > .swipe-shift > .w-10 { display: none; }
${AUTHORS} > .swipe-shift > .min-w-0 > span.absolute.pointer-events-none { display: none; }
${OWN_CONTENT} {
  display: flex;
  flex-direction: column;
  align-items: end;
}
${OWN_CONTENT} > .items-baseline > button.font-semibold { display: none; }
${OWN_CONTENT} > button.w-full { max-inline-size: 80%; }
${OWN_CONTENT} > .forward-block { max-inline-size: 100%; }
${OWN_CONTENT} > :is(.contents, .forward-block) > .w-fit.max-w-full {
  max-inline-size: min(80%, 42rem);
}
${OWN_BUBBLE},
${BOT_BUBBLE} {
  display: block;
  inline-size: fit-content;
  max-inline-size: min(80%, 42rem);
  padding: .5rem .85rem;
  border-radius: 1rem;
  background: var(--zam-bg-selected);
}
${OWN_BUBBLE} { margin-inline-start: auto; }
${BOT_BUBBLE} {
  position: relative;
  min-block-size: calc(${BOT_AVATAR_SIZE}px + 1rem);
  margin-inline-end: auto;
  padding-inline-end: calc(${BOT_AVATAR_SIZE}px + 1.1rem);
  border-start-start-radius: .25rem;
}
.${BOT_AVATAR} { display: none; }
${BOT_CONTENT} .${BOT_AVATAR} {
  position: absolute;
  inset-block-start: .5rem;
  inset-inline-end: .5rem;
  display: block;
  border-radius: 50%;
}
${OWN_BUBBLE}::after { display: none; }
${OWN_BUBBLE} > .message-body,
${BOT_BUBBLE} > .message-body {
  color: var(--zam-text-primary);
  overflow-wrap: anywhere;
}
${OWN_BUBBLE} .message-body :is(a, .room-mention) {
  color: var(--zam-link, var(--zam-accent-text));
}
${HERMES_CONTENT} ${MESSAGE_BODY} > .other-bubble { display: contents; }
`;
