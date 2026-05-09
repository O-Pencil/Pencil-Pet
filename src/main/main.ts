import { execFile } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readdirSync, statSync, readSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import electron from "electron";
import Store from "electron-store";
import { DEFAULT_SETTINGS, SPRITE_SIZE, SPRITE_STATES, mapPetStateToSpriteState } from "../shared/constants";
import type { Settings, PetState, PetFacing, AgentMonitorEvent, AppSnapshot, SpeechBubble, PetLayout } from "../shared/types";

// Pet state to image mapping
export const PET_STATE_IMAGES: Record<PetState, string> = {
  idle: "stay.png",
  sitting: "stay.png",
  thinking: "work.png",
  working: "work.png",
  happy: "play.png",
  waving: "play.png",
  failed: "stay.png",
  waiting: "work.png",
  runningLeft: "play.png",
  runningRight: "play.png",
  resting: "stay.png",
  sleeping: "stay.png",
  stretching: "play.png",
  held: "play.png"
};
import { APP_NAME, STORE_NAME, PET_WINDOW, PRELOAD_PATH, RENDERER_HTML_PATH, IS_DEV, AGENT_ACTIVITY_CHECK_INTERVAL_MS, AGENT_EVENT_MAX_AGE_MS } from "./config";

const { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, protocol, screen, shell, Tray, net } = electron;

// ============ Types ============
type PetPosition = { x: number; y: number };
type StoreSchema = {
  settings: Settings;
  petPosition?: PetPosition;
};

// ============ State ============
const store = new Store<StoreSchema>({
  name: STORE_NAME,
  defaults: { settings: DEFAULT_SETTINGS }
});

let petWindow: Electron.BrowserWindow | null = null;
let tray: Electron.Tray | null = null;
let petState: PetState = "idle";
let petFacing: PetFacing = "right";
let agentActivityTimer: NodeJS.Timeout | null = null;
let bubbleTimer: NodeJS.Timeout | null = null;
let ambientRoamTimer: NodeJS.Timeout | null = null;
let currentBubble: SpeechBubble | null = null;
let petLayout: PetLayout = { petOffsetX: 0, bubbleAnchorX: 0, bubbleLeftX: 0, bubbleArrowX: 0 };

const agentSeenEventIds = new Set<string>();
const agentActiveSessions = new Map<string, number>();
let agentMonitorPrimed = false;
let agentLastNotificationAt = 0;

const MIN_PET_SCALE = 0.5;
const MAX_PET_SCALE = 1.5;
const PET_VISUAL_BASE_SCALE = 1.0;
const PET_WINDOW_PADDING = 40;
const BUBBLE_WINDOW_WIDTH = 260;
const AMBIENT_ROAM_INTERVAL_MS = 25000;

// Pet image dimensions (for photos with background)
const PET_IMAGE_WIDTH = 200;
const PET_IMAGE_HEIGHT = 200;

// ============ Settings ============
function getSettings(): Settings {
  const stored = store.get("settings");
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    petScale: Math.min(MAX_PET_SCALE, Math.max(MIN_PET_SCALE, stored?.petScale ?? DEFAULT_SETTINGS.petScale))
  };
}

function setSettings(next: Settings): void {
  store.set("settings", next);
  sendToAll("settings:updated", next);
}

// ============ Pet Window ============
function visiblePetSize(scale: number): { width: number; height: number } {
  const renderScale = PET_VISUAL_BASE_SCALE * scale;
  return {
    width: Math.round(SPRITE_SIZE.frameWidth * renderScale),
    height: Math.round(SPRITE_SIZE.frameHeight * renderScale)
  };
}

function petWindowSize(scale = getSettings().petScale): { width: number; height: number } {
  const baseWidth = Math.round(PET_IMAGE_WIDTH * scale);
  const baseHeight = Math.round(PET_IMAGE_HEIGHT * scale);
  if (currentBubble) {
    return {
      width: Math.max(BUBBLE_WINDOW_WIDTH, baseWidth + PET_WINDOW_PADDING * 2),
      height: baseHeight + 140
    };
  }
  return {
    width: Math.max(80, baseWidth + PET_WINDOW_PADDING),
    height: Math.max(80, baseHeight + PET_WINDOW_PADDING)
  };
}

