import * as THREE from 'three';

import { boardKey } from '../constants/board';

export type TileOwner = 'blue' | 'red';
export type TileOccupant = TileOwner | null;
export type TileEffect =
  | 'hit'
  | 'move'
  | 'march'
  | 'disabled'
  | null;
export type TileHoverState = 'none';

interface TacticalBoardOptions {
  boardRows: number;
  boardCols: number;
  cellSize: number;
  forceOwner?: TileOwner;
  atlasPath?: string;
}

interface Tile {
  mesh: THREE.Mesh;
  owner: TileOwner;
  occupant: TileOccupant;
  effect: TileEffect;
  hoverState: TileHoverState;
  disabled: boolean;
  disabledOverlayIndex: number;
  disabledOverlayMatrix: THREE.Matrix4;
}

export interface TacticalBoard {
  group: THREE.Group;
  tiles: Map<string, Tile>;
  setTileOwner: (row: number, col: number, owner: TileOwner) => void;
  setTileOccupiedBy: (row: number, col: number, occupant: TileOccupant) => void;
  setTileEffect: (row: number, col: number, effect: TileEffect) => void;
  setTileDisabled: (row: number, col: number, disabled: boolean) => void;
  clearDisabled: () => void;
  clearEffects: () => void;
  clearOccupants: () => void;
  setTileHoverState?: (row: number, col: number, state: TileHoverState) => void;
  clearHoverStates?: () => void;
  setDragIndicators: (sourceRow: number | null, sourceCol: number | null, targetRow: number | null, targetCol: number | null) => void;
  clearDragIndicators: () => void;
}

type ProjectedAtlasParams = {
  atlas: THREE.Texture;
  normalYThreshold?: number;
  swapXZ?: boolean;
  flipU?: boolean;
  flipV?: boolean;
};

const cachedAtlasTextures: Record<string, THREE.Texture> = {};
const cachedOverlayTextures: Record<string, THREE.Texture> = {};

const getAtlasTexture = (path = '/texture/board.png') => {
  if (cachedAtlasTextures[path]) return cachedAtlasTextures[path];

  const loader = new THREE.TextureLoader();
  const texture = loader.load(
    path,
    () => {
      // Keep logs minimal per spec.
    },
    undefined,
    () => {
      // Keep logs minimal per spec.
    }
  );
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  cachedAtlasTextures[path] = texture;
  return texture;
};

const getDisabledHatchTexture = () => {
  if (cachedOverlayTextures.hatch) return cachedOverlayTextures.hatch;
  if (typeof document === 'undefined') return null;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Almost black base
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  
  // Very dark gray stripes for subtle pattern
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 4;

  const step = 8;
  for (let x = -size; x < size * 2; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + size, size);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.colorSpace = THREE.SRGBColorSpace;
  cachedOverlayTextures.hatch = texture;
  return texture;
};

const makeDragIndicatorMaterial = (color: number) => {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2.5,
    polygonOffsetUnits: -2.5,
    side: THREE.DoubleSide
  });
};

const makeProjectedAtlasMaterial = ({
  atlas,
  normalYThreshold = 0.6,
  swapXZ = true,
  flipU = false,
  flipV = true
}: ProjectedAtlasParams): THREE.MeshStandardMaterial => {
  const DEBUG_UV = false;

  const material = new THREE.MeshStandardMaterial({
    color: 0x1f232a,
    roughness: 0.95,
    metalness: 0.05
  });

  const uBoardMin = { value: new THREE.Vector2(0, 0) };
  const uBoardSize = { value: new THREE.Vector2(1, 1) };
  material.userData.projectedAtlasUniforms = { uBoardMin, uBoardSize };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.projectedAtlasMap = { value: atlas };
    shader.uniforms.uBoardMin = uBoardMin;
    shader.uniforms.uBoardSize = uBoardSize;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\n`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\n\nvWorldPos = worldPosition.xyz;\nvWorldNormal = normalize(mat3(modelMatrix) * normal);\n`
      );

    const swapXZCode = swapXZ ? 'projectedUV = projectedUV.yx;' : '';
    const flipUCode = flipU ? 'projectedUV.x = 1.0 - projectedUV.x;' : '';
    const flipVCode = flipV ? 'projectedUV.y = 1.0 - projectedUV.y;' : '';

    const debugUvBlock = DEBUG_UV
      ? `\nif (topMask > 0.5) {\n  diffuseColor.rgb = vec3(projectedUV, 0.0);\n}\n`
      : '';

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n\nuniform sampler2D projectedAtlasMap;\nuniform vec2 uBoardMin;\nuniform vec2 uBoardSize;\n\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\n`
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );\n\nvec2 projectedUV = vec2(\n  (vWorldPos.x - uBoardMin.x) / uBoardSize.x,\n  (vWorldPos.z - uBoardMin.y) / uBoardSize.y\n);\n\n// Default flip to match prior orientation\nprojectedUV.y = 1.0 - projectedUV.y;\n\n${swapXZCode}\n${flipUCode}\n${flipVCode}\n\nprojectedUV = clamp(projectedUV, 0.0, 1.0);\n\nvec3 atlasColor = texture2D(projectedAtlasMap, projectedUV).rgb;\nfloat topMask = step(${normalYThreshold.toFixed(3)}, vWorldNormal.y);\ndiffuseColor.rgb = mix(diffuseColor.rgb, atlasColor, topMask);\n${debugUvBlock}`
      );
  };

  material.customProgramCacheKey = () =>
    [
      'projectedAtlas-v1',
      `t:${normalYThreshold.toFixed(3)}`,
      `sxz:${swapXZ ? 1 : 0}`,
      `fu:${flipU ? 1 : 0}`,
      `fv:${flipV ? 1 : 0}`
    ].join('|');

  return material;
};

