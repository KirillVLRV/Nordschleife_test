// ============================================================
// SECTION: Three.js Scene — Track, Car, Cameras, Signs, Landmarks
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TrackData, CORNER_SPECS } from './track';
import { SimData, interpSim } from './simulation';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  carGroup: THREE.Group;
  bodyMesh: THREE.Group;
  wheelMeshes: THREE.Group[];
  shadowDisc: THREE.Mesh;
  trackMesh: THREE.Mesh;
  curbMeshes: THREE.Mesh[];
  racingLineMesh: THREE.Line | null;
  signSprites: THREE.Sprite[];
  signLeaders: THREE.Line[];
  cornerSigns: THREE.Mesh[];
  brakeMarkers: THREE.Mesh[];
  cornerPlates: THREE.Mesh[];
  wheelLoadBars: THREE.Mesh[];
  cogSphere: THREE.Mesh;
  cogTrail: THREE.Line;
  gridHelper: THREE.GridHelper;
  carLight: THREE.PointLight;
  landmarks: THREE.Group;
  photoPlates: THREE.Sprite[];
  elevationTintMesh: THREE.Mesh | null;
  sim: SimData;
  track: TrackData;
  cameraMode: number;
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  freeFlyState: { yaw: number; pitch: number; keys: Set<string> };
  visibility: { wheelLoads: boolean; cogSphere: boolean; bodyRoll: boolean; racingLine: boolean; photoPlates: boolean; elevationTint: boolean; minimap: boolean };
  signDisplayMode: 'nearest' | 'all' | 'selected';
  selectedCorner: number;
}

// ============================================================
// Track ribbon
// ============================================================
export function buildTrackMesh(track: TrackData, elevationTint: boolean): { ribbon: THREE.Mesh; curbs: THREE.Mesh[]; tintRibbon: THREE.Mesh | null } {
  const N = track.numSamples;
  const hw = track.trackWidth / 2;

  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];

  // Elevation color ramp: deep blue (320m) → amber (617m)
  const minEle = track.bounds.min.y;
  const maxEle = track.bounds.max.y;
  const eleRange = maxEle - minEle || 1;

  for (let i = 0; i < N; i++) {
    const px = track.positions[i * 3];
    const py = track.positions[i * 3 + 1];
    const pz = track.positions[i * 3 + 2];
    const bx = track.binormals[i * 3];
    const bz = track.binormals[i * 3 + 2];

    vertices.push(px - bx * hw, py, pz - bz * hw);
    vertices.push(px + bx * hw, py, pz + bz * hw);

    const u = i / N;
    uvs.push(0, u * 50, 1, u * 50);

    if (elevationTint) {
      const t = (py - minEle) / eleRange;
      // Blue → cyan → green → yellow → amber
      const r = t < 0.5 ? 0.1 : 0.1 + (t - 0.5) * 1.6;
      const g = t < 0.3 ? 0.2 + t * 1.5 : t < 0.7 ? 0.65 : 0.65 - (t - 0.7) * 0.5;
      const b = t < 0.5 ? 0.6 - t * 0.8 : 0.2 - (t - 0.5) * 0.3;
      colors.push(r, g, b, r, g, b);
    }

    if (i < N - 1) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1);
      indices.push(base + 1, base + 2, base + 3);
    }
  }
  const lastBase = (N - 1) * 2;
  indices.push(lastBase, 0, lastBase + 1);
  indices.push(lastBase + 1, 0, 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (elevationTint) {
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  console.log(`[TrackMesh] BBox: (${bb.min.x.toFixed(0)},${bb.min.y.toFixed(0)},${bb.min.z.toFixed(0)}) → (${bb.max.x.toFixed(0)},${bb.max.y.toFixed(0)},${bb.max.z.toFixed(0)})`);

  const material = new THREE.MeshStandardMaterial({
    color: elevationTint ? 0xffffff : 0x3a3f46,
    vertexColors: elevationTint,
    roughness: 0.75,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const ribbon = new THREE.Mesh(geometry, material);

  // Edge glow
  const edgePtsL: number[] = [];
  const edgePtsR: number[] = [];
  for (let i = 0; i < N; i++) {
    const px = track.positions[i * 3];
    const py = track.positions[i * 3 + 1];
    const pz = track.positions[i * 3 + 2];
    const bx = track.binormals[i * 3];
    const bz = track.binormals[i * 3 + 2];
    edgePtsL.push(px - bx * hw, py + 0.05, pz - bz * hw);
    edgePtsR.push(px + bx * hw, py + 0.05, pz + bz * hw);
  }
  const edgeGeoL = new THREE.BufferGeometry();
  edgeGeoL.setAttribute('position', new THREE.Float32BufferAttribute(edgePtsL, 3));
  ribbon.add(new THREE.Line(edgeGeoL, new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.5 })));
  const edgeGeoR = new THREE.BufferGeometry();
  edgeGeoR.setAttribute('position', new THREE.Float32BufferAttribute(edgePtsR, 3));
  ribbon.add(new THREE.Line(edgeGeoR, new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.5 })));

  // Curbs
  const curbs: THREE.Mesh[] = [];
  const curbGeo = new THREE.BoxGeometry(1.5, 0.08, 2.5);
  const curbMatRed = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0x440000, emissiveIntensity: 0.3 });
  const curbMatWhite = new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0x222222, emissiveIntensity: 0.2 });

  for (let i = 0; i < N; i += 12) {
    const curv = track.curvatures[i];
    if (curv > 0.012) {
      const mat = (i % 24 < 12) ? curbMatRed : curbMatWhite;
      const curb = new THREE.Mesh(curbGeo, mat);
      const bx = track.binormals[i * 3];
      const bz = track.binormals[i * 3 + 2];
      curb.position.set(
        track.positions[i * 3] + bx * hw * 1.05,
        track.positions[i * 3 + 1] + 0.04,
        track.positions[i * 3 + 2] + bz * hw * 1.05
      );
      const tx = track.tangents[i * 3];
      const tz = track.tangents[i * 3 + 2];
      curb.rotation.y = Math.atan2(tx, tz);
      curbs.push(curb);
    }
  }

  // Elevation tint ribbon (separate mesh for toggle)
  let tintRibbon: THREE.Mesh | null = null;
  if (elevationTint) {
    // Already using vertex colors on main ribbon
    tintRibbon = null;
  }

  return { ribbon, curbs, tintRibbon };
}

