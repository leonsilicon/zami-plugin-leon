import { isSlackProtocol } from "./workspace.ts";
import type { BridgeState } from "./zami.ts";

export const BRIDGE_ACCOUNT_DATA = "com.beeper.bridge_state";

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function slackAccountAvatar(accountData: unknown, roomBridges: BridgeState[]) {
  const room = roomBridges.find(({ content }) => isSlackProtocol(record(content.protocol)?.id));
  const bridgeName = room?.content["com.beeper.bridge_name"];
  const receiver = record(room?.content.channel)?.["fi.mau.receiver"];
  const network = record(room?.content.network)?.id;

  const accounts = Object.entries(record(record(accountData)?.bridges) ?? {}).flatMap(
    ([name, value]) => {
      const bridge = record(value);
      if (typeof bridgeName === "string" && name !== bridgeName) return [];
      if (!isSlackProtocol(name) && !isSlackProtocol(record(bridge?.bridgeState)?.bridgeType))
        return [];
      return Object.entries(record(bridge?.remoteState) ?? {}).flatMap(([id, value]) => {
        const account = record(value);
        if (
          !account ||
          account.state_event === "LOGGED_OUT" ||
          account.state_event === "UNCONFIGURED"
        )
          return [];
        return [{ id, avatar: record(account.remote_profile)?.avatar }];
      });
    },
  );

  const exact = accounts.filter(({ id }) => id === receiver);
  const workspace = typeof network === "string" ? network.toUpperCase() : null;
  // Some older portals provide only the workspace ID in their bridge metadata.
  const matches =
    exact.length || (typeof receiver === "string" && /^T[A-Z0-9]+-/i.test(receiver))
      ? exact
      : accounts.filter(({ id }) => !workspace || id.toUpperCase().split("-")[0] === workspace);
  const avatar = matches.length === 1 ? matches[0]?.avatar : undefined;
  return typeof avatar === "string" && avatar.startsWith("mxc://") ? avatar : null;
}
