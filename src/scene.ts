// ============================================================
// SECTION: Three.js Scene — Track, Car, Cameras, Visualizations
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TrackData, CORNER_SPECS } from './track';
import { SimData, interpSim } from './simulation';

// Pre-allocated vectors (zero per-frame allocation)
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
  cornerSigns: THREE.Mesh[];
  brakeMarkers: THREE.Mesh[];
  cornerPlates: THREE.Mesh[];
  wheelLoadBars: THREE.Mesh[];
  wheelLoadLabels: THREE.Sprite[];
  cogSphere: THREE.Mesh;
  cogTrail: THREE.Line;
  gridHelper: THREE.GridHelper;
  carLight: THREE.PointLight;
  sim: SimData;
  track: TrackData;
  cameraMode: number;
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  freeFlyState: { yaw: number; pitch: number; keys: Set<string> };
}

// ============================================================
// Build track ribbon mesh
// ============================================================
export function buildTrackMesh(track: TrackData): { ribbon: THREE.Mesh; curbs: THREE.Mesh[] } {
  const N = track.numSamples;
  const hw = track.trackWidth / 2; // 4.5m half-width

  // Build ribbon geometry in XZ plane (Y = elevation)
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < N; i++) {
    const px = track.positions[i * 3];
    const py = track.positions[i * 3 + 1];
    const pz = track.positions[i * 3 + 2];
    const bx = track.binormals[i * 3];
    const bz = track.binormals[i * 3 + 2];

    // Left edge: pos - binormal * hw (binormal is horizontal perpendicular)
    vertices.push(px - bx * hw, py, pz - bz * hw);
    // Right edge: pos + binormal * hw
    vertices.push(px + bx * hw, py, pz + bz * hw);

    const u = i / N;
    uvs.push(0, u * 50, 1, u * 50); // tiled UVs for curb pattern

    if (i < N - 1) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1);
      indices.push(base + 1, base + 2, base + 3);
    }
  }
  // Close loop
  const lastBase = (N - 1) * 2;
  indices.push(lastBase, 0, lastBase + 1);
  indices.push(lastBase + 1, 0, 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // Self-test: log bounding box
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  console.log(`[TrackMesh] BBox: min(${bb.min.x.toFixed(0)},${bb.min.y.toFixed(0)},${bb.min.z.toFixed(0)}) max(${bb.max.x.toFixed(0)},${bb.max.y.toFixed(0)},${bb.max.z.toFixed(0)})`);
  console.log(`[TrackMesh] Size: ${(bb.max.x-bb.min.x).toFixed(0)} × ${(bb.max.y-bb.min.y).toFixed(0)} × ${(bb.max.z-bb.min.z).toFixed(0)} m`);

  // Asphalt material — light gray, clearly visible
  const material = new THREE.MeshStandardMaterial({
    color: 0x3a3f46,
    roughness: 0.75,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const ribbon = new THREE.Mesh(geometry, material);

  // Edge glow lines (cyan)
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

  // Curbs at tight corners
  const curbs: THREE.Mesh[] = [];
  const curbGeo = new THREE.BoxGeometry(1.5, 0.08, 2.5);
  const curbMatRed = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0x440000, emissiveIntensity: 0.3 });
  const curbMatWhite = new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0x222222, emissiveIntensity: 0.2 });

  for (let i = 0; i < N; i += 12) {
    const curv = track.curvatures[i];
    if (curv > 0.012) {
      const side = 1; // outer edge
      const mat = (i % 24 < 12) ? curbMatRed : curbMatWhite;
      const curb = new THREE.Mesh(curbGeo, mat);
      const bx = track.binormals[i * 3];
      const bz = track.binormals[i * 3 + 2];
      curb.position.set(
        track.positions[i * 3] + bx * hw * side * 1.05,
        track.positions[i * 3 + 1] + 0.04,
        track.positions[i * 3 + 2] + bz * hw * side * 1.05
      );
      // Align curb with track direction
      const tx = track.tangents[i * 3];
      const tz = track.tangents[i * 3 + 2];
      curb.rotation.y = Math.atan2(tx, tz);
      curbs.push(curb);
    }
  }

  return { ribbon, curbs };
}

