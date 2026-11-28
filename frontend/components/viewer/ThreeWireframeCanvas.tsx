"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  DEFAULT_FOV_DEG,
  getCameraPresetConfig,
  getLightingPresetConfig,
  type CameraPreset,
  type InteractionMode,
  type LightingPreset,
  type RuntimeMeshMetadata,
} from "./viewerTypes";

export type ThreeInspectionMode = "geometry" | "wireframe";

export interface ThreeWireframeCanvasProps {
  src: string;
  alt: string;
  mode?: ThreeInspectionMode;
  autoRotate: boolean;
  interactionMode: InteractionMode;
  cameraPreset: CameraPreset;
  presetVersion: number;
  fov: number;
  showGrid?: boolean;
  lightingPreset?: LightingPreset;
  exposure?: number;
  shadows?: boolean;
  onLoad: (stats: RuntimeMeshMetadata) => void;
  onError: (message: string) => void;
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const mat of materials) {
        for (const value of Object.values(mat)) {
          if (value instanceof THREE.Texture) {
            value.dispose();
          }
        }
        mat.dispose();
      }
    }
  });
}

function applyPresetToCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  preset: CameraPreset,
  radius: number,
  centerY: number
): void {
  const cfg = getCameraPresetConfig(preset);
  const sinPhi = Math.sin(cfg.phi);
  const cosPhi = Math.cos(cfg.phi);
  const prevDamping = controls.enableDamping;
  controls.enableDamping = false;
  camera.position.set(
    radius * sinPhi * Math.sin(cfg.theta),
    centerY + radius * cosPhi,
    radius * sinPhi * Math.cos(cfg.theta)
  );
  controls.target.set(0, centerY, 0);
  controls.update();
  controls.enableDamping = prevDamping;
}

