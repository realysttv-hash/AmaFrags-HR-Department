import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Embed,
  type ModalSubmitInteraction
} from "discord.js";
import { sendAdminLog } from "../adminLog/adminLog.js";
import { normalizeScheduledAtInput } from "../calendar/calendarDates.js";
import { getConfiguredChannelId } from "../configuration/botConfigStore.js";
import {
  buildRequestModal,
  buildReviewRow,
  createRequestId,
  getOptionalModalValue,
  getRequiredModalValue,
  truncateEmbedField
} from "../requests/requestBuilder.js";
import { sendRequestToRequestsChannel } from "../requests/sendRequest.js";

const lfgButtonCustomId = "looking_for_game";
const lfgModalCustomId = "looking_for_game_modal";
const acceptChallengePrefix = "accept_lfg:";
const cancelChallengePrefix = "cancel_lfg:";
const acceptChallengeModalPrefix = "accept_lfg_modal:";
const eventType = "Looking for Game";
const pendingChallengeAccepts = new Set<string>();

function findEmbedField(embed: Embed, fieldName: string) {
  return embed.fields.find((field) => field.name === fieldName)?.value ?? null;
}

function extractUserId(value: string | null) {
  if (!value) return null;

  const match = value.match(/<@!?(\d+)>/);

  return match?.[1] ?? null;
}

function buildAcceptChallengeRow(challengeId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${acceptChallengePrefix}${challengeId}`)
      .setLabel("Accept Challenge")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`${cancelChallengePrefix}${challengeId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger)
  );
}

function withUpdatedField(
  embed: Embed,
  fieldName: string,
  value: string,
  inline = false
) {
  const fields = embed.fields.map((field) => {
    if (field.name !== fieldName) {
      return {
        name: field.name,
        value: field.value,
        inline: field.inline
      };
    }

    return {
      name: fieldName,
      value,
      inline
    };
  });

  if (!fields.some((field) => field.name === fieldName)) {
    fields.push({
      name: fieldName,
      value,
      inline
    });
  }

  return EmbedBuilder.from(embed.toJSON()).setFields(fields);
}

async function getLookingForGameChannel(interaction: ModalSubmitInteraction) {
  const channelId =
    (await getConfiguredChannelId("lookingForGameChannelId")) ??
    interaction.channelId;

  if (!channelId) {
    throw new Error("Looking for game channel could not be resolved.");
  }

  const channel = await interaction.client.channels.fetch(channelId);

  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error("Looking for game channel was not found or is not a text channel.");
  }

  return channel;
}

export async function handleLookingForGameButton(interaction: ButtonInteraction) {
  if (interaction.customId !== lfgButtonCustomId) return false;

  const modal = buildRequestModal(lfgModalCustomId, "Looking for Game", [
    {
      customId: "challenger",
      label: "Your team/player name",
      placeholder: "Example: VN, Core, or your nickname",
      maxLength: 80
    },
    {
      customId: "scheduled_at",
      label: "Match date and time",
      placeholder: "Example: 18:00 CET",
      maxLength: 80
    },
    {
      customId: "server",
      label: "Preferred server",
      placeholder: "Example: Server #1",
      maxLength: 80
    },
    {
      customId: "map",
      label: "Map",
      placeholder: "Example: Arland, Everon, Zarichne",
      maxLength: 100
    },
    {
      customId: "notes",
      label: "Additional notes",
      placeholder: "Format, rules, contact details, etc.",
      style: TextInputStyle.Paragraph,
      required: false,
      maxLength: 1000
    }
  ]);

  await interaction.showModal(modal);
  return true;
}

