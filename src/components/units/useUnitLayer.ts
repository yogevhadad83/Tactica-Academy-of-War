import { useCallback, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { PlacedUnit, Position } from '../../types';
import type { AttackType, DemoState, HitEvent } from '../../types/battle';
import { boardKey, cellToWorld } from '../../constants/board';
import { COMPUTED_ANIMATION_DURATIONS } from '../../data/animationMetadata';

export type AnimationState = 'idle' | 'walk' | 'fight' | 'death' | 'impact';
export type ModelKey = string;

interface ModelDefinition {
  key: ModelKey;
  path: string;
  targetHeight: number;
  animations: Record<AnimationState, string>;
}

interface LoadedModelAsset {
  key: ModelKey;
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  scale: number;
  yOffset: number;
  rawHeight?: number;
}

export interface UnitVisual {
  group: THREE.Group;
  glowMaterial: THREE.MeshBasicMaterial;
  hpCanvas: HTMLCanvasElement;
  hpTexture: THREE.CanvasTexture;
  hpPlane: THREE.Mesh;
  hpWorldSpace: boolean;
  hpOffset: number;
  mixer?: THREE.AnimationMixer;
  actions?: Partial<Record<AnimationState, THREE.AnimationAction>>;
  impactActions?: THREE.AnimationAction[]; // Array of impact animation variants
  idleActions?: THREE.AnimationAction[]; // Array of idle animation variants (Idle_0, Idle_1, etc.)
  fightActions?: THREE.AnimationAction[]; // Array of fight animation variants (Fight_0, Fight_1, etc.)
  currentAnimation?: AnimationState;
  currentImpactIndex?: number; // Track which impact variant is currently playing
  currentIdleIndex?: number; // Track which idle variant is currently playing
  currentFightIndex?: number; // Track which fight variant is currently playing
  fightAnimationStartTime?: number;
  impactAnimationStartTime?: number;
  nextIdleVariantTime?: number; // When to trigger the next random idle variant
  isCustomMesh?: boolean;
  modelKey?: ModelKey;
  targetPosition: THREE.Vector3;
  moveStartPosition: THREE.Vector3;
  moveStartTime?: number;
  positionInitialized: boolean;
  fadeMaterials: THREE.Material[];
  fadeStartTime?: number;
  deathTimestamp?: number;
  isDead: boolean;
  // HP animation state
  displayHp: number; // Currently displayed HP (animates towards targetHp)
  targetHp: number; // Target HP to animate towards
  maxHp: number; // Maximum HP for this unit
  team: 'player' | 'enemy'; // Team for HP bar color
  hpAnimationStartTime?: number; // When HP animation started
  hpAnimationStartValue?: number; // HP value when animation started
  showHpDetails: boolean; // Whether to show heart icon and HP number
}

const playerColor = new THREE.Color(0x5ea3ff);
const enemyColor = new THREE.Color(0xf87171);
const HP_CANVAS_WIDTH = 340;
const HP_CANVAS_HEIGHT = 64;
const HP_BAR_MARGIN = 44;
const HP_BAR_HEIGHT = 20;
const HP_PLANE_WIDTH = 1.6;
const HP_PLANE_HEIGHT = 0.22;
const HP_PLANE_BASE_HEIGHT = 2.05;
const HP_PLANE_BOB_AMPLITUDE = 0.05;
const HP_PLANE_BOB_SPEED = 0.0015;
const HP_ANIMATION_DURATION_MS = 400; // Duration for HP bar to animate down

const MOVE_DURATION_MS = 780;
const DEATH_FADE_DURATION_MS = 1400;
const DEATH_FADE_DELAY_MS = 3000;
const FIGHT_ANIMATION_MIN_DURATION_MS = 1550; // 46 frames at 30fps ≈ 1.53s
const IMPACT_ANIMATION_DURATION_MS = 800; // Duration for impact animation to play
const IDLE_VARIANT_MIN_DELAY_MS = 4000; // Minimum time between random idle triggers
const IDLE_VARIANT_MAX_DELAY_MS = 12000; // Maximum time between random idle triggers
const MELEE_IMPACT_DELAY_MS = 650; // Delay before melee impact plays (when sword connects)
const ARROW_TRAVEL_DURATION_MS = 520;
const RANGED_IMPACT_DELAY_MS = 50; // Small delay so impact plays right as arrow arrives (not after)
const ARROW_LAUNCH_HEIGHT = 1.65;
const ARROW_IMPACT_HEIGHT = 1.2;
const ARROW_FORWARD_OFFSET = 0.35;
const ARCHER_UNIT_ID = 'archer';
const MAX_PROCESSED_HIT_IDS = 128;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

interface ArrowProjectile {
  id: string;
  mesh: THREE.Group;
  start: THREE.Vector3;
  end: THREE.Vector3;
  startTime: number;
  duration: number;
}

const arrowShaftGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.55, 6);
const arrowHeadGeometry = new THREE.ConeGeometry(0.035, 0.16, 8);
const arrowShaftMaterial = new THREE.MeshStandardMaterial({
  color: 0xfcd34d,
  emissive: 0xf97316,
  emissiveIntensity: 0.65,
  metalness: 0.05,
  roughness: 0.4,
  depthWrite: false,
  transparent: true,
  opacity: 0.95
});
const arrowHeadMaterial = new THREE.MeshStandardMaterial({
  color: 0xf97316,
  emissive: 0xf97316,
  emissiveIntensity: 0.8,
  metalness: 0.05,
  roughness: 0.35,
  depthWrite: false,
  transparent: true,
  opacity: 0.9
});
const arrowUpVector = new THREE.Vector3(0, 1, 0);
const arrowTempVector = new THREE.Vector3();

const DEFAULT_MODEL_TARGET_HEIGHT = 1.9;
const DEFAULT_ANIMATIONS: Record<AnimationState, string> = {
  idle: 'Idle_0',
  walk: 'Walk_0',
  fight: 'Fight_0',
  death: 'Death_0',
  impact: 'Impact_0'
};

// Impact timing metadata: when the weapon/attack connects during each fight animation
// Maps model key -> fight animation name -> impact delay in milliseconds
const FIGHT_IMPACT_TIMINGS: Record<string, Record<string, number>> = {
  knight: {
    'Fight_0': 600,  // Sword connects after 0.6 seconds
    'Fight_1': 500,  // Faster swing, connects after 0.5 seconds
  },
  beast: {
    'Fight_0': 600,  // Claw/attack connects after 0.6 seconds
  },
};

// Get the impact delay for a specific model and its current fight animation
const getImpactDelay = (modelKey: string, fightAnimationName: string): number => {
  const modelTimings = FIGHT_IMPACT_TIMINGS[modelKey];
  if (modelTimings && modelTimings[fightAnimationName] !== undefined) {
    return modelTimings[fightAnimationName];
  }
  // Default fallback
  return MELEE_IMPACT_DELAY_MS;
};