function clampBoundsToWorkArea(bounds: Electron.Rectangle): Electron.Rectangle {
  const center = { x: bounds.x + Math.round(bounds.width / 2), y: bounds.y + Math.round(bounds.height / 2) };
  const workArea = screen.getDisplayNearestPoint(center).workArea;
  return {
    ...bounds,
    x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - bounds.width),
    y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - bounds.height)
  };
}

function initialPetBounds(): Electron.Rectangle {
  const workArea = screen.getPrimaryDisplay().workArea;
  const stored = store.get("petPosition");
  const size = petWindowSize();
  const fallback = {
    ...size,
    x: Math.round(workArea.x + workArea.width / 2 - size.width / 2),
    y: workArea.y + workArea.height - size.height
  };
  if (!stored) return fallback;
  return clampBoundsToWorkArea({ ...fallback, x: stored.x, y: stored.y });
}

function persistPetPosition(): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petWindow.getBounds();
  store.set("petPosition", { x: bounds.x, y: bounds.y });
}

// ============ IPC ============
function sendToPet<T>(channel: string, payload?: T): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send(channel, payload);
}

function sendToAll<T>(channel: string, payload?: T): void {
  sendToPet(channel, payload);
}

function publishSnapshot(): void {
  sendToAll("app:snapshot", snapshot());
}

function setPetState(next: PetState): void {
  petState = next;
  const imageName = PET_STATE_IMAGES[next] || "stay.JPG";
  sendToAll("pet:set-state", { state: next, image: imageName });
}

function setPetFacing(next: PetFacing): void {
  if (petFacing === next) return;
  petFacing = next;
  publishSnapshot();
}

// ============ Bubble ============
function showBubble(bubble: SpeechBubble): void {
  if (bubbleTimer) clearTimeout(bubbleTimer);
  currentBubble = bubble;
  resizePetWindowForScale(getSettings().petScale);
  sendPetLayout();
  sendToPet("pet:show-bubble", bubble);
  if (bubble.autoDismissMs) {
    bubbleTimer = setTimeout(() => hideBubble(), bubble.autoDismissMs);
  }
}

function hideBubble(): void {
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
  currentBubble = null;
  sendToPet("pet:hide-bubble");
  resizePetWindowForScale(getSettings().petScale);
  sendPetLayout();
}

function sendPetLayout(): void {
  sendToPet("pet:layout", petLayout);
}

function layoutForPetAnchor(bounds: Electron.Rectangle, petAnchorScreenX?: number): PetLayout {
  const anchorX = petAnchorScreenX === undefined ? Math.round(bounds.width / 2) : petAnchorScreenX - bounds.x;
  return { petOffsetX: Math.round(anchorX - bounds.width / 2), bubbleAnchorX: Math.round(anchorX), bubbleLeftX: Math.round(anchorX), bubbleArrowX: Math.round(0) };
}

// ============ Window Management ============
function resizePetWindowForScale(scale: number): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  const current = petWindow.getBounds();
  const nextSize = petWindowSize(scale);
  const petAnchorX = current.x + current.width / 2 + petLayout.petOffsetX;
  const nextBounds = clampBoundsToWorkArea({
    ...nextSize,
    x: Math.round(petAnchorX - nextSize.width / 2),
    y: current.y + current.height - nextSize.height
  });
  petLayout = layoutForPetAnchor(nextBounds, petAnchorX);
  petWindow.setBounds(nextBounds);
  sendPetLayout();
  persistPetPosition();
}

function showPetWindowInactive(): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.showInactive();
  if (process.platform === "darwin") {
    petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  petWindow.setAlwaysOnTop(true, "floating", 1);
  petWindow.setIgnoreMouseEvents(false);
  updateTrayMenu();
  sendPetLayout();
  publishSnapshot();
}

function loadRenderer(win: Electron.BrowserWindow, route: "pet" | "settings"): void {
  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (devServer) {
    void win.loadURL(`${devServer}#${route}`);
    return;
  }
  void win.loadFile(RENDERER_HTML_PATH, { hash: route });
}

