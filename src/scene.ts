// ============================================================
// SECTION: Three.js Scene — Track, Car, Cameras, Visualizations
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TrackData, CORNER_SPECS } from './track';
import { SimData, interpSim } from './simulation';

// Pre-allocated vectors (no per-frame allocations)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _mat4 = new THREE.Matrix4();
const _color = new THREE.Color();

export interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  carGroup: THREE.Group;
  bodyMesh: THREE.Group;
  wheelMeshes: THREE.Mesh[];
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
  const hw = track.trackWidth / 2;
  
  // Build ribbon geometry
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  
  for (let i = 0; i < N; i++) {
    const px = track.positions[i * 3];
    const py = track.positions[i * 3 + 1];
    const pz = track.positions[i * 3 + 2];
    const bx = track.binormals[i * 3];
    const by = track.binormals[i * 3 + 1];
    const bz = track.binormals[i * 3 + 2];
    
    // Left edge
    vertices.push(px - bx * hw, py - by * hw, pz - bz * hw);
    // Right edge
    vertices.push(px + bx * hw, py + by * hw, pz + bz * hw);
    
    const u = i / N;
    uvs.push(0, u, 1, u);
    
    if (i < N - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }
  // Close the loop
  const lastBase = (N - 1) * 2;
  indices.push(lastBase, lastBase + 1, 0);
  indices.push(lastBase + 1, 1, 0);
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  
  // Glowing asphalt material
  const material = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    emissive: 0x001a2a,
    emissiveIntensity: 0.6,
    roughness: 0.6,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
  
  const ribbon = new THREE.Mesh(geometry, material);
  
  // Add glowing edge lines
  const edgePointsL: number[] = [];
  const edgePointsR: number[] = [];
  for (let i = 0; i < N; i++) {
    const px = track.positions[i * 3];
    const py = track.positions[i * 3 + 1];
    const pz = track.positions[i * 3 + 2];
    const bx = track.binormals[i * 3];
    const by = track.binormals[i * 3 + 1];
    const bz = track.binormals[i * 3 + 2];
    
    edgePointsL.push(px - bx * hw, py + 0.1, pz - bz * hw);
    edgePointsR.push(px + bx * hw, py + 0.1, pz + bz * hw);
  }
  
  const edgeGeoL = new THREE.BufferGeometry();
  edgeGeoL.setAttribute('position', new THREE.Float32BufferAttribute(edgePointsL, 3));
  const edgeMatL = new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.6 });
  const edgeLineL = new THREE.Line(edgeGeoL, edgeMatL);
  ribbon.add(edgeLineL);
  
  const edgeGeoR = new THREE.BufferGeometry();
  edgeGeoR.setAttribute('position', new THREE.Float32BufferAttribute(edgePointsR, 3));
  const edgeMatR = new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.6 });
  const edgeLineR = new THREE.Line(edgeGeoR, edgeMatR);
  ribbon.add(edgeLineR);
  
  // Center line (dashed effect via segments)
  const centerPoints: number[] = [];
  for (let i = 0; i < N; i += 3) {
    centerPoints.push(track.positions[i * 3], track.positions[i * 3 + 1] + 0.05, track.positions[i * 3 + 2]);
  }
  const centerGeo = new THREE.BufferGeometry();
  centerGeo.setAttribute('position', new THREE.Float32BufferAttribute(centerPoints, 3));
  const centerMat = new THREE.PointsMaterial({ color: 0x004444, size: 0.5, transparent: true, opacity: 0.3 });
  const centerLine = new THREE.Points(centerGeo, centerMat);
  ribbon.add(centerLine);
  
  // Build curb stripes (red-white at corners)
  const curbs: THREE.Mesh[] = [];
  const curbGeo = new THREE.PlaneGeometry(1.2, 3);
  const curbMatRed = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0x330000, emissiveIntensity: 0.5 });
  const curbMatWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222, emissiveIntensity: 0.3 });
  
  // Place curbs at tight corners
  for (let i = 0; i < N; i += 15) {
    const curv = track.curvatures[i];
    if (curv > 0.015) { // tight corner
      const side = curv > 0 ? 1 : -1;
      const mat = (i % 30 < 15) ? curbMatRed : curbMatWhite;
      const curb = new THREE.Mesh(curbGeo, mat);
      curb.position.set(
        track.positions[i * 3] + track.binormals[i * 3] * hw * side * 1.1,
        track.positions[i * 3 + 1] + 0.05,
        track.positions[i * 3 + 2] + track.binormals[i * 3 + 2] * hw * side * 1.1
      );
      curb.lookAt(
        curb.position.x + track.tangents[i * 3],
        curb.position.y + track.tangents[i * 3 + 1],
        curb.position.z + track.tangents[i * 3 + 2]
      );
      curb.rotateX(-Math.PI / 2);
      curbs.push(curb);
    }
  }
  
  return { ribbon, curbs };
}