// ============================================================
// Racing line visualization
// ============================================================
export function buildRacingLine(track: TrackData): THREE.Line {
  const pts: number[] = [];
  const N = track.numSamples;
  // Show as dashed (every other segment)
  for (let i = 0; i < N; i++) {
    if (i % 4 < 2) {
      pts.push(track.racingLinePositions[i * 3], track.racingLinePositions[i * 3 + 1] + 0.15, track.racingLinePositions[i * 3 + 2]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.5 });
  return new THREE.Line(geo, mat);
}

// ============================================================
// Sign sprites with distance fade
// ============================================================
export function buildSignSprites(track: TrackData): { sprites: THREE.Sprite[]; leaders: THREE.Line[] } {
  const sprites: THREE.Sprite[] = [];
  const leaders: THREE.Line[] = [];
  const hw = track.trackWidth / 2;

  track.cornerPositions.forEach((cp, idx) => {
    // Canvas texture
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1a5c1a';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 252, 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cp.name, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 1, depthTest: false });
    const sprite = new THREE.Sprite(mat);

    const bx = track.binormals[cp.index * 3];
    const bz = track.binormals[cp.index * 3 + 2];
    sprite.position.set(
      cp.pos.x + bx * (hw + 6),
      cp.pos.y + 4,
      cp.pos.z + bz * (hw + 6)
    );
    sprite.scale.set(8, 2, 1);
    sprite.userData = { cornerIdx: idx };
    sprites.push(sprite);

    // Leader line from sign to track edge
    const leaderPts = [
      cp.pos.x + bx * (hw + 0.5), cp.pos.y + 0.1, cp.pos.z + bz * (hw + 0.5),
      cp.pos.x + bx * (hw + 5.5), cp.pos.y + 3.5, cp.pos.z + bz * (hw + 5.5),
    ];
    const leaderGeo = new THREE.BufferGeometry();
    leaderGeo.setAttribute('position', new THREE.Float32BufferAttribute(leaderPts, 3));
    const leader = new THREE.Line(leaderGeo, new THREE.LineBasicMaterial({ color: 0x00aa88, transparent: true, opacity: 0.3 }));
    leaders.push(leader);
  });

  return { sprites, leaders };
}

// ============================================================
// Car body factory — parameterized by body type
// ============================================================
export interface CarParams {
  wheelbase: number;
  trackWidth: number;
  height: number;
  roofHeight: number;
  length: number;
  bodyType: 'hatch' | 'sedan' | 'suv' | 'roadster' | 'classic';
  paintColor: number;
  emissiveColor: number;
}

export const CLI_PARAMS: CarParams = {
  wheelbase: 2.59, trackWidth: 1.53, height: 1.42, roofHeight: 1.35,
  length: 4.09, bodyType: 'hatch', paintColor: 0xcc1111, emissiveColor: 0x330000,
};

export function buildCar(params: CarParams = CLI_PARAMS): { group: THREE.Group; body: THREE.Group; wheels: THREE.Group[] } {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const { wheelbase, trackWidth, height, length, bodyType, paintColor, emissiveColor } = params;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: paintColor, emissive: emissiveColor, emissiveIntensity: 0.3,
    roughness: 0.3, metalness: 0.55,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x112244, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.65,
  });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.1 });

  const halfL = length / 2;
  const halfW = trackWidth / 2 + 0.12;
  const halfWB = wheelbase / 2;

  // Main body
  const mainBody = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, height * 0.45, length * 0.95), bodyMat);
  mainBody.position.y = height * 0.35;
  body.add(mainBody);

  // Greenhouse (dark glass)
  let greenhouseH: number, greenhouseL: number, greenhouseOffset: number;
  switch (bodyType) {
    case 'hatch': greenhouseH = height * 0.35; greenhouseL = length * 0.45; greenhouseOffset = -0.1; break;
    case 'sedan': greenhouseH = height * 0.32; greenhouseL = length * 0.42; greenhouseOffset = -0.15; break;
    case 'suv': greenhouseH = height * 0.4; greenhouseL = length * 0.5; greenhouseOffset = -0.05; break;
    case 'roadster': greenhouseH = height * 0.2; greenhouseL = length * 0.3; greenhouseOffset = 0; break;
    case 'classic': greenhouseH = height * 0.35; greenhouseL = length * 0.38; greenhouseOffset = -0.3; break;
    default: greenhouseH = height * 0.35; greenhouseL = length * 0.45; greenhouseOffset = -0.1;
  }
  const greenhouse = new THREE.Mesh(
    new THREE.BoxGeometry(halfW * 1.8, greenhouseH, greenhouseL),
    glassMat
  );
  greenhouse.position.set(0, height * 0.55 + greenhouseH / 2, greenhouseOffset);
  body.add(greenhouse);

  // Wheel arches (dark cutouts)
  const archGeo = new THREE.BoxGeometry(0.15, 0.35, 0.7);
  const archPositions = [
    [-halfW, height * 0.2, halfWB],
    [halfW, height * 0.2, halfWB],
    [-halfW, height * 0.2, -halfWB],
    [halfW, height * 0.2, -halfWB],
  ];
  archPositions.forEach(([x, y, z]) => {
    const arch = new THREE.Mesh(archGeo, darkMat);
    arch.position.set(x, y, z);
    body.add(arch);
  });

  // Bumpers
  const fb = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2.1, 0.22, 0.2), darkMat);
  fb.position.set(0, height * 0.2, halfL - 0.1);
  body.add(fb);
  const rb = fb.clone();
  rb.position.set(0, height * 0.2, -halfL + 0.1);
  body.add(rb);

  // Headlights (emissive strips)
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.8 });
  const hlGeo = new THREE.BoxGeometry(0.3, 0.1, 0.05);
  const hlL = new THREE.Mesh(hlGeo, lightMat);
  hlL.position.set(-halfW * 0.7, height * 0.4, halfL - 0.05);
  body.add(hlL);
  const hlR = hlL.clone();
  hlR.position.set(halfW * 0.7, height * 0.4, halfL - 0.05);
  body.add(hlR);

  // Tail lights
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x880000, emissiveIntensity: 0.5 });
  const tlL = new THREE.Mesh(hlGeo, tailMat);
  tlL.position.set(-halfW * 0.7, height * 0.4, -halfL + 0.05);
  body.add(tlL);
  const tlR = tlL.clone();
  tlR.position.set(halfW * 0.7, height * 0.4, -halfL + 0.05);
  body.add(tlR);

  // Mirrors
  const mirrorGeo = new THREE.BoxGeometry(0.15, 0.08, 0.12);
  const mirrorL = new THREE.Mesh(mirrorGeo, chromeMat);
  mirrorL.position.set(-halfW - 0.1, height * 0.5, halfWB * 0.3);
  body.add(mirrorL);
  const mirrorR = mirrorL.clone();
  mirrorR.position.set(halfW + 0.1, height * 0.5, halfWB * 0.3);
  body.add(mirrorR);

  group.add(body);

  // Wheels with rims and brake discs
  const wheelR = 0.3;
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.18, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const rimGeo = new THREE.CylinderGeometry(wheelR * 0.65, wheelR * 0.65, 0.2, 6);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 });
  const brakeGeo = new THREE.CylinderGeometry(wheelR * 0.5, wheelR * 0.5, 0.04, 12);
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x664422, metalness: 0.4, roughness: 0.6 });

  const wheels: THREE.Group[] = [];
  const wheelPos = [
    [-halfW + 0.05, wheelR, halfWB],
    [halfW - 0.05, wheelR, halfWB],
    [-halfW + 0.05, wheelR, -halfWB],
    [halfW - 0.05, wheelR, -halfWB],
  ];
  wheelPos.forEach(([x, y, z]) => {
    const wg = new THREE.Group();
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    wg.add(w);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.z = Math.PI / 2;
    wg.add(rim);
    const brake = new THREE.Mesh(brakeGeo, brakeMat);
    brake.rotation.z = Math.PI / 2;
    brake.position.x = x > 0 ? -0.05 : 0.05;
    wg.add(brake);
    wg.position.set(x, y, z);
    group.add(wg);
    wheels.push(wg);
  });

  return { group, body, wheels };
}

