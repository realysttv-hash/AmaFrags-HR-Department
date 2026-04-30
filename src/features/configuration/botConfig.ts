import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction
} from "discord.js";
import { sendAdminLog } from "../adminLog/adminLog.js";
import { publishCalendarToChannel } from "../calendar/calendar.js";
import { publishLeaguePanelToChannel } from "../panel/leaguePanel.js";
import {
  clearConfiguredChannelOverride,
  configurableChannelLabels,
  getConfigEntries,
  setConfiguredChannelId,
  type ConfigurableChannelKey
} from "./botConfigStore.js";

function userIsAdministrator(interaction: ChatInputCommandInteraction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

function formatSource(source: "saved" | "env" | "unset") {
  if (source === "saved") return "Discord config";
  if (source === "env") return ".env fallback";

  return "Not configured";
}

function formatChannel(channelId: string | null) {
  return channelId ? `<#${channelId}>` : "Not configured";
}

async function buildConfigEmbed() {
  const entries = await getConfigEntries();

  return new EmbedBuilder()
    .setTitle("Bot Channel Configuration")
    .setColor(0x5865f2)
    .setDescription("Current channel routing for bot features.")
    .addFields(
      entries.map((entry) => ({
        name: entry.label,
        value: `${formatChannel(entry.channelId)}\nSource: ${formatSource(entry.source)}`,
        inline: true
      }))
    )
    .setTimestamp();
}

async function maybeRefreshDestination(
  interaction: ChatInputCommandInteraction,
  destination: ConfigurableChannelKey
) {
  if (destination === "panelChannelId") {
    const message = await publishLeaguePanelToChannel(interaction.client);

    return `Panel refreshed: ${message.url}`;
  }

  if (destination === "calendarChannelId") {
    const message = await publishCalendarToChannel(interaction.client);

    return `Calendar refreshed: ${message.url}`;
  }

  return null;
}

async function handleView(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    embeds: [await buildConfigEmbed()],
    ephemeral: true
  });
}

async function handleSet(interaction: ChatInputCommandInteraction) {
  const destination = interaction.options.getString(
    "destination",
    true
  ) as ConfigurableChannelKey;
  const channel = interaction.options.getChannel("channel", true);

  if (channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "Only regular text channels are supported for this setting.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await setConfiguredChannelId(destination, channel.id);

  let refreshStatus: string | null = null;

  try {
    refreshStatus = await maybeRefreshDestination(interaction, destination);
  } catch (error) {
    refreshStatus =
      "The channel was saved, but I could not refresh the related public message. Check bot permissions in that channel.";
    console.error("Could not refresh configured destination:", error);
  }

  await sendAdminLog(interaction.client, {
    title: "Bot Configuration Updated",
    color: 0x5865f2,
    fields: [
      {
        name: "Setting",
        value: configurableChannelLabels[destination],
        inline: true
      },
      {
        name: "Channel",
        value: `<#${channel.id}>`,
        inline: true
      },
      {
        name: "Updated by",
        value: `${interaction.user}`,
        inline: true
      }
    ]
  });

  await interaction.editReply({
    content: [
      `${configurableChannelLabels[destination]} channel set to <#${channel.id}>.`,
      refreshStatus
    ]
      .filter(Boolean)
      .join("\n")
  });
}

async function handleReset(interaction: ChatInputCommandInteraction) {
  const destination = interaction.options.getString(
    "destination",
    true
  ) as ConfigurableChannelKey;

  await interaction.deferReply({ ephemeral: true });
  await clearConfiguredChannelOverride(destination);

  let refreshStatus: string | null = null;

  try {
    refreshStatus = await maybeRefreshDestination(interaction, destination);
  } catch {
    refreshStatus =
      "The override was reset, but I could not refresh the related public message.";
  }

  await sendAdminLog(interaction.client, {
    title: "Bot Configuration Reset",
    color: 0xfaa61a,
    fields: [
      {
        name: "Setting",
        value: configurableChannelLabels[destination],
        inline: true
      },
      {
        name: "Updated by",
        value: `${interaction.user}`,
        inline: true
      }
    ]
  });

  await interaction.editReply({
    content: [
      `${configurableChannelLabels[destination]} override reset to .env/default behavior.`,
      refreshStatus
    ]
      .filter(Boolean)
      .join("\n")
  });
}

export async function handleBotConfigCommand(
  interaction: ChatInputCommandInteraction
) {
  if (interaction.commandName !== "bot-config") return false;

  if (!userIsAdministrator(interaction)) {
    await interaction.reply({
      content: "Only server administrators can configure the bot.",
      ephemeral: true
    });
    return true;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "view") {
    await handleView(interaction);
    return true;
  }

  if (subcommand === "set") {
    await handleSet(interaction);
    return true;
  }

  if (subcommand === "reset") {
    await handleReset(interaction);
    return true;
  }

  await interaction.reply({
    content: "Unknown bot-config subcommand.",
    ephemeral: true
  });

  return true;
}
