const DATE_TBA_VALUE = "Date TBA";

const timezoneOffsets: Record<string, number> = {
  UTC: 0,
  CET: 1,
  CEST: 2
};

function padDatePart(value: number) {
  return value.toString().padStart(2, "0");
}

function isDateTbaInput(value: string) {
  return /^(date\s*tba|tba|to be announced)$/i.test(value.trim());
}

function isValidUtcDateParts(
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

export function formatCalendarDateTime(date: Date) {
  const year = date.getUTCFullYear();
  const month = padDatePart(date.getUTCMonth() + 1);
  const day = padDatePart(date.getUTCDate());
  const hour = padDatePart(date.getUTCHours());
  const minute = padDatePart(date.getUTCMinutes());

  return `${year}-${month}-${day} ${hour}:${minute} UTC`;
}

export function parseScheduledAtDate(value: string): Date | null {
  const trimmedValue = value.trim();

  if (!trimmedValue || isDateTbaInput(trimmedValue)) {
    return null;
  }

  const isoDate = new Date(trimmedValue);

  if (
    /^\d{4}-\d{2}-\d{2}T/.test(trimmedValue) &&
    !Number.isNaN(isoDate.getTime())
  ) {
    return isoDate;
  }

  const match = trimmedValue.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?(?:\s*(UTC|CET|CEST))?$/i
  );

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
  const offset = timezoneOffsets[zone];

  if (offset === undefined) {
    return null;
  }

  if (!isValidUtcDateParts(year, month, day, hour, minute)) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day, hour - offset, minute));
}

export function normalizeScheduledAtInput(value: string): string | null {
  if (isDateTbaInput(value)) {
    return DATE_TBA_VALUE;
  }

  const date = parseScheduledAtDate(value);

  if (!date) {
    return null;
  }

  return formatCalendarDateTime(date);
}

export function getDateTbaValue() {
  return DATE_TBA_VALUE;
}
