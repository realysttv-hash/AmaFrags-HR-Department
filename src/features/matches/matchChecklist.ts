import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Message,
  type ModalSubmitInteraction,
  type RoleSelectMenuInteraction,
  type StringSelectMenuInteraction
} from "discord.js";
import {
  getCalendarMatches,
  type CalendarMatch
} from "../calendar/calendarStore.js";
import { getConfiguredChannelId } from "../configuration/botConfigStore.js";
import {
  buildRequestModal,
  createRequestId,
  getOptionalModalValue,
  getRequiredModalValue,
  truncateEmbedField
} from "../requests/requestBuilder.js";
import { sendPublicUpdate } from "../updates/publicUpdates.js";

const selectCustomId = "match_checklist_select";
const modalCustomIdPrefix = "match_checklist_modal:";
const confirmCustomIdPrefix = "match_checklist_confirm:";
const confirmRoleSelectPrefix = "match_checklist_confirm_roles:";
const maxSelectableMatches = 25;
const confirmationSessionTtlMs = 15 * 60 * 1000;

type PendingChecklistConfirmation = {
  channelId: string;
  messageId: string;
  confirmerId: string;
  timeout: NodeJS.Timeout;
};

const pendingChecklistConfirmations = new Map<string, PendingChecklistConfirmation>();

function truncateSelectText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function buildMatchOption(match: CalendarMatch) {
  return new StringSelectMenuOptionBuilder()
    .setLabel(truncateSelectText(`${match.homeTeam} vs ${match.awayTeam}`, 100))
    .setDescription(
      truncateSelectText(
        `${match.scheduledAt} | ${match.map} | ${match.server}`,
        100
      )
    )
    .setValue(match.id);
}

async function getSelectedMatch(matchId: string) {
  const matches = await getCalendarMatches();

  return matches.find((match) => match.id === matchId) ?? null;
}

