import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Models are optional: a prop with `model` uses public/models/<model>.glb only if that
 * name is listed in public/models/manifest.json (npm run assets:manifest writes it).
 * Otherwise the greybox shape stays, and no 404s pile up in the console.
 */
export interface Assets {
  hasModel(name: string): boolean;
  loadModel(name: string): Promise<THREE.Object3D | null>;
}

const base = import.meta.env.BASE_URL ?? '/';

async function fetchList(url: string): Promise<Set<string>> {
  try {
    const r = await fetch(url);
    if (!r.ok) return new Set();
    const j = (await r.json()) as { files?: unknown };
    return new Set(Array.isArray(j.files) ? j.files.filter((f): f is string => typeof f === 'string') : []);
  } catch {
    return new Set();
  }
}

export async function loadAssets(): Promise<Assets> {
  const models = await fetchList(`${base}models/manifest.json`);
  const loader = new GLTFLoader();
  const cache = new Map<string, Promise<THREE.Object3D | null>>();
  return {
    hasModel: (name) => models.has(name),
    loadModel(name) {
      if (!models.has(name)) return Promise.resolve(null);
      let p = cache.get(name);
      if (!p) {
        p = loader
          .loadAsync(`${base}models/${name}.glb`)
          .then((g) => g.scene)
          .catch((err) => {
            console.warn(`[assets] could not load models/${name}.glb — keeping greybox`, err);
            return null;
          });
        cache.set(name, p);
      }
      return p.then((scene) => {
        if (!scene) return null;
        const instance = scene.clone(true);
        // Kitchen disposal owns each instance; never dispose the cached model's resources.
        instance.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          o.geometry = o.geometry.clone();
          o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        });
        return instance;
      });
    },
  };
}

/** Scale a loaded model to the prop's size and put its bottom at y = 0. */
export function fitModel(model: THREE.Object3D, size: [number, number, number]) {
  const box = new THREE.Box3().setFromObject(model);
  const dims = box.getSize(new THREE.Vector3());
  const s = Math.min(size[0] / (dims.x || 1), size[1] / (dims.y || 1), size[2] / (dims.z || 1));
  model.scale.setScalar(s);
  const after = new THREE.Box3().setFromObject(model);
  const center = after.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -after.min.y, -center.z);
}
