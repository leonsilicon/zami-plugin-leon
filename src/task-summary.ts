import { issueChannel, linearIssueIdentifier, type Channel } from "./workspace.ts";
import type { HostModules } from "./zami.ts";

const ROOM = "data-leon-task";
const SUMMARY = "data-leon-task-summary";
const TITLE = "data-leon-task-title";
const SYNC_BOT = /^(?:slack22linear|Linear Sync)(?: \(bot\))?$/i;

type TaskTimeline = { timeline: HTMLElement; channel: Channel; identifier: string };
type Intro = { row: Element; title: Element };
type Rooms = Pick<HostModules["$lib/matrix/client"], "getRoom">;

function findIntro(
  { timeline, channel, identifier }: TaskTimeline,
  rooms: Rooms,
): Intro | undefined {
  const room = rooms.getRoom(channel.id);
  if (!room) return;
  const label = `${identifier.toUpperCase()}:`;
  // slack22linear starts its intro with the issue link. Keeping the original row
  // preserves Zam's formatting, message actions, and thread entry point.
  for (const row of timeline.querySelectorAll(":scope > [data-row-index] > [data-sender]")) {
    const body = row.querySelector(".message-body");
    const title = body?.querySelector("a[href]");
    if (
      !title?.textContent?.trimStart().startsWith(label) ||
      !body?.textContent?.trimStart().startsWith(label) ||
      linearIssueIdentifier(title.getAttribute("href") ?? "") !== identifier
    )
      continue;
    const member = room.getMember(row.getAttribute("data-sender") ?? "");
    if (SYNC_BOT.test((member?.rawDisplayName || member?.name || "").trim())) {
      return { row, title };
    }
  }
}

export function installTaskSummary(rooms: Rooms) {
  let active: TaskTimeline | undefined;
  let intro: Intro | undefined;

  function refresh() {
    const next = active && findIntro(active, rooms);
    if (intro?.row !== next?.row || intro?.title !== next?.title) {
      intro?.row.removeAttribute(SUMMARY);
      intro?.title.removeAttribute(TITLE);
      next?.row.setAttribute(SUMMARY, "");
      next?.title.setAttribute(TITLE, "");
      intro = next;
    }
    active?.timeline.toggleAttribute(ROOM, Boolean(active.channel.issue || next));
  }

  const observer = new MutationObserver(refresh);

  return {
    refresh,
    setRoom(timeline: HTMLElement | null, channel?: Channel) {
      const identifier = channel && issueChannel(channel.name)?.identifier;
      const next =
        timeline && channel && identifier ? { timeline, channel, identifier } : undefined;
      if (active?.timeline !== next?.timeline) {
        observer.disconnect();
        active?.timeline.removeAttribute(ROOM);
        if (next) {
          observer.observe(next.timeline, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["href", "data-sender"],
          });
        }
      }
      active = next;
      refresh();
    },
  };
}

const SUMMARY_ROW = `[${ROOM}] [${SUMMARY}]`;
const SUMMARY_CONTENT = `${SUMMARY_ROW} > .swipe-shift > .min-w-0`;

export const TASK_SUMMARY_STYLES = `
[${ROOM}] > .px-4.pb-4:has(> .rounded-full + h3 + p),
[${ROOM}] > [data-row-index]:has(> [${SUMMARY}]) > .my-4:first-child,
${SUMMARY_ROW} > .swipe-shift > .w-10,
${SUMMARY_CONTENT} > .items-baseline,
${SUMMARY_CONTENT} > span.absolute.pointer-events-none {
  display: none;
}
${SUMMARY_ROW} {
  padding-block: .75rem 1.125rem;
}
${SUMMARY_CONTENT} > .contents > .other-bubble {
  display: contents;
}
${SUMMARY_CONTENT} .message-body {
  max-inline-size: 72ch;
  color: var(--zam-text-primary);
  font-size: 1rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
${SUMMARY_CONTENT} [${TITLE}] {
  color: var(--zam-text-primary);
  font-size: 1.25em;
  font-weight: 650;
}
`;