// ============================================================
// Build corner name signs (canvas textures)
// ============================================================
export function buildCornerSigns(track: TrackData): THREE.Mesh[] {
  const signs: THREE.Mesh[] = [];
  const hw = track.trackWidth / 2;
  
  track.cornerPositions.forEach((cp, idx) => {
    if (!CORNER_SPECS[idx]?.isNamed) return;
    
    // Create canvas texture for sign
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    
    // Green background with white border
    ctx.fillStyle = '#1a5c1a';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 252, 60);
    
    // White text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cp.name, 128, 32);
    
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(6, 1.5);
    const sign = new THREE.Mesh(geo, mat);
    
    // Position beside track
    const offset = hw + 4;
    sign.position.set(
      cp.pos.x + track.binormals[cp.index * 3] * offset,
      cp.pos.y + 2.5,
      cp.pos.z + track.binormals[cp.index * 3 + 2] * offset
    );
    sign.lookAt(
      sign.position.x + track.tangents[cp.index * 3],
      sign.position.y,
      sign.position.z + track.tangents[cp.index * 3 + 2]
    );
    
    signs.push(sign);
  });
  
  return signs;
}

// ============================================================
// Build brake distance markers (100/200/300m)
// ============================================================
export function buildBrakeMarkers(track: TrackData): THREE.Mesh[] {
  const markers: THREE.Mesh[] = [];
  const hw = track.trackWidth / 2;
  
  // Find heavy braking zones (tight corners)
  const brakingZones: number[] = [];
  for (let i = 0; i < track.numSamples; i += 50) {
    if (track.curvatures[i] > 0.02) {
      brakingZones.push(i);
    }
  }
  
  brakingZones.forEach(cornerIdx => {
    [100, 200, 300].forEach(dist => {
      const arcPos = track.arcLengths[cornerIdx] - dist;
      if (arcPos < 0) return;
      
      const frac = arcPos / track.totalLength;
      const idx = Math.floor(frac * (track.numSamples - 1));
      
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${dist}`, 32, 32);
      
      const texture = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
      const geo = new THREE.PlaneGeometry(1.5, 1.5);
      const marker = new THREE.Mesh(geo, mat);
      
      marker.position.set(
        track.positions[idx * 3] + track.binormals[idx * 3] * (hw + 1.5),
        track.positions[idx * 3 + 1] + 1,
        track.positions[idx * 3 + 2] + track.binormals[idx * 3 + 2] * (hw + 1.5)
      );
      marker.lookAt(
        marker.position.x + track.tangents[idx * 3],
        marker.position.y,
        marker.position.z + track.tangents[idx * 3 + 2]
      );
      
      markers.push(marker);
    });
  });
  
  return markers;
}

// ============================================================
// Build corner number plates
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
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${idx + 1}`, 32, 32);
    
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(0.8, 0.8);
    const plate = new THREE.Mesh(geo, mat);
    
    const offset = hw + 0.8;
    plate.position.set(
      cp.pos.x - track.binormals[cp.index * 3] * offset,
      cp.pos.y + 0.8,
      cp.pos.z - track.binormals[cp.index * 3 + 2] * offset
    );
    
    plates.push(plate);
  });
  
  return plates;
}

// ============================================================
// Build procedural Renault Clio R.S. III
// ============================================================
export function buildCar(): { group: THREE.Group; body: THREE.Group; wheels: THREE.Mesh[] } {
  const group = new THREE.Group();
  const body = new THREE.Group();
  
  // Red paint material
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xcc1111,
    roughness: 0.3,
    metalness: 0.6,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.8,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x112244,
    roughness: 0.1,
    metalness: 0.9,
    transparent: true,
    opacity: 0.7,
  });
  
  // Main body (rounded box approximation)
  const mainBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 0.7, 3.9),
    bodyMat
  );
  mainBody.position.y = 0.55;
  body.add(mainBody);
  
  // Cabin (smaller box on top)
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.6, 2.0),
    bodyMat
  );
  cabin.position.set(0, 1.1, -0.2);
  body.add(cabin);
  
  // Windshield
  const windshield = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.6),
    glassMat
  );
  windshield.position.set(0, 1.1, 0.8);
  windshield.rotation.x = -0.3;
  body.add(windshield);
  
  // Rear window
  const rearWindow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.5),
    glassMat
  );
  rearWindow.position.set(0, 1.1, -1.2);
  rearWindow.rotation.x = 0.4;
  body.add(rearWindow);
  
  // Hood
  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 0.1, 1.2),
    bodyMat
  );
  hood.position.set(0, 0.95, 1.2);
  body.add(hood);
  
  // Front bumper
  const frontBumper = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.3, 0.3),
    darkMat
  );
  frontBumper.position.set(0, 0.35, 2.0);
  body.add(frontBumper);
  
  // Rear bumper
  const rearBumper = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.3, 0.3),
    darkMat
  );
  rearBumper.position.set(0, 0.35, -2.0);
  body.add(rearBumper);
  
  // Headlights
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.5 });
  const headlightL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), lightMat);
  headlightL.position.set(-0.65, 0.6, 1.95);
  body.add(headlightL);
  const headlightR = headlightL.clone();
  headlightR.position.set(0.65, 0.6, 1.95);
  body.add(headlightR);
  
  group.add(body);
  
  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.2, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });
  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.22, 8);
  
  const wheels: THREE.Mesh[] = [];
  const wheelPositions = [
    [-0.77, 0.31, 1.3],   // FL
    [0.77, 0.31, 1.3],    // FR
    [-0.75, 0.31, -1.2],  // RL
    [0.75, 0.31, -1.2],   // RR
  ];
  
  wheelPositions.forEach(([x, y, z]) => {
    const wheelGroup = new THREE.Group();
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheelGroup.add(wheel);
    
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.z = Math.PI / 2;
    wheelGroup.add(rim);
    
    wheelGroup.position.set(x, y, z);
    group.add(wheelGroup);
    wheels.push(wheelGroup as unknown as THREE.Mesh);
  });
  
  return { group, body, wheels };
}

