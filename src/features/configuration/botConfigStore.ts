import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";

export const configurableChannelKeys = [
  "panelChannelId",
  "requestsChannelId",
  "logChannelId",
  "calendarChannelId",
  "lookingForGameChannelId"
] as const;

export type ConfigurableChannelKey = (typeof configurableChannelKeys)[number];

export type BotConfig = Partial<Record<ConfigurableChannelKey, string>>;

export const configurableChannelLabels: Record<ConfigurableChannelKey, string> = {
  panelChannelId: "Public panel",
  requestsChannelId: "Requests",
  logChannelId: "Admin logs",
  calendarChannelId: "Calendar",
  lookingForGameChannelId: "Looking for Game"
};

type ConfigEntry = {
  key: ConfigurableChannelKey;
  label: string;
  channelId: string | null;
  source: "saved" | "env" | "unset";
};

const dataDirectoryPath = path.join(process.cwd(), "data");
const configFilePath = path.join(dataDirectoryPath, "bot-config.json");

const defaultBotConfig: BotConfig = {};

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function getFallbackBotConfig(): BotConfig {
  return {
    panelChannelId: env.panelChannelId ?? env.calendarChannelId,
    requestsChannelId: env.requestsChannelId,
    logChannelId: env.logChannelId,
    calendarChannelId: env.calendarChannelId,
    lookingForGameChannelId: env.lookingForGameChannelId
  };
}

function isConfigurableChannelKey(value: string): value is ConfigurableChannelKey {
  return configurableChannelKeys.includes(value as ConfigurableChannelKey);
}

function normalizeStoredConfig(data: unknown): BotConfig {
  if (!data || typeof data !== "object") {
    return {};
  }

  const normalizedConfig: BotConfig = {};
  const record = data as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!isConfigurableChannelKey(key)) continue;

    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      normalizedConfig[key] = value.trim();
    }
  }

  return normalizedConfig;
}

async function ensureConfigFileExists() {
  await mkdir(dataDirectoryPath, { recursive: true });

  try {
    await readFile(configFilePath, "utf8");
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }

    await writeFile(configFilePath, JSON.stringify(defaultBotConfig, null, 2), "utf8");
  }
}

async function readStoredBotConfig() {
  await ensureConfigFileExists();

  const rawData = await readFile(configFilePath, "utf8");

  try {
    return normalizeStoredConfig(JSON.parse(rawData));
  } catch (error) {
    throw new Error(`Bot config file contains invalid JSON: ${configFilePath}`, {
      cause: error
    });
  }
}

async function saveStoredBotConfig(config: BotConfig) {
  await ensureConfigFileExists();

  const temporaryFilePath = `${configFilePath}.${process.pid}.${Date.now()}.tmp`;

  await writeFile(temporaryFilePath, JSON.stringify(config, null, 2), "utf8");
  await rename(temporaryFilePath, configFilePath);
}

export async function getBotConfig(): Promise<BotConfig> {
  return {
    ...getFallbackBotConfig(),
    ...(await readStoredBotConfig())
  };
}

export async function getConfiguredChannelId(key: ConfigurableChannelKey) {
  const config = await getBotConfig();

  return config[key] ?? null;
}

export async function setConfiguredChannelId(
  key: ConfigurableChannelKey,
  channelId: string
) {
  const config = await readStoredBotConfig();

  config[key] = channelId;

  await saveStoredBotConfig(config);
}

export async function clearConfiguredChannelOverride(key: ConfigurableChannelKey) {
  const config = await readStoredBotConfig();

  delete config[key];

  await saveStoredBotConfig(config);
}

export async function getConfigEntries(): Promise<ConfigEntry[]> {
  const fallbackConfig = getFallbackBotConfig();
  const storedConfig = await readStoredBotConfig();

  return configurableChannelKeys.map((key) => {
    const storedChannelId = storedConfig[key];
    const fallbackChannelId = fallbackConfig[key];
    const channelId = storedChannelId ?? fallbackChannelId ?? null;
    const source = storedChannelId ? "saved" : fallbackChannelId ? "env" : "unset";

    return {
      key,
      label: configurableChannelLabels[key],
      channelId,
      source
    };
  });
}
