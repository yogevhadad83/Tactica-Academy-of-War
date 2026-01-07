import * as THREE from 'three';

import { boardKey } from '../constants/board';

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

interface Tile {
  mesh: THREE.Mesh;
  owner: TileOwner;
  occupant: TileOccupant;
  effect: TileEffect;
  hoverState: TileHoverState;
  disabled: boolean;
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
  setTileHoverState: (row: number, col: number, state: TileHoverState) => void;
  clearHoverStates: () => void;
}

type ProjectedAtlasParams = {
  atlas: THREE.Texture;
  normalYThreshold?: number;
  swapXZ?: boolean;
  flipU?: boolean;
  flipV?: boolean;
};

let cachedAtlasTexture: THREE.Texture | null = null;

const getAtlasTexture = () => {
  if (cachedAtlasTexture) return cachedAtlasTexture;

  const loader = new THREE.TextureLoader();
  const texture = loader.load(
    '/texture/board.jpg',
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
  cachedAtlasTexture = texture;
  return texture;
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
  forceOwner
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

  const atlas = getAtlasTexture();
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
        disabled: false
      };
      tiles.set(key, tile);
    }
  }

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
    });
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
    clearHoverStates
  };
};

