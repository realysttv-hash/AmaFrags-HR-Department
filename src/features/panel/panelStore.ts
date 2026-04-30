import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

type PanelState = {
  panelMessageId: string | null;
};

const dataDirectoryPath = path.join(process.cwd(), "data");
const panelFilePath = path.join(dataDirectoryPath, "panel.json");

const defaultPanelState: PanelState = {
  panelMessageId: null
};

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

async function ensurePanelFileExists() {
  await mkdir(dataDirectoryPath, { recursive: true });

  try {
    await readFile(panelFilePath, "utf8");
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }

    await writeFile(panelFilePath, JSON.stringify(defaultPanelState, null, 2), "utf8");
  }
}

async function getPanelState() {
  await ensurePanelFileExists();

  const rawData = await readFile(panelFilePath, "utf8");
  const parsedData = JSON.parse(rawData) as Partial<PanelState>;

  return {
    panelMessageId: parsedData.panelMessageId ?? null
  };
}

async function savePanelState(state: PanelState) {
  await ensurePanelFileExists();

  const temporaryFilePath = `${panelFilePath}.${process.pid}.${Date.now()}.tmp`;

  await writeFile(temporaryFilePath, JSON.stringify(state, null, 2), "utf8");
  await rename(temporaryFilePath, panelFilePath);
}

export async function getPanelMessageId() {
  const state = await getPanelState();

  return state.panelMessageId;
}

export async function setPanelMessageId(panelMessageId: string) {
  await savePanelState({
    panelMessageId
  });
}