export async function handleLookingForGameModal(
  interaction: ModalSubmitInteraction
) {
  if (interaction.customId !== lfgModalCustomId) return false;

  const scheduledAt = normalizeScheduledAtInput(
    getRequiredModalValue(interaction, "scheduled_at")
  );

  await interaction.deferReply({ ephemeral: true });

  const challengeId = createRequestId("LFG");
  const challenger = getRequiredModalValue(interaction, "challenger");
  const server = getRequiredModalValue(interaction, "server");
  const map = getRequiredModalValue(interaction, "map");
  const notes = getOptionalModalValue(
    interaction,
    "notes",
    "No additional notes provided."
  );

  const embed = new EmbedBuilder()
    .setTitle("Looking for Game")
    .setDescription("A new match challenge is open.")
    .setColor(0xed4245)
    .addFields(
      {
        name: "Challenge ID",
        value: challengeId,
        inline: true
      },
      {
        name: "Submitted by",
        value: `${interaction.user}`,
        inline: true
      },
      {
        name: "Challenger",
        value: challenger,
        inline: true
      },
      {
        name: "Scheduled at",
        value: scheduledAt,
        inline: true
      },
      {
        name: "Server",
        value: server,
        inline: true
      },
      {
        name: "Map",
        value: map,
        inline: true
      },
      {
        name: "Event type",
        value: eventType,
        inline: true
      },
      {
        name: "Status",
        value: "Open",
        inline: true
      },
      {
        name: "Notes",
        value: truncateEmbedField(notes),
        inline: false
      }
    )
    .setTimestamp();

  const channel = await getLookingForGameChannel(interaction);
  const message = await channel.send({
    embeds: [embed],
    components: [buildAcceptChallengeRow(challengeId)],
    allowedMentions: {
      parse: []
    }
  });

  await sendAdminLog(interaction.client, {
    title: "LFG Challenge Posted",
    description: `${challenger} is looking for a game.`,
    color: 0xed4245,
    fields: [
      {
        name: "Challenge ID",
        value: challengeId,
        inline: true
      },
      {
        name: "Submitted by",
        value: `${interaction.user}`,
        inline: true
      },
      {
        name: "Scheduled at",
        value: scheduledAt,
        inline: true
      },
      {
        name: "Server",
        value: server,
        inline: true
      },
      {
        name: "Challenge message",
        value: message.url,
        inline: false
      }
    ]
  });

  await interaction.editReply({
    content: `Your Looking for Game challenge has been posted: ${message.url}`
  });

  return true;
}

export async function handleAcceptLookingForGameButton(
  interaction: ButtonInteraction
) {
  if (!interaction.customId.startsWith(acceptChallengePrefix)) return false;

  const challengeId = interaction.customId.slice(acceptChallengePrefix.length);
  const oldEmbed = interaction.message.embeds[0];

  if (!oldEmbed) {
    await interaction.reply({
      content: "This challenge message does not contain challenge details.",
      ephemeral: true
    });
    return true;
  }

  const submittedByUserId = extractUserId(findEmbedField(oldEmbed, "Submitted by"));

  if (submittedByUserId === interaction.user.id) {
    await interaction.reply({
      content: "You cannot accept your own challenge.",
      ephemeral: true
    });
    return true;
  }

  if (pendingChallengeAccepts.has(challengeId)) {
    await interaction.reply({
      content: "This challenge is already being accepted.",
      ephemeral: true
    });
    return true;
  }

  pendingChallengeAccepts.add(challengeId);

  try {
    const modal = buildRequestModal(
      `${acceptChallengeModalPrefix}${challengeId}:${interaction.message.id}`,
      "Accept Challenge",
      [
        {
          customId: "opponent_team",
          label: "Your team name",
          placeholder: "Example: VN, Core, Medusa",
          maxLength: 80
        }
      ]
    );

    await interaction.showModal(modal);
  } catch (error) {
    pendingChallengeAccepts.delete(challengeId);
    throw error;
  }

  return true;
}

export async function handleCancelLookingForGameButton(
  interaction: ButtonInteraction
) {
  if (!interaction.customId.startsWith(cancelChallengePrefix)) return false;

  const challengeId = interaction.customId.slice(cancelChallengePrefix.length);
  const oldEmbed = interaction.message.embeds[0];

  if (!oldEmbed) {
    await interaction.reply({
      content: "This challenge message does not contain challenge details.",
      ephemeral: true
    });
    return true;
  }

  const submittedByUserId = extractUserId(findEmbedField(oldEmbed, "Submitted by"));

  if (submittedByUserId !== interaction.user.id) {
    await interaction.reply({
      content: "Only the user who posted this challenge can cancel it.",
      ephemeral: true
    });
    return true;
  }

  pendingChallengeAccepts.delete(challengeId);

  await interaction.reply({
    content: "Your Looking for Game challenge has been cancelled.",
    ephemeral: true
  });

  await interaction.message.delete();

  await sendAdminLog(interaction.client, {
    title: "LFG Challenge Cancelled",
    description: "A Looking for Game challenge was cancelled by its author.",
    color: 0xed4245,
    fields: [
      {
        name: "Challenge ID",
        value: challengeId,
        inline: true
      },
      {
        name: "Cancelled by",
        value: `${interaction.user}`,
        inline: true
      }
    ]
  });

  return true;
}

