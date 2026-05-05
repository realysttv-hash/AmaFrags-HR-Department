import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Interaction
} from "discord.js";
import {
  handleAddMatchCommand,
  handleCalendarButton,
  handleCalendarCommand,
  handleClearAllGamesCommand,
  handleDeleteMatchCommand,
  handleEditMatchCommand,
  handleRefreshCalendarCommand
} from "../features/calendar/calendar.js";
import { handleLeaguePanelCommand } from "../features/panel/leaguePanel.js";
import {
  handleTeamRegistrationButton,
  handleTeamRegistrationModal
} from "../features/teams/teamRegistration.js";
import {
  handleMatchRescheduleButton,
  handleMatchRescheduleModal,
  handleMatchRescheduleSelect
} from "../features/matches/matchReschedule.js";
import {
  handleMatchChecklistButton,
  handleMatchChecklistConfirmButton,
  handleMatchChecklistConfirmRoleSelect,
  handleMatchChecklistModal,
  handleMatchChecklistSelect
} from "../features/matches/matchChecklist.js";
import {
  handleServerBookingButton,
  handleServerBookingModal
} from "../features/serverBookings/serverBooking.js";
import {
  handleTransferRequestButton,
  handleTransferRequestModal
} from "../features/transfers/transferRequest.js";
import {
  handleApprovalRoleSelect,
  handleRejectReasonModal,
  handleReviewButton
} from "../features/requests/reviewButtons.js";
import {
  handleAcceptLookingForGameModal,
  handleAcceptLookingForGameButton,
  handleCancelLookingForGameButton,
  handleLookingForGameButton,
  handleLookingForGameModal
} from "../features/lookingForGame/lookingForGame.js";
import { handleBotConfigCommand } from "../features/configuration/botConfig.js";

type CommandHandler = (interaction: ChatInputCommandInteraction) => Promise<unknown>;

function isDiscordApiErrorCode(error: unknown, code: number) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === code
  );
}

async function replyWithInteractionError(interaction: Interaction) {
  if (!interaction.isRepliable()) return;

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "Something went wrong while processing this interaction.",
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: "Something went wrong while processing this interaction.",
      ephemeral: true
    });
  } catch (replyError) {
    if (isDiscordApiErrorCode(replyError, 40060)) {
      return;
    }

    throw replyError;
  }
}

async function handlePingCommand(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    content: "Pong! The league bot is online.",
    ephemeral: true
  });
}

async function handleAdminTestCommand(interaction: ChatInputCommandInteraction) {
  const memberPermissions = interaction.memberPermissions;

  if (!memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "Only server administrators can use this command.",
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: "Admin check passed. You are a server administrator.",
    ephemeral: true
  });
}

const commandHandlers = new Map<string, CommandHandler>([
  ["ping", handlePingCommand],
  ["league-panel", handleLeaguePanelCommand],
  ["calendar", handleCalendarCommand],
  ["add-match", handleAddMatchCommand],
  ["edit-match", handleEditMatchCommand],
  ["delete-match", handleDeleteMatchCommand],
  ["clear-all-games", handleClearAllGamesCommand],
  ["refresh-calendar", handleRefreshCalendarCommand],
  ["bot-config", handleBotConfigCommand],
  ["admin-test", handleAdminTestCommand]
]);

const buttonHandlers = [
  handleReviewButton,
  handleTeamRegistrationButton,
  handleMatchRescheduleButton,
  handleMatchChecklistButton,
  handleMatchChecklistConfirmButton,
  handleServerBookingButton,
  handleTransferRequestButton,
  handleLookingForGameButton,
  handleAcceptLookingForGameButton,
  handleCancelLookingForGameButton,
  handleCalendarButton
];

const modalHandlers = [
  handleRejectReasonModal,
  handleTeamRegistrationModal,
  handleMatchRescheduleModal,
  handleMatchChecklistModal,
  handleServerBookingModal,
  handleTransferRequestModal,
  handleLookingForGameModal,
  handleAcceptLookingForGameModal
];

const selectMenuHandlers = [
  handleMatchRescheduleSelect,
  handleMatchChecklistSelect
];

const roleSelectMenuHandlers = [
  handleApprovalRoleSelect,
  handleMatchChecklistConfirmRoleSelect
];

export async function onInteractionCreate(interaction: Interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      const handler = commandHandlers.get(interaction.commandName);

      if (handler) {
        await handler(interaction);
      }

      return;
    }

    if (interaction.isButton()) {
      for (const handler of buttonHandlers) {
        if (await handler(interaction)) return;
      }
    }

    if (interaction.isStringSelectMenu()) {
      for (const handler of selectMenuHandlers) {
        if (await handler(interaction)) return;
      }
    }

    if (interaction.isRoleSelectMenu()) {
      for (const handler of roleSelectMenuHandlers) {
        if (await handler(interaction)) return;
      }
    }

    if (interaction.isModalSubmit()) {
      for (const handler of modalHandlers) {
        if (await handler(interaction)) return;
      }
    }
  } catch (error) {
    console.error("Interaction error:", error);

    await replyWithInteractionError(interaction);
  }
}