function buildConfirmRow(checklistId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${confirmCustomIdPrefix}${checklistId}`)
      .setLabel("Confirmed")
      .setStyle(ButtonStyle.Success)
  );
}

function setPendingChecklistConfirmation(
  confirmationContextId: string,
  context: Omit<PendingChecklistConfirmation, "timeout">
) {
  const timeout = setTimeout(() => {
    pendingChecklistConfirmations.delete(confirmationContextId);
  }, confirmationSessionTtlMs);

  timeout.unref();
  pendingChecklistConfirmations.set(confirmationContextId, {
    ...context,
    timeout
  });
}

function popPendingChecklistConfirmation(confirmationContextId: string) {
  const context = pendingChecklistConfirmations.get(confirmationContextId);

  if (!context) {
    return null;
  }

  clearTimeout(context.timeout);
  pendingChecklistConfirmations.delete(confirmationContextId);

  return context;
}

function buildConfirmRoleSelectRow(confirmationContextId: string) {
  return new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`${confirmRoleSelectPrefix}${confirmationContextId}`)
      .setPlaceholder("Select team role(s) to mention in the public update")
      .setMinValues(1)
      .setMaxValues(5)
  );
}

function findEmbedFieldValue(
  embed: { fields?: { name: string; value: string }[] },
  fieldName: string
) {
  return embed.fields?.find((field) => field.name === fieldName)?.value ?? null;
}

function extractUserIdFromValue(value: string | null): string | null {
  if (!value) return null;

  const match = value.match(/<@!?(\d+)>/);

  return match?.[1] ?? null;
}

async function trySendChecklistConfirmedDm(
  interaction: ButtonInteraction | RoleSelectMenuInteraction,
  userId: string,
  confirmedBy: string,
  checklistMessageUrl: string
) {
  try {
    const user = await interaction.client.users.fetch(userId);

    await user.send({
      content: [
        "Your match checklist has been confirmed.",
        "",
        `**Confirmed by:** ${confirmedBy}`,
        `**Checklist message:** ${checklistMessageUrl}`
      ].join("\n")
    });

    return true;
  } catch {
    return false;
  }
}

function formatRoleMentions(roleIds: string[]) {
  return roleIds.length > 0
    ? roleIds.map((roleId) => `<@&${roleId}>`).join(" ")
    : "No roles selected.";
}

async function confirmChecklist(
  interaction: ButtonInteraction | RoleSelectMenuInteraction,
  checklistMessage: Message,
  roleIds: string[]
) {
  const oldEmbed = checklistMessage.embeds[0];

  if (!oldEmbed) {
    await interaction.followUp({
      content: "This checklist message does not contain an embed.",
      ephemeral: true
    });
    return;
  }

  const oldTitle = oldEmbed.title ?? "Match Checklist";
  const alreadyConfirmed = oldTitle.toLowerCase().startsWith("confirmed -");

  if (alreadyConfirmed) {
    await interaction.followUp({
      content: "This checklist is already confirmed.",
      ephemeral: true
    });
    return;
  }

  const embedJson = oldEmbed.toJSON();
  const submittedByValue = findEmbedFieldValue(embedJson, "Submitted by");
  const submittedByUserId = extractUserIdFromValue(submittedByValue);
  const match = findEmbedFieldValue(embedJson, "Match") ?? "Unknown match";
  const scheduledAt = findEmbedFieldValue(embedJson, "Scheduled at") ?? "Date TBA";
  const team = findEmbedFieldValue(embedJson, "Team") ?? "Unknown team";

  const updatedEmbed = EmbedBuilder.from(embedJson)
    .setTitle(`Confirmed - ${oldTitle}`)
    .setColor(0x000000)
    .addFields({
      name: "Confirmed by",
      value: `${interaction.user}`,
      inline: true
    });

  await checklistMessage.edit({
    embeds: [updatedEmbed],
    components: []
  });

  const publicUpdateSent = await sendPublicUpdate(interaction.client, {
    title: "Match Checklist Confirmed",
    description: match,
    color: 0x000000,
    roleIds,
    fields: [
      {
        name: "Team",
        value: team,
        inline: true
      },
      {
        name: "Scheduled at",
        value: scheduledAt,
        inline: true
      },
      {
        name: "Checklist message",
        value: checklistMessage.url,
        inline: false
      },
      {
        name: "Mentioned roles",
        value: formatRoleMentions(roleIds),
        inline: false
      },
      {
        name: "Confirmed by",
        value: `${interaction.user}`,
        inline: true
      }
    ]
  });

  let dmSent = false;

  if (submittedByUserId) {
    dmSent = await trySendChecklistConfirmedDm(
      interaction,
      submittedByUserId,
      `${interaction.user}`,
      checklistMessage.url
    );
  }

  await interaction.followUp({
    content: [
      dmSent
        ? "Checklist confirmed and the submitter was notified by DM."
        : "Checklist confirmed, but I could not send a DM to the submitter. They may have DMs disabled.",
      publicUpdateSent
        ? "Public update posted."
        : "Public updates channel is not configured or unavailable."
    ].join("\n"),
    ephemeral: true
  });
}

export async function handleMatchChecklistButton(interaction: ButtonInteraction) {
  if (interaction.customId !== "match_checklist") return false;

  const matches = (await getCalendarMatches()).slice(0, maxSelectableMatches);

  if (matches.length === 0) {
    await interaction.reply({
      content: "There are no matches in the calendar yet.",
      ephemeral: true
    });
    return true;
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(selectCustomId)
    .setPlaceholder("Select the match you want to submit a checklist for")
    .addOptions(matches.map(buildMatchOption));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    selectMenu
  );

  await interaction.reply({
    content: "Select the match you want to submit a checklist for.",
    components: [row],
    ephemeral: true
  });

  return true;
}

export async function handleMatchChecklistSelect(
  interaction: StringSelectMenuInteraction
) {
  if (interaction.customId !== selectCustomId) return false;

  const matchId = interaction.values[0];
  const match = await getSelectedMatch(matchId);

  if (!match) {
    await interaction.update({
      content: "This match no longer exists in the calendar.",
      components: []
    });
    return true;
  }

  const modal = buildRequestModal(
    `${modalCustomIdPrefix}${match.id}`,
    "Match Checklist",
    [
      {
        customId: "team",
        label: "Which team is this checklist for?",
        placeholder: "Example: Home team / Away team / Team name",
        maxLength: 80
      },
      {
        customId: "players",
        label: "Players (one per line)",
        placeholder: "Example:\nPlayer 1\nPlayer 2\nPlayer 3",
        style: TextInputStyle.Paragraph,
        maxLength: 1000
      },
      {
        customId: "notes",
        label: "Notes (optional)",
        placeholder: "Optional notes for admins/referees.",
        style: TextInputStyle.Paragraph,
        required: false,
        maxLength: 1000
      }
    ]
  );

  await interaction.showModal(modal);
  return true;
}

export async function handleMatchChecklistModal(
  interaction: ModalSubmitInteraction
) {
  if (!interaction.customId.startsWith(modalCustomIdPrefix)) return false;

  const matchId = interaction.customId.slice(modalCustomIdPrefix.length);
  const match = await getSelectedMatch(matchId);

  if (!match) {
    await interaction.reply({
      content: "This match no longer exists in the calendar.",
      ephemeral: true
    });
    return true;
  }

  const checklistChannelId = await getConfiguredChannelId("checklistChannelId");

  if (!checklistChannelId) {
    await interaction.reply({
      content:
        "Checklist channel is not configured. Ask an administrator to set it with /bot-config (destination: Match checklists).",
      ephemeral: true
    });
    return true;
  }

  const checklistChannel = await interaction.client.channels.fetch(
    checklistChannelId
  );

  if (!checklistChannel || checklistChannel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content:
        "Checklist channel was not found or is not a regular text channel. Ask an administrator to update /bot-config.",
      ephemeral: true
    });
    return true;
  }

  const team = getRequiredModalValue(interaction, "team");
  const players = getRequiredModalValue(interaction, "players");
  const notes = getOptionalModalValue(interaction, "notes", "");
  const checklistId = createRequestId("CHECKLIST");
  const matchLabel = `${match.homeTeam} vs ${match.awayTeam}`;

  const embed = new EmbedBuilder()
    .setTitle("Match Checklist")
    .setDescription("A match participation checklist has been submitted.")
    .setColor(0x000000)
    .addFields(
      {
        name: "Checklist ID",
        value: checklistId,
        inline: true
      },
      {
        name: "Submitted by",
        value: `${interaction.user}`,
        inline: true
      },
      {
        name: "Match ID",
        value: match.id,
        inline: true
      },
      {
        name: "Match",
        value: matchLabel,
        inline: false
      },
      {
        name: "Scheduled at",
        value: match.scheduledAt,
        inline: true
      },
      {
        name: "Server",
        value: match.server,
        inline: true
      },
      {
        name: "Map",
        value: match.map,
        inline: true
      },
      {
        name: "Team",
        value: truncateEmbedField(team),
        inline: true
      },
      {
        name: "Players",
        value: truncateEmbedField(players),
        inline: false
      }
    )
    .setTimestamp();

  const trimmedNotes = notes.trim();

  if (trimmedNotes) {
    embed.addFields({
      name: "Notes",
      value: truncateEmbedField(trimmedNotes),
      inline: false
    });
  }

  const message = await checklistChannel.send({
    embeds: [embed],
    components: [buildConfirmRow(checklistId)]
  });

  await interaction.reply({
    content: `Checklist submitted: ${message.url}`,
    ephemeral: true
  });

  return true;
}

export async function handleMatchChecklistConfirmButton(
  interaction: ButtonInteraction
) {
  if (!interaction.customId.startsWith(confirmCustomIdPrefix)) return false;

  const memberPermissions = interaction.memberPermissions;

  if (!memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({
      content: "Only staff can confirm match checklists.",
      ephemeral: true
    });
    return true;
  }

  const oldEmbed = interaction.message.embeds[0];

  if (!oldEmbed) {
    await interaction.reply({
      content: "This checklist message does not contain an embed.",
      ephemeral: true
    });
    return true;
  }

  const oldTitle = oldEmbed.title ?? "Match Checklist";
  const alreadyConfirmed = oldTitle.toLowerCase().startsWith("confirmed -");

  if (alreadyConfirmed) {
    await interaction.reply({
      content: "This checklist is already confirmed.",
      ephemeral: true
    });
    return true;
  }

  const confirmationContextId = interaction.id;

  setPendingChecklistConfirmation(confirmationContextId, {
    channelId: interaction.channelId,
    messageId: interaction.message.id,
    confirmerId: interaction.user.id
  });

  await interaction.reply({
    content: "Select the team role(s) to mention in the public checklist confirmation.",
    components: [buildConfirmRoleSelectRow(confirmationContextId)],
    ephemeral: true
  });

  return true;
}

export async function handleMatchChecklistConfirmRoleSelect(
  interaction: RoleSelectMenuInteraction
) {
  if (!interaction.customId.startsWith(confirmRoleSelectPrefix)) return false;

  const confirmationContextId = interaction.customId.slice(
    confirmRoleSelectPrefix.length
  );
  const context = popPendingChecklistConfirmation(confirmationContextId);

  if (!context) {
    await interaction.update({
      content: "This checklist confirmation session expired. Please click Confirmed again.",
      components: []
    });
    return true;
  }

  if (context.confirmerId !== interaction.user.id) {
    await interaction.update({
      content: "This checklist confirmation session belongs to another staff member.",
      components: []
    });
    return true;
  }

  const memberPermissions = interaction.memberPermissions;

  if (!memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.update({
      content: "Only staff can confirm match checklists.",
      components: []
    });
    return true;
  }

  const channel = await interaction.client.channels.fetch(context.channelId);

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.update({
      content: "Could not find the checklist channel.",
      components: []
    });
    return true;
  }

  const checklistMessage = await channel.messages.fetch(context.messageId);

  await interaction.update({
    content: "Checklist confirmation is being processed.",
    components: []
  });

  await confirmChecklist(interaction, checklistMessage, interaction.values);

  return true;
}
