# zami-plugin-leon

A Zami plugin that optimizes the UI for how Leon uses Slack.

## Install

1. Sign in to a Zami build with the [Zami plugin API](https://github.com/leonsilicon/Zami/tree/trunk/packages/com/leonsilicon/zami/plugins) using the Beeper account that has your Slack connection.
2. Open **Settings → Plugins → Add a repo** and enter `leonsilicon/zami-plugin-leon`.
3. Install and enable **Leon**.

## Use

- **Home** opens today's `#project-YYYY-MM-DD` channel in Zami's regular chat and composer. The date follows Toronto time. If Beeper is still syncing the channel, Home opens it as soon as it arrives.
- The **Awaiting Leon** sidebar shows one row per issue, with its Linear priority, status circle, and title. Pick an issue to open its Slack chat. The number on the hamburger counts channels, including ones you've already read.
- The server rail lists Linear project channels. Pick a project to open its chat. Pick **Home** to return to today's chat and the Awaiting Leon list.
- Hold the hamburger and choose **Original Zami** or **Leon workspace**. Right-click and **Shift+F10** also open the menu. Zami remembers your choice on this device.

## Data

The plugin reads joined Slack rooms through Beeper. [Linear Slack Sync](https://github.com/leonsilicon/leonsilicon.ai/tree/main/packages/ai/leonsilicon/services/linear-slack-sync) writes the priority, status, its type and color, the issue link, and the title to the Slack channel topic, which Beeper exposes as the Matrix room topic. Older topics show dashes when priority is missing and use words from the channel name when the title is missing. The daily sync refreshes existing open issues.

Manual section moves and archived rooms with stale topic or membership state in Beeper can differ from the sidebar.

The server rail uses `#project-…` Slack channels as Linear projects. Linear Slack Sync appends the project color and icon to the channel topic. Projects without bridged metadata use a neutral cube. Dailylinear provisions the dated channel and joins it to the workspace. Chat and delivery use Zami's existing Beeper session.

## Develop

With Node.js 24 or later and [Vite+](https://viteplus.dev/guide/) installed, run:

```sh
vp install
vp check
vp build
npm test
```

Edit the TypeScript under `src/`. The Vite+ build produces `plugin/index.js`, the standalone ES module Zami fetches from GitHub. Commit the rebuilt bundle with source changes. To try a build locally, choose **Settings → Plugins → Load a plugin from a folder** and select `plugin/`.
