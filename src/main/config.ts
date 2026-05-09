import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const APP_NAME = "PencilPet";
export const STORE_NAME = "pencil-pet";

export const PET_WINDOW = {
  width: 180,
  height: 260
} as const;

export const PRELOAD_PATH = join(__dirname, "../preload/index.mjs");
export const RENDERER_HTML_PATH = join(__dirname, "../renderer/index.html");
export const IS_DEV = Boolean(process.env.ELECTRON_RENDERER_URL);

export const AGENT_ACTIVITY_CHECK_INTERVAL_MS = 5000;
export const AGENT_EVENT_MAX_AGE_MS = 2 * 60 * 1000;