// ============================================================
// Corner name signs
// ============================================================
export function buildCornerSigns(track: TrackData): THREE.Mesh[] {
  const signs: THREE.Mesh[] = [];
  const hw = track.trackWidth / 2;

  track.cornerPositions.forEach((cp, idx) => {
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
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(8, 2);
    const sign = new THREE.Mesh(geo, mat);

    const offset = hw + 5;
    const bx = track.binormals[cp.index * 3];
    const bz = track.binormals[cp.index * 3 + 2];
    sign.position.set(
      cp.pos.x + bx * offset,
      cp.pos.y + 3,
      cp.pos.z + bz * offset
    );
    const tx = track.tangents[cp.index * 3];
    const tz = track.tangents[cp.index * 3 + 2];
    sign.rotation.y = Math.atan2(tx, tz);

    signs.push(sign);
  });
  return signs;
}

// ============================================================
// Brake markers
// ============================================================
export function buildBrakeMarkers(track: TrackData): THREE.Mesh[] {
  const markers: THREE.Mesh[] = [];
  const hw = track.trackWidth / 2;

  // Find heavy braking zones
  const brakingZones: number[] = [];
  for (let i = 0; i < track.numSamples; i += 80) {
    if (track.curvatures[i] > 0.018) brakingZones.push(i);
  }

  brakingZones.forEach(cornerIdx => {
    [100, 200, 300].forEach(dist => {
      const arcPos = track.arcLengths[cornerIdx] - dist;
      if (arcPos < 0) return;
      const frac = arcPos / track.totalLength;
      const idx = Math.min(Math.floor(frac * (track.numSamples - 1)), track.numSamples - 1);

      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${dist}`, 32, 32);

      const texture = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
      const geo = new THREE.PlaneGeometry(2, 2);
      const marker = new THREE.Mesh(geo, mat);
      const bx = track.binormals[idx * 3];
      const bz = track.binormals[idx * 3 + 2];
      marker.position.set(
        track.positions[idx * 3] + bx * (hw + 2),
        track.positions[idx * 3 + 1] + 1.5,
        track.positions[idx * 3 + 2] + bz * (hw + 2)
      );
      const tx = track.tangents[idx * 3];
      const tz = track.tangents[idx * 3 + 2];
      marker.rotation.y = Math.atan2(tx, tz);
      markers.push(marker);
    });
  });
  return markers;
}

// ============================================================
// Corner number plates
// ============================================================
export function buildCornerPlates(track: TrackData): THREE.Mesh[] {
  const plates: THREE.Mesh[] = [];
  const hw = track.trackWidth / 2;

  track.cornerPositions.forEach((cp, idx) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${idx + 1}`, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(1, 1);
    const plate = new THREE.Mesh(geo, mat);
    const bx = track.binormals[cp.index * 3];
    const bz = track.binormals[cp.index * 3 + 2];
    plate.position.set(
      cp.pos.x - bx * (hw + 1),
      cp.pos.y + 1,
      cp.pos.z - bz * (hw + 1)
    );
    plates.push(plate);
  });
  return plates;
}

// ============================================================
// Build procedural Renault Clio R.S. III (~4m long, red)
// ============================================================
export function buildCar(): { group: THREE.Group; body: THREE.Group; wheels: THREE.Group[] } {
  const group = new THREE.Group();
  const body = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xcc1111,
    emissive: 0x330000,
    emissiveIntensity: 0.3,
    roughness: 0.35,
    metalness: 0.5,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x112244, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.7
  });

  // Main body
  const mainBody = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.65, 3.9), bodyMat);
  mainBody.position.y = 0.52;
  body.add(mainBody);

  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.55, 1.8), bodyMat);
  cabin.position.set(0, 1.05, -0.15);
  body.add(cabin);

  // Windshield
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.55), glassMat);
  ws.position.set(0, 1.05, 0.78);
  ws.rotation.x = -0.3;
  body.add(ws);

  // Rear window
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.45), glassMat);
  rw.position.set(0, 1.05, -1.1);
  rw.rotation.x = 0.35;
  body.add(rw);

  // Hood
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.1), bodyMat);
  hood.position.set(0, 0.88, 1.2);
  body.add(hood);

  // Bumpers
  const fb = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.25, 0.25), darkMat);
  fb.position.set(0, 0.32, 1.95);
  body.add(fb);
  const rb = fb.clone();
  rb.position.set(0, 0.32, -1.95);
  body.add(rb);

  // Headlights
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.8 });
  const hlL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), lightMat);
  hlL.position.set(-0.6, 0.55, 1.95);
  body.add(hlL);
  const hlR = hlL.clone();
  hlR.position.set(0.6, 0.55, 1.95);
  body.add(hlR);

  group.add(body);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const rimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.2, 6);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 });

  const wheels: THREE.Group[] = [];
  const wheelPos = [[-0.75, 0.3, 1.25], [0.75, 0.3, 1.25], [-0.75, 0.3, -1.15], [0.75, 0.3, -1.15]];
  wheelPos.forEach(([x, y, z]) => {
    const wg = new THREE.Group();
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    wg.add(w);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.z = Math.PI / 2;
    wg.add(rim);
    wg.position.set(x, y, z);
    group.add(wg);
    wheels.push(wg);
  });

  return { group, body, wheels };
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
  for (let i = 0; i < 4; i++) {
    wheelLoadBars.push(new THREE.Mesh(barGeo, barMat.clone()));
  }

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
// Initialize scene
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

  // Camera — near/far for huge track
  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 30000);

  // Lighting
  const ambient = new THREE.AmbientLight(0xbfd4e6, 0.8);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(1, 2, 1).normalize().multiplyScalar(5000);
  scene.add(dirLight);

  // Car light
  const carLight = new THREE.PointLight(0xffaa44, 0.5, 80);
  scene.add(carLight);

  // Grid — sized to track bounds
  const bounds = track.bounds;
  const trackSize = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * 1.5;
  const gridHelper = new THREE.GridHelper(trackSize, 60, 0x003333, 0x001a1a);
  gridHelper.position.set(bounds.center.x, bounds.min.y - 30, bounds.center.z);
  (gridHelper.material as THREE.Material).transparent = true;
  (gridHelper.material as THREE.Material).opacity = 0.25;
  scene.add(gridHelper);

  // Track
  const { ribbon, curbs } = buildTrackMesh(track);
  scene.add(ribbon);
  curbs.forEach(c => scene.add(c));

  // Signs, markers, plates
  const cornerSigns = buildCornerSigns(track);
  cornerSigns.forEach(s => scene.add(s));
  const brakeMarkers = buildBrakeMarkers(track);
  brakeMarkers.forEach(m => scene.add(m));
  const cornerPlates = buildCornerPlates(track);
  cornerPlates.forEach(p => scene.add(p));

  // Car
  const { group: carGroup, body: bodyMesh, wheels: wheelMeshes } = buildCar();
  scene.add(carGroup);

  // Shadow disc under car
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

  // Controls — orbit around car
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxDistance = 8000;
  controls.minDistance = 2;

  // Initial camera: chase-orbit behind car
  const startData = interpSim(sim, 0);
  const startHeading = startData.heading;
  camera.position.set(
    startData.posX - Math.sin(startHeading) * 25,
    startData.posY + 12,
    startData.posZ - Math.cos(startHeading) * 25
  );
  controls.target.set(startData.posX, startData.posY, startData.posZ);
  controls.update();

  // Self-test: verify canvas receives pointer events
  setTimeout(() => {
    const rect = renderer.domElement.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const el = document.elementFromPoint(cx, cy);
    console.assert(
      el === renderer.domElement || el?.tagName === 'CANVAS',
      `[SelfTest] Canvas should receive pointer events at center. Got: ${el?.tagName}.${el?.className}`
    );
  }, 500);

  return {
    renderer, scene, camera, controls,
    carGroup, bodyMesh, wheelMeshes, shadowDisc,
    trackMesh: ribbon, curbMeshes: curbs,
    cornerSigns, brakeMarkers, cornerPlates,
    wheelLoadBars, wheelLoadLabels: [],
    cogSphere, cogTrail,
    gridHelper, carLight,
    sim, track,
    cameraMode: 1,
    currentTime: 0,
    isPlaying: false,
    playbackSpeed: 1,
    freeFlyState: { yaw: 0, pitch: 0, keys: new Set() },
  };
}

