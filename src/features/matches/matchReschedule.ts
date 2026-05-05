import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction
} from "discord.js";
import { normalizeScheduledAtInput } from "../calendar/calendarDates.js";
import {
  getCalendarMatches,
  type CalendarMatch
} from "../calendar/calendarStore.js";
import {
  buildRequestModal,
  buildReviewRow,
  createRequestId,
  getRequiredModalValue,
  truncateEmbedField
} from "../requests/requestBuilder.js";
import { sendRequestToRequestsChannel } from "../requests/sendRequest.js";

const selectCustomId = "match_reschedule_select";
const modalCustomIdPrefix = "match_reschedule_modal:";
const maxSelectableMatches = 25;

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

function buildInvalidDateMessage(value: string) {
  return [
    `Invalid proposed date: \`${value}\`.`,
    "Use a format like `2026-05-04 20:00 UTC`, `2026-05-04 21:00 CET`, `2026-05-04 22:00 CEST`, or `Date TBA`."
  ].join("\n");
}

async function getSelectedMatch(matchId: string) {
  const matches = await getCalendarMatches();

  return matches.find((match) => match.id === matchId) ?? null;
}

export async function handleMatchRescheduleButton(interaction: ButtonInteraction) {
  if (interaction.customId !== "match_reschedule") return false;

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
    .setPlaceholder("Select the match you want to reschedule")
    .addOptions(matches.map(buildMatchOption));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    selectMenu
  );

  await interaction.reply({
    content: "Select the match you want to reschedule.",
    components: [row],
    ephemeral: true
  });

  return true;
}

export async function handleMatchRescheduleSelect(
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
    "Match Reschedule Request",
    [
      {
        customId: "proposed_date",
        label: "Proposed new date and time",
        placeholder: "Example: 2026-05-05 21:00 UTC",
        maxLength: 80
      },
      {
        customId: "opponent_consent",
        label: "Has the opponent agreed?",
        placeholder: "Yes / No / Pending + short explanation",
        maxLength: 120
      },
      {
        customId: "reason",
        label: "Reason",
        placeholder: "Explain why the match should be rescheduled.",
        style: TextInputStyle.Paragraph,
        maxLength: 1000
      }
    ]
  );

  await interaction.showModal(modal);
  return true;
}

export async function handleMatchRescheduleModal(
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

  const proposedDateRaw = getRequiredModalValue(interaction, "proposed_date");
  const proposedDate = normalizeScheduledAtInput(proposedDateRaw);

  if (!proposedDate) {
    await interaction.reply({
      content: buildInvalidDateMessage(proposedDateRaw),
      ephemeral: true
    });
    return true;
  }

  const opponentConsent = getRequiredModalValue(interaction, "opponent_consent");
  const reason = getRequiredModalValue(interaction, "reason");
  const requestId = createRequestId("MATCH");
  const matchLabel = `${match.homeTeam} vs ${match.awayTeam}`;

  const embed = new EmbedBuilder()
    .setTitle("Match Reschedule Request")
    .setDescription("A calendar match reschedule request has been submitted.")
    .setColor(0x9b59b6)
    .addFields(
      {
        name: "Request ID",
        value: requestId,
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
        name: "Current date and time",
        value: match.scheduledAt,
        inline: true
      },
      {
        name: "Proposed new date and time",
        value: proposedDate,
        inline: true
      },
      {
        name: "Server",
        value: match.server,
        inline: true
      },
      {
        name: "Event type",
        value: match.eventType,
        inline: true
      },
      {
        name: "Opponent consent",
        value: opponentConsent,
        inline: false
      },
      {
        name: "Reason",
        value: truncateEmbedField(reason),
        inline: false
      }
    )
    .setTimestamp();

  await sendRequestToRequestsChannel(
    interaction,
    embed,
    buildReviewRow("match_reschedule", requestId)
  );

  await interaction.reply({
    content: "Your match reschedule request has been submitted to the administration.",
    ephemeral: true
  });

  return true;
}