function createPetWindow(): void {
  const bounds = initialPetBounds();
  petLayout = layoutForPetAnchor(bounds);
  petWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    show: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    vibrancy: undefined,
    visualEffectState: "active",
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  });

  petWindow.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "normal");
  if (process.platform === "darwin") {
    petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  loadRenderer(petWindow, "pet");
  
  petWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${message} (at ${sourceId}:${line})`);
  });

  petWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error(`[Renderer Load Error] ${errorDescription} (${errorCode})`);
  });

  petWindow.once("ready-to-show", showPetWindowInactive);
  petWindow.webContents.once("did-finish-load", showPetWindowInactive);
  petWindow.on("closed", () => {
    petWindow = null;
    updateTrayMenu();
    publishSnapshot();
  });
}

// ============ Tray & Menu ============
function actionMenuItems(): Electron.MenuItemConstructorOptions[] {
  const petVisible = Boolean(petWindow?.isVisible());
  return [
    {
      label: petVisible ? "Hide Pet" : "Show Pet",
      click: () => {
        if (!petWindow) createPetWindow();
        if (!petWindow) return;
        if (petWindow.isVisible()) petWindow.hide();
        else petWindow.showInactive();
        updateTrayMenu();
        publishSnapshot();
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit()
    }
  ];
}

function updateTrayMenu(): void {
  if (!tray) return;
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: APP_NAME, enabled: false },
    { type: "separator" },
    ...actionMenuItems()
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function createTray(): void {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, "tray-icon.png")
    : join(process.cwd(), "build", "tray-icon.png");
  
  // Create tray - use nativeImage for better compatibility
  let trayIcon: Electron.NativeImage;
  try {
    if (existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
      if (trayIcon.isEmpty()) {
        // Fallback to a simple 16x16 icon
        trayIcon = nativeImage.createEmpty();
      }
    } else {
      // Create a simple 16x16 orange square as fallback
      trayIcon = nativeImage.createEmpty();
    }
  } catch {
    trayIcon = nativeImage.createEmpty();
  }
  
  tray = new Tray(trayIcon);
  tray.setToolTip(APP_NAME);
  tray.on("click", () => tray?.popUpContextMenu());
  updateTrayMenu();
}

// ============ Agent Activity Monitor ============
function listRecentFiles(root: string, extension: string, maxFiles: number, maxDepth = 5): string[] {
  if (!existsSync(root)) return [];
  const files: Array<{ path: string; mtimeMs: number }> = [];
  function walk(dir: string, depth: number): void {
    if (depth < 0) return;
    let entries: import("node:fs").Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { walk(path, depth - 1); continue; }
      if (!entry.isFile() || !entry.name.endsWith(extension)) continue;
      try { files.push({ path, mtimeMs: statSync(path).mtimeMs }); } catch {}
    }
  }
  walk(root, maxDepth);
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, maxFiles).map(f => f.path);
}

function readTextTail(path: string, maxBytes = 96_000): string {
  const stat = statSync(path);
  const start = Math.max(0, stat.size - maxBytes);
  const buffer = Buffer.alloc(stat.size - start);
  const fd = openSync(path, "r");
  try { readSync(fd, buffer, 0, buffer.length, start); } finally { closeSync(fd); }
  return buffer.toString("utf8");
}

function parseJsonLinesTail(path: string): Array<Record<string, unknown>> {
  try {
    const lines = readTextTail(path).split("\n");
    return lines.map(line => { try { return JSON.parse(line); } catch { return null; } }).filter((v): v is Record<string, unknown> => Boolean(v));
  } catch { return []; }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function eventTimeMs(value: unknown): number {
  const parsed = Date.parse(stringValue(value));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function hashText(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(36);
}

function extractTextFromContent(content: unknown, typeName: string): string {
  if (!Array.isArray(content)) return "";
  return content.map(part => {
    const record = asRecord(part);
    if (!record || record.type !== typeName) return "";
    return stringValue(record.text);
  }).filter(Boolean).join(" ").trim();
}

function compactAgentText(text: string): string {
  const plain = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`*_>#-]/g, "").replace(/\s+/g, " ").trim();
  const firstSentence = plain.match(/^.{8,90}?[。！？.!?](?=\s|$)/)?.[0] ?? plain;
  return firstSentence.length > 50 ? `${firstSentence.slice(0, 48)}...` : firstSentence;
}

let agentLastActivityAt = Date.now();