export async function handleAcceptLookingForGameModal(
  interaction: ModalSubmitInteraction
) {
  if (!interaction.customId.startsWith(acceptChallengeModalPrefix)) return false;

  const context = interaction.customId.slice(acceptChallengeModalPrefix.length);
  const [challengeId, messageId] = context.split(":");

  try {
    await interaction.deferReply({ ephemeral: true });

    if (!challengeId || !messageId) {
      await interaction.editReply({
        content: "This challenge accept session is invalid. Please click Accept Challenge again."
      });
      return true;
    }

    const channel = interaction.channel;

    if (!channel || !("messages" in channel)) {
      await interaction.editReply({
        content: "I could not find the challenge channel."
      });
      return true;
    }

    const challengeMessage = await channel.messages.fetch(messageId);
    const oldEmbed = challengeMessage.embeds[0];

    if (!oldEmbed) {
      await interaction.editReply({
        content: "This challenge message does not contain challenge details."
      });
      return true;
    }

    const requestId = createRequestId("LFG-REQUEST");
    const challenger = findEmbedField(oldEmbed, "Challenger") ?? "Unknown challenger";
    const scheduledAt = findEmbedField(oldEmbed, "Scheduled at") ?? "Date TBA";
    const server = findEmbedField(oldEmbed, "Server") ?? "TBA";
    const map = findEmbedField(oldEmbed, "Map") ?? "TBA";
    const notes = findEmbedField(oldEmbed, "Notes") ?? "No additional notes provided.";
    const opponent = getRequiredModalValue(interaction, "opponent_team");

    const requestEmbed = new EmbedBuilder()
      .setTitle("Looking for Game Match Approval")
      .setDescription("A looking-for-game challenge has been accepted and needs review.")
      .setColor(0xed4245)
      .addFields(
        {
          name: "Request ID",
          value: requestId,
          inline: true
        },
        {
          name: "Challenge ID",
          value: challengeId,
          inline: true
        },
        {
          name: "Submitted by",
          value: findEmbedField(oldEmbed, "Submitted by") ?? "Unknown user",
          inline: true
        },
        {
          name: "Accepted by",
          value: `${interaction.user}`,
          inline: true
        },
        {
          name: "Challenger",
          value: challenger,
          inline: true
        },
        {
          name: "Opponent",
          value: opponent,
          inline: true
        },
        {
          name: "Match",
          value: `${challenger} vs ${opponent}`,
          inline: false
        },
        {
          name: "Scheduled at",
          value: scheduledAt,
          inline: true
        },
        {
          name: "Server",
          value: server,
          inline: true
        },
        {
          name: "Map",
          value: map,
          inline: true
        },
        {
          name: "Event type",
          value: eventType,
          inline: true
        },
        {
          name: "Challenge message",
          value: challengeMessage.url,
          inline: false
        },
        {
          name: "Notes",
          value: truncateEmbedField(notes),
          inline: false
        }
      )
      .setTimestamp();

    await sendRequestToRequestsChannel(
      interaction,
      requestEmbed,
      buildReviewRow("lfg_match", requestId)
    );

    await sendAdminLog(interaction.client, {
      title: "LFG Challenge Accepted",
      description: `${challenger} vs ${opponent}`,
      color: 0xed4245,
      fields: [
        {
          name: "Challenge ID",
          value: challengeId,
          inline: true
        },
        {
          name: "Request ID",
          value: requestId,
          inline: true
        },
        {
          name: "Accepted by",
          value: `${interaction.user}`,
          inline: true
        },
        {
          name: "Scheduled at",
          value: scheduledAt,
          inline: true
        },
        {
          name: "Challenge message",
          value: challengeMessage.url,
          inline: false
        }
      ]
    });

    const updatedEmbed = withUpdatedField(
      oldEmbed,
      "Status",
      `Pending admin approval - accepted by ${opponent}`,
      false
    ).setColor(0xed4245);

    await challengeMessage.edit({
      embeds: [updatedEmbed],
      components: []
    });

    await interaction.editReply({
      content: "Challenge accepted. The administration has received a review request."
    });
  } catch (error) {
    pendingChallengeAccepts.delete(challengeId);
    throw error;
  }

  return true;
}
