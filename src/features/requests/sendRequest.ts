import {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelType,
  EmbedBuilder,
  type Interaction
} from "discord.js";
import { sendAdminLog } from "../adminLog/adminLog.js";
import { getConfiguredChannelId } from "../configuration/botConfigStore.js";

function findEmbedField(embed: EmbedBuilder, fieldName: string) {
  const json = embed.toJSON();

  return json.fields?.find((field) => field.name === fieldName)?.value ?? null;
}

export async function sendRequestToRequestsChannel(
  interaction: Interaction,
  embed: EmbedBuilder,
  row: ActionRowBuilder<ButtonBuilder>
) {
  const requestsChannelId = await getConfiguredChannelId("requestsChannelId");

  if (!requestsChannelId) {
    throw new Error("Requests channel is not configured.");
  }

  const requestsChannel = await interaction.client.channels.fetch(requestsChannelId);

  if (!requestsChannel || requestsChannel.type !== ChannelType.GuildText) {
    throw new Error("Requests channel was not found or is not a text channel.");
  }

  const message = await requestsChannel.send({
    embeds: [embed],
    components: [row]
  });

  const embedJson = embed.toJSON();

  await sendAdminLog(interaction.client, {
    title: "New Request Submitted",
    description: embedJson.title ?? "A new request was submitted.",
    color: 0x5865f2,
    fields: [
      {
        name: "Request ID",
        value: findEmbedField(embed, "Request ID") ?? "Not provided.",
        inline: true
      },
      {
        name: "Submitted by",
        value: findEmbedField(embed, "Submitted by") ?? `${interaction.user}`,
        inline: true
      },
      {
        name: "Request message",
        value: message.url,
        inline: false
      }
    ]
  });
}