function classifyAgentText(text: string): Omit<AgentMonitorEvent, "id" | "source" | "sessionKey" | "timestampMs"> | null {
  const compact = compactAgentText(text);
  if (!compact) return null;

  if (/(权限|授权|批准|permission|approval)/i.test(text)) {
    return { kind: "needs-review", message: compact, progressKind: "permission", state: "thinking" };
  }
  if (/(选择|选项|choose|option)/i.test(text)) {
    return { kind: "needs-review", message: compact, progressKind: "choice", state: "thinking" };
  }
  if (/(报错|失败|failed|error)/i.test(text)) {
    return { kind: "failed", message: compact, progressKind: "failed", state: "failed" };
  }
  if (/(等待|需要|review|attention)/i.test(text)) {
    return { kind: "needs-review", message: compact, progressKind: "review", state: "waiting" };
  }
  if (/(已|完成|done|complete|fixed)/i.test(compact)) {
    return { kind: "complete", message: compact, progressKind: "complete", state: "happy" };
  }
  if (/(正在|执行|working|running|编译|构建|building|compiling)/i.test(text)) {
    return { kind: "working", message: compact, progressKind: "working", state: "working" };
  }
  if (/(思考|thinking|analysing|分析)/i.test(text)) {
    return { kind: "working", message: compact, progressKind: "thinking", state: "thinking" };
  }
  return { kind: "working", message: compact, progressKind: "working", state: "thinking" };
}

function makeAgentEvent(
  source: AgentMonitorEvent["source"],
  path: string,
  timestampMs: number,
  text: string,
  classified: Omit<AgentMonitorEvent, "id" | "source" | "sessionKey" | "timestampMs">
): AgentMonitorEvent {
  return {
    ...classified,
    id: `${source}:${path}:${timestampMs}:${classified.kind}:${hashText(text)}`,
    source,
    sessionKey: `${source}:${path}`,
    timestampMs
  };
}

// Collect nanoPencil session events
function collectNanoPencilSessionEvents(): AgentMonitorEvent[] {
  const home = app.getPath("home");
  const sessionRoots = [
    join(home, ".nanopencil", "agent", "sessions"),
    join(home, ".pencils", "agents")
  ];

  const events: AgentMonitorEvent[] = [];

  for (const root of sessionRoots) {
    if (!existsSync(root)) continue;

    // Handle multi-agent paths
    const sessionDirs = root.endsWith("agents")
      ? readdirSync(root, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => join(root, d.name, "sessions"))
          .filter(p => existsSync(p))
      : [root];

    for (const sessionDir of sessionDirs) {
      console.log(`[Monitor] Scanning session dir: ${sessionDir}`);
      const files = listRecentFiles(sessionDir, ".jsonl", 4);
      for (const file of files) {
        console.log(`[Monitor] Checking session file: ${file}`);
        for (const line of parseJsonLinesTail(file)) {
          const event = parseNanoPencilLine(line, file);
          if (event) events.push(event);
        }
      }
    }
  }

  return events;
}

function parseNanoPencilLine(line: Record<string, unknown>, file: string): AgentMonitorEvent | null {
  const timestampMs = eventTimeMs(line.timestamp);
  const type = stringValue(line.type);
  
  // Handle thinking level changes
  if (type === "thinking_level_change") {
    const level = stringValue(line.thinkingLevel);
    if (level !== "off") {
      return {
        id: `nanoPencil:${file}:${timestampMs}:thinking:${level}`,
        source: "nanoPencil",
        sessionKey: `nanoPencil:${file}`,
        kind: "working",
        message: `正在思考 (${level})`,
        progressKind: "thinking",
        state: "thinking",
        timestampMs
      };
    }
  }

  // Handle messages
  if (type === "message") {
    const message = asRecord(line.message);
    if (!message) return null;

    const role = stringValue(message.role);
    const content = message.content;
    const textContent = Array.isArray(content) 
      ? extractTextFromContent(content, "text") 
      : stringValue(content);

    // Assistant messages
    if (role === "assistant" && textContent) {
      const classified = classifyAgentText(textContent);
      if (classified) {
        return makeAgentEvent("nanoPencil", file, timestampMs, textContent, classified);
      }
    }

    // Tool calls in message
    if (message.tool_calls || message.function_call) {
      const toolName = stringValue(asRecord((message.tool_calls as any)?.[0] || message.function_call)?.name) || "工具";
      return {
        id: `nanoPencil:${file}:${timestampMs}:tool:${hashText(toolName)}`,
        source: "nanoPencil",
        sessionKey: `nanoPencil:${file}`,
        kind: "working",
        message: `正在调用 ${toolName}`,
        progressKind: "tool",
        state: "thinking",
        timestampMs
      };
    }
  }

  // Legacy format support
  const role = stringValue(line.role);
  const content = line.content;
  const textContent = Array.isArray(content) 
    ? extractTextFromContent(content, "text") 
    : stringValue(content);

  if (role === "assistant" && textContent) {
    const classified = classifyAgentText(textContent);
    if (classified) {
      return makeAgentEvent("nanoPencil", file, timestampMs, textContent, classified);
    }
  }

  if (line.tool_calls || line.function_call) {
    const toolName = stringValue(asRecord((line.tool_calls as any)?.[0] || line.function_call)?.name) || "工具";
    return {
      id: `nanoPencil:${file}:${timestampMs}:tool_legacy:${hashText(toolName)}`,
      source: "nanoPencil",
      sessionKey: `nanoPencil:${file}`,
      kind: "working",
      message: `正在调用 ${toolName}`,
      progressKind: "tool",
      state: "thinking",
      timestampMs
    };
  }

  return null;
}