// ============================================================
// Build mass visualization elements
// ============================================================
export function buildMassVisualization(): {
  wheelLoadBars: THREE.Mesh[];
  cogSphere: THREE.Mesh;
  cogTrail: THREE.Line;
} {
  // Wheel load bars (pyramids)
  const barGeo = new THREE.ConeGeometry(0.15, 1, 4);
  const barMat = new THREE.MeshStandardMaterial({
    color: 0x00ffcc,
    emissive: 0x00aa88,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.8,
  });
  
  const wheelLoadBars: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(barGeo, barMat.clone());
    wheelLoadBars.push(bar);
  }
  
  // CoG sphere
  const cogGeo = new THREE.SphereGeometry(0.2, 16, 16);
  const cogMat = new THREE.MeshStandardMaterial({
    color: 0xff6600,
    emissive: 0xff4400,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.6,
  });
  const cogSphere = new THREE.Mesh(cogGeo, cogMat);
  
  // CoG trail
  const trailPoints = new Float32Array(300); // 100 points * 3
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(trailPoints, 3));
  const trailMat = new THREE.LineBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.4 });
  const cogTrail = new THREE.Line(trailGeo, trailMat);
  
  return { wheelLoadBars, cogSphere, cogTrail };
}

// ============================================================
// Initialize the full scene
// ============================================================
export function initScene(
  container: HTMLElement,
  track: TrackData,
  sim: SimData
): SceneState {
  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);
  
  // Scene
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.00015);
  
  // Camera - position to see the track
  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 1, 50000);
  // Start position: look at first corner from above
  const startPos = new THREE.Vector3(
    track.positions[0],
    track.positions[1] + 150,
    track.positions[2] + 300
  );
  camera.position.copy(startPos);
  camera.lookAt(track.positions[0], track.positions[1], track.positions[2]);
  
  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxDistance = 5000;
  controls.minDistance = 2;
  // Set initial target to car starting position (first frame of sim)
  controls.target.set(sim.posX[0], sim.posY[0], sim.posZ[0]);
  
  // Lighting
  const ambient = new THREE.AmbientLight(0x334455, 0.6);
  scene.add(ambient);
  
  const dirLight = new THREE.DirectionalLight(0xeeeeff, 1.2);
  dirLight.position.set(500, 1000, 300);
  scene.add(dirLight);
  
  const pointLight = new THREE.PointLight(0x00ccff, 0.8, 3000);
  pointLight.position.set(0, 500, 0);
  scene.add(pointLight);
  
  // Car-following spotlight
  const carLight = new THREE.PointLight(0xffaa44, 0.6, 100);
  carLight.position.set(0, 10, 0);
  scene.add(carLight);
  
  // Background stars (particles)
  const starCount = 2000;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 30000;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 15000 + 2000;
    starPositions[i * 3 + 2] = (Math.random() - 0.5) * 30000;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0x446688, size: 2, transparent: true, opacity: 0.4 });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);
  
  // Grid (faint cyan) - positioned below the track
  const gridHelper = new THREE.GridHelper(15000, 150, 0x003333, 0x001a1a);
  gridHelper.position.y = 200; // Below the lowest track point
  (gridHelper.material as THREE.Material).transparent = true;
  (gridHelper.material as THREE.Material).opacity = 0.3;
  scene.add(gridHelper);
  
  // Track
  const { ribbon, curbs } = buildTrackMesh(track);
  scene.add(ribbon);
  curbs.forEach(c => scene.add(c));
  
  // Corner signs
  const cornerSigns = buildCornerSigns(track);
  cornerSigns.forEach(s => scene.add(s));
  
  // Brake markers
  const brakeMarkers = buildBrakeMarkers(track);
  brakeMarkers.forEach(m => scene.add(m));
  
  // Corner plates
  const cornerPlates = buildCornerPlates(track);
  cornerPlates.forEach(p => scene.add(p));
  
  // Car
  const { group: carGroup, body: bodyMesh, wheels: wheelMeshes } = buildCar();
  scene.add(carGroup);
  
  // Mass visualization
  const { wheelLoadBars, cogSphere, cogTrail } = buildMassVisualization();
  wheelLoadBars.forEach(b => scene.add(b));
  scene.add(cogSphere);
  scene.add(cogTrail);
  
  // Free-fly state
  const freeFlyState = { yaw: 0, pitch: 0, keys: new Set<string>() };
  
  return {
    renderer, scene, camera, controls,
    carGroup, bodyMesh: bodyMesh as unknown as THREE.Group, wheelMeshes: wheelMeshes as unknown as THREE.Mesh[],
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
    freeFlyState,
  };
}

