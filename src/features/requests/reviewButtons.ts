import {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Embed,
  type ModalSubmitInteraction
} from "discord.js";
import { publishCalendarToChannel } from "../calendar/calendar.js";
import {
  addCalendarMatch,
  editCalendarMatch
} from "../calendar/calendarStore.js";
import { normalizeScheduledAtInput } from "../calendar/calendarDates.js";
import { sendAdminLog } from "../adminLog/adminLog.js";
import { reviewButtonPrefixes } from "./requestBuilder.js";

const rejectReasonModalPrefix = "reject_reason:";
const rejectionSessionTtlMs = 15 * 60 * 1000;

type PendingRejectionContext = {
  channelId: string;
  messageId: string;
  reviewerId: string;
  reviewCustomId: string;
  timeout: NodeJS.Timeout;
};

const pendingRejections = new Map<string, PendingRejectionContext>();

export function isReviewButton(customId: string): boolean {
  return reviewButtonPrefixes.some((prefix) => customId.startsWith(prefix));
}

function setPendingRejection(
  rejectionContextId: string,
  context: Omit<PendingRejectionContext, "timeout">
) {
  const timeout = setTimeout(() => {
    pendingRejections.delete(rejectionContextId);
  }, rejectionSessionTtlMs);

  timeout.unref();
  pendingRejections.set(rejectionContextId, {
    ...context,
    timeout
  });
}

function popPendingRejection(rejectionContextId: string) {
  const context = pendingRejections.get(rejectionContextId);

  if (!context) {
    return null;
  }

  clearTimeout(context.timeout);
  pendingRejections.delete(rejectionContextId);

  return context;
}

function findEmbedField(embed: Embed, fieldName: string) {
  return embed.fields.find((field) => field.name === fieldName)?.value ?? null;
}

function extractUserIdFromValue(value: string | null): string | null {
  if (!value) return null;

  const match = value.match(/<@!?(\d+)>/);

  return match?.[1] ?? null;
}

function extractSubmittedByUserId(embed: Embed): string | null {
  return extractUserIdFromValue(findEmbedField(embed, "Submitted by"));
}

function extractAcceptedByUserId(embed: Embed): string | null {
  return extractUserIdFromValue(findEmbedField(embed, "Accepted by"));
}

function getRequestTitle(embed: Embed) {
  return embed.title ?? "Your league request";
}

function getRequestId(embed: Embed) {
  return findEmbedField(embed, "Request ID") ?? "Not provided.";
}

function buildApprovedEmbed(oldEmbed: Embed, reviewedBy: string) {
  const oldTitle = oldEmbed.title ?? "Request";

  return EmbedBuilder.from(oldEmbed.toJSON())
    .setTitle(`Approved - ${oldTitle}`)
    .setColor(0x57f287)
    .addFields({
      name: "Reviewed by",
      value: reviewedBy,
      inline: true
    });
}

function buildRejectedEmbed(oldEmbed: Embed, reviewedBy: string, reason: string) {
  const oldTitle = oldEmbed.title ?? "Request";

  return EmbedBuilder.from(oldEmbed.toJSON())
    .setTitle(`Rejected - ${oldTitle}`)
    .setColor(0xed4245)
    .addFields(
      {
        name: "Reviewed by",
        value: reviewedBy,
        inline: true
      },
      {
        name: "Rejection reason",
        value: reason.slice(0, 1024),
        inline: false
      }
    );
}

async function trySendApprovalDm(
  interaction: ButtonInteraction,
  userId: string,
  requestTitle: string
) {
  try {
    const user = await interaction.client.users.fetch(userId);

    await user.send({
      content: [
        "Your request has been approved.",
        "",
        `**Request:** ${requestTitle}`,
        "",
        "The administration has reviewed and approved your request."
      ].join("\n")
    });

    return true;
  } catch {
    return false;
  }
}

async function trySendRejectionDm(
  interaction: ModalSubmitInteraction,
  userId: string,
  requestTitle: string,
  reason: string
) {
  try {
    const user = await interaction.client.users.fetch(userId);

    await user.send({
      content: [
        "Your request has been rejected.",
        "",
        `**Request:** ${requestTitle}`,
        `**Reason:** ${reason}`,
        "",
        "Please contact the administration if you need clarification."
      ].join("\n")
    });

    return true;
  } catch {
    return false;
  }
}

async function trySendCustomDm(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  userId: string,
  content: string
) {
  try {
    const user = await interaction.client.users.fetch(userId);

    await user.send({
      content
    });

    return true;
  } catch {
    return false;
  }
}

