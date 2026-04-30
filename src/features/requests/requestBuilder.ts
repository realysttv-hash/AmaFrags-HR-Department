import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction
} from "discord.js";

export type RequestReviewKind =
  | "team_registration"
  | "match_reschedule"
  | "server_booking"
  | "transfer_request"
  | "lfg_match";

export const reviewButtonPrefixes: string[] = [
  "approve_team_registration:",
  "reject_team_registration:",
  "approve_match_reschedule:",
  "reject_match_reschedule:",
  "approve_server_booking:",
  "reject_server_booking:",
  "approve_transfer_request:",
  "reject_transfer_request:",
  "approve_lfg_match:",
  "reject_lfg_match:"
];

type ModalFieldConfig = {
  customId: string;
  label: string;
  placeholder: string;
  style?: TextInputStyle;
  required?: boolean;
  maxLength: number;
};

export function createRequestId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

export function buildRequestModal(
  customId: string,
  title: string,
  fields: ModalFieldConfig[]
) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  modal.addComponents(
    ...fields.map((field) => {
      const input = new TextInputBuilder()
        .setCustomId(field.customId)
        .setLabel(field.label)
        .setPlaceholder(field.placeholder)
        .setStyle(field.style ?? TextInputStyle.Short)
        .setRequired(field.required ?? true)
        .setMaxLength(field.maxLength);

      return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
    })
  );

  return modal;
}

export function buildReviewRow(kind: RequestReviewKind, requestId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_${kind}:${requestId}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`reject_${kind}:${requestId}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger)
  );
}

export function getRequiredModalValue(
  interaction: ModalSubmitInteraction,
  customId: string
) {
  return interaction.fields.getTextInputValue(customId).trim();
}

export function getOptionalModalValue(
  interaction: ModalSubmitInteraction,
  customId: string,
  fallback: string
) {
  return interaction.fields.getTextInputValue(customId).trim() || fallback;
}

export function truncateEmbedField(value: string, fallback = "Not provided.") {
  const cleanedValue = value.trim();

  if (!cleanedValue) {
    return fallback;
  }

  return cleanedValue.slice(0, 1024);
}
