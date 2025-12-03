/**
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * 
 * Animation metadata extracted from GLB model files.
 * Generated: 2025-12-03T21:09:39.636Z
 * 
 * To regenerate, run: npx tsx scripts/extract-animation-metadata.ts
 */

import type { AnimationState, ModelKey } from '../components/units/useUnitLayer';

export interface AnimationMetadata {
  name: string;
  durationMs: number;
}

export interface ModelAnimationData {
  animations: Record<string, AnimationMetadata>;
}

/**
 * Raw animation data extracted from GLB files.
 * Maps model key -> animation clip name -> duration info
 */
export const RAW_ANIMATION_DATA: Record<string, Record<string, AnimationMetadata>> = {
  'archer': {
    'Armature|mixamo.com|Layer0': { name: 'Armature|mixamo.com|Layer0', durationMs: 67 },
    'Armature|mixamo.com|Layer0.001': { name: 'Armature|mixamo.com|Layer0.001', durationMs: 67 },
    'Death_0': { name: 'Death_0', durationMs: 2367 },
    'Fight_0': { name: 'Fight_0', durationMs: 733 },
    'Fight_1': { name: 'Fight_1', durationMs: 2033 },
    'Idle_0': { name: 'Idle_0', durationMs: 5033 },
    'idle_1': { name: 'idle_1', durationMs: 3800 },
    'Impact_0': { name: 'Impact_0', durationMs: 1000 },
    'Impact_1': { name: 'Impact_1', durationMs: 733 },
    'Walk_0': { name: 'Walk_0', durationMs: 933 },
  },
  'beast': {
    'Armature|mixamo.com|Layer0': { name: 'Armature|mixamo.com|Layer0', durationMs: 67 },
    'Armature|mixamo.com|Layer0.001': { name: 'Armature|mixamo.com|Layer0.001', durationMs: 67 },
    'Armature|mixamo.com|Layer0.002': { name: 'Armature|mixamo.com|Layer0.002', durationMs: 3300 },
    'Armature|mixamo.com|Layer0.003': { name: 'Armature|mixamo.com|Layer0.003', durationMs: 67 },
    'Armature|mixamo.com|Layer0.004': { name: 'Armature|mixamo.com|Layer0.004', durationMs: 67 },
    'Death_0': { name: 'Death_0', durationMs: 2600 },
    'Fight_0': { name: 'Fight_0', durationMs: 1300 },
    'Fight_1': { name: 'Fight_1', durationMs: 1133 },
    'Idle_0': { name: 'Idle_0', durationMs: 3300 },
    'Idle_1': { name: 'Idle_1', durationMs: 5433 },
    'Impact_0': { name: 'Impact_0', durationMs: 1000 },
    'Kill_0': { name: 'Kill_0', durationMs: 2700 },
    'Walk_0': { name: 'Walk_0', durationMs: 1133 },
  },
  'knight': {
    'Armature|mixamo.com|Layer0': { name: 'Armature|mixamo.com|Layer0', durationMs: 67 },
    'Armature|mixamo.com|Layer0.001': { name: 'Armature|mixamo.com|Layer0.001', durationMs: 67 },
    'Armature|mixamo.com|Layer0.002': { name: 'Armature|mixamo.com|Layer0.002', durationMs: 3333 },
    'Death_0': { name: 'Death_0', durationMs: 3333 },
    'Fight_0': { name: 'Fight_0', durationMs: 1533 },
    'Fight_1': { name: 'Fight_1', durationMs: 1233 },
    'Idle_0': { name: 'Idle_0', durationMs: 2767 },
    'Idle_1': { name: 'Idle_1', durationMs: 7567 },
    'Impact_0': { name: 'Impact_0', durationMs: 733 },
    'Impact_1': { name: 'Impact_1', durationMs: 1000 },
    'Kill_0': { name: 'Kill_0', durationMs: 2467 },
    'Long_0': { name: 'Long_0', durationMs: 2367 },
    'Walk_0': { name: 'Walk_0', durationMs: 767 },
    'Walk_1': { name: 'Walk_1', durationMs: 667 },
  },
};

/**
 * Animation state to clip name mapping.
 * Update this if your models use different naming conventions.
 */
const ANIMATION_STATE_TO_CLIP: Record<AnimationState, string[]> = {
  idle: ['Idle_0', 'Idle_1'],
  walk: ['Walk_0', 'Walk_1'],
  fight: ['Fight_0', 'Fight_1'],
  death: ['Death_0', 'Death_1'],
  impact: ['Impact_0', 'Impact_1'],
};

/**
 * Get the duration of an animation state for a model.
 * Uses the first matching clip name found in the model's animations.
 */
export function getAnimationDurationFromMetadata(
  modelKey: ModelKey,
  state: AnimationState
): number | undefined {
  const modelData = RAW_ANIMATION_DATA[modelKey];
  if (!modelData) return undefined;

  const clipNames = ANIMATION_STATE_TO_CLIP[state];
  for (const clipName of clipNames) {
    const animData = modelData[clipName];
    if (animData) {
      return animData.durationMs;
    }
  }

  return undefined;
}

/**
 * Check if a model has a specific animation state.
 */
export function hasAnimationState(modelKey: ModelKey, state: AnimationState): boolean {
  return getAnimationDurationFromMetadata(modelKey, state) !== undefined;
}

/**
 * Get all available animation states for a model.
 */
export function getAvailableAnimations(modelKey: ModelKey): AnimationState[] {
  const states: AnimationState[] = ['idle', 'walk', 'fight', 'death', 'impact'];
  return states.filter(state => hasAnimationState(modelKey, state));
}

/**
 * Pre-computed animation durations for use in useUnitLayer.ts
 * This maps model key -> animation state -> duration in ms
 */
export const COMPUTED_ANIMATION_DURATIONS: Partial<Record<ModelKey, Partial<Record<AnimationState, number>>>> = {
  'archer': {
    death: 2367,
    fight: 733,
    idle: 5033,
    impact: 1000,
    walk: 933,
  },
  'beast': {
    death: 2600,
    fight: 1300,
    idle: 3300,
    impact: 1000,
    walk: 1133,
  },
  'knight': {
    death: 3333,
    fight: 1533,
    idle: 2767,
    impact: 733,
    walk: 767,
  },
};