function isLookingForGameReview(customId: string) {
  return customId.startsWith("approve_lfg_match:") || customId.startsWith("reject_lfg_match:");
}

function isMatchRescheduleReview(customId: string) {
  return (
    customId.startsWith("approve_match_reschedule:") ||
    customId.startsWith("reject_match_reschedule:")
  );
}

function isServerBookingReview(customId: string) {
  return (
    customId.startsWith("approve_server_booking:") ||
    customId.startsWith("reject_server_booking:")
  );
}

function getLfgMatchDetails(embed: Embed) {
  const challenger = findEmbedField(embed, "Challenger") ?? "Unknown challenger";
  const opponent = findEmbedField(embed, "Opponent") ?? "Unknown opponent";
  const scheduledAt = findEmbedField(embed, "Scheduled at") ?? "Date TBA";
  const map = findEmbedField(embed, "Map") ?? "TBA";
  const server = findEmbedField(embed, "Server") ?? "TBA";
  const notes = findEmbedField(embed, "Notes") ?? "No additional notes provided.";

  return {
    challenger,
    opponent,
    scheduledAt,
    map,
    server,
    notes,
    matchLabel: `${challenger} vs ${opponent}`
  };
}

function getServerBookingDetails(embed: Embed) {
  const team = findEmbedField(embed, "Team") ?? "Unknown team";
  const trainingDate = findEmbedField(embed, "Training date") ?? "Date TBA";
  const time = findEmbedField(embed, "Time") ?? "Time TBA";
  const server = findEmbedField(embed, "Preferred server") ?? "TBA";
  const map = findEmbedField(embed, "Map") ?? "TBA";

  return {
    team,
    trainingDate,
    time,
    server,
    map,
    scheduledAt: normalizeServerBookingDateTime(trainingDate, time)
  };
}

function normalizeServerBookingDateTime(trainingDate: string, time: string) {
  const timeMatch = time.match(/(\d{1,2}:\d{2})(?:\s*-\s*\d{1,2}:\d{2})?\s*(UTC|CET|CEST)?/i);

  if (!timeMatch) {
    return normalizeScheduledAtInput(trainingDate) ?? `${trainingDate} ${time}`;
  }

  const [, startTime, zone = "UTC"] = timeMatch;

  return (
    normalizeScheduledAtInput(`${trainingDate} ${startTime} ${zone.toUpperCase()}`) ??
    `${trainingDate} ${time}`
  );
}

function getMatchRescheduleDetails(embed: Embed) {
  const matchId = findEmbedField(embed, "Match ID");
  const match = findEmbedField(embed, "Match") ?? "Unknown match";
  const currentDate = findEmbedField(embed, "Current date and time") ?? "Unknown date";
  const proposedDate =
    findEmbedField(embed, "Proposed new date and time") ?? "Date TBA";
  const server = findEmbedField(embed, "Server") ?? "TBA";
  const eventType = findEmbedField(embed, "Event type") ?? "Other";

  return {
    matchId,
    match,
    currentDate,
    proposedDate,
    server,
    eventType
  };
}

async function handleServerBookingApproval(
  interaction: ButtonInteraction,
  oldEmbed: Embed
) {
  await interaction.deferUpdate();

  const submittedByUserId = extractSubmittedByUserId(oldEmbed);
  const details = getServerBookingDetails(oldEmbed);

  const calendarMatch = await addCalendarMatch({
    homeTeam: details.team,
    awayTeam: "Training Server",
    scheduledAt: details.scheduledAt,
    map: details.map,
    server: details.server,
    eventType: "Training",
    notes: `Time request: ${details.time}`,
    createdBy: submittedByUserId ?? interaction.user.id
  });

  await publishCalendarToChannel(interaction.client);

  const updatedEmbed = buildApprovedEmbed(oldEmbed, `${interaction.user}`)
    .addFields({
      name: "Calendar match ID",
      value: calendarMatch.id,
      inline: true
    });

  await interaction.message.edit({
    embeds: [updatedEmbed],
    components: []
  });

  await sendAdminLog(interaction.client, {
    title: "Training Server Booking Approved",
    description: `${details.team} training session`,
    color: 0x57f287,
    fields: [
      {
        name: "Request ID",
        value: getRequestId(oldEmbed),
        inline: true
      },
      {
        name: "Calendar match ID",
        value: calendarMatch.id,
        inline: true
      },
      {
        name: "Reviewed by",
        value: `${interaction.user}`,
        inline: true
      },
      {
        name: "Scheduled at",
        value: calendarMatch.scheduledAt,
        inline: true
      },
      {
        name: "Server",
        value: calendarMatch.server,
        inline: true
      },
      {
        name: "Map",
        value: calendarMatch.map,
        inline: true
      },
      {
        name: "Request message",
        value: interaction.message.url,
        inline: false
      }
    ]
  });

  const dmSent = submittedByUserId
    ? await trySendCustomDm(
        interaction,
        submittedByUserId,
        [
          "Your training server booking has been approved.",
          "",
          `**Team:** ${details.team}`,
          `**Scheduled at:** ${calendarMatch.scheduledAt}`,
          `**Requested time:** ${details.time}`,
          `**Map:** ${calendarMatch.map}`,
          `**Server:** ${calendarMatch.server}`,
          `**Calendar match ID:** ${calendarMatch.id}`,
          "",
          "The training session has been added to the league calendar."
        ].join("\n")
      )
    : false;

  await interaction.followUp({
    content: dmSent
      ? "The training server booking has been approved, added to the calendar, and the requester was notified."
      : "The training server booking has been approved and added to the calendar, but I could not send a DM to the requester.",
    ephemeral: true
  });
}