// ============================================================
// Landmarks (start gantry, bridge, Karussell bowl, castle)
// ============================================================
export function buildLandmarks(track: TrackData): THREE.Group {
  const group = new THREE.Group();
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x00ccff, emissive: 0x004466, emissiveIntensity: 0.5,
    transparent: true, opacity: 0.6, wireframe: true,
  });

  // Start/Finish gantry
  const startCorner = track.cornerPositions[0];
  const gantryH = 6;
  const gantryW = track.trackWidth + 4;
  const bx = track.binormals[startCorner.index * 3];
  const bz = track.binormals[startCorner.index * 3 + 2];

  // Two pillars
  const pillarGeo = new THREE.BoxGeometry(0.3, gantryH, 0.3);
  const p1 = new THREE.Mesh(pillarGeo, glowMat);
  p1.position.set(startCorner.pos.x - bx * gantryW / 2, startCorner.pos.y + gantryH / 2, startCorner.pos.z - bz * gantryW / 2);
  group.add(p1);
  const p2 = new THREE.Mesh(pillarGeo, glowMat);
  p2.position.set(startCorner.pos.x + bx * gantryW / 2, startCorner.pos.y + gantryH / 2, startCorner.pos.z + bz * gantryW / 2);
  group.add(p2);
  // Crossbar
  const crossGeo = new THREE.BoxGeometry(gantryW, 0.3, 0.3);
  const cross = new THREE.Mesh(crossGeo, glowMat);
  cross.position.set(startCorner.pos.x, startCorner.pos.y + gantryH, startCorner.pos.z);
  cross.rotation.y = Math.atan2(track.tangents[startCorner.index * 3], track.tangents[startCorner.index * 3 + 2]);
  group.add(cross);

  // Brünnchen pedestrian bridge (corner 21)
  const brunnchen = track.cornerPositions[20]; // Brünnchen
  if (brunnchen) {
    const archGeo = new THREE.TorusGeometry(5, 0.2, 8, 16, Math.PI);
    const arch = new THREE.Mesh(archGeo, glowMat);
    const bbx = track.binormals[brunnchen.index * 3];
    const bbz = track.binormals[brunnchen.index * 3 + 2];
    arch.position.set(brunnchen.pos.x, brunnchen.pos.y + 5, brunnchen.pos.z);
    arch.rotation.y = Math.atan2(track.tangents[brunnchen.index * 3], track.tangents[brunnchen.index * 3 + 2]);
    arch.rotation.x = Math.PI / 2;
    group.add(arch);
  }

  // Caracciola-Karussell banked bowl (corner 16)
  const karussell = track.cornerPositions[15];
  if (karussell) {
    const bowlGeo = new THREE.CylinderGeometry(8, 8, 3, 16, 1, true, 0, Math.PI * 0.7);
    const bowl = new THREE.Mesh(bowlGeo, glowMat);
    const kbx = track.binormals[karussell.index * 3];
    const kbz = track.binormals[karussell.index * 3 + 2];
    bowl.position.set(
      karussell.pos.x - kbx * 5,
      karussell.pos.y + 1.5,
      karussell.pos.z - kbz * 5
    );
    bowl.rotation.x = Math.PI * 0.15; // ~30° banking
    bowl.rotation.y = Math.atan2(track.tangents[karussell.index * 3], track.tangents[karussell.index * 3 + 2]);
    group.add(bowl);
  }

  // Nürburg castle wireframe (near start)
  const castleGroup = new THREE.Group();
  const towerGeo = new THREE.BoxGeometry(3, 12, 3);
  const tower1 = new THREE.Mesh(towerGeo, glowMat);
  tower1.position.set(0, 6, 0);
  castleGroup.add(tower1);
  const tower2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 10, 2.5), glowMat);
  tower2.position.set(5, 5, 2);
  castleGroup.add(tower2);
  const wallGeo = new THREE.BoxGeometry(8, 6, 0.5);
  const wall = new THREE.Mesh(wallGeo, glowMat);
  wall.position.set(2.5, 3, 0);
  castleGroup.add(wall);
  castleGroup.position.set(startCorner.pos.x + 150, startCorner.pos.y, startCorner.pos.z + 100);
  group.add(castleGroup);

  return group;
}

