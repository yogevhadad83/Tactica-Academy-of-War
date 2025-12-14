import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CELL_SIZE } from '../constants/board';
import type { DemoState, HitEvent } from '../types/battle';
import type { PlacedUnit } from '../types';
import { useUnitLayer } from './units/useUnitLayer';
import { createTacticalBoard } from './createTacticalBoard';
import type { TileEffect, TileOwner, TacticalBoard, TileOccupant } from './createTacticalBoard';

const PLANNING_CAMERA_FOV = 38;
const BATTLE_CAMERA_FOV = 54; // wider angle for cinematic battle view
const ORBIT_RADIUS = 18;
const BASE_CAMERA_HEIGHT = 20;
const LOCKED_CAMERA_DISTANCE = ORBIT_RADIUS * 1.25;
const LOCKED_CAMERA_HEIGHT = BASE_CAMERA_HEIGHT + 8;
const CAMERA_CLOSE_DISTANCE_FACTOR = 0.52;
const CAMERA_CLOSE_HEIGHT_FACTOR = 0.74;
const PLANNING_CAMERA_DISTANCE_FACTOR = 0.96;
const CAMERA_LERP_FACTOR = 0.12;
const CAMERA_APPROACH_DURATION = 900;

// Legacy tuning constants kept for reference (no longer used in planning view)
// const LOCKED_DISTANCE_FACTOR = 1.55;
// const LOCKED_HEIGHT_FACTOR = 1.15;
// const LOCKED_MIN_DISTANCE = 14;
// const LOCKED_MIN_HEIGHT = 12;
// const LOCKED_TARGET_Z_FACTOR = 0.18;
// const LOCKED_TARGET_Z_OFFSET = CELL_SIZE * 1.6;
// const LOCKED_LOOK_HEIGHT_FACTOR = 0.065;
// const LOCKED_LOOK_MIN = 2.6;
// const LOCKED_LOOK_DOWN_OFFSET = -0.2;
// const LOCKED_CAMERA_X_OFFSET = 3.5;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface ThreeBattleStageProps {
  boardSize: number;
  boardCols?: number;
  units: PlacedUnit[];
  hitCells: string[];
  hitEvents: HitEvent[];
  moveCells: string[];
  marchCells: string[];
  demoState: DemoState;
  interactionMode?: 'planning' | 'battle';
  dragActive?: boolean;
  onTileHover?: (info: { row: number; col: number; occupied: TileOccupant | null }) => void;
  onTileDrop?: (info: { row: number; col: number; occupied: TileOccupant | null }) => void;
  onTileClick?: (info: { row: number; col: number; occupied: TileOccupant | null }) => void;
  forceOwner?: TileOwner;
}