async function handleMatchRescheduleApproval(
  interaction: ButtonInteraction,
  oldEmbed: Embed
) {
  await interaction.deferUpdate();

  const details = getMatchRescheduleDetails(oldEmbed);

  if (!details.matchId) {
    await interaction.followUp({
      content: "This reschedule request does not contain a Match ID.",
      ephemeral: true
    });
    return;
  }

  const updatedMatch = await editCalendarMatch(details.matchId, {
    scheduledAt: details.proposedDate
  });

  if (!updatedMatch) {
    await interaction.followUp({
      content: `No match found with ID: ${details.matchId}. The calendar was not changed.`,
      ephemeral: true
    });
    return;
  }

  await publishCalendarToChannel(interaction.client);

  const updatedEmbed = buildApprovedEmbed(oldEmbed, `${interaction.user}`)
    .addFields({
      name: "Calendar updated",
      value: `Match ${updatedMatch.id} moved to ${updatedMatch.scheduledAt}.`,
      inline: false
    });

  await interaction.message.edit({
    embeds: [updatedEmbed],
    components: []
  });

  await sendAdminLog(interaction.client, {
    title: "Match Reschedule Approved",
    description: details.match,
    color: 0x57f287,
    fields: [
      {
        name: "Request ID",
        value: getRequestId(oldEmbed),
        inline: true
      },
      {
        name: "Match ID",
        value: updatedMatch.id,
        inline: true
      },
      {
        name: "Reviewed by",
        value: `${interaction.user}`,
        inline: true
      },
      {
        name: "Previous date",
        value: details.currentDate,
        inline: true
      },
      {
        name: "New date",
        value: updatedMatch.scheduledAt,
        inline: true
      },
      {
        name: "Request message",
        value: interaction.message.url,
        inline: false
      }
    ]
  });

  const submittedByUserId = extractSubmittedByUserId(oldEmbed);
  const dmSent = submittedByUserId
    ? await trySendCustomDm(
        interaction,
        submittedByUserId,
        [
          "Your match reschedule request has been approved.",
          "",
          `**Match:** ${details.match}`,
          `**Previous date:** ${details.currentDate}`,
          `**New date:** ${updatedMatch.scheduledAt}`,
          `**Server:** ${updatedMatch.server}`,
          "",
          "The public league calendar has been updated."
        ].join("\n")
      )
    : false;

  await interaction.followUp({
    content: dmSent
      ? "The match has been rescheduled and the public calendar has been updated."
      : "The match has been rescheduled and the public calendar has been updated, but I could not send a DM to the requester.",
    ephemeral: true
  });
}

