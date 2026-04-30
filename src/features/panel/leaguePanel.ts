import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Client
} from "discord.js";
import { getConfiguredChannelId } from "../configuration/botConfigStore.js";
import { getPanelMessageId, setPanelMessageId } from "./panelStore.js";

const PANEL_CONTENT = "## ArmaFrags HR Department";

function buildLeaguePanelEmbed() {
  return new EmbedBuilder()
    .setTitle("Arma Reforger League Panel")
    .setDescription(
      [
        "Use the buttons below to interact with the league system.",
        "",
        "**Available actions:**",
        "- Register a team",
        "- Request a match reschedule",
        "- Book a training server",
        "- Request a player transfer",
        "- Post a Looking for Game challenge",
        "- View the league calendar"
      ].join("\n")
    )
    .setColor(0x2f3136);
}

function buildLeaguePanelComponents() {
  const requestRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("team_register")
      .setLabel("Register Team")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("match_reschedule")
      .setLabel("Request Match Reschedule")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("server_booking")
      .setLabel("Book Training Server")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("transfer_request")
      .setLabel("Request Transfer")
      .setStyle(ButtonStyle.Secondary)
  );

  const utilityRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("looking_for_game")
      .setLabel("Looking for Game")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("view_calendar")
      .setLabel("View Calendar")
      .setStyle(ButtonStyle.Success)
  );

  return [requestRow, utilityRow];
}

function buildLeaguePanelPayload() {
  return {
    content: PANEL_CONTENT,
    embeds: [buildLeaguePanelEmbed()],
    components: buildLeaguePanelComponents(),
    allowedMentions: {
      parse: []
    }
  };
}

export async function publishLeaguePanelToChannel(client: Client) {
  const panelChannelId = await getConfiguredChannelId("panelChannelId");

  if (!panelChannelId) {
    throw new Error("Panel channel is not configured.");
  }

  const panelChannel = await client.channels.fetch(panelChannelId);

  if (!panelChannel || panelChannel.type !== ChannelType.GuildText) {
    throw new Error("Panel channel was not found or is not a text channel.");
  }

  const payload = buildLeaguePanelPayload();
  const existingMessageId = await getPanelMessageId();

  if (existingMessageId) {
    try {
      const existingMessage = await panelChannel.messages.fetch(existingMessageId);

      return await existingMessage.edit(payload);
    } catch (error) {
      console.warn("Could not edit existing panel message; sending a new one.", error);
    }
  }

  const newMessage = await panelChannel.send(payload);
  await setPanelMessageId(newMessage.id);

  return newMessage;
}

export async function handleLeaguePanelCommand(
  interaction: ChatInputCommandInteraction
) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "Only server administrators can refresh the public league panel.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const panelMessage = await publishLeaguePanelToChannel(interaction.client);

  await interaction.editReply({
    content: `The public league panel has been refreshed: ${panelMessage.url}`
  });
}