// ============================================================
// Photo plates (Wikimedia Commons)
// ============================================================
const PHOTO_DATA = [
  { corner: 15, file: 'Karussell.jpg', captionEn: 'Caracciola-Karussell', captionRu: 'Каруссель Караччола', credit: 'Wikimedia / CC BY-SA' },
  { corner: 20, file: 'Nordschleife_Br%C3%BCnnchen.jpg', captionEn: 'Brünnchen', captionRu: 'Брунхен', credit: 'Wikimedia / CC BY-SA' },
  { corner: 3, file: 'N%C3%BCrburgring_Flugplatz.jpg', captionEn: 'Flugplatz', captionRu: 'Флугплац', credit: 'Wikimedia / CC BY-SA' },
  { corner: 12, file: 'N%C3%BCrburgring_Bergwerk.jpg', captionEn: 'Bergwerk', captionRu: 'Бергверк', credit: 'Wikimedia / CC BY-SA' },
  { corner: 23, file: 'D%C3%B6ttinger_H%C3%B6he.jpg', captionEn: 'Döttinger Höhe', captionRu: 'Дёттингер Хёэ', credit: 'Wikimedia / CC BY-SA' },
  { corner: 0, file: 'N%C3%BCrburgring_start-finish.jpg', captionEn: 'Start/Finish', captionRu: 'Старт/Финиш', credit: 'Wikimedia / Public Domain' },
];

