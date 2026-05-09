export type PetState =
  | "idle"
  | "sitting"
  | "happy"
  | "thinking"
  | "waving"
  | "failed"
  | "waiting"
  | "runningLeft"
  | "runningRight"
  | "working"
  | "resting"
  | "sleeping"
  | "stretching"
  | "held";

export type PetFacing = "left" | "right";

export type SpriteAnimationState = {
  row: number;
  frames: number;
  durationMs: number;
};

export type SpeechBubble = {
  id: string;
  message: string;
  autoDismissMs?: number;
};

export type PetLayout = {
  petOffsetX: number;
  bubbleAnchorX: number;
  bubbleLeftX: number;
  bubbleArrowX: number;
};

export type Settings = {
  petScale: number;
  petRoamEnabled: boolean;
  selectedPetId: string;
  agentActivityEnabled: boolean;
  agentCompletionSoundEnabled: boolean;
};

export type AgentSource = "nanoPencil" | "Codex" | "Claude Code";
export type AgentEventKind = "complete" | "failed" | "needs-review" | "working";
export type AgentProgressKind =
  | "working"
  | "thinking"
  | "tool"
  | "script"
  | "choice"
  | "permission"
  | "review"
  | "complete"
  | "failed"
  | "idle"
  | "resting"
  | "sleeping";

export type AgentMonitorEvent = {
  id: string;
  source: AgentSource;
  sessionKey: string;
  kind: AgentEventKind;
  message: string;
  progressKind?: AgentProgressKind;
  state: PetState;
  timestampMs: number;
};

export type AppSnapshot = {
  settings: Settings;
  petState: PetState;
  petFacing: PetFacing;
  petVisible: boolean;
};
