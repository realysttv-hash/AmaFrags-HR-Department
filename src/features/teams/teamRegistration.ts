import {
  EmbedBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction
} from "discord.js";
import {
  buildRequestModal,
  buildReviewRow,
  createRequestId,
  getOptionalModalValue,
  getRequiredModalValue,
  truncateEmbedField
} from "../requests/requestBuilder.js";
import { sendRequestToRequestsChannel } from "../requests/sendRequest.js";

const modalCustomId = "team_register_modal";

export async function handleTeamRegistrationButton(interaction: ButtonInteraction) {
  if (interaction.customId !== "team_register") return false;

  const modal = buildRequestModal(modalCustomId, "Team Registration", [
    {
      customId: "team_name",
      label: "Team name",
      placeholder: "Example: Task Force Eagle",
      maxLength: 80
    },
    {
      customId: "team_tag",
      label: "Team tag",
      placeholder: "Example: TFE",
      maxLength: 12
    },
    {
      customId: "captain",
      label: "Captain Discord name or ID",
      placeholder: "Example: @Kowal or 123456789012345678",
      maxLength: 100
    },
    {
      customId: "roster",
      label: "Player roster",
      placeholder: "List all players, one per line if possible.",
      style: TextInputStyle.Paragraph,
      maxLength: 1000
    },
    {
      customId: "notes",
      label: "Additional notes",
      placeholder: "Website, logo link, timezone, preferred contact, etc.",
      style: TextInputStyle.Paragraph,
      required: false,
      maxLength: 1000
    }
  ]);

  await interaction.showModal(modal);
  return true;
}

export async function handleTeamRegistrationModal(
  interaction: ModalSubmitInteraction
) {
  if (interaction.customId !== modalCustomId) return false;

  const teamName = getRequiredModalValue(interaction, "team_name");
  const teamTag = getRequiredModalValue(interaction, "team_tag");
  const captain = getRequiredModalValue(interaction, "captain");
  const roster = getRequiredModalValue(interaction, "roster");
  const notes = getOptionalModalValue(
    interaction,
    "notes",
    "No additional notes provided."
  );
  const requestId = createRequestId("TEAM");

  const embed = new EmbedBuilder()
    .setTitle("Team Registration Request")
    .setDescription("A new team registration request has been submitted.")
    .setColor(0x5865f2)
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
        name: "Team name",
        value: teamName,
        inline: true
      },
      {
        name: "Team tag",
        value: teamTag,
        inline: true
      },
      {
        name: "Captain",
        value: captain,
        inline: false
      },
      {
        name: "Roster",
        value: truncateEmbedField(roster),
        inline: false
      },
      {
        name: "Additional notes",
        value: truncateEmbedField(notes),
        inline: false
      }
    )
    .setTimestamp();

  await sendRequestToRequestsChannel(
    interaction,
    embed,
    buildReviewRow("team_registration", requestId)
  );

  await interaction.reply({
    content: "Your team registration request has been submitted to the administration.",
    ephemeral: true
  });

  return true;
}
