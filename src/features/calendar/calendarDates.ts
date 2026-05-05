const DATE_TBA_VALUE = "Date TBA";

export function normalizeScheduledAtInput(value: string): string {
  return value.trim() || DATE_TBA_VALUE;
}

export function getDateTbaValue() {
  return DATE_TBA_VALUE;
}
