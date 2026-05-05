import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client
} from "discord.js";
import { sendAdminLog } from "../adminLog/adminLog.js";
import { getConfiguredChannelId } from "../configuration/botConfigStore.js";
import { normalizeScheduledAtInput } from "./calendarDates.js";
import { buildCalendarEmbeds } from "./calendarEmbeds.js";
import {
  addCalendarMatch,
  clearCalendarMatches,
  deleteCalendarMatch,
  editCalendarMatch,
  getCalendarMessageId,
  setCalendarMessageId,
  type CalendarEventType,
  type CalendarMatch,
  type CalendarMatchUpdate
} from "./calendarStore.js";

const CALENDAR_MESSAGE_CONTENT = "## Arma Reforger League Calendar";

function userIsAdministrator(interaction: ChatInputCommandInteraction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

function buildCalendarMessageContent(totalMatches: number, shownMatches: number) {
  const timestamp = Math.floor(Date.now() / 1000);
  const countText =
    totalMatches > shownMatches
      ? `Showing ${shownMatches} of ${totalMatches} scheduled events.`
      : `${totalMatches} scheduled event${totalMatches === 1 ? "" : "s"}.`;

  return `${CALENDAR_MESSAGE_CONTENT}\n${countText}\nLast updated: <t:${timestamp}:R>`;
}

function getEventTypeFromOption(
  interaction: ChatInputCommandInteraction,
  required: true
): CalendarEventType;
function getEventTypeFromOption(
  interaction: ChatInputCommandInteraction,
  required: false
): CalendarEventType | null;
function getEventTypeFromOption(
  interaction: ChatInputCommandInteraction,
  required: boolean
): CalendarEventType | null {
  const value = interaction.options.getString("event-type", required);

  if (!value) return null;

  return value as CalendarEventType;
}

function getNormalizedScheduledAt(
  interaction: ChatInputCommandInteraction,
  required: true
): string;
function getNormalizedScheduledAt(
  interaction: ChatInputCommandInteraction,
  required: false
): string | null;
function getNormalizedScheduledAt(
  interaction: ChatInputCommandInteraction,
  required: boolean
) {
  const value = interaction.options.getString("scheduled-at", required);

  if (!value) return null;

  return normalizeScheduledAtInput(value);
}

function buildMatchEmbed(
  title: string,
  description: string,
  color: number,
  match: CalendarMatch,
  includeNotes: boolean
) {
  const fields = [
    {
      name: "Match ID",
      value: match.id,
      inline: true
    },
    {
      name: "Match",
      value: `${match.homeTeam} vs ${match.awayTeam}`,
      inline: false
    },
    {
      name: "Event type",
      value: match.eventType,
      inline: true
    },
    {
      name: "Scheduled at",
      value: match.scheduledAt,
      inline: true
    },
    {
      name: "Map",
      value: match.map,
      inline: true
    },
    {
      name: "Server",
      value: match.server,
      inline: true
    }
  ];

  if (includeNotes) {
    fields.push({
      name: "Notes",
      value: match.notes,
      inline: false
    });
  }

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .addFields(fields)
    .setTimestamp();
}

export async function publishCalendarToChannel(client: Client) {
  const calendarChannelId = await getConfiguredChannelId("calendarChannelId");

  if (!calendarChannelId) {
    throw new Error("Calendar channel is not configured.");
  }

  const calendarChannel = await client.channels.fetch(calendarChannelId);

  if (!calendarChannel || calendarChannel.type !== ChannelType.GuildText) {
    throw new Error("Calendar channel was not found or is not a text channel.");
  }

  const calendarView = await buildCalendarEmbeds();
  const messagePayload = {
    content: buildCalendarMessageContent(
      calendarView.totalMatches,
      calendarView.shownMatches
    ),
    embeds: calendarView.embeds,
    allowedMentions: {
      parse: []
    }
  };

  const existingMessageId = await getCalendarMessageId();

  if (existingMessageId) {
    try {
      const existingMessage = await calendarChannel.messages.fetch(existingMessageId);

      return await existingMessage.edit({
        ...messagePayload,
        attachments: []
      });
    } catch (error) {
      console.warn("Could not edit existing calendar message; sending a new one.", error);
    }
  }

  const newMessage = await calendarChannel.send(messagePayload);
  await setCalendarMessageId(newMessage.id);

  return newMessage;
}

export async function handleCalendarCommand(
  interaction: ChatInputCommandInteraction
) {
  await interaction.deferReply({ ephemeral: true });

  const calendarView = await buildCalendarEmbeds();

  await interaction.editReply({
    content: buildCalendarMessageContent(
      calendarView.totalMatches,
      calendarView.shownMatches
    ),
    embeds: calendarView.embeds
  });
}

export async function handleCalendarButton(interaction: ButtonInteraction) {
  if (interaction.customId !== "view_calendar") return false;

  await interaction.deferReply({ ephemeral: true });

  const calendarView = await buildCalendarEmbeds();

  await interaction.editReply({
    content: buildCalendarMessageContent(
      calendarView.totalMatches,
      calendarView.shownMatches
    ),
    embeds: calendarView.embeds
  });

  return true;
}

export async function handleAddMatchCommand(
  interaction: ChatInputCommandInteraction
) {
  if (interaction.commandName !== "add-match") return false;

  if (!userIsAdministrator(interaction)) {
    await interaction.reply({
      content: "Only server administrators can add matches.",
      ephemeral: true
    });
    return true;
  }

  const scheduledAt = getNormalizedScheduledAt(interaction, true);

  await interaction.deferReply({ ephemeral: true });

  const homeTeam = interaction.options.getString("home-team", true).trim();
  const awayTeam = interaction.options.getString("away-team", true).trim();
  const map = interaction.options.getString("map", true).trim();
  const server = interaction.options.getString("server", true).trim();
  const eventType = getEventTypeFromOption(interaction, true);
  const notes =
    interaction.options.getString("notes", false)?.trim() || "No additional notes.";

  const newMatch = await addCalendarMatch({
    homeTeam,
    awayTeam,
    scheduledAt,
    map,
    server,
    eventType,
    notes,
    createdBy: interaction.user.id
  });

  await publishCalendarToChannel(interaction.client);

  await sendAdminLog(interaction.client, {
    title: "Calendar Match Added",
    description: `${newMatch.homeTeam} vs ${newMatch.awayTeam}`,
    color: 0x57f287,
    fields: [
      {
        name: "Match ID",
        value: newMatch.id,
        inline: true
      },
      {
        name: "Scheduled at",
        value: newMatch.scheduledAt,
        inline: true
      },
      {
        name: "Added by",
        value: `${interaction.user}`,
        inline: true
      },
      {
        name: "Server",
        value: newMatch.server,
        inline: true
      },
      {
        name: "Map",
        value: newMatch.map,
        inline: true
      },
      {
        name: "Event type",
        value: newMatch.eventType,
        inline: true
      }
    ]
  });

  const embed = buildMatchEmbed(
    "Match Added",
    "The match has been added to the league calendar.",
    0x57f287,
    newMatch,
    true
  );

  await interaction.editReply({
    embeds: [embed]
  });

  return true;
}

export async function handleEditMatchCommand(
  interaction: ChatInputCommandInteraction
) {
  if (interaction.commandName !== "edit-match") return false;

  if (!userIsAdministrator(interaction)) {
    await interaction.reply({
      content: "Only server administrators can edit matches.",
      ephemeral: true
    });
    return true;
  }

  const matchId = interaction.options.getString("match-id", true).trim();
  const update: CalendarMatchUpdate = {};

  const homeTeam = interaction.options.getString("home-team", false)?.trim();
  const awayTeam = interaction.options.getString("away-team", false)?.trim();
  const scheduledAtRaw = interaction.options.getString("scheduled-at", false);
  const map = interaction.options.getString("map", false)?.trim();
  const server = interaction.options.getString("server", false)?.trim();
  const eventType = getEventTypeFromOption(interaction, false);
  const notes = interaction.options.getString("notes", false)?.trim();

  if (homeTeam) update.homeTeam = homeTeam;
  if (awayTeam) update.awayTeam = awayTeam;

  if (scheduledAtRaw !== null) {
    update.scheduledAt = normalizeScheduledAtInput(scheduledAtRaw);
  }

  if (server) update.server = server;
  if (map) update.map = map;
  if (eventType !== null) update.eventType = eventType;
  if (notes) update.notes = notes;

  if (Object.keys(update).length === 0) {
    await interaction.reply({
      content: "No changes were provided. Add at least one field to update.",
      ephemeral: true
    });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });

  const updatedMatch = await editCalendarMatch(matchId, update);

  if (!updatedMatch) {
    await interaction.editReply({
      content: `No match found with ID: ${matchId}`
    });
    return true;
  }

  await publishCalendarToChannel(interaction.client);

  await sendAdminLog(interaction.client, {
    title: "Calendar Match Edited",
    description: `${updatedMatch.homeTeam} vs ${updatedMatch.awayTeam}`,
    color: 0xfaa61a,
    fields: [
      {
        name: "Match ID",
        value: updatedMatch.id,
        inline: true
      },
      {
        name: "Edited by",
        value: `${interaction.user}`,
        inline: true
      },
      {
        name: "Updated fields",
        value: Object.keys(update).join(", "),
        inline: false
      },
      {
        name: "Scheduled at",
        value: updatedMatch.scheduledAt,
        inline: true
      },
      {
        name: "Server",
        value: updatedMatch.server,
        inline: true
      },
      {
        name: "Map",
        value: updatedMatch.map,
        inline: true
      }
    ]
  });

  const embed = buildMatchEmbed(
    "Match Edited",
    "The match has been updated in the league calendar.",
    0xfaa61a,
    updatedMatch,
    true
  );

  await interaction.editReply({
    embeds: [embed]
  });

  return true;
}