// Collect Codex session events
function collectCodexSessionEvents(): AgentMonitorEvent[] {
  const sessionsRoot = join(app.getPath("home"), ".codex", "sessions");
  const files = listRecentFiles(sessionsRoot, ".jsonl", 4);
  const events: AgentMonitorEvent[] = [];

  for (const file of files) {
    for (const line of parseJsonLinesTail(file)) {
      if (line.type !== "response_item") continue;
      const payload = asRecord(line.payload);
      if (!payload) continue;
      const timestampMs = eventTimeMs(line.timestamp);
      const payloadType = stringValue(payload.type);

      if (payloadType === "message") {
        const text = extractTextFromContent(payload.content, "output_text");
        const classified = classifyAgentText(text);
        if (classified) events.push(makeAgentEvent("Codex", file, timestampMs, text, classified));
      }

      if (payloadType === "function_call" || payloadType === "reasoning") {
        const callName = stringValue(payload.name);
        events.push({
          id: `Codex:${file}:${timestampMs}:${payloadType}`,
          source: "Codex",
          sessionKey: `Codex:${file}`,
          kind: "working",
          message: payloadType === "function_call" ? callName || "正在执行工具" : "正在思考",
          progressKind: payloadType === "reasoning" ? "thinking" : "tool",
          state: "thinking",
          timestampMs
        });
      }
    }
  }
  return events;
}

// Collect Claude Code session events
function collectClaudeSessionEvents(): AgentMonitorEvent[] {
  const projectRoot = join(app.getPath("home"), ".claude", "projects");
  const files = listRecentFiles(projectRoot, ".jsonl", 5, 3);
  const events: AgentMonitorEvent[] = [];

  for (const file of files) {
    for (const line of parseJsonLinesTail(file)) {
      const timestampMs = eventTimeMs(line.timestamp);
      if (line.type !== "assistant") continue;
      const message = asRecord(line.message);
      if (!message) continue;
      const stopReason = stringValue(message.stop_reason);
      const text = extractTextFromContent(message.content, "text");

      if (stopReason === "end_turn") {
        const classified = classifyAgentText(text);
        if (classified) {
          const uuid = stringValue(line.uuid) || hashText(text);
          events.push({
            ...makeAgentEvent("Claude Code", file, timestampMs, text, classified),
            id: `Claude Code:${file}:${uuid}:${classified.kind}`
          });
        }
      }

      if (stopReason === "tool_use") {
        events.push({
          id: `Claude Code:${file}:${timestampMs}:tool_use`,
          source: "Claude Code",
          sessionKey: `Claude Code:${file}`,
          kind: "working",
          message: compactAgentText(text || "正在执行工具"),
          progressKind: "tool",
          state: "thinking",
          timestampMs
        });
      }
    }
  }
  return events;
}

function rememberAgentEvent(id: string): void {
  agentSeenEventIds.add(id);
  if (agentSeenEventIds.size > 500) {
    const first = agentSeenEventIds.values().next().value;
    if (typeof first === "string") agentSeenEventIds.delete(first);
  }
}

