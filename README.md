# Leon for Zami

A Slack workspace for [Zami](https://github.com/leonsilicon/Zami), built around Linear projects and the issues awaiting Leon.

## Install

1. Sign in to a Zami build with the [Zami plugin API](https://github.com/leonsilicon/Zami/tree/trunk/packages/com/leonsilicon/zami/plugins) using the Beeper account that has your Slack connection.
2. Open **Settings → Plugins → Add a repo** and enter `leonsilicon/zami-plugin-leon`.
3. Install and enable **Leon**.

## Use

- **Home** opens today's `#project-YYYY-MM-DD` channel in Zami's regular chat and composer. The date follows Toronto time. If Beeper is still syncing the channel, Home opens it as soon as it arrives.
- The **Awaiting Leon** sidebar lists the Slack issue channels awaiting you. The number on the hamburger counts channels, including ones you've already read.
- The server rail lists Linear project channels. Pick a project to open its chat. Pick **Home** to return to today's chat and the Awaiting Leon list.
- Hold the hamburger and choose **Original Zami** or **Leon workspace**. Right-click and **Shift+F10** also open the menu. Zami remembers your choice on this device.

## Data

The plugin reads joined Matrix rooms with Slack bridge metadata. It uses the status at the start of each `#leon-…` channel's bridged topic, which Linear Slack Sync writes when it files that issue in a Slack section. Manual section moves and archived rooms whose status and membership stay unchanged in Beeper can differ from the sidebar.

The server rail uses `#project-…` Slack channels as Linear projects. Dailylinear provisions the dated channel and joins it to the workspace. Chat and delivery use Zami's existing Beeper session.

## Develop

Run `npm test` with Node.js. The installable ES module is `plugin/index.js` and has no build step. Use **Settings → Plugins → Load a plugin from a folder** to try local edits.
