import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { cursorPosition, getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { ATLAS, ANIMATIONS, isPetState, type PetState } from "./pet-atlas";
import "./style.css";

const POSITION_KEY = "pet-factory.window-position.v1";
const SELECTED_PET_KEY = "pet-factory.selected-pet.v1";
const DEFAULT_STATE: PetState = "idle";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const AUTO_IDLE_MIN_DELAY = 7_000;
const AUTO_IDLE_MAX_DELAY = 15_000;
const MOUSE_FOLLOW_INTERVAL = 120;
const MOUSE_MOVE_THRESHOLD = 8;
const MOUSE_REACTION_RADIUS = 360;
const MOUSE_REACTION_VERTICAL_PADDING = 96;
const MOUSE_RUN_DISTANCE = 28;

const AUTO_BEHAVIORS: readonly { state: PetState; duration?: number }[] = [
  { state: "waving" },
  { state: "look-around", duration: 4_200 },
  { state: "waiting", duration: 3_400 },
];

interface PetManifest {
  id: string;
  displayName: string;
  description: string;
  spriteVersionNumber: number;
  spritesheetUrl: string;
}

interface PetCatalog {
  pets: PetManifest[];
}

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`桌面宠物节点未加载：${selector}`);
  return element;
}

function isPetManifest(value: unknown): value is PetManifest {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "displayName" in value &&
    "description" in value &&
    "spriteVersionNumber" in value &&
    "spritesheetUrl" in value &&
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    typeof value.description === "string" &&
    value.spriteVersionNumber === 2 &&
    typeof value.spritesheetUrl === "string"
  );
}

function isPetCatalog(value: unknown): value is PetCatalog {
  return (
    typeof value === "object" &&
    value !== null &&
    "pets" in value &&
    Array.isArray(value.pets) &&
    value.pets.every(isPetManifest)
  );
}

function randomDelay(): number {
  return Math.round(
    AUTO_IDLE_MIN_DELAY + Math.random() * (AUTO_IDLE_MAX_DELAY - AUTO_IDLE_MIN_DELAY),
  );
}

const petElement = requireElement("#pet");
const spriteElement = requireElement("#sprite");
const petWindow = getCurrentWindow();

let pets: PetManifest[] = [];
let currentState: PetState = DEFAULT_STATE;
let frameIndex = 0;
let completedLoops = 0;
let lastFrameAt = performance.now();
let animationFrameId = 0;
let nextBehaviorTimer: number | undefined;
let behaviorReturnTimer: number | undefined;
let movementReturnTimer: number | undefined;
let dragging = false;
let dragOriginX = 0;
let unlistenWindowMove: (() => void) | undefined;
let cursorFollowTimer: number | undefined;
let lastCursorPosition: PhysicalPosition | undefined;
let readingCursor = false;

function clearTimer(timer: number | undefined): undefined {
  if (timer !== undefined) window.clearTimeout(timer);
  return undefined;
}

function clearAutoBehaviorTimers(): void {
  nextBehaviorTimer = clearTimer(nextBehaviorTimer);
  behaviorReturnTimer = clearTimer(behaviorReturnTimer);
}

function showFrame(state: PetState, index: number): void {
  const animation = ANIMATIONS[state];
  const selected = animation.sequence?.[index] ?? {
    row: animation.row,
    column: index,
  };

  spriteElement.style.backgroundPosition = [
    `${-selected.column * ATLAS.frameWidth}px`,
    `${-selected.row * ATLAS.frameHeight}px`,
  ].join(" ");
}

function scheduleNextBehavior(): void {
  if (prefersReducedMotion || dragging || currentState !== DEFAULT_STATE) return;

  nextBehaviorTimer = clearTimer(nextBehaviorTimer);
  nextBehaviorTimer = window.setTimeout(() => {
    nextBehaviorTimer = undefined;
    if (dragging || currentState !== DEFAULT_STATE) return;

    const behavior = AUTO_BEHAVIORS[Math.floor(Math.random() * AUTO_BEHAVIORS.length)];
    setPetState(behavior.state);

    if (behavior.duration !== undefined) {
      behaviorReturnTimer = window.setTimeout(() => {
        behaviorReturnTimer = undefined;
        if (!dragging && currentState === behavior.state) setPetState(DEFAULT_STATE);
      }, behavior.duration);
    }
  }, randomDelay());
}

