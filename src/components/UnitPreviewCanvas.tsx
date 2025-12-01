import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { PlacedUnit, Unit } from '../types';
import { useUnitLayer } from './units/useUnitLayer';

const PREVIEW_BOARD_SIZE = 3;
const CAMERA_DISTANCE = 4.4;
const CAMERA_HEIGHT = 2.6;
const CAMERA_FOV = 38;
const FLOOR_RADIUS = 4.8;
const SPIN_SPEED = 0.28;
const LOOK_TARGET_Y = 1.1;

interface UnitPreviewCanvasProps {
  unit: Unit | null;
}

const buildPreviewUnit = (unit: Unit | null): PlacedUnit[] => {
  if (!unit) {
    return [];
  }
  return [
    {
      ...unit,
      instanceId: `preview-${unit.id}`,
      team: 'player',
      position: { row: 1, col: 1 },
      currentHp: unit.hp
    } as PlacedUnit
  ];
};

const UnitPreviewCanvas = ({ unit }: UnitPreviewCanvasProps) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const unitRootRef = useRef<THREE.Group | null>(null);
  const hpRootRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const rotationRef = useRef(0);
  const [sceneReady, setSceneReady] = useState(false);

  const previewUnits = useMemo(() => buildPreviewUnit(unit), [unit]);

  const {
    modelRevision,
    ensureAssetsForUnits,
    syncUnits,
    updateHpFacing,
    updateUnitMovement,
    updateDeathFades,
    updateMixers,
    updateRandomIdles,
    disposeAll
  } = useUnitLayer(unitRootRef, hpRootRef, { showHpOverlay: true, hpWorldSpace: true, showHpDetails: true });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || typeof window === 'undefined') {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050713);

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, mount.clientWidth / mount.clientHeight, 0.1, 50);
    camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
    camera.lookAt(0, LOOK_TARGET_Y, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.03);
    scene.environment = envTarget.texture;

    const hemi = new THREE.HemisphereLight(0xcad8ff, 0x050711, 0.95);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffe9c6, 1.75);
    keyLight.position.set(6, 8, 4);
    keyLight.castShadow = false;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 1.35);
    rimLight.position.set(-5, 5.5, -6);
    scene.add(rimLight);

    const floorGeometry = new THREE.CircleGeometry(FLOOR_RADIUS, 96);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0b0f1f,
      metalness: 0.35,
      roughness: 0.75,
      transparent: true,
      opacity: 0.95
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = false;
    scene.add(floor);

    const accentGeometry = new THREE.CircleGeometry(FLOOR_RADIUS * 0.55, 96);
    const accentMaterial = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      transparent: true,
      opacity: 0.4
    });
    const accent = new THREE.Mesh(accentGeometry, accentMaterial);
    accent.rotation.x = -Math.PI / 2;
    accent.position.y = 0.01;
    scene.add(accent);

    const unitRoot = new THREE.Group();
    unitRoot.position.y = 0;
    scene.add(unitRoot);
    unitRootRef.current = unitRoot;

    const hpRoot = new THREE.Group();
    scene.add(hpRoot);
    hpRootRef.current = hpRoot;

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    setSceneReady(true);

    const clock = new THREE.Clock();
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      rotationRef.current += delta * SPIN_SPEED;
      if (unitRootRef.current) {
        unitRootRef.current.rotation.y = rotationRef.current;
      }
      updateUnitMovement();
      updateDeathFades();
      updateMixers(delta);
      updateRandomIdles();
      updateHpFacing(camera);
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!mount || !cameraRef.current || !rendererRef.current) return;
      const { clientWidth, clientHeight } = mount;
      cameraRef.current.aspect = clientWidth / clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(clientWidth, clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setSceneReady(false);
      disposeAll();
      renderer.dispose();
      envTarget.dispose();
      pmrem.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [disposeAll, updateDeathFades, updateHpFacing, updateMixers, updateRandomIdles, updateUnitMovement]);

  useEffect(() => {
    if (!sceneReady) return;
    ensureAssetsForUnits(previewUnits);
    syncUnits(previewUnits, PREVIEW_BOARD_SIZE);
  }, [ensureAssetsForUnits, previewUnits, sceneReady, syncUnits, modelRevision]);

  return <div className="unit-preview-canvas" ref={mountRef} aria-hidden={!unit}></div>;
};

export default UnitPreviewCanvas;