function markAgentSessionWorking(sessionKey: string): void {
  agentActiveSessions.set(sessionKey, Date.now());
  for (const [key, lastSeen] of agentActiveSessions) {
    if (Date.now() - lastSeen > AGENT_EVENT_MAX_AGE_MS) agentActiveSessions.delete(key);
  }
}

function hasRecentAgentWork(sessionKey: string): boolean {
  const lastSeen = agentActiveSessions.get(sessionKey);
  return Boolean(lastSeen && Date.now() - lastSeen <= AGENT_EVENT_MAX_AGE_MS);
}

function agentEventMessage(event: AgentMonitorEvent): string {
  if (event.kind === "failed") return `${event.source} 遇到问题`;
  if (event.progressKind === "permission") return `${event.source} 需要权限`;
  if (event.progressKind === "choice") return `${event.source} 需要选择`;
  if (event.kind === "needs-review") return `${event.source} 需要确认`;
  return `${event.source} 完成了！`;
}

function playAgentCompletionSound(event: AgentMonitorEvent): void {
  if (!getSettings().agentCompletionSoundEnabled) return;
  if (event.kind !== "complete" && event.kind !== "failed") return;
  if (process.platform === "darwin") {
    const sound = event.kind === "failed" ? "Basso.aiff" : "Glass.aiff";
    execFile("/usr/bin/afplay", [join("/System/Library/Sounds", sound)], { timeout: 2500 }, () => {
      shell.beep();
    });
    return;
  }
  shell.beep();
}

function notifyAgentEvent(event: AgentMonitorEvent): boolean {
  const now = Date.now();
  if (now - agentLastNotificationAt < 5000) return false;
  agentLastNotificationAt = now;

  if (!petWindow || petWindow.isDestroyed()) createPetWindow();
  showPetWindowInactive();

  playAgentCompletionSound(event);
  setPetState(event.state);

  const displayMs = event.kind === "failed" ? 4000 : 3000;
  showBubble({ id: `agent-${event.id}`, message: agentEventMessage(event), autoDismissMs: displayMs });

  setTimeout(() => {
    if (currentBubble?.id === `agent-${event.id}`) hideBubble();
    if (petState === event.state) setPetState("idle");
  }, displayMs + 200);

  return true;
}

async function checkAgentActivityNow(): Promise<void> {
  if (!getSettings().agentActivityEnabled) return;

  const now = Date.now();
  const newestAllowedAt = now - AGENT_EVENT_MAX_AGE_MS;
  const events = [
    ...collectNanoPencilSessionEvents(),
    ...collectCodexSessionEvents(),
    ...collectClaudeSessionEvents()
  ]
    .filter(e => e.timestampMs >= newestAllowedAt && e.timestampMs <= now + 30_000)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  // Prime the monitor on first check
  if (!agentMonitorPrimed) {
    for (const event of events) rememberAgentEvent(event.id);
    agentMonitorPrimed = true;
    const latestWorking = events.filter(e => e.kind === "working").at(-1);
    if (latestWorking && now - latestWorking.timestampMs < 30_000) {
      agentLastActivityAt = now;
      markAgentSessionWorking(latestWorking.sessionKey);
      setPetState("thinking");
      showBubble({ id: "agent-working", message: `${latestWorking.source} 正在工作...`, autoDismissMs: 3000 });
    }
    return;
  }

  let hasNewActivity = false;

  // Process new events
  for (const event of events) {
    if (agentSeenEventIds.has(event.id)) continue;

    hasNewActivity = true;
    agentLastActivityAt = now;

    if (event.kind === "working") {
      rememberAgentEvent(event.id);
      markAgentSessionWorking(event.sessionKey);
      
      // If we were sleeping or resting, show a stretching transition first
      if (petState === "sleeping" || petState === "resting") {
        setPetState("stretching");
        showBubble({ id: "agent-waking", message: `${event.source} 正在启动...`, autoDismissMs: 2000 });
        setTimeout(() => {
          setPetState(event.state);
          if (!currentBubble) {
            showBubble({ id: "agent-working", message: `${event.source} 正在工作...`, autoDismissMs: 3000 });
          }
        }, 2000);
      } else {
        setPetState(event.state);
        if (!currentBubble) {
          showBubble({ id: "agent-working", message: `${event.source} 正在工作...`, autoDismissMs: 3000 });
        }
      }
      continue;
    }

    if (hasRecentAgentWork(event.sessionKey)) {
      if (notifyAgentEvent(event)) {
        rememberAgentEvent(event.id);
        agentLastActivityAt = now;
      }
    }
  }

  // Handle idle transitions if no new activity and no agent is currently working
  const isAgentWorking = Array.from(agentActiveSessions.values()).some(lastSeen => now - lastSeen <= 30_000);
  
  if (!hasNewActivity && !isAgentWorking) {
    const idleTime = now - agentLastActivityAt;
    if (idleTime > 15 * 60 * 1000) { // 15 mins
      if (petState !== "sleeping" && petState !== "runningLeft" && petState !== "runningRight") {
        setPetState("sleeping");
      }
    } else if (idleTime > 5 * 60 * 1000) { // 5 mins
      if (petState !== "resting" && petState !== "runningLeft" && petState !== "runningRight") {
        setPetState("resting");
      }
    } else if (idleTime > 1 * 60 * 1000) { // 1 min
      if (petState === "thinking" || petState === "working") {
        setPetState("idle");
      }
    }
  }
}

