# zami-plugin-leon

A Zami plugin that optimizes the UI for how Leon uses Slack.

## Install

1. Sign in to a Zami build with the [Zami plugin API](https://github.com/leonsilicon/Zami/tree/trunk/packages/com/leonsilicon/zami/plugins) using the Beeper account that has your Slack connection.
2. Open **Settings → Plugins → Add a repo** and enter `leonsilicon/zami-plugin-leon`.
3. Install and enable **Leon**.

## Use

- **Home** lists **Awaiting Leon** issues from urgent to low priority, with unprioritized issues last. Pick an issue to open its Slack chat. Sending a text message from the composer opens today's project chat once the send succeeds. **More** opens that room's options.
- The plugin registers today's channel as Zami's [home](https://github.com/leonsilicon/Zami/tree/trunk/packages/com/leonsilicon/zami/plugins#home-and-startup). The date follows Toronto time. Home and its composer are there as Zami opens, before Beeper has synced: Zami draws Home as you left it, and a message you send right away waits above the composer until the channel has synced. **Original Zami** opens where you left it.
- The **Awaiting Leon** sidebar groups issues under **Unread** and **Read** and sorts each group from urgent to low priority, with unprioritized issues last. Pick an issue to open its Slack chat. The number on the hamburger counts all awaiting issues.
- Linear task chats show the issue ID, priority, status, and title in the header. At the start of the chat, the synced issue summary takes the place of the welcome banner. Slack chat headers hide the lock and call icons in the Leon workspace.
- In the Leon workspace, your messages sit in right-aligned bubbles. Other Slack bots use left-aligned bubbles with a small sender avatar. Hermes messages use the full chat width without a bubble. The layout also applies inside threads.
- Active Linear project channels sit directly below **Home** in the drawer. Pick **Today** to read today's chat, or pick another project to open its chat.
- The project column starts with icons. Cubes use their Linear colors, and emoji appear on their own. Use the double chevrons at the top to show or hide project names. Zami remembers your choice on this device.
- Hold the hamburger and choose **Original Zami** or **Leon workspace**. Right-click and **Shift+F10** also open the menu. Zami remembers your choice on this device.

## Data

The plugin reads joined Slack rooms through Beeper. `slack22linear` publishes issue titles, status, color, priority, and dates in Matrix room account data on Leon's Beeper account. Home lists issues marked **Awaiting Leon**. Issue details appear as soon as the room account data arrives.

Manual section moves and archived rooms with stale membership state in Beeper can differ from the sidebar.

The rail uses `#project-…` Slack channels as Linear projects. The Beeper inbox publishes project colors and icons as Matrix room account data and closed project channels as account-wide Matrix data on Leon's account. While the first snapshot syncs, the rail uses Beeper's archive tags and hides past daily projects. Dailylinear provisions today's channel. Chat and delivery use Zami's existing Beeper session.

The plugin keeps each Slack channel's name, bridge address, and issue and project details on this device between launches. Zami's own saved room list has no bridge details, so without them Home would wait for Beeper to sync before it knew today's channel.

## Develop

With Node.js 24 or later and [Vite+](https://viteplus.dev/guide/) installed, run:

```sh
vp install
vp check
vp build
npm test
```

Edit the TypeScript under `src/`. The Vite+ build produces `plugin/index.js`, the standalone ES module Zami fetches from GitHub. Commit the rebuilt bundle with source changes. To try a build locally, choose **Settings → Plugins → Load a plugin from a folder** and select `plugin/`.