export function ThreeWireframeCanvas({
  src,
  alt,
  mode = "wireframe",
  autoRotate,
  interactionMode,
  cameraPreset,
  presetVersion,
  fov,
  showGrid = false,
  lightingPreset = "studio",
  exposure = 1.0,
  shadows = true,
  onLoad,
  onError,
}: ThreeWireframeCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const lightsRef = useRef<{
    hemi: THREE.HemisphereLight;
    key: THREE.DirectionalLight;
    fill: THREE.DirectionalLight;
    floorMat: THREE.ShadowMaterial;
    grid: THREE.GridHelper;
  } | null>(null);
  const meshesRef = useRef<{
    solids: THREE.Mesh[];
    wires: THREE.Mesh[];
    occluderMat: THREE.MeshStandardMaterial;
    clayMat: THREE.MeshStandardMaterial;
  } | null>(null);
  const framingRef = useRef<{ radius: number; centerY: number }>({
    radius: 2.35,
    centerY: 0.5,
  });

  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  const modeRef = useRef(mode);
  const autoRotateRef = useRef(autoRotate);
  const interactionModeRef = useRef(interactionMode);
  const cameraPresetRef = useRef(cameraPreset);
  const fovRef = useRef(fov);
  const showGridRef = useRef(showGrid);
  const lightingPresetRef = useRef(lightingPreset);
  const exposureRef = useRef(exposure);
  const shadowsRef = useRef(shadows);

  onLoadRef.current = onLoad;
  onErrorRef.current = onError;
  modeRef.current = mode;
  autoRotateRef.current = autoRotate;
  interactionModeRef.current = interactionMode;
  cameraPresetRef.current = cameraPreset;
  fovRef.current = fov;
  showGridRef.current = showGrid;
  lightingPresetRef.current = lightingPreset;
  exposureRef.current = exposure;
  shadowsRef.current = shadows;

  // Main WebGL lifecycle + GLB loading + thorough GPU disposal on src change/unmount
  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;

    const controller = new AbortController();
    let disposed = false;
    let rafId = 0;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      onErrorRef.current("WebGL is unavailable for 3D geometry inspection.");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(
      container.clientWidth || 640,
      container.clientHeight || 420
    );
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = exposureRef.current;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.setAttribute(
      "aria-label",
      `${alt} (${modeRef.current} mode)`
    );
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 420;
    const camera = new THREE.PerspectiveCamera(
      fovRef.current || DEFAULT_FOV_DEG,
      width / Math.max(height, 1),
      0.01,
      100
    );
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = Math.PI - 0.02;
    controls.autoRotate = autoRotateRef.current;
    controls.autoRotateSpeed = 1.6;
    controls.mouseButtons.LEFT =
      interactionModeRef.current === "pan"
        ? THREE.MOUSE.PAN
        : THREE.MOUSE.ROTATE;
    controls.touches.ONE =
      interactionModeRef.current === "pan"
        ? THREE.TOUCH.DOLLY_PAN
        : THREE.TOUCH.ROTATE;
    controlsRef.current = controls;

    // Studio lighting rig: hemisphere + warm key + subtle rim/fill for clay & wireframe clarity
    const lightCfg = getLightingPresetConfig(lightingPresetRef.current);
    const hemiLight = new THREE.HemisphereLight(
      0xf5f3f0,
      0x1d1d20,
      lightCfg.threeHemiIntensity * exposureRef.current
    );
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(
      0xfff3e6,
      lightCfg.threeKeyIntensity * exposureRef.current
    );
    keyLight.position.set(2.5, 4.4, 3.0);
    keyLight.castShadow = shadowsRef.current;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.radius = 4;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(
      0xdce4f0,
      lightCfg.threeFillIntensity * exposureRef.current
    );
    fillLight.position.set(-2.6, -1.4, -2.8);
    scene.add(fillLight);

    const floorGeo = new THREE.PlaneGeometry(12, 12);
    const floorMat = new THREE.ShadowMaterial({
      opacity: shadowsRef.current ? 0.34 : 0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(4.2, 16, 0xf79448, 0x2c2c30);
    grid.position.y = 0.002;
    grid.visible = showGridRef.current;
    const gridMats = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    gridMats.forEach((mat, idx) => {
      mat.transparent = true;
      mat.opacity = idx === 0 ? 0.48 : 0.42;
      mat.depthWrite = false;
    });
    scene.add(grid);

    lightsRef.current = {
      hemi: hemiLight,
      key: keyLight,
      fill: fillLight,
      floorMat,
      grid,
    };

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    const occluderMat = new THREE.MeshStandardMaterial({
      color: 0x17171a,
      roughness: 0.92,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    const clayMat = new THREE.MeshStandardMaterial({
      color: 0xc6c0b8,
      roughness: 0.76,
      metalness: 0.04,
    });

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xf79448,
      wireframe: true,
      transparent: true,
      opacity: 0.68,
    });

    const loader = new GLTFLoader();

    const loadGlb = async () => {
      try {
        const res = await fetch(src, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const buffer = await res.arrayBuffer();
        if (disposed || controller.signal.aborted) return;

        loader.parse(
          buffer,
          "",
          (gltf) => {
            if (disposed || controller.signal.aborted) {
              disposeObjectTree(gltf.scene);
              return;
            }

            const rawRoot = gltf.scene;
            const rawBox = new THREE.Box3().setFromObject(rawRoot);
            const rawSize = new THREE.Vector3();
            rawBox.getSize(rawSize);

            let totalVertices = 0;
            let totalTriangles = 0;
            const uniqueMaterials = new Set<THREE.Material>();
            let hasTextures = false;

            const solids: THREE.Mesh[] = [];
            const wireClones: THREE.Mesh[] = [];

            rawRoot.traverse((obj) => {
              if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
              const geom = obj.geometry;
              if (!geom.getAttribute("normal")) {
                geom.computeVertexNormals();
              }
              const posAttr = geom.getAttribute("position");
              if (posAttr) {
                totalVertices += posAttr.count;
                totalTriangles += geom.index
                  ? Math.floor(geom.index.count / 3)
                  : Math.floor(posAttr.count / 3);
              }

              const origMats = Array.isArray(obj.material)
                ? obj.material
                : [obj.material];
              for (const m of origMats) {
                if (!m) continue;
                uniqueMaterials.add(m);
                const std = m as THREE.MeshStandardMaterial;
                if (
                  std.map ||
                  std.normalMap ||
                  std.roughnessMap ||
                  std.emissiveMap
                ) {
                  hasTextures = true;
                }
              }

              obj.castShadow = true;
              obj.receiveShadow = modeRef.current === "geometry";
              for (const m of origMats) {
                if (!m) continue;
                for (const val of Object.values(m)) {
                  if (val instanceof THREE.Texture) val.dispose();
                }
                m.dispose();
              }

              const isGeometry = modeRef.current === "geometry";
              obj.material = isGeometry ? clayMat : occluderMat;
              solids.push(obj);

              const overlay = new THREE.Mesh(geom, wireMat);
              overlay.position.copy(obj.position);
              overlay.rotation.copy(obj.rotation);
              overlay.scale.copy(obj.scale);
              overlay.visible = !isGeometry;
              overlay.matrixAutoUpdate = obj.matrixAutoUpdate;
              if (!obj.matrixAutoUpdate) {
                overlay.matrix.copy(obj.matrix);
              }
              wireClones.push(overlay);
              if (obj.parent) {
                obj.parent.add(overlay);
              }
            });

            meshesRef.current = {
              solids,
              wires: wireClones,
              occluderMat,
              clayMat,
            };

            // Normalize model scale to ~1.48 units max dimension for balanced studio framing
            const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z, 1e-4);
            const scale = 1.48 / maxDim;
            rawRoot.scale.multiplyScalar(scale);

            const scaledBox = new THREE.Box3().setFromObject(rawRoot);
            const scaledCenter = new THREE.Vector3();
            const scaledSize = new THREE.Vector3();
            scaledBox.getCenter(scaledCenter);
            scaledBox.getSize(scaledSize);

            rawRoot.position.x -= scaledCenter.x;
            rawRoot.position.z -= scaledCenter.z;
            rawRoot.position.y -= scaledBox.min.y;

            modelGroup.add(rawRoot);

            const fitRadius = Math.max(scaledSize.length() * 1.24, 1.75);
            const centerY = scaledSize.y * 0.48;
            framingRef.current = { radius: fitRadius, centerY };
            controls.minDistance = fitRadius * 0.35;
            controls.maxDistance = fitRadius * 3.0;

            applyPresetToCamera(
              camera,
              controls,
              cameraPresetRef.current,
              fitRadius,
              centerY
            );

            onLoadRef.current({
              vertices: totalVertices,
              triangles: totalTriangles,
              dimensions: [rawSize.x, rawSize.y, rawSize.z],
              materialCount: uniqueMaterials.size,
              hasTextures,
            });
          },
          () => {
            if (!disposed) {
              onErrorRef.current(
                "Could not parse GLB geometry for 3D inspection."
              );
            }
          }
        );
      } catch (err) {
        if (!disposed && (err as Error).name !== "AbortError") {
          onErrorRef.current(
            "Could not load the 3D GLB file for geometry inspection."
          );
        }
      }
    };

    void loadGlb();

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || disposed) return;
      const w = Math.max(entry.contentRect.width, 1);
      const h = Math.max(entry.contentRect.height, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    const renderLoop = () => {
      if (disposed) return;
      rafId = window.requestAnimationFrame(renderLoop);
      controls.update();
      // Hide floor grid when inspecting from underneath so bottom geometry stays unobstructed
      if (lightsRef.current) {
        lightsRef.current.grid.visible =
          showGridRef.current && camera.position.y >= -0.05;
      }
      renderer.render(scene, camera);
    };
    renderLoop();

    return () => {
      disposed = true;
      controller.abort();
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.dispose();
      controlsRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      lightsRef.current = null;
      meshesRef.current = null;
      disposeObjectTree(scene);
      occluderMat.dispose();
      clayMat.dispose();
      wireMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [src, alt]);

  // Hot-swap between matte clay geometry and copper CAD wireframe without reloading the GLB
  useEffect(() => {
    const group = meshesRef.current;
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.domElement.setAttribute("aria-label", `${alt} (${mode} mode)`);
    }
    if (!group) return;
    const isGeometry = mode === "geometry";
    for (const solid of group.solids) {
      solid.material = isGeometry ? group.clayMat : group.occluderMat;
      solid.receiveShadow = isGeometry;
    }
    for (const wire of group.wires) {
      wire.visible = !isGeometry;
    }
  }, [mode, alt]);

  // Sync studio lighting, exposure, shadows, and ground grid dynamically
  useEffect(() => {
    const lights = lightsRef.current;
    const renderer = rendererRef.current;
    if (!lights || !renderer) return;
    const cfg = getLightingPresetConfig(lightingPreset);
    lights.hemi.intensity = cfg.threeHemiIntensity * exposure;
    lights.key.intensity = cfg.threeKeyIntensity * exposure;
    lights.fill.intensity = cfg.threeFillIntensity * exposure;
    lights.key.castShadow = shadows;
    lights.floorMat.opacity = shadows ? 0.34 : 0;
    lights.grid.visible =
      showGrid && (cameraRef.current?.position.y ?? 1) >= -0.05;
    renderer.toneMappingExposure = exposure;
  }, [lightingPreset, exposure, shadows, showGrid]);

  // Sync live interactive controls without reloading the GLB
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.mouseButtons.LEFT =
      interactionMode === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.touches.ONE =
      interactionMode === "pan"
        ? THREE.TOUCH.DOLLY_PAN
        : THREE.TOUCH.ROTATE;
  }, [interactionMode]);

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }, [fov]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    applyPresetToCamera(
      camera,
      controls,
      cameraPreset,
      framingRef.current.radius,
      framingRef.current.centerY
    );
  }, [cameraPreset, presetVersion]);

  return (
    <div
      ref={hostRef}
      data-testid="three-wireframe-canvas"
      data-mode={mode}
      className="h-full w-full cursor-grab active:cursor-grabbing"
    />
  );
}
