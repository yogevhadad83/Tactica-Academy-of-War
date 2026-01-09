import * as THREE from 'three';
import type { MutableRefObject } from 'react';

import { cellToWorld } from '../constants/board';
import type { PlacedUnit, Position } from '../types';
import type { AttackType } from '../types/battle';
import type { Team } from '../engine/battleEngine';
import { PLAYER_ZONE_START } from '../engine/battleEngine';
import type { UnitVisual } from './units/useUnitLayer';

export interface MovementIntent {
  unitId: string;
  team: Team;
  from: Position;
  to: Position;
}

export interface AttackIntent {
  id: string;
  attackerId: string;
  attackerTeam: Team;
  attackerPosition: Position;
  targetPosition: Position;
  targetId?: string;
  targetTeam?: Team;
  attackType: AttackType;
  didKill: boolean;
}

interface TimedIndicator {
  mesh: THREE.Object3D;
  material: THREE.MeshBasicMaterial;
  createdAt: number;
  duration: number;
  update: (progress: number) => void;
}

interface DangerIndicator {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  phaseOffset: number;
}

// Keep team accents aligned with existing unit palette (see useUnitLayer.ts)
// Player: blue, Enemy: red (no yellow/orange indicators).
const TEAM_ACCENT_HEX: Record<Team, number> = {
  player: 0x3b82f6,
  enemy: 0xef4444
};

// Yellow reserved strictly for "being hit" feedback.
const HIT_YELLOW_HEX = 0xfcd34d;

const ACTIVE_DURATION = 1400;
const MOVE_PATH_DURATION = 1000;
const TARGET_FLASH_DURATION = 520;

const SURFACE_Y = 0.08;

class BattleIntentVisualizer {
  private readonly unitRoot: THREE.Group;
  private readonly unitVisualsRef: MutableRefObject<Map<string, UnitVisual>>;
  private readonly group: THREE.Group;
  private readonly ringGeometry: THREE.RingGeometry;
  private readonly pulseGeometry: THREE.CircleGeometry;

  private activeIndicators = new Map<string, TimedIndicator>();
  private movementIndicators: TimedIndicator[] = [];
  private attackIndicators: TimedIndicator[] = [];
  private targetIndicators: TimedIndicator[] = [];
  private dangerIndicators = new Map<string, DangerIndicator>();

  private boardRows = 12;
  private boardCols = 6;
  private enabled = true;

  constructor(options: { unitRoot: THREE.Group; unitVisualsRef: MutableRefObject<Map<string, UnitVisual>> }) {
    this.unitRoot = options.unitRoot;
    this.unitVisualsRef = options.unitVisualsRef;
    this.group = new THREE.Group();
    this.group.name = 'BattleIntentVisualizer';
    this.unitRoot.add(this.group);

    this.ringGeometry = new THREE.RingGeometry(0.35, 0.55, 48);
    this.pulseGeometry = new THREE.CircleGeometry(0.45, 48);
  }

  applyFrame(args: {
    boardRows: number;
    boardCols: number;
    movementIntents: MovementIntent[];
    attackIntents: AttackIntent[];
    units: PlacedUnit[];
    activeUnitIds: Set<string>;
    actingTeam?: Team;
  }) {
    if (!this.enabled) return;
    this.boardRows = args.boardRows;
    this.boardCols = args.boardCols;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const teamLookup = new Map<string, Team>();
    args.movementIntents.forEach((intent) => {
      teamLookup.set(intent.unitId, intent.team);
      this.spawnMovementPath(intent, now);
    });
    args.attackIntents.forEach((intent) => {
      teamLookup.set(intent.attackerId, intent.attackerTeam);
      this.spawnAttackIndicator(intent, now);
    });

    args.activeUnitIds.forEach((unitId) => {
      const team = teamLookup.get(unitId) ?? args.actingTeam ?? 'player';
      this.spawnActiveRing(unitId, team, now);
    });

    this.updateDangerMarkers(args.units);
  }