export function buildPhotoPlates(track: TrackData, lang: 'en' | 'ru'): THREE.Sprite[] {
  const sprites: THREE.Sprite[] = [];
  const hw = track.trackWidth / 2;

  PHOTO_DATA.forEach(data => {
    const cp = track.cornerPositions[data.corner];
    if (!cp) return;

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;

    // Frame
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, 320, 240);
    ctx.strokeStyle = '#00ccaa';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 316, 236);

    // Placeholder image area
    ctx.fillStyle = '#0a2a3a';
    ctx.fillRect(10, 10, 300, 170);
    ctx.fillStyle = '#00ccaa44';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('[Photo: ' + data.file + ']', 160, 95);

    // Caption
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(lang === 'en' ? data.captionEn : data.captionRu, 160, 200);
    // Credit
    ctx.fillStyle = '#888888';
    ctx.font = '10px Arial';
    ctx.fillText(data.credit, 160, 225);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.9, depthTest: false });
    const sprite = new THREE.Sprite(mat);

    const bx = track.binormals[cp.index * 3];
    const bz = track.binormals[cp.index * 3 + 2];
    sprite.position.set(
      cp.pos.x - bx * (hw + 10),
      cp.pos.y + 6,
      cp.pos.z - bz * (hw + 10)
    );
    sprite.scale.set(10, 7.5, 1);
    sprites.push(sprite);
  });

  return sprites;
}

