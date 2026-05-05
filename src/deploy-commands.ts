import {
  ChannelType,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";
import { env } from "./config/env.js";

const eventTypeChoices = [
  { name: "Ranked", value: "Ranked" },
  { name: "Friendly", value: "Friendly" },
  { name: "Training", value: "Training" },
  { name: "Looking for Game", value: "Looking for Game" },
  { name: "Date TBA", value: "Date TBA" },
  { name: "Other", value: "Other" }
];

const botConfigDestinationChoices = [
  { name: "Public panel", value: "panelChannelId" },
  { name: "Requests", value: "requestsChannelId" },
  { name: "Admin logs", value: "logChannelId" },
  { name: "Calendar", value: "calendarChannelId" },
  { name: "Looking for Game", value: "lookingForGameChannelId" },
  { name: "Match checklists", value: "checklistChannelId" },
  { name: "Public updates", value: "updatesChannelId" }
];

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Checks if the league bot is online.")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("league-panel")
    .setDescription("Refreshes the public Arma Reforger League panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("calendar")
    .setDescription("Shows the Arma Reforger League calendar.")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("add-match")
    .setDescription("Adds a match to the league calendar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("home-team")
        .setDescription("The first team.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("away-team")
        .setDescription("The second team.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("scheduled-at")
        .setDescription("Free text, saved exactly as entered. Example: 18:00 CET.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("server")
        .setDescription("Server name or number.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("map")
        .setDescription("Map name.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("event-type")
        .setDescription("The type of event.")
        .setRequired(true)
        .addChoices(...eventTypeChoices)
    )
    .addStringOption((option) =>
      option
        .setName("notes")
        .setDescription("Optional stage, rules, or match notes.")
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("edit-match")
    .setDescription("Edits an existing match in the league calendar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("match-id")
        .setDescription("The match ID, for example: MATCH-1712345678901.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("home-team")
        .setDescription("New first team name.")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("away-team")
        .setDescription("New second team name.")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("scheduled-at")
        .setDescription("Free text, saved exactly as entered. Example: 20:00 UTC.")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("server")
        .setDescription("New server name or number.")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("map")
        .setDescription("New map name.")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("event-type")
        .setDescription("New event type.")
        .setRequired(false)
        .addChoices(...eventTypeChoices)
    )
    .addStringOption((option) =>
      option
        .setName("notes")
        .setDescription("New stage, rules, or match notes.")
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("delete-match")
    .setDescription("Deletes a match from the league calendar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("match-id")
        .setDescription("The match ID, for example: MATCH-1712345678901.")
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("refresh-calendar")
    .setDescription("Refreshes the public league calendar message.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("bot-config")
    .setDescription("Configures bot channel routing.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("Shows the current bot channel configuration.")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Sets where a bot feature should post.")
        .addStringOption((option) =>
          option
            .setName("destination")
            .setDescription("The bot feature to configure.")
            .setRequired(true)
            .addChoices(...botConfigDestinationChoices)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The text channel to use.")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Resets a setting to .env/default behavior.")
        .addStringOption((option) =>
          option
            .setName("destination")
            .setDescription("The bot feature to reset.")
            .setRequired(true)
            .addChoices(...botConfigDestinationChoices)
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("clear-all-games")
    .setDescription("Deletes all scheduled games from the league calendar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin-test")
    .setDescription("Checks if you have server administrator permissions.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON()
];

const rest = new REST({ version: "10" }).setToken(env.discordToken);

console.log("Deploying slash commands...");

await rest.put(
  Routes.applicationGuildCommands(env.discordClientId, env.discordGuildId),
  {
    body: commands
  }
);

console.log("Slash commands deployed successfully.");
