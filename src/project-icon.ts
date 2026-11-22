import type { ProjectAppearance } from "./workspace.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const CUBE = "M12 3 3.5 7.75v8.5L12 21l8.5-4.75v-8.5L12 3Z M3.5 7.75 12 12.5l8.5-4.75 M12 12.5V21";
const ICON_PATHS: Record<string, string> = {
  book: "M4 5c3-1.5 5.5-1 8 1v14c-2.5-2-5-2.5-8-1V5Zm16 0c-3-1.5-5.5-1-8 1v14c2.5-2 5-2.5 8-1V5Z",
  briefcase: "M3 8h18v12H3z M8 8V4h8v4 M3 13h18 M10 13v2h4v-2",
  calendar: "M4 6h16v14H4z M8 4v4 M16 4v4 M4 10h16 M8 14h2 M14 14h2",
  code: "m8 7-5 5 5 5m8-10 5 5-5 5m-2-13-4 16",
  flag: "M5 21V4m0 1c5-4 9 4 14 0v9c-5 4-9-4-14 0",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c-4 3.5-4 14.5 0 18 4-3.5 4-14.5 0-18ZM3 12h18",
  home: "m3 10 9-7 9 7 M5 9v12h14V9 M9 21v-7h6v7",
  rocket:
    "M9 16c-1-1-2-2-3-2 1-3 2-5 5-7 4-3 8-3 9-3 0 1 0 5-3 9-2 3-4 4-7 5 0-1-1-2-1-2Zm0-6H5l-2 4 3 1m8 0v4l-4 2-1-3m6-8h.01M7 18l-3 2 1-3",
  star: "m12 3 2.75 5.5 6.25.9-4.5 4.35 1.05 6.15L12 17l-5.55 2.9 1.05-6.15L3 9.4l6.25-.9L12 3Z",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 5h.01",
};

export function projectIcon(
  appearance: ProjectAppearance | undefined,
  emojiForShortcode?: (code: string) => string | undefined,
) {
  const icon = appearance?.icon ?? "";
  const shortcode = /^:([\w+-]+):$/.exec(icon)?.[1];
  const emoji = shortcode
    ? emojiForShortcode?.(shortcode)
    : /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(icon)
      ? icon
      : undefined;
  if (emoji) {
    const element = document.createElement("span");
    element.className = "leon-project-icon leon-project-emoji";
    if (appearance?.color) element.style.setProperty("--leon-project-color", appearance.color);
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
  if (appearance?.color) svg.style.setProperty("--leon-project-color", appearance.color);
  const shape = icon.replace(/^icon[-_]?/i, "").toLowerCase();
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", Object.hasOwn(ICON_PATHS, shape) ? ICON_PATHS[shape]! : CUBE);
  svg.append(path);
  return svg;
}