// ============================================================
// Mass visualization
// ============================================================
export function buildMassVisualization() {
  const barGeo = new THREE.ConeGeometry(0.2, 1, 4);
  const barMat = new THREE.MeshStandardMaterial({
    color: 0x00ffcc, emissive: 0x00aa88, emissiveIntensity: 0.5,
    transparent: true, opacity: 0.8,
  });
  const wheelLoadBars: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) wheelLoadBars.push(new THREE.Mesh(barGeo, barMat.clone()));

  const cogGeo = new THREE.SphereGeometry(0.25, 12, 12);
  const cogMat = new THREE.MeshStandardMaterial({
    color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 0.8,
    transparent: true, opacity: 0.6,
  });
  const cogSphere = new THREE.Mesh(cogGeo, cogMat);

  const trailPts = new Float32Array(300);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(trailPts, 3));
  const cogTrail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.4 }));

  return { wheelLoadBars, cogSphere, cogTrail };
}

// ============================================================
// Init scene
// ============================================================
export function initScene(container: HTMLElement, track: TrackData, sim: SimData): SceneState {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 30000);

  // Lighting
  const ambient = new THREE.AmbientLight(0xbfd4e6, 0.8);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(1, 2, 1).normalize().multiplyScalar(5000);
  scene.add(dirLight);
  const carLight = new THREE.PointLight(0xffaa44, 0.5, 80);
  scene.add(carLight);

  // Grid
  const bounds = track.bounds;
  const trackSize = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * 1.5;
  const gridHelper = new THREE.GridHelper(trackSize, 60, 0x003333, 0x001a1a);
  gridHelper.position.set(bounds.center.x, bounds.min.y - 30, bounds.center.z);
  (gridHelper.material as THREE.Material).transparent = true;
  (gridHelper.material as THREE.Material).opacity = 0.25;
  scene.add(gridHelper);

  // Track
  const { ribbon, curbs } = buildTrackMesh(track, false);
  scene.add(ribbon);
  curbs.forEach(c => scene.add(c));

  // Racing line
  const racingLineMesh = buildRacingLine(track);
  racingLineMesh.visible = false;
  scene.add(racingLineMesh);

  // Signs
  const { sprites: signSprites, leaders: signLeaders } = buildSignSprites(track);
  signSprites.forEach(s => scene.add(s));
  signLeaders.forEach(l => scene.add(l));

  // Landmarks
  const landmarks = buildLandmarks(track);
  scene.add(landmarks);

  // Photo plates
  const photoPlates = buildPhotoPlates(track, 'en');
  photoPlates.forEach(p => scene.add(p));

  // Car
  const { group: carGroup, body: bodyMesh, wheels: wheelMeshes } = buildCar(CLI_PARAMS);
  scene.add(carGroup);

  // Shadow disc
  const shadowGeo = new THREE.CircleGeometry(2.5, 16);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  scene.add(shadowDisc);

  // Mass viz
  const { wheelLoadBars, cogSphere, cogTrail } = buildMassVisualization();
  wheelLoadBars.forEach(b => scene.add(b));
  scene.add(cogSphere);
  scene.add(cogTrail);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxDistance = 8000;
  controls.minDistance = 2;

  // Initial camera position
  const startData = interpSim(sim, 0);
  camera.position.set(
    startData.posX - Math.sin(startData.heading) * 25,
    startData.posY + 12,
    startData.posZ - Math.cos(startData.heading) * 25
  );
  controls.target.set(startData.posX, startData.posY, startData.posZ);
  controls.update();

  // Double-click to recenter
  renderer.domElement.addEventListener('dblclick', () => {
    if (stateRef) {
      const d = interpSim(stateRef.sim, stateRef.currentTime);
      stateRef.controls.target.set(d.posX, d.posY, d.posZ);
    }
  });

  // Self-test
  setTimeout(() => {
    const rect = renderer.domElement.getBoundingClientRect();
    const el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    console.assert(el === renderer.domElement || el?.tagName === 'CANVAS',
      `[SelfTest] Canvas should receive pointer events. Got: ${el?.tagName}`);
  }, 500);

  // We need a ref for the dblclick handler
  const stateRef: SceneState = {
    renderer, scene, camera, controls,
    carGroup, bodyMesh, wheelMeshes, shadowDisc,
    trackMesh: ribbon, curbMeshes: curbs, racingLineMesh,
    signSprites, signLeaders,
    cornerSigns: [], brakeMarkers: [], cornerPlates: [],
    wheelLoadBars, cogSphere, cogTrail,
    gridHelper, carLight, landmarks, photoPlates,
    elevationTintMesh: null,
    sim, track,
    cameraMode: 1, currentTime: 0, isPlaying: false, playbackSpeed: 1,
    freeFlyState: { yaw: 0, pitch: 0, keys: new Set() },
    visibility: { wheelLoads: true, cogSphere: true, bodyRoll: true, racingLine: false, photoPlates: true, elevationTint: false, minimap: true },
    signDisplayMode: 'nearest',
    selectedCorner: 0,
  };

  return stateRef;
}

