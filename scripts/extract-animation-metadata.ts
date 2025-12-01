/**
 * Script to extract animation metadata from GLB model files.
 * 
 * Usage:
 *   npx tsx scripts/extract-animation-metadata.ts
 * 
 * This script:
 * 1. Scans all .glb files in public/models/
 * 2. Extracts animation names and durations
 * 3. Generates src/data/animationMetadata.ts with the data
 * 
 * Run this script whenever you add or update model files.
 */

import { NodeIO } from '@gltf-transform/core';
import * as fs from 'fs';
import * as path from 'path';

const MODELS_DIR = path.join(process.cwd(), 'public', 'models');
const OUTPUT_FILE = path.join(process.cwd(), 'src', 'data', 'animationMetadata.ts');

interface AnimationInfo {
  name: string;
  durationMs: number;
  durationSec: number;
}

interface ModelAnimations {
  modelKey: string;
  fileName: string;
  animations: AnimationInfo[];
}

async function extractAnimationsFromGlb(filePath: string): Promise<AnimationInfo[]> {
  const io = new NodeIO();
  const doc = await io.read(filePath);
  const animations = doc.getRoot().listAnimations();
  
  const result: AnimationInfo[] = [];
  
  for (const anim of animations) {
    const channels = anim.listChannels();
    let maxDuration = 0;
    
    for (const channel of channels) {
      const sampler = channel.getSampler();
      if (!sampler) continue;
      
      const input = sampler.getInput();
      if (!input) continue;
      
      const arr = input.getArray();
      if (arr && arr.length > 0) {
        maxDuration = Math.max(maxDuration, arr[arr.length - 1]);
      }
    }
    
    const name = anim.getName() || 'unnamed';
    result.push({
      name,
      durationSec: Math.round(maxDuration * 1000) / 1000, // Round to 3 decimal places
      durationMs: Math.round(maxDuration * 1000)
    });
  }
  
  return result;
}

function getModelKeyFromFileName(fileName: string): string {
  // Remove .glb extension to get model key
  return path.basename(fileName, '.glb');
}

function generateTypeScriptFile(modelsData: ModelAnimations[]): string {
  const timestamp = new Date().toISOString();
  
  let output = `/**
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * 
 * Animation metadata extracted from GLB model files.
 * Generated: ${timestamp}
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
`;

  for (const model of modelsData) {
    output += `  '${model.modelKey}': {\n`;
    for (const anim of model.animations) {
      output += `    '${anim.name}': { name: '${anim.name}', durationMs: ${anim.durationMs} },\n`;
    }
    output += `  },\n`;
  }

  output += `};

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
`;

  // Generate the computed durations in the format useUnitLayer expects
  for (const model of modelsData) {
    const states: Array<{ state: string; duration: number }> = [];
    
    // Map clip names to animation states
    // Only include states that are defined in AnimationState type: 'idle' | 'walk' | 'fight' | 'death' | 'impact'
    const stateMapping: Record<string, string> = {
      'Idle_0': 'idle', 'Idle_1': 'idle',
      'Walk_0': 'walk', 'Walk_1': 'walk',
      'Fight_0': 'fight', 'Fight_1': 'fight',
      'Death_0': 'death', 'Death_1': 'death',
      'Impact_0': 'impact', 'Impact_1': 'impact',
      // Note: Kill_0/Kill_1 animations exist in some models but are not used by AnimationState
    };
    
    const seenStates = new Set<string>();
    for (const anim of model.animations) {
      const state = stateMapping[anim.name];
      if (state && !seenStates.has(state)) {
        seenStates.add(state);
        states.push({ state, duration: anim.durationMs });
      }
    }
    
    if (states.length > 0) {
      output += `  '${model.modelKey}': {\n`;
      for (const { state, duration } of states) {
        output += `    ${state}: ${duration},\n`;
      }
      output += `  },\n`;
    }
  }

  output += `};
`;

  return output;
}

async function main() {
  console.log('🔍 Scanning for GLB models in:', MODELS_DIR);
  
  if (!fs.existsSync(MODELS_DIR)) {
    console.error('❌ Models directory not found:', MODELS_DIR);
    process.exit(1);
  }
  
  const files = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.glb'));
  
  if (files.length === 0) {
    console.warn('⚠️  No .glb files found in models directory');
    process.exit(0);
  }
  
  console.log(`📦 Found ${files.length} model(s):`, files.join(', '));
  
  const modelsData: ModelAnimations[] = [];
  
  for (const file of files) {
    const filePath = path.join(MODELS_DIR, file);
    const modelKey = getModelKeyFromFileName(file);
    
    console.log(`\n📊 Processing: ${file}`);
    
    try {
      const animations = await extractAnimationsFromGlb(filePath);
      
      modelsData.push({
        modelKey,
        fileName: file,
        animations
      });
      
      console.log(`   Found ${animations.length} animation(s):`);
      for (const anim of animations) {
        console.log(`   - ${anim.name}: ${anim.durationMs}ms (${anim.durationSec}s)`);
      }
    } catch (error) {
      console.error(`   ❌ Error processing ${file}:`, error);
    }
  }
  
  // Sort by model key for consistent output
  modelsData.sort((a, b) => a.modelKey.localeCompare(b.modelKey));
  
  // Generate and write the TypeScript file
  const tsContent = generateTypeScriptFile(modelsData);
  
  // Ensure the output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT_FILE, tsContent, 'utf-8');
  
  console.log(`\n✅ Generated: ${OUTPUT_FILE}`);
  console.log('\n📋 Summary:');
  console.log(`   Models processed: ${modelsData.length}`);
  console.log(`   Total animations: ${modelsData.reduce((sum, m) => sum + m.animations.length, 0)}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