// ============================================================
// Update scene per frame
// ============================================================
export function updateScene(state: SceneState, time: number, visibility: {
  wheelLoads: boolean; cogSphere: boolean; bodyRoll: boolean;
}) {
  const data = interpSim(state.sim, time);

  // Position car
  state.carGroup.position.set(data.posX, data.posY, data.posZ);
  state.carGroup.rotation.set(data.pitchAngle * 0.015, data.heading, 0, 'YXZ');

  // Body roll/pitch
  if (visibility.bodyRoll) {
    state.bodyMesh.rotation.z = -data.rollAngle * Math.PI / 180 * 0.5;
    state.bodyMesh.rotation.x = data.pitchAngle * Math.PI / 180 * 0.25;
  } else {
    state.bodyMesh.rotation.z = 0;
    state.bodyMesh.rotation.x = 0;
  }

  // Wheel spin
  const spin = data.speed * time * 0.8;
  state.wheelMeshes.forEach(w => {
    w.children[0].rotation.x = spin;
  });

  // Shadow disc
  state.shadowDisc.position.set(data.posX, data.posY + 0.02, data.posZ);
  state.shadowDisc.rotation.x = -Math.PI / 2;

  // Car light
  state.carLight.position.set(data.posX, data.posY + 3, data.posZ);

  // CoG sphere
  state.cogSphere.position.set(data.posX, data.posY + 0.5, data.posZ);
  state.cogSphere.visible = visibility.cogSphere;

  // CoG trail
  if (visibility.cogSphere) {
    const trailPos = state.cogTrail.geometry.attributes.position as THREE.BufferAttribute;
    const arr = trailPos.array as Float32Array;
    for (let i = arr.length - 3; i >= 3; i -= 3) {
      arr[i] = arr[i - 3]; arr[i + 1] = arr[i - 2]; arr[i + 2] = arr[i - 1];
    }
    arr[0] = data.posX; arr[1] = data.posY + 0.5; arr[2] = data.posZ;
    trailPos.needsUpdate = true;
  }

  // Wheel load bars
  if (visibility.wheelLoads) {
    const offsets = [[-0.75, 0, 1.25], [0.75, 0, 1.25], [-0.75, 0, -1.15], [0.75, 0, -1.15]];
    const loads = [data.wheelLoadFL, data.wheelLoadFR, data.wheelLoadRL, data.wheelLoadRR];
    const maxLoad = 1240 * 9.81 * 0.4;

    state.wheelLoadBars.forEach((bar, i) => {
      const load = loads[i];
      const norm = Math.min(load / maxLoad, 1.5);
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
    case 2: { // Chase cam
      const behind = _v2.set(
        -Math.sin(data.heading) * 15, 5, -Math.cos(data.heading) * 15
      ).add(carPos);
      state.camera.position.lerp(behind, 0.1);
      state.camera.lookAt(carPos);
      break;
    }
    case 3: { // Hood
      const hood = _v2.set(
        Math.sin(data.heading) * 1.5, 1.4, Math.cos(data.heading) * 1.5
      ).add(carPos);
      state.camera.position.copy(hood);
      const look = _v3.set(
        Math.sin(data.heading) * 100 + data.posX,
        data.posY + 1,
        Math.cos(data.heading) * 100 + data.posZ
      );
      state.camera.lookAt(look);
      break;
    }
    case 4: { // Top-down — show whole track
      const center = state.track.bounds.center;
      const topPos = _v2.set(center.x, state.track.bounds.max.y + 2500, center.z);
      state.camera.position.lerp(topPos, 0.05);
      state.camera.lookAt(center.x, state.track.bounds.min.y, center.z);
      break;
    }
    case 5: { // TV cam at nearest corner
      let nearest = state.track.cornerPositions[0];
      let minD = Infinity;
      state.track.cornerPositions.forEach(cp => {
        const d = cp.pos.distanceTo(carPos);
        if (d < minD) { minD = d; nearest = cp; }
      });
      const tvPos = _v2.set(
        nearest.pos.x + nearest.dir.z * 40,
        nearest.pos.y + 20,
        nearest.pos.z - nearest.dir.x * 40
      );
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

export function resizeScene(state: SceneState, w: number, h: number) {
  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(w, h);
}