// ============================================================
// Update scene per frame
// ============================================================
export function updateScene(state: SceneState, time: number) {
  const data = interpSim(state.sim, time);
  const vis = state.visibility;

  // Car position
  state.carGroup.position.set(data.posX, data.posY, data.posZ);
  state.carGroup.rotation.set(data.pitchAngle * 0.015, data.heading, 0, 'YXZ');

  // Body roll/pitch
  if (vis.bodyRoll) {
    state.bodyMesh.rotation.z = -data.rollAngle * Math.PI / 180 * 0.5;
    state.bodyMesh.rotation.x = data.pitchAngle * Math.PI / 180 * 0.25;
  } else {
    state.bodyMesh.rotation.z = 0;
    state.bodyMesh.rotation.x = 0;
  }

  // Wheel spin
  const spin = data.speed * time * 0.8;
  state.wheelMeshes.forEach(w => { w.children[0].rotation.x = spin; });

  // Shadow
  state.shadowDisc.position.set(data.posX, data.posY + 0.02, data.posZ);

  // Car light
  state.carLight.position.set(data.posX, data.posY + 3, data.posZ);

  // CoG
  state.cogSphere.position.set(data.posX, data.posY + 0.5, data.posZ);
  state.cogSphere.visible = vis.cogSphere;

  if (vis.cogSphere) {
    const trailPos = state.cogTrail.geometry.attributes.position as THREE.BufferAttribute;
    const arr = trailPos.array as Float32Array;
    for (let i = arr.length - 3; i >= 3; i -= 3) {
      arr[i] = arr[i - 3]; arr[i + 1] = arr[i - 2]; arr[i + 2] = arr[i - 1];
    }
    arr[0] = data.posX; arr[1] = data.posY + 0.5; arr[2] = data.posZ;
    trailPos.needsUpdate = true;
  }

  // Wheel loads
  if (vis.wheelLoads) {
    const offsets = [[-0.75, 0, 1.25], [0.75, 0, 1.25], [-0.75, 0, -1.15], [0.75, 0, -1.15]];
    const loads = [data.wheelLoadFL, data.wheelLoadFR, data.wheelLoadRL, data.wheelLoadRR];
    const maxLoad = 1240 * 9.81 * 0.4;
    state.wheelLoadBars.forEach((bar, i) => {
      const norm = Math.min(loads[i] / maxLoad, 1.5);
      const h = norm * 2.5;
      _v1.set(offsets[i][0], 0, offsets[i][2]);
      _v1.applyQuaternion(state.carGroup.quaternion);
      _v1.add(state.carGroup.position);
      bar.position.set(_v1.x, _v1.y + h / 2 + 0.1, _v1.z);
      bar.scale.set(1, Math.max(0.1, h), 1);
      bar.visible = true;
      const mat = bar.material as THREE.MeshStandardMaterial;
      if (norm > 1.0) { mat.color.setHex(0xff3300); mat.emissive.setHex(0xaa2200); }
      else if (norm > 0.7) { mat.color.setHex(0xffcc00); mat.emissive.setHex(0xaa8800); }
      else { mat.color.setHex(0x00ffcc); mat.emissive.setHex(0x00aa88); }
    });
  } else {
    state.wheelLoadBars.forEach(b => b.visible = false);
  }

  // Racing line visibility
  if (state.racingLineMesh) state.racingLineMesh.visible = vis.racingLine;

  // Sign distance fade + display mode
  const carPos = _v1.set(data.posX, data.posY, data.posZ);
  state.signSprites.forEach((sprite, idx) => {
    const dist = sprite.position.distanceTo(carPos);
    let show = false;
    switch (state.signDisplayMode) {
      case 'all': show = true; break;
      case 'nearest': show = dist < 200; break;
      case 'selected': show = idx === state.selectedCorner || dist < 80; break;
    }
    sprite.visible = show;
    state.signLeaders[idx].visible = show;

    if (show) {
      // Distance fade: full under 60m, 25% beyond 150m
      const opacity = dist < 60 ? 1 : dist > 150 ? 0.25 : 1 - (dist - 60) / (150 - 60) * 0.75;
      (sprite.material as THREE.SpriteMaterial).opacity = opacity;
      // Scale by distance
      const sc = dist < 60 ? 1 : dist > 200 ? 0.6 : 1 - (dist - 60) / 140 * 0.4;
      sprite.scale.set(8 * sc, 2 * sc, 1);
      // Highlight selected
      if (idx === state.selectedCorner) {
        (sprite.material as THREE.SpriteMaterial).color.setHex(0xffaa00);
      } else {
        (sprite.material as THREE.SpriteMaterial).color.setHex(0xffffff);
      }
    }
  });

  // Photo plates visibility + distance fade
  state.photoPlates.forEach(sprite => {
    sprite.visible = vis.photoPlates;
    if (vis.photoPlates) {
      const dist = sprite.position.distanceTo(carPos);
      const opacity = dist < 60 ? 0.9 : dist > 200 ? 0.1 : 0.9 - (dist - 60) / 140 * 0.8;
      (sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, opacity);
    }
  });

  // Camera modes
  updateCamera(state, data);
}