const ANIMATION_SPEED_OVERRIDES: Partial<Record<ModelKey, Partial<Record<AnimationState, number>>>> = {
  archer: {
    fight: 0.5 // slower fight loop so archers launch one arrow for every two melee swings
  }
};

type ModelOverride = Partial<Pick<ModelDefinition, 'path' | 'targetHeight' | 'animations'>>;
const MODEL_OVERRIDES: Record<ModelKey, ModelOverride> = {};

const getModelDefinition = (modelKey: ModelKey): ModelDefinition => {
  const override = MODEL_OVERRIDES[modelKey] ?? {};
  return {
    key: modelKey,
    // Use absolute root so GLTFLoader works from any routed page (avoids /board/models/... 404)
    // Model files are lowercase, so normalize the key
    path: override.path ?? `/models/${modelKey.toLowerCase()}.glb`,
    targetHeight: override.targetHeight ?? DEFAULT_MODEL_TARGET_HEIGHT,
    animations: override.animations ?? DEFAULT_ANIMATIONS
  };
};

const DEFAULT_MODEL_KEY: ModelKey = 'knight';
export const getModelKeyForUnit = (unitId: string): ModelKey => unitId || DEFAULT_MODEL_KEY;
const isUnitDead = (unit: PlacedUnit) => (unit.currentHp ?? unit.hp) <= 0;

// Animation durations in milliseconds - imported from auto-generated metadata
// To update, run: npx tsx scripts/extract-animation-metadata.ts
const ANIMATION_DURATIONS = COMPUTED_ANIMATION_DURATIONS;

// Default durations for animations not specified per-model (in ms)
const DEFAULT_ANIMATION_DURATIONS: Record<AnimationState, number> = {
  idle: 3000,
  walk: 1000,
  fight: 1500,
  death: 3000,
  impact: 1000
};

// Get the duration of an animation for a specific model
export const getAnimationDuration = (modelKey: ModelKey, state: AnimationState): number => {
  return ANIMATION_DURATIONS[modelKey]?.[state] ?? DEFAULT_ANIMATION_DURATIONS[state] ?? 1000;
};

// Calculate the duration a tick should take based on animations that will play
// Returns duration in milliseconds
export const calculateTickDuration = (
  hitEvents: HitEvent[],
  units: PlacedUnit[]
): number => {
  if (hitEvents.length === 0) {
    // No attacks this tick - just movement or idle
    return MOVE_DURATION_MS;
  }

  const unitById = new Map(units.map((u) => [u.instanceId, u]));
  let maxDuration = 0;

  for (const event of hitEvents) {
    const attacker = unitById.get(event.attackerId);
    const attackerModelKey = attacker ? getModelKeyForUnit(attacker.id) : DEFAULT_MODEL_KEY;

    // Attacker plays fight animation
    const attackerDuration = getAnimationDuration(attackerModelKey, 'fight');
    maxDuration = Math.max(maxDuration, attackerDuration);

    // Target's impact animation timing
    // Impact is delayed (melee: when weapon connects, ranged: arrow travel time)
    // Total time = delay + impact duration
    if (event.targetId) {
      const target = unitById.get(event.targetId);
      const targetModelKey = target ? getModelKeyForUnit(target.id) : DEFAULT_MODEL_KEY;
      
      let impactDelay: number;
      if (event.attackType === 'melee') {
        const attackerModelDef = getModelDefinition(attackerModelKey);
        const fightAnimName = attackerModelDef.animations.fight;
        impactDelay = getImpactDelay(attackerModelKey, fightAnimName);
      } else {
        // Ranged: arrow travel time + small buffer
        impactDelay = ARROW_TRAVEL_DURATION_MS + RANGED_IMPACT_DELAY_MS;
      }
      
      const impactDuration = getAnimationDuration(targetModelKey, 'impact');
      const totalImpactTime = impactDelay + impactDuration;
      maxDuration = Math.max(maxDuration, totalImpactTime);
    }
  }

  // Ensure a minimum tick duration for visual clarity
  const MIN_TICK_DURATION_MS = 800;
  return Math.max(maxDuration, MIN_TICK_DURATION_MS);
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const toWorldVector = (position: Position, boardRows: number, boardCols: number, height: number) => {
  const { x, z } = cellToWorld(position.row, position.col, boardRows, boardCols);
  return new THREE.Vector3(x, height, z);
};

const createArrowMesh = () => {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(arrowShaftGeometry, arrowShaftMaterial);
  shaft.castShadow = false;
  shaft.receiveShadow = false;
  const head = new THREE.Mesh(arrowHeadGeometry, arrowHeadMaterial);
  head.position.y = 0.35;
  head.castShadow = false;
  head.receiveShadow = false;
  group.add(shaft);
  group.add(head);
  return group;
};

const createHpCanvas = (unit: PlacedUnit, showHpDetails: boolean = false) => {
  const canvas = document.createElement('canvas');
  // render at device pixel ratio for a crisp, non-blurry HUD
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  canvas.width = Math.round(HP_CANVAS_WIDTH * dpr);
  canvas.height = Math.round(HP_CANVAS_HEIGHT * dpr);
  // store logical size for drawing calculations on the canvas
  (canvas as any).__logicalWidth = HP_CANVAS_WIDTH;
  (canvas as any).__logicalHeight = HP_CANVAS_HEIGHT;
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(HP_PLANE_WIDTH, HP_PLANE_HEIGHT), material);
  plane.renderOrder = 5;
  // plane size is in world units and independent of canvas resolution
  plane.position.y = HP_PLANE_BASE_HEIGHT;
  // ensure texture mapping won't interpolate on low-res devices
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  const currentHp = unit.currentHp ?? unit.hp;
  updateHpCanvas(canvas, texture, currentHp, unit.hp, unit.team, showHpDetails);
  return { canvas, texture, plane };
};

