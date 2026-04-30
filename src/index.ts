import { Client, GatewayIntentBits } from "discord.js";
import { env } from "./config/env.js";
import { onReady } from "./events/ready.js";
import { onInteractionCreate } from "./events/interactionCreate.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

client.once("clientReady", onReady);
client.on("interactionCreate", onInteractionCreate);

await client.login(env.discordToken);