function updateCamera(state: SceneState, data: ReturnType<typeof interpSim>) {
  const carPos = _v1.set(data.posX, data.posY, data.posZ);

  switch (state.cameraMode) {
    case 1: // Orbit chase — target follows car
      state.controls.target.lerp(carPos, 0.15);
      state.controls.update();
      break;
    case 2: { // Chase
      const behind = _v2.set(-Math.sin(data.heading) * 15, 5, -Math.cos(data.heading) * 15).add(carPos);
      state.camera.position.lerp(behind, 0.1);
      state.camera.lookAt(carPos);
      state.controls.target.copy(carPos);
      break;
    }
    case 3: { // Hood
      const hood = _v2.set(Math.sin(data.heading) * 1.5, 1.4, Math.cos(data.heading) * 1.5).add(carPos);
      state.camera.position.copy(hood);
      const look = _v3.set(Math.sin(data.heading) * 100 + data.posX, data.posY + 1, Math.cos(data.heading) * 100 + data.posZ);
      state.camera.lookAt(look);
      break;
    }
    case 4: { // Top-down
      const center = state.track.bounds.center;
      const topPos = _v2.set(center.x, state.track.bounds.max.y + 2500, center.z);
      state.camera.position.lerp(topPos, 0.05);
      state.camera.lookAt(center.x, state.track.bounds.min.y, center.z);
      break;
    }
    case 5: { // TV cam
      let nearest = state.track.cornerPositions[0];
      let minD = Infinity;
      state.track.cornerPositions.forEach(cp => {
        const d = cp.pos.distanceTo(carPos);
        if (d < minD) { minD = d; nearest = cp; }
      });
      const tvPos = _v2.set(nearest.pos.x + nearest.dir.z * 40, nearest.pos.y + 20, nearest.pos.z - nearest.dir.x * 40);
      state.camera.position.lerp(tvPos, 0.06);
      state.camera.lookAt(carPos);
      break;
    }
    case 6: { // Free fly
      const spd = 5;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(state.camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(state.camera.quaternion);
      if (state.freeFlyState.keys.has('w')) state.camera.position.addScaledVector(fwd, spd);
      if (state.freeFlyState.keys.has('s')) state.camera.position.addScaledVector(fwd, -spd);
      if (state.freeFlyState.keys.has('a')) state.camera.position.addScaledVector(right, -spd);
      if (state.freeFlyState.keys.has('d')) state.camera.position.addScaledVector(right, spd);
      break;
    }
  }
}

// Recenter camera on car
export function recenterCamera(state: SceneState) {
  const data = interpSim(state.sim, state.currentTime);
  state.controls.target.set(data.posX, data.posY, data.posZ);
  // Move camera to chase position
  state.camera.position.set(
    data.posX - Math.sin(data.heading) * 25,
    data.posY + 12,
    data.posZ - Math.cos(data.heading) * 25
  );
}

export function resizeScene(state: SceneState, w: number, h: number) {
  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(w, h);
}
