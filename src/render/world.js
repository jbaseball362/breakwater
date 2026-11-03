// The parts of the scene that never change between levels: sea, causeway, piers, islands.

import * as THREE from 'three';
import { WORLD } from '../content.js';
import { lambert, limb, merge } from './models.js';

export const PALETTES = {
  morning: {
    deep: 0x0d7a93, shallow: 0x1fa9b1, glint: 0xffffff, fog: 0xa9dfe3,
    sun: 0xfff1d6, sunI: 2.5, sky: 0xe2f5ff, ground: 0x6e7f86, hemiI: 1.35, rain: false,
  },
  evening: {
    deep: 0x20607f, shallow: 0x4a939f, glint: 0xffcf96, fog: 0xf0c29c,
    sun: 0xffc88a, sunI: 2.6, sky: 0xffdcc6, ground: 0x5d5163, hemiI: 1.25, rain: false,
  },
  night: {
    deep: 0x0a2240, shallow: 0x15416a, glint: 0xbfd8ff, fog: 0x18304c,
    sun: 0xaecaff, sunI: 1.5, sky: 0x57779f, ground: 0x10192a, hemiI: 1.25, rain: false,
  },
  redtide: {
    deep: 0x511622, shallow: 0x90303a, glint: 0xffc2a8, fog: 0xb46a58,
    sun: 0xffb590, sunI: 2.3, sky: 0xffcdb8, ground: 0x4a2a30, hemiI: 1.2, rain: false,
  },
  storm: {
    deep: 0x12404f, shallow: 0x2a636b, glint: 0xcfe6ee, fog: 0x7e929b,
    sun: 0xcfe0ee, sunI: 1.5, sky: 0xa6bac9, ground: 0x303b45, hemiI: 1.3, rain: true,
  },
};

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function asphaltTexture() {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#6d7072';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const v = 90 + Math.random() * 45;
      ctx.fillStyle = `rgba(${v},${v},${v + 2},.5)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.6, 1.6);
    }
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(40,42,46,${0.03 + Math.random() * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 30 + Math.random() * 70, 18 + Math.random() * 50, Math.random() * 3, 0, 7);
      ctx.fill();
    }
  });
}

function concreteTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#5b5752';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const v = 62 + Math.random() * 44;
      ctx.fillStyle = `rgba(${v},${v - 3},${v - 7},.45)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    ctx.strokeStyle = 'rgba(30,28,26,.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, s, s);
  });
}

function beltTexture() {
  const tex = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#23282b';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#3a4246';
    ctx.lineWidth = 10;
    for (const y of [32, 96]) {
      ctx.beginPath();
      ctx.moveTo(10, y + 16);
      ctx.lineTo(s / 2, y - 16);
      ctx.lineTo(s - 10, y + 16);
      ctx.stroke();
    }
  });
  return tex;
}

function uvByWorld(geo, scale) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * scale, pos.getZ(i) * scale);
  return geo;
}