function scheduleAgentActivityMonitor(): void {
  if (agentActivityTimer) clearInterval(agentActivityTimer);
  if (!getSettings().agentActivityEnabled) return;
  agentActivityTimer = setInterval(() => void checkAgentActivityNow(), AGENT_ACTIVITY_CHECK_INTERVAL_MS);
  // Initial check after 2 seconds
  setTimeout(() => void checkAgentActivityNow(), 2000);
}

// ============ Ambient Roam ============
function scheduleAmbientRoam(): void {
  if (!getSettings().petRoamEnabled) return;
  if (ambientRoamTimer) clearTimeout(ambientRoamTimer);
  ambientRoamTimer = setTimeout(() => {
    if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) return;
    if (currentBubble) return;
    // Random direction
    const direction = Math.random() > 0.5 ? "right" : "left";
    setPetFacing(direction);
    setPetState(direction === "right" ? "runningRight" : "runningLeft");
    // Run for a bit then stop
    setTimeout(() => {
      if (petState === "runningRight" || petState === "runningLeft") {
        setPetState("idle");
      }
      scheduleAmbientRoam();
    }, 2000 + Math.random() * 3000);
  }, AMBIENT_ROAM_INTERVAL_MS + Math.random() * 20000);
}

// ============ App Snapshot ============
function snapshot(): AppSnapshot {
  return {
    settings: getSettings(),
    petState,
    petFacing,
    petVisible: Boolean(petWindow?.isVisible())
  };
}

// ============ IPC Handlers ============
ipcMain.handle("get-snapshot", () => snapshot());
ipcMain.handle("get-settings", () => getSettings());
ipcMain.handle("get-asset-data-url", (_event, filename: string) => {
  try {
    const assetsPath = app.isPackaged
      ? join(process.resourcesPath, "assets")
      : join(process.cwd(), "assets");
    const filePath = join(assetsPath, filename);
    if (!existsSync(filePath)) return null;
    const buffer = readFileSync(filePath);
    const extension = filePath.split(".").pop()?.toLowerCase();
    const mimeType = extension === "png" ? "image/png" : "image/jpeg";
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.error("Error generating data URL:", err);
    return null;
  }
});
ipcMain.on("set-settings", (_event, settings: Settings) => setSettings(settings));
ipcMain.on("pet:drag-start", (_event, offset: { offsetX: number; offsetY: number }) => {
  // Simple drag handling
});
ipcMain.on("pet:context-menu", () => {
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: "Hide", click: () => petWindow?.hide() },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() }
  ];
  Menu.buildFromTemplate(template).popup({ window: petWindow ?? undefined });
});

// ============ App Lifecycle ============
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

// app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("no-sandbox");
// app.disableHardwareAcceleration();

app.whenReady().then(() => {
  console.log("App ready...");
  
  console.log("Creating window...");
  createPetWindow();
  
  console.log("Creating tray...");
  createTray();
  
  console.log("Scheduling monitor...");
  scheduleAgentActivityMonitor();
  
  console.log("Scheduling roam...");
  scheduleAmbientRoam();
  
  console.log("Initialization complete.");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!petWindow) createPetWindow();
});
