import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CELL_SIZE } from '../constants/board';
import type { DemoState, HitEvent } from '../types/battle';
import type { PlacedUnit } from '../types';
import { useUnitLayer } from './units/useUnitLayer';
import { createTacticalBoard } from './createTacticalBoard';
import type { TileEffect, TileOwner, TacticalBoard } from './createTacticalBoard';

const ORBIT_RADIUS = 32;
const BASE_CAMERA_HEIGHT = 24;
const LOCKED_CAMERA_DISTANCE = ORBIT_RADIUS * 0.55;
const LOCKED_CAMERA_HEIGHT = BASE_CAMERA_HEIGHT + 1.5;
const CAMERA_CLOSE_DISTANCE_FACTOR = 0.52;
const CAMERA_CLOSE_HEIGHT_FACTOR = 0.74;
const PLANNING_CAMERA_DISTANCE_FACTOR = 0.96;
const PLANNING_CAMERA_HEIGHT_FACTOR = 1.05;
const CAMERA_LERP_FACTOR = 0.12;
const CAMERA_APPROACH_DURATION = 900;

const LOCKED_DISTANCE_FACTOR = 1.55;
const LOCKED_HEIGHT_FACTOR = 1.15;
const LOCKED_MIN_DISTANCE = 18;
const LOCKED_MIN_HEIGHT = 12;
const LOCKED_TARGET_Z_FACTOR = 0.18;
const LOCKED_TARGET_Z_OFFSET = CELL_SIZE * 1.6;
const LOCKED_LOOK_HEIGHT_FACTOR = 0.065;
const LOCKED_LOOK_MIN = 2.6;
const LOCKED_LOOK_DOWN_OFFSET = -0.2;
const LOCKED_CAMERA_X_OFFSET = 3.5;

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
}

const ThreeBattleStage = ({ boardSize, boardCols, units, hitCells, hitEvents, moveCells, marchCells, demoState }: ThreeBattleStageProps) => {
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
    new THREE.Vector3(0, BASE_CAMERA_HEIGHT * 0.9, ORBIT_RADIUS * 0.8)
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
  const lockedCameraTargetRef = useRef(new THREE.Vector3(0, 2, -CELL_SIZE * 0.8));
  const zoomPressedRef = useRef(false);
  const zoomFactorRef = useRef(0);
  const ZOOM_LERP_SPEED = 0.12;
  const zoomCameraPositionRef = useRef(
    new THREE.Vector3(0, LOCKED_CAMERA_HEIGHT * 0.5, LOCKED_CAMERA_DISTANCE * 0.35)
  );
  const zoomTargetRef = useRef(new THREE.Vector3(0, 1.5, 0));
  const zoomLookAtRef = useRef(new THREE.Vector3());
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const groundPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  useEffect(() => {
    const rows = boardSize;
    const cols = boardCols ?? boardSize;
    const extentX = cols * CELL_SIZE;
    const extentZ = rows * CELL_SIZE;
    const boardExtent = Math.max(extentX, extentZ);
    const lockedDistance = Math.max(LOCKED_MIN_DISTANCE, boardExtent * LOCKED_DISTANCE_FACTOR);
    const lockedHeight = Math.max(LOCKED_MIN_HEIGHT, boardExtent * LOCKED_HEIGHT_FACTOR);
    lockedCameraBasePositionRef.current.set(LOCKED_CAMERA_X_OFFSET, lockedHeight, lockedDistance);
    const closeDistance = Math.max(8, lockedDistance * CAMERA_CLOSE_DISTANCE_FACTOR);
    const closeHeight = Math.max(7, lockedHeight * CAMERA_CLOSE_HEIGHT_FACTOR);
    lockedCameraClosePositionRef.current.set(LOCKED_CAMERA_X_OFFSET, closeHeight, closeDistance);
    lockedCameraPositionRef.current.copy(lockedCameraBasePositionRef.current);
    // Set zoom position for dramatic close-up from the side, looking slightly down at units
    const zoomDistance = Math.max(3, lockedDistance * 0.15);
    const zoomHeight = Math.max(2.5, lockedHeight * 0.18);
    const zoomSideOffset = extentX * 0.4; // Offset to the side for dramatic angle
    zoomCameraPositionRef.current.set(zoomSideOffset, zoomHeight, zoomDistance);
    const planningDistance = Math.max(14, lockedDistance * PLANNING_CAMERA_DISTANCE_FACTOR);
    const planningHeight = Math.max(12, lockedHeight * PLANNING_CAMERA_HEIGHT_FACTOR);
    planningCameraPositionRef.current.set(0, planningHeight, planningDistance);
    cameraApproachRef.current = { active: false, start: 0, progress: 0 };
    const baseLookHeight = Math.max(LOCKED_LOOK_MIN, boardExtent * LOCKED_LOOK_HEIGHT_FACTOR);
    const lookHeight = baseLookHeight + LOCKED_LOOK_DOWN_OFFSET;
    const targetZ = extentZ * LOCKED_TARGET_Z_FACTOR + LOCKED_TARGET_Z_OFFSET;
    lockedCameraTargetRef.current.set(0, lookHeight, targetZ);
  }, [boardSize, boardCols]);

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

    const camera = new THREE.PerspectiveCamera(56, mount.clientWidth / mount.clientHeight, 0.2, 1200);
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

    const tacticalBoard = createTacticalBoard({ boardRows: rows, boardCols: cols, cellSize: CELL_SIZE });
    tacticalBoardRef.current = tacticalBoard;
    scene.add(tacticalBoard.group);

    const unitRoot = new THREE.Group();
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
      updateRandomIdles();
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

    const handlePointerDown = (event: PointerEvent) => {
      const camera = cameraRef.current;
      const mount = mountRef.current;
      if (!camera || !mount) return;
      
      // Only zoom during battle
      if (cameraModeRef.current !== 'locked') return;
      
      // Calculate normalized device coordinates
      const rect = mount.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
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

    const handlePointerUp = () => {
      zoomPressedRef.current = false;
    };

    window.addEventListener('resize', handleResize);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointerleave', handlePointerUp);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointerleave', handlePointerUp);
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
  }, [boardSize, boardCols, disposeAll]);

  useEffect(() => {
    const cols = boardCols ?? boardSize;
    syncUnits(units, boardSize, cols);
  }, [syncUnits, units, boardSize, boardCols, modelRevision]);

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