export async function handleDeleteMatchCommand(
  interaction: ChatInputCommandInteraction
) {
  if (interaction.commandName !== "delete-match") return false;

  if (!userIsAdministrator(interaction)) {
    await interaction.reply({
      content: "Only server administrators can delete matches.",
      ephemeral: true
    });
    return true;
  }

  const matchId = interaction.options.getString("match-id", true).trim();

  await interaction.deferReply({ ephemeral: true });

  const deletedMatch = await deleteCalendarMatch(matchId);

  if (!deletedMatch) {
    await interaction.editReply({
      content: `No match found with ID: ${matchId}`
    });
    return true;
  }

  await publishCalendarToChannel(interaction.client);

  await sendAdminLog(interaction.client, {
    title: "Calendar Match Deleted",
    description: `${deletedMatch.homeTeam} vs ${deletedMatch.awayTeam}`,
    color: 0xed4245,
    fields: [
      {
        name: "Match ID",
        value: deletedMatch.id,
        inline: true
      },
      {
        name: "Deleted by",
        value: `${interaction.user}`,
        inline: true
      },
      {
        name: "Scheduled at",
        value: deletedMatch.scheduledAt,
        inline: true
      },
      {
        name: "Server",
        value: deletedMatch.server,
        inline: true
      },
      {
        name: "Map",
        value: deletedMatch.map,
        inline: true
      }
    ]
  });

  const embed = buildMatchEmbed(
    "Match Deleted",
    "The match has been removed from the league calendar.",
    0xed4245,
    deletedMatch,
    false
  );

  await interaction.editReply({
    embeds: [embed]
  });

  return true;
}