const ThreeBattleStage = ({
  boardSize,
  boardCols,
  units,
  hitCells,
  hitEvents,
  moveCells,
  marchCells,
  demoState,
  interactionMode = 'battle',
  dragActive = false,
  onTileHover,
  onTileDrop,
  onTileClick,
  forceOwner
}: ThreeBattleStageProps) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const unitRootRef = useRef<THREE.Group | null>(null);
  const tacticalBoardRef = useRef<TacticalBoard | null>(null);
  const animationRef = useRef<number | null>(null);
  const pmremRef = useRef<THREE.PMREMGenerator | null>(null);
  const envTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const flightModeRef = useRef(false);
  const cameraModeRef = useRef<'idle' | 'locked'>('idle');
  const lockedCameraBasePositionRef = useRef(
    new THREE.Vector3(0, LOCKED_CAMERA_HEIGHT, LOCKED_CAMERA_DISTANCE)
  );
  const lockedCameraClosePositionRef = useRef(
    new THREE.Vector3(
      0,
      LOCKED_CAMERA_HEIGHT * CAMERA_CLOSE_HEIGHT_FACTOR,
      LOCKED_CAMERA_DISTANCE * CAMERA_CLOSE_DISTANCE_FACTOR
    )
  );
  const lockedCameraPositionRef = useRef(
    new THREE.Vector3(0, LOCKED_CAMERA_HEIGHT, LOCKED_CAMERA_DISTANCE)
  );
  const cameraApproachRef = useRef({ active: false, start: 0, progress: 0 });
  const pendingApproachRef = useRef(false);
  const planningCameraPositionRef = useRef(
    new THREE.Vector3(0, BASE_CAMERA_HEIGHT * 1, ORBIT_RADIUS * PLANNING_CAMERA_DISTANCE_FACTOR)
  );
  const idleCameraLerpRef = useRef(new THREE.Vector3());
  const {
    modelRevision,
    ensureAssetsForUnits,
    syncUnits,
    applyBattleState,
    updateHpFacing: alignHpOverlays,
    updateUnitMovement: advanceUnitMovement,
    updateDeathFades: fadeOutFallenUnits,
    updateMixers,
    updateHpAnimations,
    updateRandomIdles,
    updateProjectiles,
    clearProjectiles,
    disposeAll
  } = useUnitLayer(unitRootRef, unitRootRef);

  const beginCameraApproach = () => {
    if (typeof window === 'undefined') return;
    lockedCameraPositionRef.current.copy(lockedCameraBasePositionRef.current);
    cameraApproachRef.current = {
      active: true,
      start: performance.now(),
      progress: 0
    };
    pendingApproachRef.current = false;
  };
  const lockedCameraTargetRef = useRef(new THREE.Vector3(0, 0, -CELL_SIZE * 2));
  const zoomPressedRef = useRef(false);
  const zoomFactorRef = useRef(0);
  const ZOOM_LERP_SPEED = 0.12;
  const zoomCameraPositionRef = useRef(
    new THREE.Vector3(0, LOCKED_CAMERA_HEIGHT * 0.7, LOCKED_CAMERA_DISTANCE)
  );
  const zoomTargetRef = useRef(new THREE.Vector3(0, 0, -15));
  const zoomLookAtRef = useRef(new THREE.Vector3());
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const groundPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const tileMeshesRef = useRef<THREE.Object3D[]>([]);
  const hoveredTileKeyRef = useRef<string | null>(null);
  const dragActiveRef = useRef(false);
  const onTileDropRef = useRef(onTileDrop);
  const onTileHoverRef = useRef(onTileHover);
  const onTileClickRef = useRef(onTileClick);

  // Keep refs in sync with current prop values
  useEffect(() => {
    dragActiveRef.current = dragActive;
  }, [dragActive]);

  useEffect(() => {
    onTileDropRef.current = onTileDrop;
    onTileHoverRef.current = onTileHover;
    onTileClickRef.current = onTileClick;
  }, [onTileDrop, onTileHover, onTileClick]);

  useEffect(() => {
    const rows = boardSize;
    const cols = boardCols ?? boardSize;
    const extentX = cols * CELL_SIZE;
    const extentZ = rows * CELL_SIZE;
    const boardSpan = Math.max(extentX, extentZ);
    const boardCenterZ = -15; // from tacticalBoard.group.position.z

    if (interactionMode === 'planning') {
      const topDownHeight = Math.max(12, boardSpan * 0.42);
      const topDownDistance = Math.max(6, boardSpan * 0.14);
      lockedCameraTargetRef.current.set(0, 0, boardCenterZ);
      planningCameraPositionRef.current.set(0, topDownHeight, boardCenterZ + topDownDistance);
      lockedCameraBasePositionRef.current.copy(planningCameraPositionRef.current);
      lockedCameraClosePositionRef.current.set(0, topDownHeight * 0.88, boardCenterZ + topDownDistance * 0.65);
      zoomCameraPositionRef.current.set(1.8, topDownHeight * 0.68, boardCenterZ + topDownDistance * 0.42);
    } else {
      const sideOffset = Math.max(boardSpan * 0.5, 12); // Right side view (Blue Left, Red Right)
      const battleDistance = Math.max(16, boardSpan * 0.35); // Closer
      const battleHeight = Math.max(18, boardSpan * 0.35); // Lower
      lockedCameraTargetRef.current.set(0, -6, boardCenterZ); // Centered target
      planningCameraPositionRef.current.set(sideOffset * 0.72, battleHeight * 0.88, boardCenterZ + battleDistance * 0.75);
      lockedCameraBasePositionRef.current.set(sideOffset, battleHeight, boardCenterZ + battleDistance);
      lockedCameraClosePositionRef.current.set(sideOffset * 0.82, battleHeight * 0.72, boardCenterZ + battleDistance * 0.55);
      zoomCameraPositionRef.current.set(sideOffset * 0.48, battleHeight * 0.52, boardCenterZ + battleDistance * 0.32);
    }

    lockedCameraPositionRef.current.copy(lockedCameraBasePositionRef.current);
    cameraApproachRef.current = { active: false, start: 0, progress: 0 };
  }, [boardSize, boardCols, interactionMode]);

  useEffect(() => {
    ensureAssetsForUnits(units);
  }, [ensureAssetsForUnits, units]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const voidHex = 0x01060f;
    scene.background = new THREE.Color(voidHex);
    scene.fog = new THREE.FogExp2(voidHex, 0.018);

    const cameraFov = interactionMode === 'planning' ? PLANNING_CAMERA_FOV : BATTLE_CAMERA_FOV;
    const camera = new THREE.PerspectiveCamera(cameraFov, mount.clientWidth / mount.clientHeight, 0.2, 1200);
    // Start the camera extremely far and high so the board feels tiny, then let it fall into place
    const rows = boardSize;
    const cols = boardCols ?? boardSize;
    const extentX = cols * CELL_SIZE;
    const extentZ = rows * CELL_SIZE;
    const boardExtent = Math.max(extentX, extentZ);
    const distantHeight = Math.max(BASE_CAMERA_HEIGHT * 4.5, boardExtent * 4.2);
    const distantDistance = Math.max(ORBIT_RADIUS * 4.8, boardExtent * 4.5);
    camera.position.set(-distantDistance, distantHeight, distantDistance * 1.15);
    camera.lookAt(lockedCameraTargetRef.current);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(voidHex, 1);
    mount.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremRef.current = pmremGenerator;
    envTargetRef.current = envTarget;

    const ambient = new THREE.AmbientLight(0x0f172a, 0.4);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0x93c5fd, 2.1);
    keyLight.position.set(-20, 32, 38);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 140;
    const shadowRange = Math.max(extentX, extentZ) * 1.2;
    keyLight.shadow.camera.left = -shadowRange;
    keyLight.shadow.camera.right = shadowRange;
    keyLight.shadow.camera.top = shadowRange;
    keyLight.shadow.camera.bottom = -shadowRange;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffe7c2, 0.55);
    fillLight.position.set(28, 18, -26);
    scene.add(fillLight);

    const tacticalBoard = createTacticalBoard({ boardRows: rows, boardCols: cols, cellSize: CELL_SIZE, forceOwner });
    tacticalBoardRef.current = tacticalBoard;
    tileMeshesRef.current = Array.from(tacticalBoard.tiles.values()).map((tile) => tile.mesh);
    tacticalBoard.group.position.set(0, 0, -15);
    scene.add(tacticalBoard.group);

    const unitRoot = new THREE.Group();
    unitRoot.position.set(0, 0, -15);
    unitRootRef.current = unitRoot;
    scene.add(unitRoot);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    const clock = new THREE.Clock();

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;
      updateCamera(elapsed);
      alignHpOverlays(camera);
      updateMixers(delta);
      advanceUnitMovement();
      fadeOutFallenUnits();
      updateHpAnimations();
      updateRandomIdles(units);
      updateProjectiles();
      renderer.render(scene, camera);
    };

    const updateCamera = (elapsed: number) => {
      const camera = cameraRef.current;
      if (!camera) return;
      const flightActive = flightModeRef.current;

      if (flightActive && cameraModeRef.current === 'locked') {
        if (cameraApproachRef.current.active) {
          const now = performance.now();
          const elapsedMs = now - cameraApproachRef.current.start;
          const progress = clamp(elapsedMs / CAMERA_APPROACH_DURATION, 0, 1);
          cameraApproachRef.current.progress = progress;
          if (progress >= 1) {
            cameraApproachRef.current.active = false;
          }
        }
        const approachAmount = easeInOutCubic(cameraApproachRef.current.progress);
        lockedCameraPositionRef.current.lerpVectors(
          lockedCameraBasePositionRef.current,
          lockedCameraClosePositionRef.current,
          approachAmount
        );

        // Handle zoom on pointer press
        const targetZoom = zoomPressedRef.current ? 1 : 0;
        zoomFactorRef.current += (targetZoom - zoomFactorRef.current) * ZOOM_LERP_SPEED;
        
        // Interpolate between current locked position and zoom position
        const zoomedPosition = new THREE.Vector3().lerpVectors(
          lockedCameraPositionRef.current,
          zoomCameraPositionRef.current,
          zoomFactorRef.current
        );
        
        // Interpolate look-at target between normal view and zoom target
        zoomLookAtRef.current.lerpVectors(
          lockedCameraTargetRef.current,
          zoomTargetRef.current,
          zoomFactorRef.current
        );
        
        camera.position.lerp(zoomedPosition, CAMERA_LERP_FACTOR);
        camera.lookAt(zoomLookAtRef.current);
        return;
      }

      const idleTarget = idleCameraLerpRef.current;
      idleTarget.copy(planningCameraPositionRef.current);
      idleTarget.y += Math.sin(elapsed * 0.45) * 0.8;
      camera.position.lerp(idleTarget, 0.08);
      camera.lookAt(lockedCameraTargetRef.current);
    };

    animate();

    const handleResize = () => {
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      const mount = mountRef.current;
      if (!camera || !renderer || !mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };

    const clearHover = () => {
      const board = tacticalBoardRef.current;
      board?.clearHoverStates();
      hoveredTileKeyRef.current = null;
      if (onTileHoverRef.current) {
        onTileHoverRef.current({ row: -1, col: -1, occupied: null });
      }
    };

    const updatePointer = (event: PointerEvent) => {
      const mount = mountRef.current;
      if (!mount) return false;
      const rect = mount.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      return true;
    };

    const handlePointerDown = (event: PointerEvent) => {
      const camera = cameraRef.current;
      if (!camera) return;

      if (interactionMode === 'planning') {
        updatePointer(event);
        return;
      }

      // Only zoom during battle
      if (cameraModeRef.current !== 'locked') return;
      if (!updatePointer(event)) return;

      // Raycast to find where on the ground plane the user clicked
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const intersectPoint = new THREE.Vector3();
      raycasterRef.current.ray.intersectPlane(groundPlaneRef.current, intersectPoint);
      
      if (intersectPoint) {
        // Set the zoom target to the clicked point, slightly elevated to focus on unit height
        zoomTargetRef.current.set(intersectPoint.x, 1.5, intersectPoint.z);
        
        // Calculate camera position for dramatic side angle close-up
        const ZOOM_DISTANCE = 4; // How far from the target
        const ZOOM_HEIGHT = 2.5;  // Camera height
        const ZOOM_SIDE_OFFSET = 3.5; // Side offset for dramatic angle
        
        // Position camera to the side and slightly behind the click point
        zoomCameraPositionRef.current.set(
          intersectPoint.x + ZOOM_SIDE_OFFSET,
          ZOOM_HEIGHT,
          intersectPoint.z + ZOOM_DISTANCE
        );
      }
      
      zoomPressedRef.current = true;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const camera = cameraRef.current;
      const board = tacticalBoardRef.current;
      if (!camera || !board) return;
      if (!updatePointer(event)) return;
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const intersections = raycasterRef.current.intersectObjects(tileMeshesRef.current, false);
      if (intersections.length === 0) {
        clearHover();
        return;
      }
      const { key, row, col } = intersections[0].object.userData as { key?: string; row?: number; col?: number };
      if (!key || row === undefined || col === undefined) {
        clearHover();
        return;
      }
      const tile = board.tiles.get(key);
      const occupant = tile?.occupant ?? null;
      const hoverState = dragActiveRef.current
        ? occupant
          ? 'blocked'
          : 'valid'
        : occupant
          ? 'inspect'
          : 'none';
      board.clearHoverStates();
      if (hoverState !== 'none') {
        board.setTileHoverState(row, col, hoverState);
      }
      hoveredTileKeyRef.current = key;
      if (onTileHoverRef.current) {
        onTileHoverRef.current({ row, col, occupied: occupant });
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      console.log('[ThreeBattleStage] handlePointerUp, dragActiveRef.current:', dragActiveRef.current, 'interactionMode:', interactionMode);
      zoomPressedRef.current = false;
      const camera = cameraRef.current;
      const board = tacticalBoardRef.current;

      // If in planning mode with drop handler and actively dragging, process drop
      if (interactionMode === 'planning' && onTileDropRef.current && dragActiveRef.current) {
        console.log('[ThreeBattleStage] Drag is active, processing drop...');
        let foundTile = false;
        if (camera && board && updatePointer(event)) {
          raycasterRef.current.setFromCamera(pointerRef.current, camera);
          const intersections = raycasterRef.current.intersectObjects(tileMeshesRef.current, false);
          console.log('[ThreeBattleStage] Raycast intersections:', intersections.length);
          if (intersections.length > 0) {
            const { key, row, col } = intersections[0].object.userData as { key?: string; row?: number; col?: number };
            console.log('[ThreeBattleStage] Hit tile:', { key, row, col });
            if (key && row !== undefined && col !== undefined) {
              const tile = board.tiles.get(key);
              const occupant = tile?.occupant ?? null;
              console.log('[ThreeBattleStage] Calling onTileDrop with:', { row, col, occupied: occupant });
              onTileDropRef.current?.({ row, col, occupied: occupant });
              foundTile = true;
            }
          }
        }
        if (!foundTile) {
          console.log('[ThreeBattleStage] No tile found, signaling cancellation');
          // Signal cancellation (no valid tile)
          onTileDropRef.current?.({ row: -1, col: -1, occupied: null });
        }
        clearHover();
        return;
      }

      if (!camera || !board) return;

      // Re-run raycast for click detection
      if (updatePointer(event)) {
        raycasterRef.current.setFromCamera(pointerRef.current, camera);
        const intersections = raycasterRef.current.intersectObjects(tileMeshesRef.current, false);
        if (intersections.length > 0) {
          const { key, row, col } = intersections[0].object.userData as { key?: string; row?: number; col?: number };
          if (key && row !== undefined && col !== undefined) {
            hoveredTileKeyRef.current = key;
          }
        }
      }

      if (!hoveredTileKeyRef.current) return;
      const tile = board.tiles.get(hoveredTileKeyRef.current);
      if (!tile) return;
      const [row, col] = hoveredTileKeyRef.current.split('-').map(Number);
      const occupant = tile.occupant ?? null;

      if (interactionMode === 'planning' && occupant) {
        onTileClickRef.current?.({ row, col, occupied: occupant });
      }
    };

    const handlePointerLeave = () => {
      zoomPressedRef.current = false;
      clearHover();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      tacticalBoardRef.current = null;
      disposeAll();
      renderer.dispose();
      envTargetRef.current?.dispose();
      envTargetRef.current = null;
      pmremRef.current?.dispose();
      pmremRef.current = null;
      mount.removeChild(renderer.domElement);
    };
  }, [boardSize, boardCols, disposeAll, forceOwner, interactionMode]);

  useEffect(() => {
    const cols = boardCols ?? boardSize;
    syncUnits(units, boardSize, cols);
  }, [syncUnits, units, boardSize, boardCols, modelRevision]);

  useEffect(() => {
    if (!dragActive) {
      tacticalBoardRef.current?.clearHoverStates();
      hoveredTileKeyRef.current = null;
    }
  }, [dragActive]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const board = tacticalBoardRef.current;
    if (!board) return;
    board.clearOccupants();
    units.forEach((unit) => {
      const occupant: TileOwner = unit.team === 'player' ? 'blue' : 'red';
      board.setTileOccupiedBy(unit.position.row, unit.position.col, occupant);
    });
  }, [units, boardSize]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const board = tacticalBoardRef.current;
    if (board) {
      board.clearEffects();
      const applyEffect = (cellKeys: string[], effect: TileEffect) => {
        cellKeys.forEach((key) => {
          const [row, col] = key.split('-').map(Number);
          board.setTileEffect(row, col, effect);
        });
      };
      applyEffect(hitCells, 'hit');
      applyEffect(moveCells, 'move');
      applyEffect(marchCells, 'march');
    }

    applyBattleState({ hitCells, hitEvents, moveCells, marchCells, units, demoState, boardSize, boardCols });
  }, [applyBattleState, boardSize, boardCols, demoState, hitCells, hitEvents, marchCells, moveCells, units]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flightActive = demoState === 'countdown' || demoState === 'running';
    flightModeRef.current = flightActive;

    if (demoState === 'countdown') {
      // Clear processed hit IDs when starting a new battle so animations play fresh
      clearProjectiles();
      pendingApproachRef.current = false;
      cameraApproachRef.current = { active: false, start: 0, progress: 0 };
      lockedCameraPositionRef.current.copy(lockedCameraBasePositionRef.current);
      // During countdown, smoothly glide from the distant intro position toward the locked position
      cameraModeRef.current = 'locked';
      beginCameraApproach();
    } else if (demoState === 'running') {
      cameraModeRef.current = 'locked';
      // If for some reason the approach hasn't started yet, ensure it runs
      if (!cameraApproachRef.current.active && cameraApproachRef.current.progress < 1) {
        beginCameraApproach();
      }
    } else {
      cameraModeRef.current = 'idle';
      pendingApproachRef.current = false;
      cameraApproachRef.current = { active: false, start: 0, progress: 0 };
    }
  }, [demoState, clearProjectiles]);

  return <div className="three-stage-canvas" ref={mountRef}></div>;
};

export default ThreeBattleStage;
