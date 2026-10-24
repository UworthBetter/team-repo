import * as THREE from 'three';
import type { Kitchen, Prop } from '@contracts/schemas';
import type { Vec3 } from '@contracts/types';
import type { PropHandle, World } from './api';
import { fitModel, type Assets } from './assets';
import type { Bus } from './bus';

export const COUNTER_TOP = 0.9;
const TEAL = 0x2a8c9a;
const RED = 0xd9483b;

export interface WorldInternal extends World {
  readonly kitchen: Kitchen | null;
  build(k: Kitchen): void;
  resetAll(): void;
  pickables(): THREE.Object3D[];
  handleOf(obj: THREE.Object3D): PropHandle | undefined;
  snaps(): Kitchen['snaps'];
  highlightSnap(id: string | null): void;
  groundAt(x: number, z: number): number;
}

export function createWorld(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  bus: Bus,
  assets: Assets,
): WorldInternal {
  const base = new THREE.Group();
  base.name = 'core-kitchen';
  const root = new THREE.Group();
  root.name = 'module-root';
  scene.add(base, root);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(2, 5, 3);
  scene.add(hemi, sun);

  let kitchen: Kitchen | null = null;
  const props = new Map<string, PropHandle>();
  const meshToProp = new Map<THREE.Object3D, PropHandle>();
  const pickList: THREE.Object3D[] = [];
  const snapMeshes = new Map<string, THREE.Mesh>();
  const installed = new Set<string>();
  const slotGroup = new THREE.Group();

  const toon = (color: string | number) => new THREE.MeshToonMaterial({ color });

  function disposeTree(group: THREE.Object3D) {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      }
    });
    group.clear();
  }

  function geometryFor(p: Prop): THREE.BufferGeometry {
    if (p.shape === 'sphere') {
      const g = new THREE.SphereGeometry(0.5, 24, 16);
      g.scale(p.size[0], p.size[1], p.size[2]);
      return g;
    }
    if (p.shape === 'cylinder') {
      const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 28);
      g.scale(p.size[0], p.size[1], p.size[2]);
      return g;
    }
    return new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
  }

  function makeProp(p: Prop): PropHandle {
    const group = new THREE.Group();
    group.name = `prop:${p.id}`;
    const mesh = new THREE.Mesh(geometryFor(p), toon(p.color));
    mesh.position.y = p.size[1] / 2;
    group.add(mesh);
    group.position.set(p.pos[0], p.pos[1], p.pos[2]);
    const h: PropHandle = { id: p.id, kind: p.kind, object: group, size: p.size, home: group.position.clone(), grabbable: p.grabbable };
    meshToProp.set(mesh, h);
    pickList.push(mesh);
    if (p.model && assets.hasModel(p.model)) {
      void assets.loadModel(p.model).then((model) => {
        if (!model || props.get(p.id) !== h) return;
        fitModel(model, p.size);
        mesh.visible = false;
        group.add(model);
        model.traverse((o) => {
          meshToProp.set(o, h);
          if (o instanceof THREE.Mesh) pickList.push(o);
        });
      });
    }
    return h;
  }

  function buildSlots() {
    disposeTree(slotGroup);
    for (const s of kitchen?.slots ?? []) {
      const geo = new THREE.BoxGeometry(s.size[0], s.size[1], s.size[2]);
      let obj: THREE.Object3D;
      if (installed.has(s.itemId)) {
        obj = new THREE.Mesh(geo, toon('#D9A441'));
      } else {
        const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineDashedMaterial({ color: RED, dashSize: 0.06, gapSize: 0.04 }));
        line.computeLineDistances();
        geo.dispose();
        obj = line;
      }
      obj.position.set(s.pos[0], s.pos[1] + s.size[1] / 2, s.pos[2]);
      obj.name = `slot:${s.itemId}`;
      slotGroup.add(obj);
    }
  }

  bus.on('equipment:installed', ({ itemId }) => {
    installed.add(itemId);
    if (kitchen?.slots.some((s) => s.itemId === itemId)) buildSlots();
  });

  const world: WorldInternal = {
    get kitchenId() {
      return kitchen?.id ?? null;
    },
    get kitchen() {
      return kitchen;
    },
    root,
    counterTop: COUNTER_TOP,

    build(k) {
      disposeTree(base);
      disposeTree(root);
      props.clear();
      meshToProp.clear();
      pickList.length = 0;
      snapMeshes.clear();
      kitchen = k;

      scene.background = new THREE.Color(k.mood.background);
      // Ambience fog (A5): tint the air to match the region; cleared when a kitchen has none.
      scene.fog = k.ambience?.fog ? new THREE.Fog(new THREE.Color(k.ambience.fog), 3, 16) : null;
      hemi.color.set(k.mood.light);
      hemi.groundColor.set(k.mood.floor);
      sun.color.set(k.mood.light);
      sun.intensity = k.mood.lightIntensity;

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), toon(k.mood.floor));
      floor.rotation.x = -Math.PI / 2;
      base.add(floor);

      for (const c of k.counters) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(c.size[0], c.size[1], c.size[2]), toon(k.mood.counter));
        m.position.set(c.pos[0], c.pos[1] + c.size[1] / 2, c.pos[2]);
        base.add(m);
      }

      for (const s of k.snaps) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(s.radius * 0.72, s.radius, 40),
          new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(s.pos[0], s.pos[1] + 0.004, s.pos[2]);
        ring.renderOrder = 2;
        snapMeshes.set(s.id, ring);
        base.add(ring);
      }

      for (const p of k.props) {
        const h = makeProp(p);
        props.set(p.id, h);
        base.add(h.object);
      }

      base.add(slotGroup);
      buildSlots();
    },

    resetAll() {
      for (const id of props.keys()) world.resetProp(id);
    },

    prop: (id) => props.get(id),
    propsOfKind: (kind) => [...props.values()].filter((p) => p.kind === kind),
    resetProp(id) {
      const p = props.get(id);
      if (!p) return;
      p.object.position.copy(p.home);
      p.object.rotation.set(0, 0, 0);
      p.object.visible = true;
    },
    snapPos(id) {
      const s = kitchen?.snaps.find((x) => x.id === id);
      return s ? new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]) : undefined;
    },
    stationAnchor(id) {
      const s = kitchen?.stations.find((x) => x.id === id);
      return s ? new THREE.Vector3(s.anchor[0], s.anchor[1], s.anchor[2]) : undefined;
    },
    toScreen(p: THREE.Vector3 | Vec3) {
      const v = Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : p.clone();
      v.project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return { x: ((v.x + 1) / 2) * r.width + r.left, y: ((1 - v.y) / 2) * r.height + r.top, visible: v.z > -1 && v.z < 1 };
    },

    pickables: () => pickList.filter((o) => o.visible || o.parent?.visible),
    handleOf(obj) {
      let o: THREE.Object3D | null = obj;
      while (o) {
        const h = meshToProp.get(o);
        if (h) return h;
        o = o.parent;
      }
      return undefined;
    },
    snaps: () => kitchen?.snaps ?? [],
    highlightSnap(id) {
      for (const [sid, m] of snapMeshes) {
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.opacity = sid === id ? 0.95 : 0.45;
        m.scale.setScalar(sid === id ? 1.15 : 1);
      }
    },
    groundAt(x, z) {
      let h = 0;
      for (const c of kitchen?.counters ?? []) {
        if (Math.abs(x - c.pos[0]) <= c.size[0] / 2 && Math.abs(z - c.pos[2]) <= c.size[2] / 2) h = Math.max(h, c.pos[1] + c.size[1]);
      }
      return h;
    },
  };
  return world;
}