  update(nowInput?: number) {
    if (!this.enabled) return;
    const now = nowInput ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.updateActiveIndicators(now);
    this.movementIndicators = this.advanceTimedIndicators(this.movementIndicators, now);
    this.attackIndicators = this.advanceTimedIndicators(this.attackIndicators, now);
    this.targetIndicators = this.advanceTimedIndicators(this.targetIndicators, now);
    this.updateDangerPulses(now);
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    if (!value) {
      this.clearAll();
    }
  }

  dispose() {
    this.clearAll();
    this.unitRoot.remove(this.group);
    this.ringGeometry.dispose();
    this.pulseGeometry.dispose();
  }

  private clearAll() {
    const disposeList = (list: TimedIndicator[]) => {
      list.forEach((indicator) => this.disposeIndicator(indicator));
    };

    disposeList(Array.from(this.activeIndicators.values()));
    this.activeIndicators.clear();
    disposeList(this.movementIndicators);
    disposeList(this.attackIndicators);
    disposeList(this.targetIndicators);
    this.movementIndicators = [];
    this.attackIndicators = [];
    this.targetIndicators = [];

    this.dangerIndicators.forEach((indicator) => {
      this.group.remove(indicator.mesh);
      indicator.material.dispose();
    });
    this.dangerIndicators.clear();
  }