function setPetState(nextState: PetState): void {
  clearAutoBehaviorTimers();
  if (nextState !== "moving-left" && nextState !== "moving-right") {
    movementReturnTimer = clearTimer(movementReturnTimer);
  }

  currentState = nextState;
  frameIndex = 0;
  completedLoops = 0;
  lastFrameAt = performance.now();
  showFrame(currentState, frameIndex);
  document.documentElement.dataset.petState = nextState;

  if (nextState === DEFAULT_STATE) scheduleNextBehavior();
}

function animate(now: number): void {
  const animation = ANIMATIONS[currentState];

  if (now - lastFrameAt >= animation.frameDuration) {
    lastFrameAt = now;
    frameIndex += 1;

    if (frameIndex >= animation.frames) {
      frameIndex = 0;
      completedLoops += 1;

      if (animation.loops && completedLoops >= animation.loops) {
        setPetState(DEFAULT_STATE);
      }
    }

    showFrame(currentState, frameIndex);
  }

  animationFrameId = requestAnimationFrame(animate);
}

async function selectPet(id: string): Promise<void> {
  const pet = pets.find((candidate) => candidate.id === id);
  if (!pet) throw new Error(`未找到宠物：${id}`);

  spriteElement.style.backgroundImage = `url("${pet.spritesheetUrl}")`;
  document.title = `${pet.displayName} · Pet Factory`;
  petElement.setAttribute("aria-label", `${pet.displayName} 桌面宠物`);
  petElement.setAttribute("title", `在 ${pet.displayName} 附近左右移动鼠标可引导它小跑；也可拖动或双击互动`);
  spriteElement.setAttribute("aria-label", pet.displayName);
  localStorage.setItem(SELECTED_PET_KEY, pet.id);
  setPetState(DEFAULT_STATE);
}

async function loadPetCatalog(): Promise<void> {
  const response = await fetch("/pets/index.json", { cache: "no-store" });
  const catalog: unknown = await response.json();
  if (!response.ok || !isPetCatalog(catalog) || catalog.pets.length === 0) {
    throw new Error("宠物目录格式无效或为空");
  }

  pets = catalog.pets;
  const savedId = localStorage.getItem(SELECTED_PET_KEY);
  const defaultPet = pets.find((pet) => pet.id === savedId)
    ?? pets.find((pet) => pet.id === "rosie-haimei")
    ?? pets[0];
  await selectPet(defaultPet.id);
}

async function saveWindowPosition(): Promise<void> {
  const position = await petWindow.outerPosition();
  localStorage.setItem(
    POSITION_KEY,
    JSON.stringify({ x: position.x, y: position.y }),
  );
}

async function restoreWindowPosition(): Promise<boolean> {
  const raw = localStorage.getItem(POSITION_KEY);
  if (!raw) return false;

  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "x" in value &&
      "y" in value &&
      typeof value.x === "number" &&
      typeof value.y === "number"
    ) {
      await petWindow.setPosition(new PhysicalPosition(value.x, value.y));
      return true;
    }
  } catch {
    localStorage.removeItem(POSITION_KEY);
  }

  return false;
}

async function snapAndSave(): Promise<void> {
  await invoke("snap_to_edge");
  await saveWindowPosition();
}

function playMovement(direction: "moving-left" | "moving-right"): void {
  if (currentState !== direction) setPetState(direction);
  movementReturnTimer = clearTimer(movementReturnTimer);
  movementReturnTimer = window.setTimeout(() => {
    movementReturnTimer = undefined;
    if (!dragging && currentState === direction) setPetState(DEFAULT_STATE);
  }, 340);
}

