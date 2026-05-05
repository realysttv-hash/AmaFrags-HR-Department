const DATE_TBA_VALUE = "Date TBA";
const SCHEDULED_AT_PATTERN =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?(?:\s*(UTC|CET|CEST))?$/i;

export type ScheduledAtParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  zone: string;
};

function padDatePart(value: number) {
  return value.toString().padStart(2, "0");
}

function isDateTbaInput(value: string) {
  return /^(date\s*tba|tba|to be announced)$/i.test(value.trim());
}

function isValidDateParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
) {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute
  );
}

export function formatCalendarDateTime(date: Date, zone = "UTC") {
  const year = date.getUTCFullYear();
  const month = padDatePart(date.getUTCMonth() + 1);
  const day = padDatePart(date.getUTCDate());
  const hour = padDatePart(date.getUTCHours());
  const minute = padDatePart(date.getUTCMinutes());

  return `${year}-${month}-${day} ${hour}:${minute} ${zone.toUpperCase()}`;
}

export function parseScheduledAtParts(value: string): ScheduledAtParts | null {
  const trimmedValue = value.trim();

  if (!trimmedValue || isDateTbaInput(trimmedValue)) {
    return null;
  }

  const match = trimmedValue.match(SCHEDULED_AT_PATTERN);

  if (!match) {
    return null;
  }

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue, zoneValue] =
    match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = hourValue ? Number(hourValue) : 0;
  const minute = minuteValue ? Number(minuteValue) : 0;
  const zone = (zoneValue ?? "UTC").toUpperCase();

  if (!isValidDateParts(year, month, day, hour, minute)) {
    return null;
  }

  return { year, month, day, hour, minute, zone };
}

export function parseScheduledAtDate(value: string): Date | null {
  const parts = parseScheduledAtParts(value);

  if (parts) {
    return new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
    );
  }

  const trimmedValue = value.trim();
  const isoDate = new Date(trimmedValue);

  if (
    /^\d{4}-\d{2}-\d{2}T/.test(trimmedValue) &&
    !Number.isNaN(isoDate.getTime())
  ) {
    return isoDate;
  }

  return null;
}

export function normalizeScheduledAtInput(value: string): string | null {
  if (isDateTbaInput(value)) {
    return DATE_TBA_VALUE;
  }

  const parts = parseScheduledAtParts(value);

  if (!parts) {
    return null;
  }

  return `${parts.year}-${padDatePart(parts.month)}-${padDatePart(parts.day)} ${padDatePart(
    parts.hour
  )}:${padDatePart(parts.minute)} ${parts.zone}`;
}

export function getDateTbaValue() {
  return DATE_TBA_VALUE;
}
