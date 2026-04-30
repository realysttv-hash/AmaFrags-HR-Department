import {
  EmbedBuilder,
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

const modalCustomId = "server_booking_modal";

export async function handleServerBookingButton(interaction: ButtonInteraction) {
  if (interaction.customId !== "server_booking") return false;

  const modal = buildRequestModal(modalCustomId, "Training Server Booking", [
    {
      customId: "team",
      label: "Team name",
      placeholder: "Example: Task Force Eagle",
      maxLength: 80
    },
    {
      customId: "date",
      label: "Training date",
      placeholder: "Example: 2026-05-04",
      maxLength: 40
    },
    {
      customId: "time",
      label: "Start and end time",
      placeholder: "Example: 19:00-21:00 UTC",
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
      placeholder: "Example: Everon, Arland, Zarichne",
      maxLength: 100
    }
  ]);

  await interaction.showModal(modal);
  return true;
}

export async function handleServerBookingModal(
  interaction: ModalSubmitInteraction
) {
  if (interaction.customId !== modalCustomId) return false;

  const team = getRequiredModalValue(interaction, "team");
  const date = getRequiredModalValue(interaction, "date");
  const time = getRequiredModalValue(interaction, "time");
  const server = getRequiredModalValue(interaction, "server");
  const map = getRequiredModalValue(interaction, "map");
  const requestId = createRequestId("SERVER");

  const embed = new EmbedBuilder()
    .setTitle("Training Server Booking Request")
    .setDescription("A new training server booking request has been submitted.")
    .setColor(0x57f287)
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
        name: "Team",
        value: team,
        inline: true
      },
      {
        name: "Training date",
        value: date,
        inline: true
      },
      {
        name: "Time",
        value: time,
        inline: true
      },
      {
        name: "Preferred server",
        value: server,
        inline: true
      },
      {
        name: "Map",
        value: truncateEmbedField(map),
        inline: true
      }
    )
    .setTimestamp();

  await sendRequestToRequestsChannel(
    interaction,
    embed,
    buildReviewRow("server_booking", requestId)
  );

  await interaction.reply({
    content: "Your training server booking request has been submitted to the administration.",
    ephemeral: true
  });

  return true;
}
