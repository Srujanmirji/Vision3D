import type { Material, Object3D, Texture } from "three";

export const USDZ_MIME = "model/vnd.usdz+zip";

/** Free GPU-side resources held by a parsed scene. */
function disposeScene(root: Object3D): void {
  root.traverse((node) => {
    const mesh = node as Object3D & { geometry?: { dispose(): void }; material?: Material | Material[] };
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if ((value as Texture | null)?.isTexture) (value as Texture).dispose();
      }
      material.dispose();
    }
  });
}

/**
 * Convert a GLB to USDZ in the browser with three.js's USDZExporter —
 * the same converter Model Viewer uses when it opens iPhone Quick Look.
 */
export async function glbToUsdz(glb: Blob): Promise<Blob> {
  const [{ GLTFLoader }, { USDZExporter }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/exporters/USDZExporter.js"),
  ]);
  const gltf = await new GLTFLoader().parseAsync(await glb.arrayBuffer(), "");
  try {
    gltf.scene.updateWorldMatrix(false, true);
    const bytes = await new USDZExporter().parseAsync(gltf.scene, {
      quickLookCompatible: true,
      maxTextureSize: 2048,
    });
    return new Blob([bytes], { type: USDZ_MIME });
  } finally {
    disposeScene(gltf.scene);
  }
}