  private spawnActiveRing(unitId: string, team: Team, now: number) {
    const position = this.sampleUnitPosition(unitId);
    if (!position) return;

    const existing = this.activeIndicators.get(unitId);
    if (existing) {
      this.disposeIndicator(existing);
      this.activeIndicators.delete(unitId);
    }

    const material = new THREE.MeshBasicMaterial({
      color: TEAM_ACCENT_HEX[team],
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(this.ringGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, Math.max(SURFACE_Y, position.y - 0.12), position.z);
    this.group.add(mesh);

    const indicator: TimedIndicator = {
      mesh,
      material,
      createdAt: now,
      duration: ACTIVE_DURATION,
      update: (progress) => {
        const fade = Math.pow(1 - progress, 1.2);
        material.opacity = 0.85 * fade;
        const pulse = 1 + 0.18 * Math.sin(progress * Math.PI * 2);
        mesh.scale.setScalar(pulse);
      }
    };

    this.activeIndicators.set(unitId, indicator);
  }

  private spawnMovementPath(intent: MovementIntent, now: number) {
    const start = this.positionFromCell(intent.from);
    const end = this.positionFromCell(intent.to);
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length < 0.05) return;

    // Origin pulse in team color
    const originMaterial = new THREE.MeshBasicMaterial({
      color: TEAM_ACCENT_HEX[intent.team],
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide
    });
    const originMesh = new THREE.Mesh(this.pulseGeometry, originMaterial);
    originMesh.rotation.x = -Math.PI / 2;
    originMesh.position.set(start.x, SURFACE_Y + 0.015, start.z);
    this.group.add(originMesh);

    this.movementIndicators.push({
      mesh: originMesh,
      material: originMaterial,
      createdAt: now,
      duration: MOVE_PATH_DURATION,
      update: (progress) => {
        const fade = Math.pow(1 - progress, 1.5);
        originMaterial.opacity = 0.6 * fade;
        const scale = 0.8 + progress * 0.5;
        originMesh.scale.setScalar(scale);
      }
    });

    // Destination pulse in team color
    const destMaterial = new THREE.MeshBasicMaterial({
      color: TEAM_ACCENT_HEX[intent.team],
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide
    });
    const destMesh = new THREE.Mesh(this.pulseGeometry, destMaterial);
    destMesh.rotation.x = -Math.PI / 2;
    destMesh.position.set(end.x, SURFACE_Y + 0.015, end.z);
    this.group.add(destMesh);

    this.movementIndicators.push({
      mesh: destMesh,
      material: destMaterial,
      createdAt: now,
      duration: MOVE_PATH_DURATION,
      update: (progress) => {
        const fade = Math.pow(1 - progress, 1.5);
        destMaterial.opacity = 0.7 * fade;
        const scale = 0.8 + progress * 0.8;
        destMesh.scale.setScalar(scale);
      }
    });
  }

  private spawnAttackIndicator(intent: AttackIntent, now: number) {
    const end = this.positionFromCell(intent.targetPosition);
    this.spawnTargetPulse(intent, end, now);
  }

  private spawnTargetPulse(intent: AttackIntent, fallbackPosition: THREE.Vector3, now: number) {
    const world = intent.targetId ? this.sampleUnitPosition(intent.targetId) ?? fallbackPosition : fallbackPosition;
    const baseOpacity = intent.didKill ? 0.85 : 0.7;
    const material = new THREE.MeshBasicMaterial({
      color: HIT_YELLOW_HEX,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(this.pulseGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(world.x, Math.max(SURFACE_Y + 0.015, world.y - 0.05), world.z);
    this.group.add(mesh);

    this.targetIndicators.push({
      mesh,
      material,
      createdAt: now,
      duration: TARGET_FLASH_DURATION,
      update: (progress) => {
        const fade = Math.pow(1 - progress, 1.8);
        material.opacity = baseOpacity * fade;
        const scale = 0.6 + progress * 1.1;
        mesh.scale.setScalar(scale);
      }
    });
  }

  private updateDangerMarkers(units: PlacedUnit[]) {
    const required = new Set<string>();
    units.forEach((unit) => {
      if (!this.isCrossTerritory(unit)) return;
      required.add(unit.instanceId);
      const world = this.positionFromCell(unit.position);
      const existing = this.dangerIndicators.get(unit.instanceId);
      if (existing) {
        existing.mesh.position.set(world.x, SURFACE_Y + 0.01, world.z);
      } else {
        const material = new THREE.MeshBasicMaterial({
          // Keep ring consistent with unit team color (enemy stays red, player stays blue).
          color: TEAM_ACCENT_HEX[unit.team],
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
          blending: THREE.NormalBlending,
          side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(this.ringGeometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(world.x, SURFACE_Y + 0.01, world.z);
        this.group.add(mesh);
        this.dangerIndicators.set(unit.instanceId, {
          mesh,
          material,
          phaseOffset: Math.random() * Math.PI * 2
        });
      }
    });

    this.dangerIndicators.forEach((indicator, id) => {
      if (required.has(id)) return;
      this.group.remove(indicator.mesh);
      indicator.material.dispose();
      this.dangerIndicators.delete(id);
    });
  }

  private updateDangerPulses(now: number) {
    this.dangerIndicators.forEach((indicator) => {
      const pulse = (Math.sin(now * 0.002 + indicator.phaseOffset) + 1) / 2;
      indicator.material.opacity = 0.18 + pulse * 0.22;
      const scale = 1 + pulse * 0.12;
      indicator.mesh.scale.setScalar(scale);
    });
  }

  private updateActiveIndicators(now: number) {
    this.activeIndicators.forEach((indicator, unitId) => {
      const progress = (now - indicator.createdAt) / indicator.duration;
      if (progress >= 1) {
        this.disposeIndicator(indicator);
        this.activeIndicators.delete(unitId);
        return;
      }
      indicator.update(progress);
    });
  }

  private advanceTimedIndicators(list: TimedIndicator[], now: number) {
    return list.filter((indicator) => {
      const progress = (now - indicator.createdAt) / indicator.duration;
      if (progress >= 1) {
        this.disposeIndicator(indicator);
        return false;
      }
      indicator.update(progress);
      return true;
    });
  }

  private disposeIndicator(indicator: TimedIndicator) {
    this.group.remove(indicator.mesh);
    indicator.material.dispose();
  }

  private sampleUnitPosition(unitId: string): THREE.Vector3 | null {
    const visual = this.unitVisualsRef.current.get(unitId);
    if (!visual) return null;
    return visual.group.position.clone();
  }

  private positionFromCell(position: Position): THREE.Vector3 {
    const coords = cellToWorld(position.row, position.col, this.boardRows, this.boardCols);
    return new THREE.Vector3(coords.x, SURFACE_Y, coords.z);
  }

  private isCrossTerritory(unit: PlacedUnit): boolean {
    if (unit.team === 'player') {
      return unit.position.row < PLAYER_ZONE_START;
    }
    return unit.position.row >= PLAYER_ZONE_START;
  }
}

export default BattleIntentVisualizer;
