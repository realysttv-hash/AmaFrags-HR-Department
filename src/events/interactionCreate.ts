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
  handleServerBookingButton,
  handleServerBookingModal
} from "../features/serverBookings/serverBooking.js";
import {
  handleTransferRequestButton,
  handleTransferRequestModal
} from "../features/transfers/transferRequest.js";
import {
  handleRejectReasonModal,
  handleReviewButton
} from "../features/requests/reviewButtons.js";
import {
  handleAcceptLookingForGameModal,
  handleAcceptLookingForGameButton,
  handleLookingForGameButton,
  handleLookingForGameModal
} from "../features/lookingForGame/lookingForGame.js";
import { handleBotConfigCommand } from "../features/configuration/botConfig.js";

type CommandHandler = (interaction: ChatInputCommandInteraction) => Promise<unknown>;

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
  handleServerBookingButton,
  handleTransferRequestButton,
  handleLookingForGameButton,
  handleAcceptLookingForGameButton,
  handleCalendarButton
];

const modalHandlers = [
  handleRejectReasonModal,
  handleTeamRegistrationModal,
  handleMatchRescheduleModal,
  handleServerBookingModal,
  handleTransferRequestModal,
  handleLookingForGameModal,
  handleAcceptLookingForGameModal
];

const selectMenuHandlers = [
  handleMatchRescheduleSelect
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

    if (interaction.isModalSubmit()) {
      for (const handler of modalHandlers) {
        if (await handler(interaction)) return;
      }
    }
  } catch (error) {
    console.error("Interaction error:", error);

    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "Something went wrong while processing this interaction.",
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: "Something went wrong while processing this interaction.",
          ephemeral: true
        });
      }
    }
  }
}