export async function handleClearAllGamesCommand(
  interaction: ChatInputCommandInteraction
) {
  if (interaction.commandName !== "clear-all-games") return false;

  if (!userIsAdministrator(interaction)) {
    await interaction.reply({
      content: "Only server administrators can clear the calendar.",
      ephemeral: true
    });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });

  const deletedCount = await clearCalendarMatches();

  await publishCalendarToChannel(interaction.client);

  await sendAdminLog(interaction.client, {
    title: "All Calendar Games Cleared",
    color: 0xed4245,
    fields: [
      {
        name: "Deleted games",
        value: deletedCount.toString(),
        inline: true
      },
      {
        name: "Cleared by",
        value: `${interaction.user}`,
        inline: true
      }
    ]
  });

  await interaction.editReply({
    content: `Cleared ${deletedCount} scheduled game${deletedCount === 1 ? "" : "s"} and refreshed the public calendar.`
  });

  return true;
}

export async function handleRefreshCalendarCommand(
  interaction: ChatInputCommandInteraction
) {
  if (interaction.commandName !== "refresh-calendar") return false;

  if (!userIsAdministrator(interaction)) {
    await interaction.reply({
      content: "Only server administrators can refresh the public calendar.",
      ephemeral: true
    });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });
  await publishCalendarToChannel(interaction.client);

  await sendAdminLog(interaction.client, {
    title: "Calendar Refreshed",
    color: 0x5865f2,
    fields: [
      {
        name: "Refreshed by",
        value: `${interaction.user}`,
        inline: true
      }
    ]
  });

  await interaction.editReply({
    content: "The public league calendar has been refreshed."
  });

  return true;
}
