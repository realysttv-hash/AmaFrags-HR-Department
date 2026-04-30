import type { Client } from "discord.js";
import { publishLeaguePanelToChannel } from "../features/panel/leaguePanel.js";

export async function onReady(client: Client<true>) {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    const panelMessage = await publishLeaguePanelToChannel(client);
    console.log(`Public league panel is available at ${panelMessage.url}`);
  } catch (error) {
    console.error("Could not publish public league panel:", error);
  }
}
