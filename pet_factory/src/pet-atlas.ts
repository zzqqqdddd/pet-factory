export const ATLAS = {
  columns: 8,
  rows: 11,
  frameWidth: 192,
  frameHeight: 208,
  width: 1536,
  height: 2288,
} as const;

export type PetState =
  | "idle"
  | "moving-right"
  | "moving-left"
  | "waving"
  | "success"
  | "error"
  | "waiting"
  | "working"
  | "review"
  | "look-around";

export interface AnimationDefinition {
  readonly row: number;
  readonly frames: number;
  readonly frameDuration: number;
  readonly loops?: number;
  readonly sequence?: readonly { row: number; column: number }[];
}

const lookSequence = Array.from({ length: 16 }, (_, index) => ({
  row: index < 8 ? 9 : 10,
  column: index % 8,
}));

export const ANIMATIONS: Readonly<Record<PetState, AnimationDefinition>> = {
  idle: { row: 0, frames: 6, frameDuration: 240 },
  "moving-right": { row: 1, frames: 8, frameDuration: 90 },
  "moving-left": { row: 2, frames: 8, frameDuration: 90 },
  waving: { row: 3, frames: 4, frameDuration: 180, loops: 2 },
  success: { row: 4, frames: 5, frameDuration: 130, loops: 2 },
  error: { row: 5, frames: 8, frameDuration: 170, loops: 2 },
  waiting: { row: 6, frames: 6, frameDuration: 210 },
  working: { row: 7, frames: 6, frameDuration: 130 },
  review: { row: 8, frames: 6, frameDuration: 190 },
  "look-around": {
    row: 9,
    frames: 16,
    frameDuration: 260,
    sequence: lookSequence,
  },
};

export function isPetState(value: unknown): value is PetState {
  return typeof value === "string" && value in ANIMATIONS;
}
