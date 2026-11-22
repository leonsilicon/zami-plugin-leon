import { issueChannel, type Channel, type workspace } from "./workspace.ts";
import type { MatrixLink } from "./zami.ts";

type IssueLinks = Pick<ReturnType<typeof workspace>, "channels" | "slackIssues">;

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
  const words = issue.slug?.replace(/[-_]+/g, " ").trim();
  return {
    identifier: issue.identifier.toUpperCase(),
    title:
      channel?.issue?.title.replace(/\s+`\{[^`]*\}`$/, "") ||
      (words ? words[0]?.toUpperCase() + words.slice(1) : ""),
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

function issueChip(issue: NonNullable<ReturnType<typeof issueForLink>>) {
  const chip = document.createElement("span");
  chip.className = "leon-inline-issue";

  const id = document.createElement("span");
  id.className = "leon-inline-issue-id";
  const icon = document.createElement("span");
  icon.className = "leon-issue-status";
  icon.dataset.status = issue.statusType ?? "unknown";
  icon.setAttribute("aria-hidden", "true");
  if (issue.statusColor) icon.style.color = issue.statusColor;
  id.append(icon, issue.identifier);
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
) {
  const links = new WeakMap<Element, { original: Node[]; chip: HTMLElement; key: string }>();
  const editors = new WeakMap<Element, Map<string, { original: string; normalized: string }>>();

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
    }
    root.querySelectorAll(LINK).forEach(updateLink);
    root.querySelectorAll(EDITOR).forEach(updateEditor);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const { target } = mutation;
      if (!(target instanceof Element) || !target.isConnected) continue;
      if (target.matches(EDITOR)) updateEditor(target);
      if (target.matches(LINK)) updateLink(target);
      for (const node of mutation.addedNodes) {
        if (node instanceof Element && node.isConnected) scan(node);
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", ...EDITOR_ATTRIBUTES],
  });
  scan(document);

  return {
    refreshIssues: () => document.querySelectorAll(LINK).forEach(updateLink),
    dispose() {
      observer.disconnect();
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