export const createTacticalBoard = ({
  boardRows,
  boardCols,
  cellSize,
  forceOwner,
  atlasPath
}: TacticalBoardOptions): TacticalBoard => {
  const group = new THREE.Group();
  group.name = 'TacticalBoard';

  const boardW = boardCols * cellSize;
  const boardH = boardRows * cellSize;

  const BASE_THICKNESS = 0.14 * cellSize;
  const BASE_BEVEL = 0.04 * cellSize;

  const TILE_GAP = 0.06 * cellSize;
  const TILE_THICKNESS = 0.12 * cellSize;
  const TILE_BEVEL = 0.04 * cellSize;
  const TILE_CLEARANCE = 0.02 * cellSize;
  const DISABLED_OVERLAY_OPACITY = 0.88;
  const DISABLED_OVERLAY_Y_OFFSET = 0.012 * cellSize;
  const DISABLED_OVERLAY_ENABLE_HATCH = true;

  const atlas = getAtlasTexture(atlasPath ?? '/texture/board.png');
  const projectedMat = makeProjectedAtlasMaterial({ atlas, flipU: true });

  // Base slab: top surface at y = 0.
  const baseShape = new THREE.Shape();
  baseShape.moveTo(-boardW / 2, -boardH / 2);
  baseShape.lineTo(boardW / 2, -boardH / 2);
  baseShape.lineTo(boardW / 2, boardH / 2);
  baseShape.lineTo(-boardW / 2, boardH / 2);
  baseShape.closePath();

  const baseGeometry = new THREE.ExtrudeGeometry(baseShape, {
    depth: BASE_THICKNESS,
    bevelEnabled: true,
    bevelSize: BASE_BEVEL * 0.5,
    bevelThickness: BASE_BEVEL * 0.5,
    bevelSegments: 2
  });
  baseGeometry.rotateX(-Math.PI / 2);
  baseGeometry.translate(0, -BASE_THICKNESS, 0);

  const baseMesh = new THREE.Mesh(baseGeometry, projectedMat);
  baseMesh.name = 'boardBase';
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // Keep projected bounds correct even if the board group is repositioned/rotated later.
  let boundsLogged = false;
  let lastUpdatedFrame = -1;
  const updateProjectedBounds = (renderer: THREE.WebGLRenderer) => {
    const uniforms = (projectedMat.userData.projectedAtlasUniforms ?? {}) as {
      uBoardMin?: { value: THREE.Vector2 };
      uBoardSize?: { value: THREE.Vector2 };
    };
    if (!uniforms.uBoardMin || !uniforms.uBoardSize) return;

    const frame = renderer.info.render.frame;
    if (frame === lastUpdatedFrame) return;
    lastUpdatedFrame = frame;

    group.updateMatrixWorld(true);
    const pMin = new THREE.Vector3(-boardW / 2, 0, -boardH / 2).applyMatrix4(group.matrixWorld);
    const pMax = new THREE.Vector3(+boardW / 2, 0, +boardH / 2).applyMatrix4(group.matrixWorld);
    const minX = Math.min(pMin.x, pMax.x);
    const maxX = Math.max(pMin.x, pMax.x);
    const minZ = Math.min(pMin.z, pMax.z);
    const maxZ = Math.max(pMin.z, pMax.z);
    const boardWWorld = Math.max(0.00001, maxX - minX);
    const boardHWorld = Math.max(0.00001, maxZ - minZ);

    uniforms.uBoardMin.value.set(minX, minZ);
    uniforms.uBoardSize.value.set(boardWWorld, boardHWorld);

    if (!boundsLogged) {
      boundsLogged = true;
      console.log('Board projected bounds', { minX, maxX, minZ, maxZ, boardWWorld, boardHWorld });
    }
  };

  baseMesh.onBeforeRender = (renderer) => {
    updateProjectedBounds(renderer);
  };

  const tiles = new Map<string, Tile>();
  const tileSize = cellSize - TILE_GAP;

  const tileShape = new THREE.Shape();
  tileShape.moveTo(-tileSize / 2, -tileSize / 2);
  tileShape.lineTo(tileSize / 2, -tileSize / 2);
  tileShape.lineTo(tileSize / 2, tileSize / 2);
  tileShape.lineTo(-tileSize / 2, tileSize / 2);
  tileShape.closePath();

  const tileGeometry = new THREE.ExtrudeGeometry(tileShape, {
    depth: TILE_THICKNESS,
    bevelEnabled: true,
    bevelSize: TILE_BEVEL * 0.35,
    bevelThickness: TILE_BEVEL * 0.35,
    bevelSegments: 2
  });
  tileGeometry.rotateX(-Math.PI / 2);

  const disabledOverlayGeometry = new THREE.PlaneGeometry(tileSize, tileSize);
  disabledOverlayGeometry.rotateX(-Math.PI / 2);

  const disabledOverlayMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: DISABLED_OVERLAY_OPACITY,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });

  if (DISABLED_OVERLAY_ENABLE_HATCH) {
    const hatchTexture = getDisabledHatchTexture();
    if (hatchTexture) {
      disabledOverlayMaterial.map = hatchTexture;
      disabledOverlayMaterial.needsUpdate = true;
    }
  }

  const disabledOverlay = new THREE.InstancedMesh(
    disabledOverlayGeometry,
    disabledOverlayMaterial,
    boardRows * boardCols
  );
  disabledOverlay.name = 'disabledOverlay';
  disabledOverlay.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  disabledOverlay.renderOrder = 2;
  disabledOverlay.raycast = () => null;
  group.add(disabledOverlay);

  const hiddenOverlayMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  // Drag indicator meshes: source and target (subtle glow rings)
  // Use a ring/torus geometry for subtle glow effect
  const dragIndicatorGeometry = new THREE.TorusGeometry(tileSize * 0.3, tileSize * 0.05, 8, 32);
  dragIndicatorGeometry.rotateX(Math.PI / 2);
  
  const sourceMaterial = makeDragIndicatorMaterial(0xffd84d); // Subtle yellow
  const targetMaterial = makeDragIndicatorMaterial(0x66ffaa); // Subtle teal
  
  const sourceIndicator = new THREE.InstancedMesh(dragIndicatorGeometry, sourceMaterial, 1);
  sourceIndicator.name = 'dragSourceIndicator';
  sourceIndicator.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sourceIndicator.renderOrder = 3;
  sourceIndicator.raycast = () => null;
  sourceIndicator.visible = false;
  group.add(sourceIndicator);
  
  const targetIndicator = new THREE.InstancedMesh(dragIndicatorGeometry, targetMaterial, 1);
  targetIndicator.name = 'dragTargetIndicator';
  targetIndicator.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  targetIndicator.renderOrder = 3;
  targetIndicator.raycast = () => null;
  targetIndicator.visible = false;
  group.add(targetIndicator);

  for (let row = 0; row < boardRows; row += 1) {
    for (let col = 0; col < boardCols; col += 1) {
      const tileWorldX = -boardW / 2 + cellSize / 2 + col * cellSize;
      const tileWorldZ = -boardH / 2 + cellSize / 2 + row * cellSize;

      const mesh = new THREE.Mesh(tileGeometry, projectedMat);
      mesh.name = `tile-${row}-${col}`;
      mesh.position.set(tileWorldX, TILE_CLEARANCE, tileWorldZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      mesh.onBeforeRender = (renderer) => {
        updateProjectedBounds(renderer);
      };

      const key = boardKey(row, col);
      mesh.userData = { row, col, key };
      group.add(mesh);

      const tile: Tile = {
        mesh,
        owner: forceOwner ?? 'blue',
        occupant: null,
        effect: null,
        hoverState: 'none',
        disabled: false,
        disabledOverlayIndex: row * boardCols + col,
        disabledOverlayMatrix: new THREE.Matrix4().makeTranslation(
          tileWorldX,
          TILE_CLEARANCE + TILE_THICKNESS + DISABLED_OVERLAY_Y_OFFSET,
          tileWorldZ
        )
      };
      disabledOverlay.setMatrixAt(tile.disabledOverlayIndex, hiddenOverlayMatrix);
      tiles.set(key, tile);
    }
  }
  disabledOverlay.instanceMatrix.needsUpdate = true;

  const setTileOwner = (row: number, col: number, owner: TileOwner) => {
    const tile = tiles.get(boardKey(row, col));
    if (!tile) return;
    tile.owner = owner;
  };

  const setTileOccupiedBy = (row: number, col: number, occupant: TileOccupant) => {
    const tile = tiles.get(boardKey(row, col));
    if (!tile) return;
    tile.occupant = occupant;
  };

  const setTileEffect = (row: number, col: number, effect: TileEffect) => {
    const tile = tiles.get(boardKey(row, col));
    if (!tile) return;
    tile.effect = effect;
  };

  const setTileDisabled = (row: number, col: number, disabled: boolean) => {
    const tile = tiles.get(boardKey(row, col));
    if (!tile) return;
    tile.disabled = disabled;
    disabledOverlay.setMatrixAt(
      tile.disabledOverlayIndex,
      disabled ? tile.disabledOverlayMatrix : hiddenOverlayMatrix
    );
    disabledOverlay.instanceMatrix.needsUpdate = true;
  };

  const setTileHoverState = (row: number, col: number, state: TileHoverState) => {
    const tile = tiles.get(boardKey(row, col));
    if (!tile) return;
    tile.hoverState = state;
  };

  const clearEffects = () => {
    tiles.forEach((tile) => {
      tile.effect = null;
    });
  };

  const clearDisabled = () => {
    tiles.forEach((tile) => {
      tile.disabled = false;
      disabledOverlay.setMatrixAt(tile.disabledOverlayIndex, hiddenOverlayMatrix);
    });
    disabledOverlay.instanceMatrix.needsUpdate = true;
  };

  const clearHoverStates = () => {
    tiles.forEach((tile) => {
      tile.hoverState = 'none';
    });
  };

  const clearOccupants = () => {
    tiles.forEach((tile) => {
      tile.occupant = null;
    });
  };

  const setDragIndicators = (
    sourceRow: number | null,
    sourceCol: number | null,
    targetRow: number | null,
    targetCol: number | null
  ) => {
    // Show/hide source indicator
    if (sourceRow !== null && sourceCol !== null) {
      const sourceTile = tiles.get(boardKey(sourceRow, sourceCol));
      if (sourceTile) {
        const tileWorldX = -boardW / 2 + cellSize / 2 + sourceCol * cellSize;
        const tileWorldZ = -boardH / 2 + cellSize / 2 + sourceRow * cellSize;
        const matrix = new THREE.Matrix4().makeTranslation(
          tileWorldX,
          TILE_CLEARANCE + TILE_THICKNESS + 0.01 * cellSize,
          tileWorldZ
        );
        sourceIndicator.setMatrixAt(0, matrix);
        sourceIndicator.instanceMatrix.needsUpdate = true;
        sourceIndicator.visible = true;
      }
    } else {
      sourceIndicator.visible = false;
    }

    // Show/hide target indicator
    if (targetRow !== null && targetCol !== null) {
      const targetTile = tiles.get(boardKey(targetRow, targetCol));
      if (targetTile) {
        const tileWorldX = -boardW / 2 + cellSize / 2 + targetCol * cellSize;
        const tileWorldZ = -boardH / 2 + cellSize / 2 + targetRow * cellSize;
        const matrix = new THREE.Matrix4().makeTranslation(
          tileWorldX,
          TILE_CLEARANCE + TILE_THICKNESS + 0.01 * cellSize,
          tileWorldZ
        );
        targetIndicator.setMatrixAt(0, matrix);
        targetIndicator.instanceMatrix.needsUpdate = true;
        targetIndicator.visible = true;
      }
    } else {
      targetIndicator.visible = false;
    }
  };

  const clearDragIndicators = () => {
    sourceIndicator.visible = false;
    targetIndicator.visible = false;
  };

  // Proof logs (required)
  console.log('[TacticalBoard] tiles.size =', tiles.size);
  console.log('[TacticalBoard] projected atlas active');

  return {
    group,
    tiles,
    setTileOwner,
    setTileOccupiedBy,
    setTileEffect,
    setTileDisabled,
    clearDisabled,
    clearEffects,
    clearOccupants,
    setTileHoverState,
    clearHoverStates,
    setDragIndicators,
    clearDragIndicators
  };
};

