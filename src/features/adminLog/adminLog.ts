import {
  ChannelType,
  EmbedBuilder,
  type Client,
  type ColorResolvable
} from "discord.js";
import { getConfiguredChannelId } from "../configuration/botConfigStore.js";

type AdminLogField = {
  name: string;
  value: string;
  inline?: boolean;
};

type AdminLogOptions = {
  title: string;
  description?: string;
  color?: ColorResolvable;
  fields?: AdminLogField[];
};

let missingLogChannelWarningShown = false;

function truncateFieldValue(value: string) {
  return value.slice(0, 1024) || "Not provided.";
}

export async function sendAdminLog(client: Client, options: AdminLogOptions) {
  const logChannelId = await getConfiguredChannelId("logChannelId");

  if (!logChannelId) {
    if (!missingLogChannelWarningShown) {
      console.warn("LOG_CHANNEL_ID is not set; admin log messages will be skipped.");
      missingLogChannelWarningShown = true;
    }

    return false;
  }

  try {
    const logChannel = await client.channels.fetch(logChannelId);

    if (!logChannel || logChannel.type !== ChannelType.GuildText) {
      console.warn("Admin log channel was not found or is not a text channel.");
      return false;
    }

    const embed = new EmbedBuilder()
      .setTitle(options.title)
      .setDescription(options.description ?? null)
      .setColor(options.color ?? 0x5865f2)
      .setTimestamp();

    if (options.fields?.length) {
      embed.addFields(
        options.fields.map((field) => ({
          name: field.name,
          value: truncateFieldValue(field.value),
          inline: field.inline ?? false
        }))
      );
    }

    await logChannel.send({
      embeds: [embed],
      allowedMentions: {
        parse: []
      }
    });

    return true;
  } catch (error) {
    console.error("Could not send admin log:", error);
    return false;
  }
}