function plane(x0, x1, z0, z1, y, material, scale = 0.125) {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  uvByWorld(geo, scale);
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color() },
      uShallow: { value: new THREE.Color() },
      uGlint: { value: new THREE.Color() },
      uFog: { value: new THREE.Color() },
      uFogNear: { value: 70 },
      uFogFar: { value: 170 },
      uChop: { value: 1 },
    },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      varying vec3 vW;
      uniform float uTime, uFogNear, uFogFar, uChop;
      uniform vec3 uDeep, uShallow, uGlint, uFog;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
      }
      // Distance to the causeway's outline, for the foam where water meets concrete.
      float toCauseway(vec2 p) {
        float road = max(abs(p.x) - 3.9, -p.y - 90.0);
        road = max(road, p.y - 22.0);
        float yard = max(abs(p.x) - 9.6, max(-2.0 - p.y, p.y - 22.0));
        float pier = max(abs(abs(p.x) - 7.0) - 2.4, max(-90.0 - p.y, p.y + 2.8));
        return min(min(road, yard), pier);
      }
      void main() {
        vec2 p = vW.xz;
        float t = uTime;
        float a = n(p * 0.09 + vec2(t * 0.06, t * 0.03));
        float b = n(p * 0.27 + vec2(-t * 0.13, t * 0.1));
        float c = n(p * 0.8 + vec2(t * 0.26, -t * 0.2));
        float w = a * 0.6 + b * 0.28 + c * 0.12;
        vec3 col = mix(uDeep, uShallow, smoothstep(0.26, 0.74, w));
        // Long soft swell lines, then a sparse scatter of sun glints on top.
        float swell = n(p * vec2(0.34, 1.5) + vec2(t * 0.16, t * 0.42));
        col += uGlint * smoothstep(0.58, 0.86, swell) * 0.07 * uChop;
        float g = n(p * 1.25 + t * 0.7) * n(p * 0.8 - t * 0.5);
        col += uGlint * smoothstep(0.46, 0.66, g) * 0.15;
        float edge = toCauseway(p);
        float foam = smoothstep(1.5, 0.0, edge + (n(p * 2.2 + t * 0.5) - 0.5) * 1.4);
        col = mix(col, vec3(0.88, 0.97, 0.97), foam * 0.55);
        float dist = length(cameraPosition - vW);
        col = mix(col, uFog, smoothstep(uFogNear, uFogFar, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function island(x, z, r, seed) {
  const rand = (i) => {
    const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const parts = [];
  const sand = new THREE.CylinderGeometry(r * 0.92, r, 1.6, 12);
  sand.scale(1.25, 1, 0.9);
  parts.push({ geo: sand, color: 0xe4cf9a });
  const green = new THREE.IcosahedronGeometry(r * 0.62, 1);
  green.scale(1.3, 0.28, 0.9);
  green.translate(0, 0.9, 0);
  parts.push({ geo: green, color: 0x5d9a54 });
  const palms = Math.max(3, Math.round(r * 0.6));
  for (let i = 0; i < palms; i++) {
    const a = rand(i) * Math.PI * 2;
    const d = r * (0.2 + rand(i + 40) * 0.5);
    const px = Math.cos(a) * d * 1.2;
    const pz = Math.sin(a) * d * 0.8;
    const lean = (rand(i + 80) - 0.5) * 1.4;
    const height = 3.5 + rand(i + 120) * 2.5;
    parts.push({ geo: limb([px, 0.8, pz], [px + lean, 0.8 + height, pz], 0.24, 0.13, 5), color: 0x8b6f4c });
    for (let k = 0; k < 6; k++) {
      const leafA = (k / 6) * Math.PI * 2;
      const leaf = new THREE.ConeGeometry(0.5, 2.4, 4);
      leaf.rotateX(Math.PI / 2 + 0.45);
      leaf.translate(0, -0.45, 1.25);
      leaf.rotateY(leafA);
      leaf.translate(px + lean, 0.8 + height, pz);
      parts.push({ geo: leaf, color: k % 2 ? 0x3f8a4b : 0x4f9d55 });
    }
  }
  const mesh = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.position.set(x, -4.1, z);
  return mesh;
}

function railRun(group, posts, x0, z0, x1, z1, material) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  for (const y of [0.52, 0.86]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, len), material);
    rail.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    rail.rotation.y = yaw;
    rail.castShadow = true;
    group.add(rail);
  }
  const count = Math.floor(len / 2.2);
  for (let i = 0; i <= count; i++) posts.push([x0 + (x1 - x0) * i / count, z0 + (z1 - z0) * i / count]);
}

export function buildWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const asphalt = asphaltTexture();
  const concrete = concreteTexture();
  const deckMat = lambert(0xffffff, { map: asphalt });
  const concreteMat = lambert(0xffffff, { map: concrete });
  const sideMat = lambert(0x55524e);
  const railMat = lambert(0xb4bcc0);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), waterMaterial());
  water.position.y = -4.2;
  group.add(water);

  const FAR = -96;
  // Decks: the wide yard and the narrow run the crabs come down.
  group.add(plane(-9.6, 9.6, -2, 24, 0, deckMat));
  group.add(plane(-WORLD.roadHalf, WORLD.roadHalf, FAR, -2, 0, deckMat));

  const box = (x0, x1, y0, y1, z0, z1, material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  box(-9.6, 9.6, -5.5, -0.02, -2, 24, sideMat);
  box(-WORLD.roadHalf, WORLD.roadHalf, -5.5, -0.02, FAR, -2, sideMat);

  // Concrete piers that carry the belts, with a gap of open water beside the road.
  const beltTex = beltTexture();
  const belts = [];
  const pierTop = 1.4;
  const beltEnd = WORLD.beltEndZ;
  const beltStart = beltEnd - WORLD.beltLen - 40;
  for (const side of [-1, 1]) {
    const x = side * WORLD.beltX;
    box(x - 2.4, x + 2.4, -5.5, pierTop, FAR, -2.8, sideMat);
    group.add(plane(x - 2.4, x + 2.4, FAR, -2.8, pierTop + 0.01, concreteMat, 0.25));

    const tex = beltTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, (beltEnd - beltStart) / 2.6);
    const belt = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, beltEnd - beltStart).rotateX(-Math.PI / 2),
      lambert(0xffffff, { map: tex }),
    );
    belt.position.set(x, pierTop + 0.05, (beltEnd + beltStart) / 2);
    belt.receiveShadow = true;
    group.add(belt);
    belts.push({ side, tex });

    for (const edge of [-1, 1]) box(x + edge * 1.45, x + edge * 1.6, pierTop, pierTop + 0.3, FAR, beltEnd + 0.1, railMat);
    // The hopper that swallows each plate.
    box(x - 1.6, x + 1.6, pierTop, pierTop + 0.6, beltEnd + 0.1, -2.9, lambert(0x3a4246));
    box(x - 1.6, x + 1.6, pierTop + 0.6, pierTop + 0.72, beltEnd + 0.1, -2.9, lambert(0xf6c21c));
  }

  // Guard rails.
  const posts = [];
  railRun(group, posts, -9.6, -2, -9.6, 24, railMat);
  railRun(group, posts, 9.6, -2, 9.6, 24, railMat);
  railRun(group, posts, -WORLD.roadHalf, FAR, -WORLD.roadHalf, -2, railMat);
  railRun(group, posts, WORLD.roadHalf, FAR, WORLD.roadHalf, -2, railMat);
  railRun(group, posts, -9.6, -2, -WORLD.roadHalf, -2, railMat);
  railRun(group, posts, WORLD.roadHalf, -2, 9.6, -2, railMat);
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1, 0.16), lambert(0x8d979b), posts.length);
  const m = new THREE.Matrix4();
  posts.forEach(([x, z], i) => postMesh.setMatrixAt(i, m.makeTranslation(x, 0.5, z)));
  postMesh.castShadow = true;
  group.add(postMesh);

  // The pump house: the thing you are protecting, across the south end of the yard.
  const pumpWall = lambert(0x8f9a9e);
  const gateFlash = lambert(0xd9262c, { emissive: 0x000000 });
  box(-9.6, 9.6, 0, 1.2, 17.2, 24, pumpWall);
  box(-9.6, 9.6, 1.2, 1.36, 17.2, 17.9, gateFlash);
  for (const x of [-6.6, 6.6]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 2.4, 14), lambert(0x0f7c8e));
    tank.position.set(x, 2.4, 20.6);
    tank.castShadow = true;
    group.add(tank);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7, 1.8, 3.6), lambert(0xc9d0d2));
  roof.position.set(0, 2.1, 20.6);
  roof.castShadow = true;
  group.add(roof);

  // Far-off islands and near buoys, so the sea has some scale.
  [
    [-30, -62, 10, 1], [34, -74, 14, 2], [-74, -28, 16, 3],
    [78, -18, 18, 4], [-42, -112, 18, 5], [66, -116, 20, 6],
  ].forEach(([x, z, r, seed]) => group.add(island(x, z, r, seed)));

  const buoys = [[-13.5, -8], [14.5, 3], [-16, 12], [17, -22], [-20, -32]].map(([x, z], i) => {
    const buoy = new THREE.Group();
    const parts = [
      { geo: new THREE.CylinderGeometry(0.55, 0.8, 0.9, 8), color: i % 2 ? 0xd9262c : 0xf6c21c },
      { geo: new THREE.CylinderGeometry(0.1, 0.32, 1.5, 6).translate(0, 1.1, 0), color: 0xf2f7f5 },
      { geo: new THREE.SphereGeometry(0.2, 6, 4).translate(0, 1.95, 0), color: i % 2 ? 0xd9262c : 0xf6c21c },
    ];
    buoy.add(new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true })));
    buoy.position.set(x, -3.9, z);
    group.add(buoy);
    return { mesh: buoy, phase: i * 1.7 };
  });

  return { group, water, belts, buoys, gateFlash, pierTop };
}

export function applyPalette(world, scene, lights, name) {
  const p = PALETTES[name];
  const u = world.water.material.uniforms;
  u.uDeep.value.set(p.deep);
  u.uShallow.value.set(p.shallow);
  u.uGlint.value.set(p.glint);
  u.uFog.value.set(p.fog);
  u.uChop.value = p.rain ? 2 : 1;
  scene.fog.color.set(p.fog);
  scene.background.set(p.fog);
  lights.sun.color.set(p.sun);
  lights.sun.intensity = p.sunI;
  lights.hemi.color.set(p.sky);
  lights.hemi.groundColor.set(p.ground);
  lights.hemi.intensity = p.hemiI;
  return p;
}