function cursorIsNearPet(cursor: PhysicalPosition, position: PhysicalPosition): boolean {
  const petCenterX = position.x + ATLAS.frameWidth / 2;
  const minY = position.y - MOUSE_REACTION_VERTICAL_PADDING;
  const maxY = position.y + ATLAS.frameHeight + MOUSE_REACTION_VERTICAL_PADDING;

  return (
    Math.abs(cursor.x - petCenterX) <= MOUSE_REACTION_RADIUS
    && cursor.y >= minY
    && cursor.y <= maxY
  );
}

async function reactToMouseMovement(): Promise<void> {
  if (readingCursor || prefersReducedMotion || dragging || currentState !== DEFAULT_STATE) return;
  readingCursor = true;

  try {
    const cursor = await cursorPosition();
    const previous = lastCursorPosition;
    lastCursorPosition = cursor;
    if (!previous) return;

    const deltaX = cursor.x - previous.x;
    if (Math.abs(deltaX) < MOUSE_MOVE_THRESHOLD) return;

    const position = await petWindow.outerPosition();
    if (!cursorIsNearPet(cursor, position)) return;

    const direction = deltaX < 0 ? "moving-left" : "moving-right";
    playMovement(direction);
    await petWindow.setPosition(
      new PhysicalPosition(position.x + (direction === "moving-left" ? -MOUSE_RUN_DISTANCE : MOUSE_RUN_DISTANCE), position.y),
    );
    await invoke("clamp_to_work_area");
  } catch (error) {
    console.warn("无法读取鼠标位置，已保留拖动移动功能。", error);
  } finally {
    readingCursor = false;
  }
}

function startMouseFollow(): void {
  if (prefersReducedMotion || cursorFollowTimer !== undefined) return;

  cursorFollowTimer = window.setInterval(() => {
    void reactToMouseMovement();
  }, MOUSE_FOLLOW_INTERVAL);
}

async function startDragging(): Promise<void> {
  if (dragging) return;

  const startPosition = await petWindow.outerPosition();
  dragging = true;
  dragOriginX = startPosition.x;
  clearAutoBehaviorTimers();
  playMovement("moving-right");

  try {
    await petWindow.startDragging();
    const endPosition = await petWindow.outerPosition();
    playMovement(endPosition.x < dragOriginX ? "moving-left" : "moving-right");
    await snapAndSave();
  } finally {
    dragging = false;
  }
}

petElement.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  void startDragging();
});

petElement.addEventListener("dblclick", (event) => {
  event.preventDefault();
  setPetState("waving");
});

petElement.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrameId);
  clearAutoBehaviorTimers();
  movementReturnTimer = clearTimer(movementReturnTimer);
  cursorFollowTimer = clearTimer(cursorFollowTimer);
  unlistenWindowMove?.();
});

async function initialize(): Promise<void> {
  try {
    await Promise.all([
      listen<unknown>("pet-state", ({ payload }) => {
        if (isPetState(payload)) setPetState(payload);
      }),
      listen<unknown>("pet-select", ({ payload }) => {
        if (typeof payload === "string") {
          void selectPet(payload).catch((error: unknown) => console.error("切换宠物失败", error));
        }
      }),
    ]);

    unlistenWindowMove = await petWindow.onMoved(({ payload }) => {
      if (!dragging || Math.abs(payload.x - dragOriginX) < 3) return;
      playMovement(payload.x < dragOriginX ? "moving-left" : "moving-right");
    });

    await loadPetCatalog();
    const restored = await restoreWindowPosition();
    if (restored) {
      await invoke("clamp_to_work_area");
    } else {
      await invoke("place_at_default_edge");
    }
  } catch (error) {
    console.error("Pet Factory 初始化失败。", error);
    setPetState(DEFAULT_STATE);
  }

  if (!prefersReducedMotion) animationFrameId = requestAnimationFrame(animate);
  startMouseFollow();
  await petWindow.show();
}

void initialize();