async function handleLookingForGameApproval(
  interaction: ButtonInteraction,
  oldEmbed: Embed
) {
  await interaction.deferUpdate();

  const submittedByUserId = extractSubmittedByUserId(oldEmbed);
  const acceptedByUserId = extractAcceptedByUserId(oldEmbed);
  const details = getLfgMatchDetails(oldEmbed);

  const calendarMatch = await addCalendarMatch({
    homeTeam: details.challenger,
    awayTeam: details.opponent,
    scheduledAt: details.scheduledAt,
    map: details.map,
    server: details.server,
    eventType: "Looking for Game",
    notes: details.notes,
    createdBy: submittedByUserId ?? interaction.user.id
  });

  await publishCalendarToChannel(interaction.client);

  const updatedEmbed = buildApprovedEmbed(oldEmbed, `${interaction.user}`)
    .addFields({
      name: "Calendar match ID",
      value: calendarMatch.id,
      inline: true
    });

  await interaction.message.edit({
    embeds: [updatedEmbed],
    components: []
  });

  await sendAdminLog(interaction.client, {
    title: "LFG Match Approved",
    description: details.matchLabel,
    color: 0x57f287,
    fields: [
      {
        name: "Request ID",
        value: getRequestId(oldEmbed),
        inline: true
      },
      {
        name: "Calendar match ID",
        value: calendarMatch.id,
        inline: true
      },
      {
        name: "Reviewed by",
        value: `${interaction.user}`,
        inline: true
      },
      {
        name: "Scheduled at",
        value: details.scheduledAt,
        inline: true
      },
      {
        name: "Server",
        value: details.server,
        inline: true
      },
      {
        name: "Map",
        value: details.map,
        inline: true
      },
      {
        name: "Request message",
        value: interaction.message.url,
        inline: false
      }
    ]
  });

  const dmContent = [
    "Your Looking for Game match has been approved.",
    "",
    `**Match:** ${details.matchLabel}`,
    `**Scheduled at:** ${details.scheduledAt}`,
    `**Map:** ${details.map}`,
    `**Server:** ${details.server}`,
    `**Calendar match ID:** ${calendarMatch.id}`,
    "",
    "The match has been added to the league calendar."
  ].join("\n");

  const dmResults = await Promise.all([
    submittedByUserId
      ? trySendCustomDm(interaction, submittedByUserId, dmContent)
      : Promise.resolve(false),
    acceptedByUserId
      ? trySendCustomDm(interaction, acceptedByUserId, dmContent)
      : Promise.resolve(false)
  ]);

  const failedDmCount = dmResults.filter((sent) => !sent).length;

  await interaction.followUp({
    content:
      failedDmCount === 0
        ? "The LFG match has been approved, added to the calendar, and both users were notified."
        : `The LFG match has been approved and added to the calendar, but ${failedDmCount} DM notification(s) could not be sent.`,
    ephemeral: true
  });
}

async function sendLookingForGameRejectionDms(
  interaction: ModalSubmitInteraction,
  oldEmbed: Embed,
  reason: string
) {
  const submittedByUserId = extractSubmittedByUserId(oldEmbed);
  const acceptedByUserId = extractAcceptedByUserId(oldEmbed);
  const details = getLfgMatchDetails(oldEmbed);
  const content = [
    "Your Looking for Game match request has been rejected.",
    "",
    `**Match:** ${details.matchLabel}`,
    `**Scheduled at:** ${details.scheduledAt}`,
    `**Map:** ${details.map}`,
    `**Server:** ${details.server}`,
    `**Reason:** ${reason}`,
    "",
    "Please contact the administration if you need clarification."
  ].join("\n");

  const dmResults = await Promise.all([
    submittedByUserId
      ? trySendCustomDm(interaction, submittedByUserId, content)
      : Promise.resolve(false),
    acceptedByUserId
      ? trySendCustomDm(interaction, acceptedByUserId, content)
      : Promise.resolve(false)
  ]);

  return dmResults.filter((sent) => sent).length;
}

export async function handleReviewButton(interaction: ButtonInteraction) {
  if (!isReviewButton(interaction.customId)) return false;

  const memberPermissions = interaction.memberPermissions;

  if (!memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "Only server administrators can review requests.",
      ephemeral: true
    });
    return true;
  }

  const oldEmbed = interaction.message.embeds[0];

  if (!oldEmbed) {
    await interaction.reply({
      content: "This request message does not contain an embed.",
      ephemeral: true
    });
    return true;
  }

  const isRejection = interaction.customId.startsWith("reject_");

  if (isRejection) {
    const rejectionContextId = interaction.id;

    setPendingRejection(rejectionContextId, {
      channelId: interaction.channelId,
      messageId: interaction.message.id,
      reviewerId: interaction.user.id,
      reviewCustomId: interaction.customId
    });

    const modal = new ModalBuilder()
      .setCustomId(`${rejectReasonModalPrefix}${rejectionContextId}`)
      .setTitle("Rejection Reason");

    const reasonInput = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Reason")
      .setPlaceholder("Explain why this request is being rejected.")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
    );

    await interaction.showModal(modal);
    return true;
  }

  if (interaction.customId.startsWith("approve_lfg_match:")) {
    await handleLookingForGameApproval(interaction, oldEmbed);
    return true;
  }

  if (interaction.customId.startsWith("approve_match_reschedule:")) {
    await handleMatchRescheduleApproval(interaction, oldEmbed);
    return true;
  }

  if (interaction.customId.startsWith("approve_server_booking:")) {
    await handleServerBookingApproval(interaction, oldEmbed);
    return true;
  }

  const requestTitle = getRequestTitle(oldEmbed);
  const submittedByUserId = extractSubmittedByUserId(oldEmbed);
  const updatedEmbed = buildApprovedEmbed(oldEmbed, `${interaction.user}`);

  await interaction.update({
    embeds: [updatedEmbed],
    components: []
  });

  await sendAdminLog(interaction.client, {
    title: "Request Approved",
    description: requestTitle,
    color: 0x57f287,
    fields: [
      {
        name: "Request ID",
        value: getRequestId(oldEmbed),
        inline: true
      },
      {
        name: "Submitted by",
        value: findEmbedField(oldEmbed, "Submitted by") ?? "Not provided.",
        inline: true
      },
      {
        name: "Reviewed by",
        value: `${interaction.user}`,
        inline: true
      },
      {
        name: "Request message",
        value: interaction.message.url,
        inline: false
      }
    ]
  });

  let dmSent = false;

  if (submittedByUserId) {
    dmSent = await trySendApprovalDm(
      interaction,
      submittedByUserId,
      requestTitle
    );
  }

  if (!dmSent) {
    await interaction.followUp({
      content:
        "The request has been approved, but I could not send a DM to the user. They may have DMs disabled.",
      ephemeral: true
    });
  }

  return true;
}