const updateHpCanvas = (
  canvas: HTMLCanvasElement,
  texture: THREE.CanvasTexture,
  displayHp: number,
  maxHp: number,
  team: 'player' | 'enemy',
  showHpDetails: boolean = false
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const ratio = clamp(displayHp / maxHp, 0, 1);
  const hpValue = displayHp;
  // adapt coordinates for DPR scaled canvas
  const dpr = canvas.width / ((canvas as any).__logicalWidth || HP_CANVAS_WIDTH);

  // Outer ghosted pill container
  const containerX = Math.round(12 * dpr);
  const containerY = Math.round(10 * dpr);
  const containerWidth = canvas.width - containerX * 2;
  const containerHeight = canvas.height - containerY * 2;
  const containerRadius = Math.round(containerHeight / 2);

  const outerGrad = ctx.createLinearGradient(containerX, containerY, containerX, containerY + containerHeight);
  outerGrad.addColorStop(0, 'rgba(15,23,42,0.85)');
  outerGrad.addColorStop(1, 'rgba(15,23,42,0.6)');
  ctx.fillStyle = outerGrad;
  drawRoundedRect(ctx, containerX, containerY, containerWidth, containerHeight, containerRadius);
  ctx.fill();

  // Subtle outline
  ctx.strokeStyle = 'rgba(148,163,184,0.45)';
  ctx.lineWidth = Math.max(0.5, 0.5 * dpr);
  drawRoundedRect(ctx, containerX + Math.max(0.25, 0.5 * dpr), containerY + Math.max(0.25, 0.5 * dpr), containerWidth - Math.max(1, 1 * dpr), containerHeight - Math.max(1, 1 * dpr), containerRadius);
  ctx.stroke();

  // Inner track (inset area for HP bar)
  // When showing details, leave room for heart icon on left and HP number on right
  const trackX = showHpDetails ? Math.round(HP_BAR_MARGIN * dpr) : Math.round(20 * dpr);
  const trackWidth = showHpDetails 
    ? Math.round(canvas.width - HP_BAR_MARGIN * dpr - 58 * dpr) // leave room for HP number
    : Math.round(canvas.width - 40 * dpr); // use more width when no details
  const trackY = Math.round((canvas.height - HP_BAR_HEIGHT * dpr) / 2);
  const cornerRadius = Math.round((HP_BAR_HEIGHT * dpr) / 2);

  // Inset base
  const insetGrad = ctx.createLinearGradient(trackX, trackY - 4, trackX, trackY + HP_BAR_HEIGHT + 4);
  insetGrad.addColorStop(0, 'rgba(15,23,42,0.95)');
  insetGrad.addColorStop(1, 'rgba(15,23,42,0.7)');
  ctx.fillStyle = insetGrad;
  drawRoundedRect(ctx, trackX, trackY, trackWidth, Math.round(HP_BAR_HEIGHT * dpr), cornerRadius);
  ctx.fill();

  // HP fill with gradient
  if (ratio > 0) {
    const gradient = ctx.createLinearGradient(trackX, trackY, trackX + trackWidth, trackY + Math.round(HP_BAR_HEIGHT * dpr));
    gradient.addColorStop(0, team === 'player' ? '#38bdf8' : '#fb7185');
    gradient.addColorStop(1, team === 'player' ? '#22c55e' : '#fb923c');
    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, trackX, trackY, Math.round(trackWidth * ratio), Math.round(HP_BAR_HEIGHT * dpr), cornerRadius);
    ctx.fill();

    // Subtle top highlight
    const highlightGrad = ctx.createLinearGradient(trackX, trackY, trackX, trackY + Math.round(HP_BAR_HEIGHT * dpr));
    highlightGrad.addColorStop(0, 'rgba(255,255,255,0.25)');
    highlightGrad.addColorStop(0.4, 'rgba(255,255,255,0.05)');
    highlightGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = highlightGrad;
    drawRoundedRect(ctx, trackX, trackY, Math.round(trackWidth * ratio), Math.round(HP_BAR_HEIGHT * dpr), cornerRadius);
    ctx.fill();
  }

  // Heart icon and HP number (only shown when showHpDetails is true)
  if (showHpDetails) {
    // Heart icon (crisp vector, not skewed)
    const heartSize = Math.round(12 * dpr);
    const heartX = containerX + Math.round(14 * dpr);
    const heartY = Math.round(canvas.height / 2);
    ctx.save();
    ctx.translate(heartX, heartY);
    ctx.fillStyle = '#ff2d55'; // more vibrant heart color
    ctx.beginPath();
    // draw heart relative to translation origin (0,0)
    ctx.moveTo(0, -heartSize * 0.3);
    ctx.bezierCurveTo(0, -heartSize * 0.7, -heartSize * 0.6, -heartSize * 0.7, -heartSize * 0.6, -heartSize * 0.3);
    ctx.bezierCurveTo(-heartSize * 0.6, heartSize * 0.1, 0, heartSize * 0.5, 0, heartSize * 0.7);
    ctx.bezierCurveTo(0, heartSize * 0.5, heartSize * 0.6, heartSize * 0.1, heartSize * 0.6, -heartSize * 0.3);
    ctx.bezierCurveTo(heartSize * 0.6, -heartSize * 0.7, 0, -heartSize * 0.7, 0, -heartSize * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // HP number (small, crisp, subtle stroke to avoid blurriness)
    const fontSize = Math.round(11 * dpr);
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const numberX = canvas.width - containerX - Math.round(8 * dpr);
    const numberY = Math.round(canvas.height / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    // subtle thin stroke for contrast
    ctx.lineWidth = Math.max(0.6, 0.6 * dpr);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.strokeText(String(Math.round(hpValue)), numberX, numberY + 0.5);
    ctx.fillText(String(Math.round(hpValue)), numberX, numberY + 0.5);
  }

  texture.needsUpdate = true;
};

const setVisualAnimation = (visual: UnitVisual, state: AnimationState, attackType?: AttackType) => {
  if (!visual.actions || !visual.mixer) return;
  if (visual.currentAnimation === state && state !== 'impact') return;
  
  // If currently playing fight animation, check if minimum duration has elapsed
  if (visual.currentAnimation === 'fight' && visual.fightAnimationStartTime !== undefined) {
    const elapsed = performance.now() - visual.fightAnimationStartTime;
    // Only allow interruption by death, or if fight animation has completed
    if (state !== 'death' && elapsed < FIGHT_ANIMATION_MIN_DURATION_MS) {
      return; // Don't interrupt the fight animation yet
    }
  }
  
  // If currently playing impact animation, check if it has completed
  // BUT allow impact to restart with a different variant if another hit comes in
  if (visual.currentAnimation === 'impact' && visual.impactAnimationStartTime !== undefined) {
    const elapsed = performance.now() - visual.impactAnimationStartTime;
    if (state === 'impact') {
      // Another hit came in! Restart impact with a different variant
      const impactActions = visual.impactActions;
      if (impactActions && impactActions.length > 0) {
        // Stop the current impact animation
        const currentImpactAction = impactActions[visual.currentImpactIndex ?? 0];
        if (currentImpactAction) {
          currentImpactAction.fadeOut(0.1);
        }
        
        // Choose a different impact variant if available
        let nextIndex = (visual.currentImpactIndex ?? 0) + 1;
        if (nextIndex >= impactActions.length) {
          nextIndex = 0;
        }
        // If only one variant, use the same one
        if (impactActions.length === 1) {
          nextIndex = 0;
        }
        
        const nextImpactAction = impactActions[nextIndex];
        if (nextImpactAction) {
          nextImpactAction.reset().fadeIn(0.1).play();
          visual.currentImpactIndex = nextIndex;
          visual.impactAnimationStartTime = performance.now();
        }
        return;
      }
    } else {
      // Only allow interruption by death or fight, or if impact animation has completed
      if (state !== 'death' && state !== 'fight' && elapsed < IMPACT_ANIMATION_DURATION_MS) {
        return; // Don't interrupt the impact animation yet
      }
    }
  }
  
  // Handle impact animation specially - use the impact actions array
  if (state === 'impact') {
    const impactActions = visual.impactActions;
    if (impactActions && impactActions.length > 0) {
      if (visual.currentAnimation) {
        const current = visual.actions[visual.currentAnimation];
        current?.fadeOut(0.2);
      }
      // Start with first impact variant (or cycle if already playing)
      const impactIndex = 0;
      const impactAction = impactActions[impactIndex];
      if (impactAction) {
        impactAction.reset().fadeIn(0.2).play();
        visual.currentImpactIndex = impactIndex;
        visual.currentAnimation = state;
        visual.impactAnimationStartTime = performance.now();
        visual.fightAnimationStartTime = undefined;
      }
      return;
    }
  }
  
  // Handle fight animation specially - use the fight actions array with random variant
  if (state === 'fight') {
    const fightActions = visual.fightActions;
    if (fightActions && fightActions.length > 0) {
      if (visual.currentAnimation) {
        const current = visual.actions[visual.currentAnimation];
        current?.fadeOut(0.2);
        // Also fade out any impact/fight actions that might be playing
        if (visual.currentAnimation === 'impact' && visual.impactActions) {
          visual.impactActions.forEach(action => action?.fadeOut(0.2));
        }
        if (visual.currentAnimation === 'fight' && visual.fightActions) {
          visual.fightActions.forEach(action => action?.fadeOut(0.2));
        }
      }
      // For archers: Fight_0 for ranged (distant), Fight_1 for melee (adjacent)
      // For other units: pick a random fight variant
      let fightIndex: number;
      if (visual.modelKey === ARCHER_UNIT_ID && attackType) {
        fightIndex = attackType === 'ranged' ? 0 : 1;
        // Ensure index is valid
        if (fightIndex >= fightActions.length) fightIndex = 0;
      } else {
        fightIndex = Math.floor(Math.random() * fightActions.length);
      }
      const fightAction = fightActions[fightIndex];
      if (fightAction) {
        fightAction.reset().fadeIn(0.2).play();
        visual.currentFightIndex = fightIndex;
        visual.currentAnimation = state;
        visual.fightAnimationStartTime = performance.now();
        visual.impactAnimationStartTime = undefined;
      }
      return;
    }
  }
  
  const nextAction = visual.actions[state];
  if (!nextAction) return;
  if (visual.currentAnimation) {
    const current = visual.actions[visual.currentAnimation];
    current?.fadeOut(0.2);
    // Also fade out any impact/fight actions that might be playing
    if (visual.currentAnimation === 'impact' && visual.impactActions) {
      visual.impactActions.forEach(action => action?.fadeOut(0.2));
    }
    if (visual.currentAnimation === 'fight' && visual.fightActions) {
      visual.fightActions.forEach(action => action?.fadeOut(0.2));
    }
  }
  nextAction.reset().fadeIn(0.2).play();
  visual.currentAnimation = state;
  
  // Track when fight animation starts
  if (state === 'fight') {
    visual.fightAnimationStartTime = performance.now();
  } else {
    visual.fightAnimationStartTime = undefined;
  }
  
  // Track when impact animation starts (for fallback single action)
  if (state === 'impact') {
    visual.impactAnimationStartTime = performance.now();
  } else {
    visual.impactAnimationStartTime = undefined;
  }
};

const enterDeathState = (visual: UnitVisual) => {
  if (visual.isDead) return;
  visual.isDead = true;
  visual.deathTimestamp = performance.now();
  visual.fadeStartTime = undefined;
  visual.group.visible = true;
  visual.hpPlane.visible = true;
  if (visual.isCustomMesh) {
    setVisualAnimation(visual, 'death');
  }
};

const exitDeathState = (visual: UnitVisual) => {
  if (!visual.isDead) return;
  visual.isDead = false;
  visual.fadeStartTime = undefined;
  visual.deathTimestamp = undefined;
  visual.group.visible = true;
  visual.hpPlane.visible = true;
  visual.fadeMaterials.forEach((material) => {
    material.opacity = 1;
  });
  visual.glowMaterial.opacity = 0.6;
  if (visual.actions?.death) {
    visual.actions.death.stop();
    visual.actions.death.reset();
  }
  visual.currentAnimation = undefined;
  if (visual.isCustomMesh) {
    setVisualAnimation(visual, 'idle');
  }
};

const disposeVisual = (visual: UnitVisual) => {
  if (visual.group.parent) {
    visual.group.parent.remove(visual.group);
  }
  if (visual.hpWorldSpace && visual.hpPlane.parent) {
    visual.hpPlane.parent.remove(visual.hpPlane);
  }
  visual.hpTexture.dispose();
  (visual.hpPlane.geometry as THREE.BufferGeometry).dispose();
  const disposedMaterials = new Set<THREE.Material>();
  const disposeMaterial = (material?: THREE.Material) => {
    if (!material || disposedMaterials.has(material)) return;
    disposedMaterials.add(material);
    material.dispose();
  };
  disposeMaterial(visual.hpPlane.material as THREE.Material);
  disposeMaterial(visual.glowMaterial);
  visual.fadeMaterials.forEach((material) => disposeMaterial(material));
  visual.mixer?.stopAllAction();
};

const createVisual = (
  unit: PlacedUnit,
  modelAsset: LoadedModelAsset | undefined,
  modelDefinition: ModelDefinition,
  showHpOverlay: boolean,
  hpParent: THREE.Group | null,
  hpWorldSpace: boolean,
  showHpDetails: boolean = false
): UnitVisual => {
  const group = new THREE.Group();
  const { canvas, texture, plane } = createHpCanvas(unit, showHpDetails);
  let glowColor = (unit.team === 'player' ? playerColor : enemyColor).clone();
  let mixer: THREE.AnimationMixer | undefined;
  let actions: Partial<Record<AnimationState, THREE.AnimationAction>> | undefined;
  let impactActions: THREE.AnimationAction[] | undefined;
  let idleActions: THREE.AnimationAction[] | undefined;
  let fightActions: THREE.AnimationAction[] | undefined;
  const fadeMaterials = new Set<THREE.Material>();
  const registerFadableMaterial = (material?: THREE.Material | THREE.Material[]) => {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach((mat) => registerFadableMaterial(mat));
      return;
    }
    fadeMaterials.add(material);
  };

  if (modelAsset) {
    const modelClone = clone(modelAsset.scene);
    modelClone.scale.setScalar(modelAsset.scale);
    modelClone.position.y = modelAsset.yOffset;
    modelClone.rotation.y = unit.team === 'player' ? Math.PI : 0;
    modelClone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((mat) => {
            if (!mat) return mat;
            const cloned = mat.clone();
            registerFadableMaterial(cloned);
            return cloned;
          });
        } else if (child.material) {
          const cloned = child.material.clone();
          child.material = cloned;
          registerFadableMaterial(cloned);
        }
        child.frustumCulled = false;
      }
    });
    group.add(modelClone);
    mixer = new THREE.AnimationMixer(modelClone);
    actions = {};
    impactActions = [];
    const animationNames = modelDefinition.animations;
    (Object.entries(animationNames) as [AnimationState, string][]).forEach(([state, clipName]) => {
      const clip = THREE.AnimationClip.findByName(modelAsset.animations, clipName);
      if (!clip) return;
      const action = mixer!.clipAction(clip);
      // These animations should play once and hold on the last frame
      if (state === 'death' || state === 'fight' || state === 'impact') {
        action.reset();
        action.clampWhenFinished = true;
        action.setLoop(THREE.LoopOnce, 1);
      }
      const override = ANIMATION_SPEED_OVERRIDES[modelDefinition.key]?.[state];
      if (override) {
        action.timeScale = override;
      }
      actions![state] = action;
    });
    
    // Collect all impact animation variants (Impact_0, Impact_1, etc.)
    modelAsset.animations.forEach((clip) => {
      if (clip.name.startsWith('Impact_')) {
        const action = mixer!.clipAction(clip);
        action.reset();
        action.clampWhenFinished = true;
        action.setLoop(THREE.LoopOnce, 1);
        impactActions!.push(action);
      }
    });
    
    // Collect all idle animation variants (Idle_0, Idle_1, etc.)
    idleActions = [];
    modelAsset.animations.forEach((clip) => {
      if (clip.name.startsWith('Idle_')) {
        const action = mixer!.clipAction(clip);
        // Idle animations should loop
        action.setLoop(THREE.LoopRepeat, Infinity);
        idleActions!.push(action);
      }
    });
    
    // Collect all fight animation variants (Fight_0, Fight_1, etc.)
    fightActions = [];
    modelAsset.animations.forEach((clip) => {
      if (clip.name.startsWith('Fight_')) {
        const action = mixer!.clipAction(clip);
        action.reset();
        action.clampWhenFinished = true;
        action.setLoop(THREE.LoopOnce, 1);
        fightActions!.push(action);
      }
    });
  } else {
    const columnGeometry = new THREE.CapsuleGeometry(0.35, 0.6, 8, 16);
    const columnMaterial = new THREE.MeshStandardMaterial({
      color: unit.team === 'player' ? playerColor : enemyColor,
      emissive:
        unit.team === 'player' ? playerColor.clone().multiplyScalar(0.35) : enemyColor.clone().multiplyScalar(0.35),
      metalness: 0.55,
      roughness: 0.25
    });
    const body = new THREE.Mesh(columnGeometry, columnMaterial);
    body.castShadow = true;
    body.position.y = 1.2;
    group.add(body);
    registerFadableMaterial(columnMaterial);

    const crestMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: columnMaterial.color.clone(),
      emissiveIntensity: 0.8
    });
    const crest = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 18), crestMaterial);
    crest.position.y = 2;
    group.add(crest);
    registerFadableMaterial(crestMaterial);
    glowColor = columnMaterial.color;
  }

  // Change 2: Removed glowing circles under units
  // Create a dummy material for glowMaterial reference (required by interface)
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: glowColor,
    transparent: true,
    opacity: 0,
    visible: false
  });

  if (showHpOverlay) {
    if (hpWorldSpace && hpParent) {
      hpParent.add(plane);
    } else {
      group.add(plane);
    }
    registerFadableMaterial(plane.material as THREE.Material);
  } else {
    plane.visible = false;
  }
  registerFadableMaterial(plane.material as THREE.Material);
  // Change 2: glowMaterial is now a dummy (no visible ring)

  // compute per-model hp offset so the bar sits above the head, using model raw height when available
  const computedHpOffset = modelAsset && typeof modelAsset.rawHeight === 'number'
    ? modelAsset.rawHeight * modelAsset.scale + 0.12
    : HP_PLANE_BASE_HEIGHT;
  // place the plane initially at the computed offset
  plane.position.y = computedHpOffset;

  // Helper to generate random delay for next idle variant
  const getRandomIdleDelay = () => 
    IDLE_VARIANT_MIN_DELAY_MS + Math.random() * (IDLE_VARIANT_MAX_DELAY_MS - IDLE_VARIANT_MIN_DELAY_MS);

  return {
    group,
    glowMaterial, // Change 2: Now a dummy invisible material
    hpCanvas: canvas,
    hpTexture: texture,
    hpPlane: plane,
    mixer,
    actions,
    impactActions,
    idleActions,
    fightActions,
    currentIdleIndex: 0,
    nextIdleVariantTime: performance.now() + getRandomIdleDelay() + Math.random() * 3000, // Stagger initial timing
    isCustomMesh: Boolean(modelAsset),
    modelKey: modelAsset?.key,
    targetPosition: new THREE.Vector3(),
    moveStartPosition: new THREE.Vector3(),
    positionInitialized: false,
    fadeMaterials: Array.from(fadeMaterials),
    deathTimestamp: undefined,
    isDead: false,
    hpWorldSpace,
    hpOffset: computedHpOffset,
    // Initialize HP animation state
    displayHp: unit.currentHp ?? unit.hp,
    targetHp: unit.currentHp ?? unit.hp,
    maxHp: unit.hp,
    team: unit.team,
    hpAnimationStartTime: undefined,
    hpAnimationStartValue: undefined,
    showHpDetails
  };
};

