import { EmbedBuilder } from "discord.js";
import {
  getCalendarMatches,
  type CalendarEventType,
  type CalendarMatch
} from "./calendarStore.js";

const MAX_PUBLIC_CALENDAR_MATCHES = 15;

function getEventMarker(eventType: CalendarEventType) {
  if (eventType === "Ranked") return "[Ranked]";
  if (eventType === "Friendly") return "[Friendly]";
  if (eventType === "Training") return "[Training]";
  if (eventType === "Looking for Game") return "[LFG]";
  if (eventType === "Date TBA") return "[Date TBA]";

  return "[Other]";
}

function sortMatches(matches: CalendarMatch[]) {
  return [...matches].sort((a, b) => {
    return a.scheduledAt.localeCompare(b.scheduledAt);
  });
}

function buildMatchField(match: CalendarMatch, index: number) {
  const columnIndex = index % 3;
  const separatorPrefix = columnIndex === 0 ? "" : "| ";

  return {
    name: `${separatorPrefix}${index + 1}. ${getEventMarker(match.eventType)} ${match.homeTeam} vs ${match.awayTeam}`,
    value: [
      `${separatorPrefix}Date/time: ${match.scheduledAt || "Date TBA"}`,
      `${separatorPrefix}Map: ${match.map || "TBA"}`,
      `${separatorPrefix}Srv: ${match.server || "TBA"}`,
      `${separatorPrefix}ID: ${match.id}`
    ].join("\n"),
    inline: true
  };
}

function buildRowSeparatorField() {
  return {
    name: "------------------------------------------------------------",
    value: "------------------------------------------------------------",
    inline: false
  };
}

function buildCalendarFields(matches: CalendarMatch[]) {
  const fields: ReturnType<typeof buildMatchField>[] = [];

  for (const [index, match] of matches.entries()) {
    fields.push(buildMatchField(match, index));

    const rowIsComplete = (index + 1) % 3 === 0;
    const hasMoreMatches = index < matches.length - 1;

    if (rowIsComplete && hasMoreMatches) {
      fields.push(buildRowSeparatorField());
    }
  }

  return fields;
}

function buildCalendarEmbed(matches: CalendarMatch[], totalMatches: number) {
  const embed = new EmbedBuilder()
    .setTitle("Arma Reforger League Calendar")
    .setColor(0x5865f2)
    .setTimestamp();

  if (matches.length === 0) {
    return embed
      .setDescription("No matches or training sessions are currently scheduled.")
      .setColor(0xa1a1aa);
  }

  const hiddenCount = totalMatches - matches.length;

  embed
    .setDescription(
      hiddenCount > 0
        ? `Showing the next ${matches.length} of ${totalMatches} scheduled events.`
        : `${totalMatches} scheduled event${totalMatches === 1 ? "" : "s"}.`
    )
    .addFields(buildCalendarFields(matches));

  return embed;
}

export async function buildCalendarEmbeds() {
  const allMatches = await getCalendarMatches();
  const upcomingMatches = sortMatches(allMatches).slice(
    0,
    MAX_PUBLIC_CALENDAR_MATCHES
  );

  return {
    embeds: [buildCalendarEmbed(upcomingMatches, allMatches.length)],
    totalMatches: allMatches.length,
    shownMatches: upcomingMatches.length
  };
}