// ============================================================
// Update scene per frame (interpolation only, no physics)
// ============================================================
export function updateScene(state: SceneState, time: number, visibility: {
  wheelLoads: boolean; cogSphere: boolean; bodyRoll: boolean;
}) {
  const data = interpSim(state.sim, time);
  
  // Position car
  state.carGroup.position.set(data.posX, data.posY, data.posZ);
  
  // Move car light with car
  state.carLight.position.set(data.posX, data.posY + 5, data.posZ);
  
  // Orient car along heading
  state.carGroup.rotation.set(data.pitchAngle * 0.02, data.heading, 0, 'YXZ');
  
  // Body roll/pitch relative to wheels
  if (visibility.bodyRoll) {
    state.bodyMesh.rotation.z = -data.rollAngle * Math.PI / 180 * 0.5;
    state.bodyMesh.rotation.x = data.pitchAngle * Math.PI / 180 * 0.3;
  } else {
    state.bodyMesh.rotation.z = 0;
    state.bodyMesh.rotation.x = 0;
  }
  
  // Wheel rotation (visual spin)
  const wheelSpin = data.speed * time * 0.5;
  state.wheelMeshes.forEach(w => {
    w.children[0].rotation.x = wheelSpin;
  });
  
  // CoG sphere position (inside body)
  state.cogSphere.position.set(data.posX, data.posY + 0.5, data.posZ);
  state.cogSphere.visible = visibility.cogSphere;
  
  // Update CoG trail
  if (visibility.cogSphere) {
    const trailPos = state.cogTrail.geometry.attributes.position as THREE.BufferAttribute;
    const arr = trailPos.array as Float32Array;
    // Shift trail
    for (let i = arr.length - 3; i >= 3; i -= 3) {
      arr[i] = arr[i - 3];
      arr[i + 1] = arr[i - 2];
      arr[i + 2] = arr[i - 1];
    }
    arr[0] = data.posX;
    arr[1] = data.posY + 0.5;
    arr[2] = data.posZ;
    trailPos.needsUpdate = true;
  }
  
  // Wheel load bars
  if (visibility.wheelLoads) {
    const wheelOffsets = [
      [-0.77, 0, 1.3],
      [0.77, 0, 1.3],
      [-0.75, 0, -1.2],
      [0.75, 0, -1.2],
    ];
    const loads = [data.wheelLoadFL, data.wheelLoadFR, data.wheelLoadRL, data.wheelLoadRR];
    const maxLoad = MASS * 9.81 * 0.4; // approximate max single wheel load
    
    state.wheelLoadBars.forEach((bar, i) => {
      const load = loads[i];
      const normalizedLoad = Math.min(load / maxLoad, 1.5);
      const height = normalizedLoad * 2;
      
      // Position relative to car
      _v1.set(wheelOffsets[i][0], 0, wheelOffsets[i][2]);
      _v1.applyQuaternion(state.carGroup.quaternion);
      _v1.add(state.carGroup.position);
      
      bar.position.set(_v1.x, _v1.y + height / 2, _v1.z);
      bar.scale.set(1, height, 1);
      bar.visible = true;
      
      // Color based on load
      const mat = bar.material as THREE.MeshStandardMaterial;
      if (normalizedLoad > 1.0) {
        mat.color.setHex(0xff3300);
        mat.emissive.setHex(0xaa2200);
      } else if (normalizedLoad > 0.7) {
        mat.color.setHex(0xffcc00);
        mat.emissive.setHex(0xaa8800);
      } else {
        mat.color.setHex(0x00ffcc);
        mat.emissive.setHex(0x00aa88);
      }
    });
  } else {
    state.wheelLoadBars.forEach(b => b.visible = false);
  }
  
  // Camera modes
  updateCamera(state, data);
}

