import { EmbedBuilder } from "discord.js";
import { parseScheduledAtDate } from "./calendarDates.js";
import {
  getCalendarMatches,
  type CalendarEventType,
  type CalendarMatch
} from "./calendarStore.js";

const MAX_PUBLIC_CALENDAR_MATCHES = 15;
const CALENDAR_DAYS_RANGE = 365;

function getEventMarker(eventType: CalendarEventType) {
  if (eventType === "Ranked") return "[Ranked]";
  if (eventType === "Friendly") return "[Friendly]";
  if (eventType === "Training") return "[Training]";
  if (eventType === "Looking for Game") return "[LFG]";
  if (eventType === "Date TBA") return "[Date TBA]";

  return "[Other]";
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(date);
}

function getDateAndTime(match: CalendarMatch) {
  const parsedDate = parseScheduledAtDate(match.scheduledAt);

  if (!parsedDate) {
    return {
      date: match.scheduledAt,
      time: "TBA"
    };
  }

  return {
    date: formatDate(parsedDate),
    time: `${formatTime(parsedDate)} UTC`
  };
}

function isWithinCalendarRange(match: CalendarMatch) {
  const parsedDate = parseScheduledAtDate(match.scheduledAt);

  if (!parsedDate) {
    return true;
  }

  const now = new Date();
  const rangeStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const rangeEnd = new Date(
    now.getTime() + CALENDAR_DAYS_RANGE * 24 * 60 * 60 * 1000
  );

  return parsedDate >= rangeStart && parsedDate <= rangeEnd;
}

function sortMatches(matches: CalendarMatch[]) {
  return [...matches].sort((a, b) => {
    const dateA = parseScheduledAtDate(a.scheduledAt);
    const dateB = parseScheduledAtDate(b.scheduledAt);

    if (dateA && dateB) {
      return dateA.getTime() - dateB.getTime();
    }

    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;

    return a.scheduledAt.localeCompare(b.scheduledAt);
  });
}

function buildMatchField(match: CalendarMatch, index: number) {
  const dateAndTime = getDateAndTime(match);
  const columnIndex = index % 3;
  const separatorPrefix = columnIndex === 0 ? "" : "| ";

  return {
    name: `${separatorPrefix}${index + 1}. ${getEventMarker(match.eventType)} ${match.homeTeam} vs ${match.awayTeam}`,
    value: [
      `${separatorPrefix}Date: ${dateAndTime.date}`,
      `${separatorPrefix}Hour: ${dateAndTime.time}`,
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
  const matchesWithinRange = allMatches.filter(isWithinCalendarRange);
  const upcomingMatches = sortMatches(matchesWithinRange).slice(
    0,
    MAX_PUBLIC_CALENDAR_MATCHES
  );

  return {
    embeds: [buildCalendarEmbed(upcomingMatches, matchesWithinRange.length)],
    totalMatches: matchesWithinRange.length,
    shownMatches: upcomingMatches.length
  };
}
