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
  getRequiredModalValue,
  truncateEmbedField
} from "../requests/requestBuilder.js";
import { sendRequestToRequestsChannel } from "../requests/sendRequest.js";

const modalCustomId = "transfer_request_modal";

export async function handleTransferRequestButton(interaction: ButtonInteraction) {
  if (interaction.customId !== "transfer_request") return false;

  const modal = buildRequestModal(modalCustomId, "Player Transfer Request", [
    {
      customId: "player",
      label: "Player Discord name or ID",
      placeholder: "Example: @PlayerName or 123456789012345678",
      maxLength: 100
    },
    {
      customId: "current_team",
      label: "Current team",
      placeholder: "Example: Task Force Eagle",
      maxLength: 80
    },
    {
      customId: "new_team",
      label: "New team",
      placeholder: "Example: Bravo Squad",
      maxLength: 80
    },
    {
      customId: "approvals",
      label: "Captain approvals",
      placeholder: "Example: Both captains agreed / Pending",
      maxLength: 160
    },
    {
      customId: "reason",
      label: "Reason",
      placeholder: "Explain why this transfer is being requested.",
      style: TextInputStyle.Paragraph,
      maxLength: 1000
    }
  ]);

  await interaction.showModal(modal);
  return true;
}

export async function handleTransferRequestModal(
  interaction: ModalSubmitInteraction
) {
  if (interaction.customId !== modalCustomId) return false;

  const player = getRequiredModalValue(interaction, "player");
  const currentTeam = getRequiredModalValue(interaction, "current_team");
  const newTeam = getRequiredModalValue(interaction, "new_team");
  const approvals = getRequiredModalValue(interaction, "approvals");
  const reason = getRequiredModalValue(interaction, "reason");
  const requestId = createRequestId("TRANSFER");

  const embed = new EmbedBuilder()
    .setTitle("Player Transfer Request")
    .setDescription("A new player transfer request has been submitted.")
    .setColor(0xf1c40f)
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
        name: "Player",
        value: player,
        inline: false
      },
      {
        name: "Current team",
        value: currentTeam,
        inline: true
      },
      {
        name: "New team",
        value: newTeam,
        inline: true
      },
      {
        name: "Captain approvals",
        value: approvals,
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
    buildReviewRow("transfer_request", requestId)
  );

  await interaction.reply({
    content: "Your player transfer request has been submitted to the administration.",
    ephemeral: true
  });

  return true;
}
