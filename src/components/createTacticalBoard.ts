import * as THREE from 'three';
import { boardKey, cellToWorld } from '../constants/board';

export type TileOwner = 'blue' | 'red';
export type TileOccupant = TileOwner | null;
export type TileEffect =
  | 'hit'
  | 'move'
  | 'march'
  | 'hover-valid'
  | 'hover-blocked'
  | 'hover-inspect'
  | 'disabled'
  | null;
export type TileHoverState = 'none' | 'valid' | 'blocked' | 'inspect';

interface TacticalBoardOptions {
  boardRows: number;
  boardCols: number;
  cellSize: number;
  forceOwner?: TileOwner;
}

interface SciFiTile {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  material: THREE.MeshStandardMaterial;
  glowMaterial: THREE.MeshBasicMaterial;
  owner: TileOwner;
  occupant: TileOccupant;
  effect: TileEffect;
  hoverState: TileHoverState;
  disabled: boolean;
}

export interface TacticalBoard {
  group: THREE.Group;
  tiles: Map<string, SciFiTile>;
  setTileOwner: (row: number, col: number, owner: TileOwner) => void;
  setTileOccupiedBy: (row: number, col: number, occupant: TileOccupant) => void;
  setTileEffect: (row: number, col: number, effect: TileEffect) => void;
  setTileDisabled: (row: number, col: number, disabled: boolean) => void;
  clearDisabled: () => void;
  clearEffects: () => void;
  clearOccupants: () => void;
  setTileHoverState: (row: number, col: number, state: TileHoverState) => void;
  clearHoverStates: () => void;
}

const ownerPalettes: Record<TileOwner, { base: THREE.Color; emissive: THREE.Color; glow: THREE.Color; stroke: string }> = {
  blue: {
    base: new THREE.Color(0x0a1627),
    emissive: new THREE.Color(0x1d4ed8),
    glow: new THREE.Color(0x3b82f6),
    stroke: '#143055'
  },
  red: {
    base: new THREE.Color(0x1e0b11),
    emissive: new THREE.Color(0xdc2626),
    glow: new THREE.Color(0xfb7185),
    stroke: '#4d1a24'
  }
};

const tileEffectPalette: Record<Exclude<Exclude<TileEffect, 'disabled'>, null>, { color: THREE.Color; intensity: number }> = {
  hit: { color: new THREE.Color(0xff5f6d), intensity: 1.15 },
  move: { color: new THREE.Color(0x38bdf8), intensity: 0.85 },
  march: { color: new THREE.Color(0xfcd34d), intensity: 0.75 },
  'hover-valid': { color: new THREE.Color(0xfacc15), intensity: 0.95 },
  'hover-blocked': { color: new THREE.Color(0xf87171), intensity: 1.05 },
  'hover-inspect': { color: new THREE.Color(0x60a5fa), intensity: 0.9 }
};

const tileTextureCache = new Map<TileOwner, THREE.CanvasTexture>();