export async function handleRejectReasonModal(
  interaction: ModalSubmitInteraction
) {
  if (!interaction.customId.startsWith(rejectReasonModalPrefix)) return false;

  const rejectionContextId = interaction.customId.slice(
    rejectReasonModalPrefix.length
  );

  const context = popPendingRejection(rejectionContextId);

  if (!context) {
    await interaction.reply({
      content: "This rejection session expired. Please click Reject again.",
      ephemeral: true
    });
    return true;
  }

  if (context.reviewerId !== interaction.user.id) {
    await interaction.reply({
      content: "This rejection session belongs to another reviewer.",
      ephemeral: true
    });
    return true;
  }

  const memberPermissions = interaction.memberPermissions;

  if (!memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "Only server administrators can reject requests.",
      ephemeral: true
    });
    return true;
  }

  const reason = interaction.fields.getTextInputValue("reason").trim();
  const channel = await interaction.client.channels.fetch(context.channelId);

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "Could not find the request channel.",
      ephemeral: true
    });
    return true;
  }

  const message = await channel.messages.fetch(context.messageId);
  const oldEmbed = message.embeds[0];

  if (!oldEmbed) {
    await interaction.reply({
      content: "This request message does not contain an embed.",
      ephemeral: true
    });
    return true;
  }

  const requestTitle = getRequestTitle(oldEmbed);
  const submittedByUserId = extractSubmittedByUserId(oldEmbed);
  const updatedEmbed = buildRejectedEmbed(oldEmbed, `${interaction.user}`, reason);

  await message.edit({
    embeds: [updatedEmbed],
    components: []
  });

  await sendAdminLog(interaction.client, {
    title: isLookingForGameReview(context.reviewCustomId)
      ? "LFG Match Rejected"
      : isMatchRescheduleReview(context.reviewCustomId)
        ? "Match Reschedule Rejected"
        : "Request Rejected",
    description: getRequestTitle(oldEmbed),
    color: 0xed4245,
    fields: [
      {
        name: "Request ID",
        value: getRequestId(oldEmbed),
        inline: true
      },
      {
        name: "Submitted by",
        value: findEmbedField(oldEmbed, "Submitted by") ?? "Not provided.",
        inline: true
      },
      {
        name: "Reviewed by",
        value: `${interaction.user}`,
        inline: true
      },
      {
        name: "Reason",
        value: reason,
        inline: false
      },
      {
        name: "Request message",
        value: message.url,
        inline: false
      }
    ]
  });

  if (isLookingForGameReview(context.reviewCustomId)) {
    const sentDmCount = await sendLookingForGameRejectionDms(
      interaction,
      oldEmbed,
      reason
    );

    await interaction.reply({
      content:
        sentDmCount === 2
          ? "The LFG match request has been rejected and both users have been notified by DM."
          : `The LFG match request has been rejected. ${sentDmCount} of 2 DM notification(s) were sent.`,
      ephemeral: true
    });

    return true;
  }

  let dmSent = false;

  if (submittedByUserId) {
    dmSent = await trySendRejectionDm(
      interaction,
      submittedByUserId,
      requestTitle,
      reason
    );
  }

  await interaction.reply({
    content: dmSent
      ? "The request has been rejected and the user has been notified by DM."
      : "The request has been rejected, but I could not send a DM to the user. They may have DMs disabled.",
    ephemeral: true
  });

  return true;
}
