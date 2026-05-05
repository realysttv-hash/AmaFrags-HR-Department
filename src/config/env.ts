import "dotenv/config";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getOptionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  discordToken: getRequiredEnv("DISCORD_TOKEN"),
  discordClientId: getRequiredEnv("DISCORD_CLIENT_ID"),
  discordGuildId: getRequiredEnv("DISCORD_GUILD_ID"),

  requestsChannelId: getOptionalEnv("REQUESTS_CHANNEL_ID"),
  calendarChannelId: getOptionalEnv("CALENDAR_CHANNEL_ID"),
  panelChannelId: getOptionalEnv("PANEL_CHANNEL_ID"),
  logChannelId: getOptionalEnv("LOG_CHANNEL_ID"),
  lookingForGameChannelId: getOptionalEnv("LOOKING_FOR_GAME_CHANNEL_ID"),
  checklistChannelId: getOptionalEnv("CHECKLIST_CHANNEL_ID"),
  updatesChannelId: getOptionalEnv("UPDATES_CHANNEL_ID")
};