const createTileSurfaceTexture = (owner: TileOwner) => {
  if (tileTextureCache.has(owner)) {
    return tileTextureCache.get(owner) as THREE.CanvasTexture;
  }

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D context for tile texture');

  ctx.fillStyle = '#050910';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = ownerPalettes[owner].stroke;
  ctx.lineWidth = 1;
  const spacing = size / 4;
  for (let i = 0; i <= size; i += spacing) {
    ctx.beginPath();
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(size, i + 0.5);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  tileTextureCache.set(owner, texture);
  return texture;
};

const techDetailPositions = [
  new THREE.Vector3(1, 0, 1),
  new THREE.Vector3(-1, 0, 1),
  new THREE.Vector3(1, 0, -1),
  new THREE.Vector3(-1, 0, -1)
];

const refreshTileAppearance = (tile: SciFiTile) => {
  const palette = ownerPalettes[tile.owner];

  let baseColor = palette.base.clone();
  let emissive = palette.emissive.clone();
  let emissiveIntensity = 0.35;
  let glowColor = palette.glow.clone();
  let glowOpacity = 0.35;
  let opacity = 0.6;

  if (tile.occupant) {
    const occupantPalette = ownerPalettes[tile.occupant];
    emissive = occupantPalette.emissive.clone();
    emissiveIntensity = 0.95;
    glowColor = occupantPalette.glow.clone();
    glowOpacity = 0.6;
  }

  if (tile.effect && tile.effect !== 'disabled') {
    const effect = tileEffectPalette[tile.effect];
    emissive = effect.color.clone();
    emissiveIntensity = effect.intensity;
    glowColor = effect.color.clone();
    glowOpacity = 0.85;
  }

  if (tile.hoverState !== 'none') {
    const hoverKey: Exclude<TileEffect, 'disabled' | null> =
      tile.hoverState === 'valid'
        ? 'hover-valid'
        : tile.hoverState === 'blocked'
          ? 'hover-blocked'
          : 'hover-inspect';
    const hoverEffect = tileEffectPalette[hoverKey];
    emissive = hoverEffect.color.clone();
    emissiveIntensity = hoverEffect.intensity;
    glowColor = hoverEffect.color.clone();
    glowOpacity = 0.95;
  }

  if (tile.disabled || tile.effect === 'disabled') {
    baseColor = baseColor.multiplyScalar(0.45);
    emissive = new THREE.Color(0x0b1220);
    emissiveIntensity = 0.12;
    glowColor = new THREE.Color(0x0b1220);
    glowOpacity = 0.08;
    opacity = 0.2;
  }

  tile.material.color.copy(baseColor);
  tile.material.emissive.copy(emissive);
  tile.material.emissiveIntensity = emissiveIntensity;
  tile.material.opacity = opacity;
  tile.glowMaterial.color.copy(glowColor);
  tile.glowMaterial.opacity = glowOpacity;
};

const createTileMesh = (owner: TileOwner, tileSize: number, tileThickness: number) => {
  const geometry = new THREE.BoxGeometry(tileSize, tileThickness, tileSize);
  const material = new THREE.MeshStandardMaterial({
    color: ownerPalettes[owner].base,
    metalness: 0.55,
    roughness: 0.35,
    emissive: ownerPalettes[owner].emissive.clone(),
    emissiveIntensity: 0.3,
    transparent: true,
    // Change 3: More transparent tiles (was 0.88)
    opacity: 0.6,
    map: createTileSurfaceTexture(owner)
  });
  material.map?.repeat.set(4, 4);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const glowGeometry = new THREE.PlaneGeometry(tileSize * 1.04, tileSize * 1.04);
  glowGeometry.rotateX(-Math.PI / 2);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: ownerPalettes[owner].glow.clone(),
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.position.y = tileThickness * 0.55;

  const tileGroup = new THREE.Group();
  tileGroup.add(mesh);
  tileGroup.add(glow);

  return { tileGroup, mesh, material, glow, glowMaterial };
};

export const createTacticalBoard = ({ boardRows, boardCols, cellSize, forceOwner }: TacticalBoardOptions): TacticalBoard => {
  const boardGroup = new THREE.Group();
  boardGroup.name = 'TacticalBoard';

  const boardExtentRows = boardRows * cellSize;
  const boardExtentCols = boardCols * cellSize;
  const platformHeight = 0.8;
  const lipHeight = 0.18;
  const tileThickness = 0.16;
  const tileSize = cellSize * 0.86;
  // Change 1: Reduced platform overhang for thinner border
  const platformGeometry = new THREE.BoxGeometry(boardExtentCols * 1.04, platformHeight, boardExtentRows * 1.04);
  const platformMaterial = new THREE.MeshStandardMaterial({
    color: 0x050b14,
    metalness: 0.8,
    roughness: 0.25
  });
  const platform = new THREE.Mesh(platformGeometry, platformMaterial);
  platform.position.y = -platformHeight / 2;
  platform.castShadow = true;
  platform.receiveShadow = true;
  boardGroup.add(platform);

  // Change 1: Reduced lip overhang for thinner border
  const lipGeometry = new THREE.BoxGeometry(boardExtentCols * 1.06, lipHeight, boardExtentRows * 1.06);
  const lipMaterial = new THREE.MeshStandardMaterial({
    color: 0x0d1b2a,
    emissive: new THREE.Color(0x0ea5e9),
    emissiveIntensity: 0.65,
    metalness: 0.7,
    roughness: 0.3
  });
  const lip = new THREE.Mesh(lipGeometry, lipMaterial);
  lip.position.y = -platformHeight + lipHeight / 2;
  lip.receiveShadow = true;
  boardGroup.add(lip);

  const edgeDetailGeometry = new THREE.BoxGeometry(cellSize * 0.6, lipHeight * 2, cellSize * 0.6);
  const edgeDetailMaterial = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    emissive: new THREE.Color(0x14b8a6),
    emissiveIntensity: 0.4,
    metalness: 0.65,
    roughness: 0.35
  });
  const detailOffsetRows = boardExtentRows * 0.55;
  const detailOffsetCols = boardExtentCols * 0.55;
  techDetailPositions.forEach((pos) => {
    const detail = new THREE.Mesh(edgeDetailGeometry, edgeDetailMaterial);
    detail.position.set(pos.x * detailOffsetCols, -platformHeight + lipHeight, pos.z * detailOffsetRows);
    detail.castShadow = true;
    detail.receiveShadow = true;
    boardGroup.add(detail);
  });

  const tiles = new Map<string, SciFiTile>();
  const tileY = tileThickness / 2;

  for (let row = 0; row < boardRows; row += 1) {
    for (let col = 0; col < boardCols; col += 1) {
      const owner: TileOwner = forceOwner ?? (row >= boardRows / 2 ? 'blue' : 'red');
      const { tileGroup, mesh, material, glow, glowMaterial } = createTileMesh(owner, tileSize, tileThickness);
      const { x, z } = cellToWorld(row, col, boardRows, boardCols);
      tileGroup.position.set(x, tileY, z);

      const key = boardKey(row, col);
      mesh.userData = { key, row, col };
      const sciFiTile: SciFiTile = {
        mesh,
        glow,
        material,
        glowMaterial,
        owner,
        occupant: null,
        effect: null,
        hoverState: 'none',
        disabled: false
      };

      tiles.set(key, sciFiTile);
      boardGroup.add(tileGroup);
    }
  }

  const setTileOwner = (row: number, col: number, owner: TileOwner) => {
    const tile = tiles.get(boardKey(row, col));
    if (!tile) return;
    tile.owner = owner;
    refreshTileAppearance(tile);
  };

  const setTileOccupiedBy = (row: number, col: number, occupant: TileOccupant) => {
    const tile = tiles.get(boardKey(row, col));
    if (!tile) return;
    tile.occupant = occupant;
    refreshTileAppearance(tile);
  };

  const setTileEffect = (row: number, col: number, effect: TileEffect) => {
    const tile = tiles.get(boardKey(row, col));
    if (!tile) return;
    tile.effect = effect;
    refreshTileAppearance(tile);
  };

  const setTileDisabled = (row: number, col: number, disabled: boolean) => {
    const tile = tiles.get(boardKey(row, col));
    if (!tile) return;
    tile.disabled = disabled;
    refreshTileAppearance(tile);
  };

  const setTileHoverState = (row: number, col: number, state: TileHoverState) => {
    const tile = tiles.get(boardKey(row, col));
    if (!tile) return;
    tile.hoverState = state;
    refreshTileAppearance(tile);
  };

  const clearEffects = () => {
    tiles.forEach((tile) => {
      tile.effect = null;
      refreshTileAppearance(tile);
    });
  };

  const clearDisabled = () => {
    tiles.forEach((tile) => {
      tile.disabled = false;
      refreshTileAppearance(tile);
    });
  };

  const clearHoverStates = () => {
    tiles.forEach((tile) => {
      tile.hoverState = 'none';
      refreshTileAppearance(tile);
    });
  };

  const clearOccupants = () => {
    tiles.forEach((tile) => {
      tile.occupant = null;
      refreshTileAppearance(tile);
    });
  };

  return {
    group: boardGroup,
    tiles,
    setTileOwner,
    setTileOccupiedBy,
    setTileEffect,
    setTileDisabled,
    clearDisabled,
    clearEffects,
    clearOccupants,
    setTileHoverState,
    clearHoverStates
  };
};
