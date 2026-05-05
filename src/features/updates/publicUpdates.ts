import {
  ChannelType,
  EmbedBuilder,
  type Client
} from "discord.js";
import { getConfiguredChannelId } from "../configuration/botConfigStore.js";

type PublicUpdateField = {
  name: string;
  value: string;
  inline?: boolean;
};

type PublicUpdateOptions = {
  title: string;
  description?: string;
  color: number;
  roleIds?: string[];
  fields?: PublicUpdateField[];
};

function uniqueRoleIds(roleIds: string[] | undefined) {
  return [...new Set(roleIds ?? [])].filter(Boolean);
}

function buildMentionContent(roleIds: string[]) {
  if (roleIds.length === 0) return null;

  return roleIds.map((roleId) => `<@&${roleId}>`).join(" ");
}

export async function sendPublicUpdate(
  client: Client,
  options: PublicUpdateOptions
) {
  const updatesChannelId = await getConfiguredChannelId("updatesChannelId");

  if (!updatesChannelId) {
    return false;
  }

  const updatesChannel = await client.channels.fetch(updatesChannelId);

  if (!updatesChannel || updatesChannel.type !== ChannelType.GuildText) {
    return false;
  }

  const roleIds = uniqueRoleIds(options.roleIds);
  const embed = new EmbedBuilder()
    .setTitle(options.title)
    .setDescription(options.description ?? null)
    .setColor(options.color)
    .setTimestamp();

  if (options.fields?.length) {
    embed.addFields(
      options.fields.map((field) => ({
        name: field.name,
        value: field.value.slice(0, 1024) || "Not provided.",
        inline: field.inline ?? false
      }))
    );
  }

  await updatesChannel.send({
    content: buildMentionContent(roleIds) ?? undefined,
    embeds: [embed],
    allowedMentions: {
      roles: roleIds
    }
  });

  return true;
}
