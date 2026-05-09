import type { Settings, PetState, SpriteAnimationState } from "./types";

// Re-export types for convenience
export type { Settings, PetState, PetFacing, SpeechBubble, PetLayout, AppSnapshot } from "./types";

export const APP_NAME = "PencilPet";

export const PET_WINDOW = {
  width: 180,
  height: 260
} as const;

export const DEFAULT_SETTINGS: Settings = {
  petScale: 1,
  petRoamEnabled: true,
  selectedPetId: "default-pet",
  agentActivityEnabled: true,
  agentCompletionSoundEnabled: true
};

export const AGENT_ACTIVITY_CHECK_INTERVAL_MS = 5000;
export const AGENT_EVENT_MAX_AGE_MS = 2 * 60 * 1000;

// Sprite sheet configuration (PetDex compatible)
export const SPRITE_SIZE = {
  frameWidth: 192,
  frameHeight: 208,
  sheetWidth: 1536,
  sheetHeight: 1872
} as const;

export const SPRITE_STATES: Record<string, SpriteAnimationState> = {
  idle: { row: 0, frames: 6, durationMs: 1100 },
  "running-right": { row: 1, frames: 8, durationMs: 1060 },
  "running-left": { row: 2, frames: 8, durationMs: 1060 },
  waving: { row: 3, frames: 4, durationMs: 700 },
  jumping: { row: 4, frames: 5, durationMs: 840 },
  failed: { row: 5, frames: 8, durationMs: 1220 },
  waiting: { row: 6, frames: 6, durationMs: 1010 },
  running: { row: 7, frames: 6, durationMs: 820 },
  review: { row: 8, frames: 6, durationMs: 1030 }
};

export function mapPetStateToSpriteState(state: PetState): string {
  const mapping: Record<PetState, string> = {
    idle: "idle",
    thinking: "waiting",
    happy: "jumping",
    waving: "waving",
    failed: "failed",
    waiting: "waiting",
    sitting: "idle",
    runningLeft: "running-left",
    runningRight: "running-right",
    working: "waiting",
    resting: "idle",
    sleeping: "idle",
    stretching: "jumping",
    held: "idle"
  };
  return mapping[state] || "idle";
}
