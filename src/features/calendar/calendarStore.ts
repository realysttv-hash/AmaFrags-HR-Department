import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type CalendarEventType =
  | "Ranked"
  | "Friendly"
  | "Training"
  | "Looking for Game"
  | "Date TBA"
  | "Other";

export type CalendarMatch = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  scheduledAt: string;
  map: string;
  server: string;
  eventType: CalendarEventType;
  notes: string;
  createdBy: string;
  createdAt: string;
};

export type CalendarState = {
  calendarMessageId: string | null;
  matches: CalendarMatch[];
};

export type CalendarMatchUpdate = Partial<
  Pick<
    CalendarMatch,
    | "homeTeam"
    | "awayTeam"
    | "scheduledAt"
    | "map"
    | "server"
    | "eventType"
    | "notes"
  >
>;

const dataDirectoryPath = path.join(process.cwd(), "data");
const calendarFilePath = path.join(dataDirectoryPath, "calendar.json");
let calendarOperationQueue: Promise<void> = Promise.resolve();

const defaultCalendarState: CalendarState = {
  calendarMessageId: null,
  matches: []
};

function isLegacyCalendarArray(data: unknown): data is CalendarMatch[] {
  return Array.isArray(data);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

async function runWithCalendarLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = calendarOperationQueue.then(operation, operation);

  calendarOperationQueue = result.then(
    () => undefined,
    () => undefined
  );

  return result;
}

function inferLegacyEventType(match: Partial<CalendarMatch>): CalendarEventType {
  const text = `${match.homeTeam ?? ""} ${match.awayTeam ?? ""} ${match.notes ?? ""}`.toLowerCase();

  if (text.includes("friendly")) return "Friendly";
  if (text.includes("training")) return "Training";
  if (text.includes("looking for game") || text.includes("lfg")) {
    return "Looking for Game";
  }
  if (text.includes("tba")) return "Date TBA";
  if (text.includes("ranked") || text.includes("ranking")) return "Ranked";

  return "Ranked";
}

function inferLegacyMap(match: Partial<CalendarMatch>) {
  const notes = match.notes?.trim();

  if (!notes || notes === "No additional notes.") {
    return "TBA";
  }

  return notes.length <= 80 ? notes : "TBA";
}

function normalizeMatch(match: Partial<CalendarMatch>): CalendarMatch {
  return {
    id: match.id ?? `MATCH-${randomUUID()}`,
    homeTeam: match.homeTeam ?? "Unknown Team",
    awayTeam: match.awayTeam ?? "Unknown Team",
    scheduledAt: match.scheduledAt ?? "Date TBA",
    map: match.map ?? inferLegacyMap(match),
    server: match.server ?? "TBA",
    eventType: match.eventType ?? inferLegacyEventType(match),
    notes: match.notes ?? "No additional notes.",
    createdBy: match.createdBy ?? "unknown",
    createdAt: match.createdAt ?? new Date().toISOString()
  };
}

async function ensureCalendarFileExists() {
  await mkdir(dataDirectoryPath, { recursive: true });

  try {
    await readFile(calendarFilePath, "utf8");
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }

    await writeFile(
      calendarFilePath,
      JSON.stringify(defaultCalendarState, null, 2),
      "utf8"
    );
  }
}

async function readCalendarState(): Promise<{
  state: CalendarState;
  shouldPersist: boolean;
}> {
  await ensureCalendarFileExists();

  const rawData = await readFile(calendarFilePath, "utf8");
  let parsedData: CalendarState | CalendarMatch[];

  try {
    parsedData = JSON.parse(rawData) as CalendarState | CalendarMatch[];
  } catch (error) {
    throw new Error(`Calendar data file contains invalid JSON: ${calendarFilePath}`, {
      cause: error
    });
  }

  if (isLegacyCalendarArray(parsedData)) {
    return {
      state: {
        calendarMessageId: null,
        matches: parsedData.map(normalizeMatch)
      },
      shouldPersist: true
    };
  }

  const normalizedState: CalendarState = {
    calendarMessageId: parsedData.calendarMessageId ?? null,
    matches: (parsedData.matches ?? []).map(normalizeMatch)
  };

  return {
    state: normalizedState,
    shouldPersist: false
  };
}

async function writeCalendarState(state: CalendarState) {
  await ensureCalendarFileExists();

  const temporaryFilePath = `${calendarFilePath}.${process.pid}.${Date.now()}.tmp`;

  await writeFile(temporaryFilePath, JSON.stringify(state, null, 2), "utf8");
  await rename(temporaryFilePath, calendarFilePath);
}

export async function getCalendarState(): Promise<CalendarState> {
  return runWithCalendarLock(async () => {
    const { state, shouldPersist } = await readCalendarState();

    if (shouldPersist) {
      await writeCalendarState(state);
    }

    return state;
  });
}

export async function saveCalendarState(state: CalendarState) {
  await runWithCalendarLock(async () => {
    await writeCalendarState(state);
  });
}

export async function getCalendarMatches(): Promise<CalendarMatch[]> {
  const state = await getCalendarState();

  return [...state.matches].sort((a, b) => {
    return a.scheduledAt.localeCompare(b.scheduledAt);
  });
}

export async function addCalendarMatch(
  match: Omit<CalendarMatch, "id" | "createdAt">
) {
  return runWithCalendarLock(async () => {
    const { state } = await readCalendarState();

    const newMatch: CalendarMatch = {
      id: `MATCH-${Date.now()}-${randomUUID().slice(0, 8)}`,
      ...match,
      createdAt: new Date().toISOString()
    };

    state.matches.push(newMatch);

    await writeCalendarState(state);

    return newMatch;
  });
}

export async function editCalendarMatch(
  matchId: string,
  update: CalendarMatchUpdate
) {
  return runWithCalendarLock(async () => {
    const { state } = await readCalendarState();

    const matchIndex = state.matches.findIndex((match) => match.id === matchId);

    if (matchIndex === -1) {
      return null;
    }

    const existingMatch = state.matches[matchIndex];

    const updatedMatch: CalendarMatch = {
      ...existingMatch,
      ...update
    };

    state.matches[matchIndex] = updatedMatch;

    await writeCalendarState(state);

    return updatedMatch;
  });
}

export async function deleteCalendarMatch(matchId: string) {
  return runWithCalendarLock(async () => {
    const { state } = await readCalendarState();

    const matchToDelete = state.matches.find((match) => match.id === matchId);

    if (!matchToDelete) {
      return null;
    }

    state.matches = state.matches.filter((match) => match.id !== matchId);

    await writeCalendarState(state);

    return matchToDelete;
  });
}

export async function clearCalendarMatches() {
  return runWithCalendarLock(async () => {
    const { state } = await readCalendarState();
    const deletedCount = state.matches.length;

    state.matches = [];

    await writeCalendarState(state);

    return deletedCount;
  });
}

export async function getCalendarMessageId() {
  const state = await getCalendarState();

  return state.calendarMessageId;
}

export async function setCalendarMessageId(messageId: string) {
  await runWithCalendarLock(async () => {
    const { state } = await readCalendarState();

    state.calendarMessageId = messageId;

    await writeCalendarState(state);
  });
}