const updateHpFacingForVisual = (visual: UnitVisual, camera: THREE.PerspectiveCamera) => {
  const bobOffset = Math.sin(performance.now() * HP_PLANE_BOB_SPEED) * HP_PLANE_BOB_AMPLITUDE;
  if (visual.hpWorldSpace) {
    // Get world position of unit group since it may be inside a rotating parent
    const worldPos = new THREE.Vector3();
    visual.group.getWorldPosition(worldPos);
    const offset = typeof visual.hpOffset === 'number' ? visual.hpOffset : HP_PLANE_BASE_HEIGHT;
    visual.hpPlane.position.set(worldPos.x, worldPos.y + offset + bobOffset, worldPos.z);
  } else {
    visual.hpPlane.position.y = HP_PLANE_BASE_HEIGHT + bobOffset;
  }
  visual.hpPlane.quaternion.copy(camera.quaternion);
};

interface UseUnitLayerOptions {
  showHpOverlay?: boolean;
  hpWorldSpace?: boolean;
  showHpDetails?: boolean;
}

export const useUnitLayer = (
  unitRootRef: MutableRefObject<THREE.Group | null>,
  hpRootRef: MutableRefObject<THREE.Group | null> = unitRootRef,
  options: UseUnitLayerOptions = {}
) => {
  const showHpOverlay = options.showHpOverlay !== false;
  const hpWorldSpace = options.hpWorldSpace === true;
  const showHpDetails = options.showHpDetails === true;
  const unitVisualsRef = useRef<Map<string, UnitVisual>>(new Map());
  const modelAssetsRef = useRef<Record<ModelKey, LoadedModelAsset | undefined>>(
    {} as Record<ModelKey, LoadedModelAsset | undefined>
  );
  const pendingModelLoadsRef = useRef<Set<ModelKey>>(new Set());
  const arrowProjectilesRef = useRef<ArrowProjectile[]>([]);
  const processedHitIdsRef = useRef<Set<string>>(new Set());
  const processedHitQueueRef = useRef<string[]>([]);
  const [modelRevision, setModelRevision] = useState(0);

  const rememberHitId = useCallback((id: string) => {
    processedHitIdsRef.current.add(id);
    processedHitQueueRef.current.push(id);
    if (processedHitQueueRef.current.length > MAX_PROCESSED_HIT_IDS) {
      const expired = processedHitQueueRef.current.shift();
      if (expired) {
        processedHitIdsRef.current.delete(expired);
      }
    }
  }, []);

  const updateProjectiles = useCallback(() => {
    if (arrowProjectilesRef.current.length === 0) {
      return;
    }
    const now = performance.now();
    arrowProjectilesRef.current = arrowProjectilesRef.current.filter((projectile) => {
      const progress = clamp((now - projectile.startTime) / projectile.duration, 0, 1);
      const eased = easeOutCubic(progress);
      arrowTempVector.copy(projectile.start).lerp(projectile.end, eased);
      projectile.mesh.position.copy(arrowTempVector);
      if (progress >= 1) {
        projectile.mesh.parent?.remove(projectile.mesh);
        return false;
      }
      return true;
    });
  }, []);

  const clearProjectiles = useCallback(() => {
    arrowProjectilesRef.current.forEach((projectile) => {
      projectile.mesh.parent?.remove(projectile.mesh);
    });
    arrowProjectilesRef.current = [];
    processedHitIdsRef.current.clear();
    processedHitQueueRef.current = [];
  }, []);

  const ensureModelAsset = useCallback(
    (modelKey: ModelKey) => {
      if (modelAssetsRef.current[modelKey] || pendingModelLoadsRef.current.has(modelKey)) {
        return;
      }
      pendingModelLoadsRef.current.add(modelKey);
      const definition = getModelDefinition(modelKey);
      const loader = new GLTFLoader();
      loader.load(
        definition.path,
        (gltf) => {
          gltf.scene.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(gltf.scene);
          const size = bounds.getSize(new THREE.Vector3());
          const modelHeight = size.y || 1;
          const scale = definition.targetHeight / modelHeight;
          const yOffset = -bounds.min.y * scale;
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.frustumCulled = false;
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat && 'envMapIntensity' in mat) {
                  (mat as THREE.MeshStandardMaterial).envMapIntensity = 1.35;
                  mat.needsUpdate = true;
                }
              });
            }
          });
          modelAssetsRef.current[definition.key] = {
            key: definition.key,
            scene: gltf.scene,
            animations: gltf.animations,
            scale,
            yOffset,
            rawHeight: modelHeight
          };
          pendingModelLoadsRef.current.delete(modelKey);
          setModelRevision((value) => value + 1);
        },
        undefined,
        (error) => {
          pendingModelLoadsRef.current.delete(modelKey);
          console.error(`Failed to load ${definition.key} model`, error);
        }
      );
    },
    []
  );

  const ensureAssetsForUnits = useCallback(
    (units: PlacedUnit[]) => {
      const keys = new Set<ModelKey>();
      keys.add(DEFAULT_MODEL_KEY);
      units.forEach((unit) => keys.add(getModelKeyForUnit(unit.id)));
      keys.forEach((key) => ensureModelAsset(key));
    },
    [ensureModelAsset]
  );

  const syncUnits = useCallback(
    (units: PlacedUnit[], boardRows: number, boardCols: number) => {
      if (!unitRootRef.current || typeof window === 'undefined') return;
      const unitRoot = unitRootRef.current;
      const activeIds = new Set(units.map((unit) => unit.instanceId));

      unitVisualsRef.current.forEach((visual, id) => {
        if (!activeIds.has(id)) {
          disposeVisual(visual);
          unitVisualsRef.current.delete(id);
        }
      });

      units.forEach((unit, index) => {
        const { x, z } = cellToWorld(unit.position.row, unit.position.col, boardRows, boardCols);
        let visual = unitVisualsRef.current.get(unit.instanceId);
        const modelKey = getModelKeyForUnit(unit.id);
        const modelAsset = modelAssetsRef.current[modelKey];
        const modelDefinition = getModelDefinition(modelKey);
        const desiredModelKey = modelAsset ? modelKey : undefined;
        const requiresRebuild = visual
          ? (desiredModelKey && visual.modelKey !== desiredModelKey) || (!desiredModelKey && visual.isCustomMesh)
          : false;

        if (visual && requiresRebuild) {
          disposeVisual(visual);
          unitVisualsRef.current.delete(unit.instanceId);
          visual = undefined;
        }

        if (!visual) {
          const hpRoot = hpRootRef.current;
          visual = createVisual(
            unit,
            modelAsset,
            modelDefinition,
            showHpOverlay,
            hpWorldSpace ? hpRoot : null,
            hpWorldSpace,
            showHpDetails
          );
          unitVisualsRef.current.set(unit.instanceId, visual);
          unitRoot.add(visual.group);
          if (visual.isCustomMesh) {
            setVisualAnimation(visual, 'idle');
          }
        }

        if (!visual.positionInitialized) {
          // Raise units so they stand on top of the tiles instead of intersecting them
          // Tiles are at tileThickness/2, with glow plane at tileThickness*0.55 above that
          const tileThickness = 0.16; // Must match tileThickness in createTacticalBoard
          const tileGroupY = tileThickness / 2;
          const glowPlaneOffset = tileThickness * 0.55;
          const unitBaseY = tileGroupY + glowPlaneOffset;
          visual.group.position.set(x, unitBaseY, z);
          visual.targetPosition.set(x, unitBaseY, z);
          visual.moveStartPosition.set(x, unitBaseY, z);
          visual.positionInitialized = true;
          visual.moveStartTime = undefined;
        } else {
          // Normal position update logic
          const dx = visual.targetPosition.x - x;
          const dz = visual.targetPosition.z - z;
          const targetChanged = Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001;
          if (targetChanged) {
            visual.moveStartPosition.copy(visual.group.position);
            // Maintain the same Y height when moving
            const tileThickness = 0.16;
            const tileGroupY = tileThickness / 2;
            const glowPlaneOffset = tileThickness * 0.55;
            const unitBaseY = tileGroupY + glowPlaneOffset;
            visual.targetPosition.set(x, unitBaseY, z);
            visual.moveStartTime = performance.now();
          }
        }

        if (!visual.isCustomMesh) {
          visual.group.children.forEach((child, childIndex) => {
            if (!visual.isDead && childIndex === 0) {
              child.rotation.y = performance.now() * 0.0002 + index * 0.2;
            }
          });
        }

        // Update maxHp in case it changed, but don't update displayHp or targetHp here
        // HP changes are triggered by impact animations or death events
        visual.maxHp = unit.hp;
        
        if (isUnitDead(unit)) {
          // When unit dies, immediately set target HP to 0 to trigger HP bar animation
          if (visual.targetHp > 0) {
            visual.targetHp = 0;
            visual.hpAnimationStartTime = performance.now();
            visual.hpAnimationStartValue = visual.displayHp;
          }
          enterDeathState(visual);
        } else {
          exitDeathState(visual);
        }
      });
    },
    [unitRootRef]
  );

  const updateHpFacing = useCallback((camera: THREE.PerspectiveCamera | null) => {
    if (!camera) return;
    unitVisualsRef.current.forEach((visual) => {
      updateHpFacingForVisual(visual, camera);
    });
  }, []);

  const updateUnitMovement = useCallback(() => {
    const now = performance.now();
    unitVisualsRef.current.forEach((visual) => {
      if (visual.moveStartTime === undefined) {
        return;
      }
      const progress = clamp((now - visual.moveStartTime) / MOVE_DURATION_MS, 0, 1);
      const eased = easeInOutCubic(progress);
      visual.group.position.lerpVectors(visual.moveStartPosition, visual.targetPosition, eased);
      if (progress >= 1) {
        visual.group.position.copy(visual.targetPosition);
        visual.moveStartPosition.copy(visual.targetPosition);
        visual.moveStartTime = undefined;
      }
    });
  }, []);

  const updateDeathFades = useCallback(() => {
    const now = performance.now();
    unitVisualsRef.current.forEach((visual) => {
      if (!visual.isDead) {
        return;
      }
      if (visual.fadeStartTime === undefined) {
        if (!visual.deathTimestamp) {
          visual.deathTimestamp = now;
          return;
        }
        const timeSinceDeath = now - visual.deathTimestamp;
        if (timeSinceDeath < DEATH_FADE_DELAY_MS) {
          return;
        }
        visual.fadeStartTime = now;
      }
      if (visual.fadeStartTime === undefined) {
        return;
      }
      const progress = clamp((now - visual.fadeStartTime) / DEATH_FADE_DURATION_MS, 0, 1);
      const opacity = clamp(1 - progress, 0, 1);
      visual.fadeMaterials.forEach((material) => {
        if (!material.transparent) {
          material.transparent = true;
          material.needsUpdate = true;
        }
        material.opacity = opacity;
      });
      if (progress >= 1) {
        visual.fadeStartTime = undefined;
        visual.group.visible = false;
      }
    });
  }, []);

  const updateMixers = useCallback((delta: number) => {
    unitVisualsRef.current.forEach((visual) => {
      visual.mixer?.update(delta);
    });
  }, []);

  // Update random idle animations - occasionally trigger different idle variants
  const updateRandomIdles = useCallback(() => {
    const now = performance.now();
    unitVisualsRef.current.forEach((visual) => {
      // Skip if not a custom mesh model, or if dead, or no idle actions available
      if (!visual.isCustomMesh || visual.isDead || !visual.idleActions || visual.idleActions.length === 0) {
        return;
      }
      
      // Skip if currently playing a non-idle animation (fight, impact, death, walk)
      if (visual.currentAnimation && visual.currentAnimation !== 'idle') {
        // Reset the timer so we don't immediately trigger when returning to idle
        visual.nextIdleVariantTime = now + IDLE_VARIANT_MIN_DELAY_MS + Math.random() * (IDLE_VARIANT_MAX_DELAY_MS - IDLE_VARIANT_MIN_DELAY_MS);
        return;
      }
      
      // Check if it's time to trigger a random idle variant
      if (visual.nextIdleVariantTime && now >= visual.nextIdleVariantTime) {
        const idleActions = visual.idleActions;
        const currentIndex = visual.currentIdleIndex ?? 0;
        
        // Pick a random different idle variant
        let nextIndex = Math.floor(Math.random() * idleActions.length);
        // If we picked the same one, pick a different one
        if (nextIndex === currentIndex) {
          nextIndex = (currentIndex + 1) % idleActions.length;
        }
        
        // Crossfade to the new idle animation
        const currentAction = idleActions[currentIndex];
        const nextAction = idleActions[nextIndex];
        
        if (currentAction && nextAction) {
          currentAction.fadeOut(0.4);
          nextAction.reset().fadeIn(0.4).play();
          visual.currentIdleIndex = nextIndex;
        }
        
        // Schedule next random idle trigger
        visual.nextIdleVariantTime = now + IDLE_VARIANT_MIN_DELAY_MS + Math.random() * (IDLE_VARIANT_MAX_DELAY_MS - IDLE_VARIANT_MIN_DELAY_MS);
      }
    });
  }, []);

  const updateHpAnimations = useCallback(() => {
    const now = performance.now();
    unitVisualsRef.current.forEach((visual) => {
      // Skip if no animation is in progress
      if (visual.hpAnimationStartTime === undefined) {
        return;
      }
      
      const elapsed = now - visual.hpAnimationStartTime;
      const progress = clamp(elapsed / HP_ANIMATION_DURATION_MS, 0, 1);
      const eased = easeOutCubic(progress);
      
      const startValue = visual.hpAnimationStartValue ?? visual.displayHp;
      const newDisplayHp = startValue + (visual.targetHp - startValue) * eased;
      
      // Only update canvas if value changed significantly (optimization)
      if (Math.abs(newDisplayHp - visual.displayHp) > 0.1) {
        visual.displayHp = newDisplayHp;
        updateHpCanvas(visual.hpCanvas, visual.hpTexture, visual.displayHp, visual.maxHp, visual.team, visual.showHpDetails);
      }
      
      // Animation complete
      if (progress >= 1) {
        visual.displayHp = visual.targetHp;
        visual.hpAnimationStartTime = undefined;
        visual.hpAnimationStartValue = undefined;
        updateHpCanvas(visual.hpCanvas, visual.hpTexture, visual.displayHp, visual.maxHp, visual.team, visual.showHpDetails);
      }
    });
  }, []);

  const applyBattleState = useCallback(
    ({
      hitCells,
      hitEvents = [],
      moveCells,
      marchCells,
      units,
      demoState,
      boardSize,
      boardCols
    }: {
      hitCells: string[];
      hitEvents?: HitEvent[];
      moveCells: string[];
      marchCells: string[];
      units: PlacedUnit[];
      demoState: DemoState;
      boardSize: number;
      boardCols?: number;
    }) => {
      const hitSet = new Set(hitCells);
      const moveSet = new Set(moveCells);
      const marchSet = new Set(marchCells);
      const unitById = new Map(units.map((unit) => [unit.instanceId, unit]));

      unitVisualsRef.current.forEach((visual, id) => {
        const unit = unitById.get(id);
        if (!unit) return;
        const cell = boardKey(unit.position.row, unit.position.col);
        if (visual.isDead) {
          if (visual.isCustomMesh) {
            setVisualAnimation(visual, 'death');
          }
          return;
        }
        let targetOpacity = 0.6;
        let targetAnimation: AnimationState = 'idle';

        if (hitSet.has(cell)) {
          targetOpacity = 1;
        } else if (moveSet.has(cell) || marchSet.has(cell)) {
          targetOpacity = 0.85;
          targetAnimation = 'walk';
        }

        visual.glowMaterial.opacity = targetOpacity;
        if (visual.isCustomMesh) {
          const resolvedAnimation: AnimationState = demoState === 'idle' ? 'idle' : targetAnimation;
          setVisualAnimation(visual, resolvedAnimation);
        }
      });

      if (demoState !== 'running') {
        unitVisualsRef.current.forEach((visual, id) => {
          const unit = unitById.get(id);
          if (!unit) {
            return;
          }
          const desiredHp = unit.currentHp ?? unit.hp;
          if (desiredHp > 0) {
            exitDeathState(visual);
          }
          const needsHpSync =
            Math.abs(desiredHp - visual.displayHp) > 0.1 || Math.abs(desiredHp - visual.targetHp) > 0.1;
          if (needsHpSync) {
            visual.targetHp = desiredHp;
            visual.displayHp = desiredHp;
            visual.hpAnimationStartTime = undefined;
            visual.hpAnimationStartValue = undefined;
            updateHpCanvas(visual.hpCanvas, visual.hpTexture, desiredHp, visual.maxHp, visual.team, visual.showHpDetails);
          }
        });
      }

      const unitRoot = unitRootRef.current;
      if (!unitRoot || hitEvents.length === 0) {
        return;
      }

      hitEvents.forEach((event) => {
        if (processedHitIdsRef.current.has(event.id)) {
          return;
        }
        rememberHitId(event.id);
        const attackerVisual = unitVisualsRef.current.get(event.attackerId);

        if (attackerVisual && attackerVisual.isCustomMesh && !attackerVisual.isDead) {
          setVisualAnimation(attackerVisual, 'fight', event.attackType);
        }
        
        // Trigger impact animation on the target unit that received the hit
        // For melee attacks, delay the impact to sync with when the weapon connects
        // For ranged attacks, the arrow travel time handles the delay
        if (event.targetId) {
          const targetVisual = unitVisualsRef.current.get(event.targetId);
          const targetUnit = unitById.get(event.targetId);
          if (targetVisual && targetVisual.isCustomMesh && !targetVisual.isDead) {
            const triggerImpact = () => {
              // Re-check conditions at trigger time since state may have changed
              if (!targetVisual.isDead && targetVisual.currentAnimation !== 'fight') {
                setVisualAnimation(targetVisual, 'impact');
              }
              // Trigger HP bar animation when impact happens
              // The targetUnit has the new HP value (after damage was applied)
              if (targetUnit) {
                const newHp = targetUnit.currentHp ?? targetUnit.hp;
                if (newHp !== targetVisual.targetHp) {
                  targetVisual.hpAnimationStartValue = targetVisual.displayHp;
                  targetVisual.targetHp = newHp;
                  targetVisual.hpAnimationStartTime = performance.now();
                }
              }
            };
            
            if (event.attackType === 'melee') {
              // Get the attacker's model and fight animation to determine impact timing
              const attackerModelKey = attackerVisual?.modelKey ?? 'knight';
              const attackerModelDef = getModelDefinition(attackerModelKey);
              const fightAnimationName = attackerModelDef.animations.fight;
              const impactDelay = getImpactDelay(attackerModelKey, fightAnimationName);
              setTimeout(triggerImpact, impactDelay);
            } else {
              // Ranged: delay until arrow arrives
              setTimeout(triggerImpact, ARROW_TRAVEL_DURATION_MS + RANGED_IMPACT_DELAY_MS);
            }
          }
        }
        
        if (event.attackType !== 'ranged') {
          return;
        }
        const attacker = unitById.get(event.attackerId);
        if (!attacker || attacker.id !== ARCHER_UNIT_ID) {
          return;
        }
        const cols = boardCols ?? boardSize;
        const startPosition = attackerVisual
          ? attackerVisual.group.position.clone()
          : toWorldVector(event.attackerPosition, boardSize, cols, 0);
        startPosition.y = ARROW_LAUNCH_HEIGHT;
        const endPosition = toWorldVector(event.targetPosition, boardSize, cols, ARROW_IMPACT_HEIGHT);
        const direction = endPosition.clone().sub(startPosition).normalize();
        startPosition.add(direction.clone().multiplyScalar(ARROW_FORWARD_OFFSET));
        const arrowMesh = createArrowMesh();
        arrowMesh.position.copy(startPosition);
        arrowMesh.quaternion.setFromUnitVectors(arrowUpVector, direction);
        arrowMesh.renderOrder = 9;
        unitRoot.add(arrowMesh);
        arrowProjectilesRef.current.push({
          id: event.id,
          mesh: arrowMesh,
          start: startPosition,
          end: endPosition,
          startTime: performance.now(),
          duration: ARROW_TRAVEL_DURATION_MS
        });
      });
    },
    [rememberHitId]
  );

  const disposeAll = useCallback(() => {
    unitVisualsRef.current.forEach((visual) => {
      disposeVisual(visual);
    });
    unitVisualsRef.current.clear();
    clearProjectiles();
  }, [clearProjectiles]);

  return {
    unitVisualsRef,
    modelRevision,
    ensureAssetsForUnits,
    syncUnits,
    applyBattleState,
    updateHpFacing,
    updateUnitMovement,
    updateDeathFades,
    updateMixers,
    updateHpAnimations,
    updateRandomIdles,
    updateProjectiles,
    clearProjectiles,
    disposeAll,
    calculateTickDuration
  };
};
