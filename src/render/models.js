// All the game's geometry is built here from primitives, so there are no art assets to license.

import * as THREE from 'three';

export const lambert = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra });

const UP = new THREE.Vector3(0, 1, 0);

// A tapered cylinder running from point a to point b.
export function limb(a, b, r0, r1 = r0, sides = 6) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const geo = new THREE.CylinderGeometry(r1, r0, from.distanceTo(to), sides, 1);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize()));
  const mid = from.add(to).multiplyScalar(0.5);
  geo.translate(mid.x, mid.y, mid.z);
  return geo;
}

// Merges parts into one faceted geometry with per-part colors.
// leg drives the crab walk in the vertex shader. tint 0 keeps a part's own color on tinted crabs.
export function merge(parts) {
  const pos = [];
  const nor = [];
  const col = [];
  const leg = [];
  const tint = [];
  const c = new THREE.Color();
  for (const part of parts) {
    const geo = part.geo.index ? part.geo.toNonIndexed() : part.geo;
    geo.computeVertexNormals();
    c.set(part.color ?? 0xffffff);
    const ap = geo.attributes.position;
    const an = geo.attributes.normal;
    for (let i = 0; i < ap.count; i++) {
      pos.push(ap.getX(i), ap.getY(i), ap.getZ(i));
      nor.push(an.getX(i), an.getY(i), an.getZ(i));
      col.push(c.r, c.g, c.b);
      leg.push(part.leg ?? 0);
      tint.push(part.tint ?? 1);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('aLeg', new THREE.Float32BufferAttribute(leg, 1));
  out.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1));
  return out;
}

function blob(r, sx, sy, sz, x, y, z, detail = 0) {
  const geo = new THREE.IcosahedronGeometry(r, detail);
  geo.scale(sx, sy, sz);
  geo.translate(x, y, z);
  return geo;
}

// Crabs face +z, which is toward the camera as they march south.
export function crabGeometry({ detail = 0, kneed = false, shell = false, spikes = false, tendrils = false, horns = false, antenna = false, claw = 1 } = {}) {
  const parts = [{ geo: blob(0.5, 1.12, 0.64, 0.88, 0, 0.42, 0, detail) }];

  if (shell) {
    parts.push({ geo: blob(0.5, 0.95, 0.95, 1.05, 0, 0.82, -0.12, 1), color: 0xcfc4ad, tint: 0 });
    parts.push({ geo: blob(0.26, 1, 1, 1, 0, 1.24, -0.2, 0), color: 0x9f9078, tint: 0 });
  }
  if (tendrils) {
    // Anemone fronds on its back, so a medic stands out in a crowd.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.sin(a) * 0.26;
      const z = Math.cos(a) * 0.2 - 0.08;
      parts.push({ geo: limb([x, 0.66, z], [x * 1.7, 1.26, z * 1.7], 0.075, 0.03, 4), color: 0xc8fff0, tint: 0 });
    }
  }
  if (horns) {
    for (const side of [-1, 1]) {
      parts.push({ geo: limb([side * 0.3, 0.62, 0.3], [side * 0.62, 0.98, 0.62], 0.13, 0.02, 5), color: 0xe8dcc0, tint: 0 });
    }
  }
  if (antenna) {
    parts.push({ geo: limb([0, 0.62, -0.1], [0, 1.3, -0.16], 0.045, 0.025, 4), color: 0x2f3b42, tint: 0 });
    parts.push({ geo: blob(0.13, 1, 1, 1, 0, 1.36, -0.16), color: 0xff4d4d, tint: 0 });
  }
  if (spikes) {
    for (let i = -2; i <= 2; i++) {
      parts.push({ geo: limb([i * 0.2, 0.68, -0.1], [i * 0.27, 1.04, -0.16], 0.09, 0.01, 4), color: 0xffd9a8, tint: 0 });
    }
  }

  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = -0.26 + i * 0.25;
      const leg = 1 + ((i + (side > 0 ? 1 : 0)) % 2);
      if (kneed) {
        parts.push({ geo: limb([side * 0.42, 0.4, z], [side * 0.76, 0.56, z * 1.2], 0.06, 0.05, 4), leg });
        parts.push({ geo: limb([side * 0.76, 0.56, z * 1.2], [side * 1, 0.02, z * 1.4], 0.05, 0.02, 4), leg });
      } else {
        parts.push({ geo: limb([side * 0.4, 0.4, z], [side * 0.96, 0.02, z * 1.35], 0.06, 0.03, 3), leg });
      }
    }
    // Arm and pincer. Claws are the brightest part so the horde reads from far away.
    parts.push({ geo: limb([side * 0.38, 0.42, 0.28], [side * 0.62, 0.62, 0.56], 0.07, 0.06, 4), leg: -1 });
    parts.push({ geo: blob(0.22 * claw, 0.8, 0.7, 1.25, side * 0.66, 0.68, 0.72), leg: -1, color: 0xff8d84 });
    parts.push({ geo: blob(0.095, 1, 1, 1, side * 0.16, 0.74, 0.34), color: 0xffffff, tint: 0 });
    parts.push({ geo: blob(0.05, 1, 1, 1, side * 0.16, 0.77, 0.42), color: 0x14181b, tint: 0 });
  }
  return merge(parts);
}