const MASS = 1240;

function updateCamera(state: SceneState, data: ReturnType<typeof interpSim>) {
  const carPos = _v1.set(data.posX, data.posY, data.posZ);
  
  switch (state.cameraMode) {
    case 1: // Orbit chase
      state.controls.target.lerp(carPos, 0.1);
      break;
    case 2: { // Chase
      const behind = _v2.set(
        -Math.sin(data.heading) * 12,
        4,
        -Math.cos(data.heading) * 12
      ).add(carPos);
      state.camera.position.lerp(behind, 0.08);
      state.camera.lookAt(carPos);
      break;
    }
    case 3: { // Hood
      const hood = _v2.set(
        Math.sin(data.heading) * 1.5,
        1.3,
        Math.cos(data.heading) * 1.5
      ).add(carPos);
      state.camera.position.copy(hood);
      const lookAt = _v3.set(
        Math.sin(data.heading) * 50,
        data.posY + 1,
        Math.cos(data.heading) * 50
      );
      state.camera.lookAt(lookAt);
      break;
    }
    case 4: { // Top-down
      const top = _v2.set(carPos.x, carPos.y + 200, carPos.z);
      state.camera.position.lerp(top, 0.05);
      state.camera.lookAt(carPos);
      break;
    }
    case 5: { // TV cam at current corner
      // Find nearest corner
      let nearestCorner = state.track.cornerPositions[0];
      let minDist = Infinity;
      state.track.cornerPositions.forEach(cp => {
        const d = cp.pos.distanceTo(carPos);
        if (d < minDist) { minDist = d; nearestCorner = cp; }
      });
      const tvPos = _v2.set(
        nearestCorner.pos.x + nearestCorner.dir.z * 30,
        nearestCorner.pos.y + 15,
        nearestCorner.pos.z - nearestCorner.dir.x * 30
      );
      state.camera.position.lerp(tvPos, 0.05);
      state.camera.lookAt(carPos);
      break;
    }
    case 6: { // Free fly
      const spd = 2;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(state.camera.quaternion);
      if (state.freeFlyState.keys.has('w')) state.camera.position.addScaledVector(forward, spd);
      if (state.freeFlyState.keys.has('s')) state.camera.position.addScaledVector(forward, -spd);
      if (state.freeFlyState.keys.has('a')) state.camera.position.addScaledVector(right, -spd);
      if (state.freeFlyState.keys.has('d')) state.camera.position.addScaledVector(right, spd);
      break;
    }
  }
}

// ============================================================
// Resize handler
// ============================================================
export function resizeScene(state: SceneState, width: number, height: number) {
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(width, height);
}