// Adds the walk cycle and per-part tinting to a crab material.
export function crabMaterial(timeUniform) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = `attribute float aLeg;\nattribute float aTint;\nuniform float uTime;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = float(gl_InstanceID) * 1.37;
        if (aLeg > 0.5) {
          float s = sin(uTime * 13.0 + ph + aLeg * 3.14159);
          transformed.y += max(0.0, s) * 0.16 * step(0.05, position.y);
          transformed.z += s * 0.08;
        } else if (aLeg < -0.5) {
          transformed.y += sin(uTime * 3.5 + ph) * 0.07;
        }`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        vColor = mix(color.rgb, vColor, aTint);`);
  };
  return material;
}

export function buildHero() {
  const root = new THREE.Group();
  const coat = lambert(0xf6c21c);
  const trim = lambert(0xd99a0b);
  const boot = lambert(0x28343a);
  const skin = lambert(0xe6ae8a);
  const tankMat = lambert(0x0f7c8e);
  const steel = lambert(0xb5bec2);

  const add = (parent, geo, material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  const body = new THREE.Group();
  root.add(body);
  add(body, new THREE.CylinderGeometry(0.34, 0.56, 1.05, 8), coat, 0, 1.08, 0);
  add(body, new THREE.CylinderGeometry(0.57, 0.58, 0.08, 8), trim, 0, 0.58, 0);
  add(body, new THREE.SphereGeometry(0.33, 10, 8), skin, 0, 1.86, 0);
  // A sou'wester rain hat with its long brim at the back.
  const hat = new THREE.Group();
  hat.position.set(0, 2.02, -0.05);
  add(hat, new THREE.SphereGeometry(0.36, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), coat);
  const brim = add(hat, new THREE.CylinderGeometry(0.58, 0.58, 0.05, 12), trim, 0, 0.02, -0.08);
  brim.scale.z = 1.15;
  body.add(hat);
  add(body, new THREE.BoxGeometry(0.46, 0.06, 0.05), boot, 0, 1.33, 0.33).rotation.x = 0.2;

  const pack = add(body, new THREE.CylinderGeometry(0.24, 0.24, 0.8, 8), tankMat, 0, 1.15, -0.44);
  pack.rotation.x = 0.08;
  add(body, new THREE.SphereGeometry(0.24, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 1.55, -0.44);

  const legs = [-1, 1].map((side) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.22, 0.62, 0);
    add(leg, new THREE.CylinderGeometry(0.16, 0.14, 0.42, 6), coat, 0, -0.16, 0);
    add(leg, new THREE.BoxGeometry(0.26, 0.26, 0.42), boot, 0, -0.48, 0.05);
    root.add(leg);
    return leg;
  });

  // The blaster turns on its own so the hero can run one way and shoot another.
  const gun = new THREE.Group();
  gun.position.set(0, 1.28, 0);
  add(gun, limb([0.34, 0.1, 0], [0.3, -0.04, 0.44], 0.1, 0.09, 6), coat);
  add(gun, limb([-0.34, 0.1, 0], [0.16, -0.05, 0.5], 0.1, 0.09, 6), coat);
  add(gun, new THREE.BoxGeometry(0.2, 0.22, 0.56), tankMat, 0.22, -0.02, 0.62);
  add(gun, new THREE.CylinderGeometry(0.075, 0.1, 0.56, 8).rotateX(Math.PI / 2), steel, 0.22, 0, 1.12);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.22, 0, 1.42);
  gun.add(muzzle);
  root.add(gun);

  root.userData = { body, legs, gun, muzzle };
  return root;
}

function towerBase(group, accent, level) {
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.12, 0.36, 8), lambert(0x8a9296));
  plinth.position.y = 0.18;
  plinth.castShadow = plinth.receiveShadow = true;
  group.add(plinth);
  // Each level adds a painted band, so you can read upgrades at a glance.
  for (let i = 0; i < level; i++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.96 - i * 0.02, 1, 0.09, 8), lambert(accent));
    band.position.y = 0.4 + i * 0.11;
    band.castShadow = true;
    group.add(band);
  }
}

// Returns a group whose userData has `head` (turns to aim) and `muzzle`.
export function buildTower(type, level, accent) {
  const group = new THREE.Group();
  const head = new THREE.Group();
  const muzzle = new THREE.Object3D();
  const body = lambert(accent);
  const dark = lambert(0x2f3b42);
  const steel = lambert(0xb9c2c6);
  const lift = 0.36 + level * 0.11;

  const put = (parent, geo, material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  towerBase(group, accent, level);
  head.position.y = lift;
  group.add(head);

  if (type === 'spitter') {
    put(head, new THREE.CylinderGeometry(0.46, 0.6, 0.7, 8), dark, 0, 0.35, 0);
    put(head, new THREE.SphereGeometry(0.5, 10, 8), body, 0, 0.86, 0);
    const offsets = level >= 3 ? [-0.24, 0, 0.24] : level === 2 ? [-0.16, 0.16] : [0];
    for (const x of offsets) put(head, new THREE.CylinderGeometry(0.09, 0.12, 1.15, 8).rotateX(Math.PI / 2), steel, x, 0.86, 0.72);
    muzzle.position.set(0, 0.86, 1.3);
  } else if (type === 'mortar') {
    put(head, new THREE.CylinderGeometry(0.72, 0.82, 0.5, 10), dark, 0, 0.25, 0);
    const tube = put(head, new THREE.CylinderGeometry(0.34 + level * 0.04, 0.42 + level * 0.04, 1.3, 10), body, 0, 0.98, 0.26);
    tube.rotation.x = 0.55;
    put(head, new THREE.TorusGeometry(0.38 + level * 0.04, 0.07, 6, 12).rotateX(Math.PI / 2 + 0.55), steel, 0, 1.54, 0.6);
    muzzle.position.set(0, 1.6, 0.62);
  } else if (type === 'foam') {
    put(head, new THREE.CylinderGeometry(0.56, 0.62, 0.9, 10), body, 0, 0.45, 0);
    put(head, new THREE.SphereGeometry(0.56, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0xf2f7f5), 0, 0.9, 0);
    put(head, new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6), steel, 0, 1.56, 0);
    const spin = new THREE.Group();
    spin.position.y = 1.82;
    head.add(spin);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      put(spin, limb([0, 0, 0], [Math.sin(a) * 0.55, 0.08, Math.cos(a) * 0.55], 0.06, 0.05, 5), steel);
    }
    head.userData.spin = spin;
    muzzle.position.set(0, 1.82, 0);
  } else if (type === 'hose') {
    put(head, new THREE.CylinderGeometry(0.55, 0.7, 0.42, 8), dark, 0, 0.21, 0);
    const reel = put(head, new THREE.CylinderGeometry(0.62, 0.62, 0.5, 14).rotateZ(Math.PI / 2), body, 0, 0.98, -0.1);
    reel.scale.setScalar(0.9 + level * 0.06);
    put(head, new THREE.CylinderGeometry(0.11, 0.2, 1.4, 10).rotateX(Math.PI / 2), steel, 0, 1.08, 0.95);
    put(head, new THREE.TorusGeometry(0.2, 0.06, 6, 12), lambert(0xf6c21c), 0, 1.08, 0.45);
    muzzle.position.set(0, 1.08, 1.68);
  } else if (type === 'harpoon') {
    for (const a of [0.5, 2.6, 4.7]) {
      put(head, limb([0, 0.95, 0], [Math.sin(a) * 0.72, 0, Math.cos(a) * 0.72], 0.08, 0.1, 5), dark);
    }
    put(head, new THREE.BoxGeometry(0.38, 0.32, 1.5), body, 0, 1.08, 0.1);
    put(head, new THREE.BoxGeometry(1.5, 0.12, 0.14), lambert(0xf6c21c), 0, 1.14, 0.3);
    put(head, new THREE.CylinderGeometry(0.03, 0.06, 2.3, 6).rotateX(Math.PI / 2), steel, 0, 1.3, 0.55);
    put(head, new THREE.ConeGeometry(0.13, 0.36, 6).rotateX(Math.PI / 2), lambert(0xf2f7f5), 0, 1.3, 1.82);
    muzzle.position.set(0, 1.3, 1.9);
  } else if (type === 'eel') {
    put(head, new THREE.CylinderGeometry(0.42, 0.66, 0.5, 8), dark, 0, 0.25, 0);
    put(head, new THREE.CylinderGeometry(0.15, 0.15, 1.6, 8), steel, 0, 1.2, 0);
    for (let i = 0; i < 2 + level; i++) {
      put(head, new THREE.TorusGeometry(0.46 - i * 0.05, 0.075, 6, 14).rotateX(Math.PI / 2), body, 0, 0.72 + i * 0.3, 0);
    }
    put(head, new THREE.SphereGeometry(0.2 + level * 0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xcfeeff }), 0, 2.1, 0);
    muzzle.position.set(0, 2.1, 0);
  } else if (type === 'net') {
    put(head, new THREE.CylinderGeometry(0.62, 0.76, 0.46, 10), dark, 0, 0.23, 0);
    const barrel = put(head, new THREE.CylinderGeometry(0.42 + level * 0.04, 0.28, 1.2, 10), body, 0, 0.95, 0.32);
    barrel.rotation.x = 1.05;
    put(head, new THREE.TorusGeometry(0.42 + level * 0.04, 0.05, 6, 14).rotateX(Math.PI / 2 + 1.05), steel, 0, 1.25, 0.82);
    muzzle.position.set(0, 1.25, 0.9);
  } else if (type === 'mast') {
    const height = 2.1 + level * 0.3;
    put(head, new THREE.BoxGeometry(0.8, 0.3, 0.8), dark, 0, 0.15, 0);
    put(head, new THREE.CylinderGeometry(0.07, 0.16, height, 6), steel, 0, 0.3 + height / 2, 0);
    for (let i = 1; i <= level; i++) put(head, new THREE.BoxGeometry(0.7, 0.06, 0.06), body, 0, 0.5 + i * 0.5, 0);
    const spin = new THREE.Group();
    spin.position.y = 0.3 + height;
    head.add(spin);
    put(spin, new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(1.2), body, 0, 0, 0.1);
    head.userData.spin = spin;
    muzzle.position.set(0, 0.3 + height, 0);
  } else if (type === 'pump') {
    put(head, new THREE.BoxGeometry(1.1, 0.72, 1.1), body, 0, 0.36, 0);
    put(head, new THREE.CylinderGeometry(0.16, 0.16, 0.9, 8), steel, 0, 1.05, 0);
    const piston = put(head, new THREE.CylinderGeometry(0.3 + level * 0.03, 0.3 + level * 0.03, 0.26, 10), dark, 0, 1.02, 0);
    head.userData.piston = piston;
    put(head, limb([0.5, 0.4, 0.2], [0.96, 0.14, 0.62], 0.1, 0.1, 6), steel);
    muzzle.position.set(0, 1.4, 0);
  } else {
    // Blaster bench.
    put(head, new THREE.BoxGeometry(1.5, 0.12, 0.96), lambert(0x8a5a2b), 0, 0.72, 0);
    for (const [x, z] of [[-0.62, -0.36], [0.62, -0.36], [-0.62, 0.36], [0.62, 0.36]]) {
      put(head, new THREE.BoxGeometry(0.1, 0.7, 0.1), dark, x, 0.35, z);
    }
    put(head, new THREE.BoxGeometry(0.34, 0.26, 0.5), body, -0.2, 0.92, 0);
    put(head, new THREE.CylinderGeometry(0.07, 0.09, 0.6, 8).rotateZ(Math.PI / 2), steel, 0.28, 0.94, 0.04);
    muzzle.position.set(0, 1, 0);
  }
  head.add(muzzle);
  group.userData = { head, muzzle };
  return group;
}

export function buildHydrant() {
  const group = new THREE.Group();
  const red = lambert(0xd9262c);
  const darkRed = lambert(0xa81a20);
  const yellow = lambert(0xf6c21c);
  const steel = lambert(0xb9c2c6);
  const put = (geo, material, x = 0, y = 0, z = 0, parent = group) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  put(new THREE.CylinderGeometry(1.05, 1.15, 0.26, 16), darkRed, 0, 0.13, 0);
  put(new THREE.CylinderGeometry(0.46, 0.56, 1.05, 12), red, 0, 0.75, 0);
  put(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 12), darkRed, 0, 1.28, 0);
  put(new THREE.SphereGeometry(0.48, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 1.32, 0);
  for (const side of [-1, 1]) {
    put(new THREE.CylinderGeometry(0.2, 0.26, 0.34, 8).rotateZ(side * Math.PI / 2), darkRed, side * 0.62, 0.86, 0);
  }
  // The valve wheel spins while the tank drains.
  const wheel = new THREE.Group();
  wheel.position.set(0, 0.92, 0.7);
  put(new THREE.TorusGeometry(0.42, 0.07, 8, 18), yellow, 0, 0, 0, wheel);
  put(new THREE.BoxGeometry(0.8, 0.09, 0.07), yellow, 0, 0, 0, wheel);
  put(new THREE.BoxGeometry(0.09, 0.8, 0.07), yellow, 0, 0, 0, wheel);
  put(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 8).rotateX(Math.PI / 2), steel, 0, 0, 0.02, wheel);
  group.add(wheel);
  put(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8).rotateX(Math.PI / 2), steel, 0, 0.92, 0.52);
  group.userData = { wheel };
  return group;
}

export function ringMaterial(color, thickness = 0.1) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uProgress: { value: 1 },
      uBack: { value: 0.28 },
      uFill: { value: 0.1 },
      uThick: { value: thickness },
      uOpacity: { value: 1 },
    },
    vertexShader: 'varying vec2 vP; void main(){ vP = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec2 vP;
      uniform vec3 uColor;
      uniform float uProgress, uBack, uFill, uThick, uOpacity;
      void main() {
        float r = length(vP);
        float a = atan(vP.x, vP.y) / 6.28318 + 0.5;
        float e = fwidth(r);
        float inner = smoothstep(1.0 - uThick - e, 1.0 - uThick, r);
        float outer = 1.0 - smoothstep(1.0 - e, 1.0, r);
        float lit = mix(uBack, 1.0, step(a, uProgress));
        float alpha = inner * outer * lit + (1.0 - inner) * uFill;
        gl_FragColor = vec4(uColor, alpha * uOpacity);
        #include <colorspace_fragment>
      }`,
  });
}

export function ringMesh(radius, color, thickness) {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, ringMaterial(color, thickness));
  mesh.position.y = 0.04;
  mesh.renderOrder = 2;
  return mesh;
}
