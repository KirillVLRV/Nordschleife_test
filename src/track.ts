// ============================================================
// SECTION: Track Geometry — Nordschleife Centerline + GPX
// ============================================================
import * as THREE from 'three';

export interface CornerSpec {
  name: string;
  character: string;
  radius: number;
  elevation: number;
  isNamed: boolean;
}

export const CORNER_SPECS: CornerSpec[] = [
  { name: 'Start/Finish', character: 'straight', radius: 470, elevation: 470, isNamed: true },
  { name: 'Hatzenbach', character: 'kink', radius: 70, elevation: 465, isNamed: true },
  { name: 'Quiddelbacher Höhe', character: 'right', radius: 100, elevation: 480, isNamed: true },
  { name: 'Flugplatz', character: 'crest', radius: 150, elevation: 500, isNamed: true },
  { name: 'Schwedenkreuz', character: 'right', radius: 120, elevation: 495, isNamed: true },
  { name: 'Fuchsröhre', character: 'left', radius: 100, elevation: 430, isNamed: true },
  { name: 'Adenauer Forst', character: 'left', radius: 70, elevation: 420, isNamed: true },
  { name: 'Metzgesfeld', character: 'right', radius: 60, elevation: 400, isNamed: true },
  { name: 'Kallenhard', character: 'left', radius: 40, elevation: 380, isNamed: true },
  { name: 'Wehrseifen', character: 'left', radius: 35, elevation: 350, isNamed: true },
  { name: 'Breidscheid', character: 'kink', radius: 60, elevation: 320, isNamed: true },
  { name: 'Ex-Mühle', character: 'left', radius: 50, elevation: 340, isNamed: true },
  { name: 'Bergwerk', character: 'right', radius: 35, elevation: 360, isNamed: true },
  { name: 'Kesselchen', character: 'right', radius: 60, elevation: 390, isNamed: true },
  { name: 'Klostertal', character: 'kink', radius: 50, elevation: 430, isNamed: true },
  { name: 'Caracciola-Karussell', character: 'left', radius: 40, elevation: 470, isNamed: true },
  { name: 'Hohe Acht', character: 'right', radius: 60, elevation: 617, isNamed: true },
  { name: 'Hedwigshöhe', character: 'right', radius: 120, elevation: 600, isNamed: true },
  { name: 'Wippermann', character: 'left', radius: 60, elevation: 580, isNamed: true },
  { name: 'Eschbach', character: 'right', radius: 50, elevation: 560, isNamed: true },
  { name: 'Brünnchen', character: 'right', radius: 60, elevation: 545, isNamed: true },
  { name: 'Pflanzgarten', character: 'kink', radius: 80, elevation: 550, isNamed: true },
  { name: 'Schwalbenschwanz', character: 'right', radius: 100, elevation: 540, isNamed: true },
  { name: 'Döttinger Höhe', character: 'straight', radius: 470, elevation: 510, isNamed: true },
  { name: 'Tiergarten', character: 'right', radius: 50, elevation: 500, isNamed: true },
  { name: 'Hohenrain', character: 'left', radius: 60, elevation: 490, isNamed: true },
  { name: 'Veedol-Schikane', character: 'chicane', radius: 30, elevation: 480, isNamed: true },
  { name: 'Finish', character: 'straight', radius: 470, elevation: 470, isNamed: true },
];

export interface TrackData {
  positions: Float32Array;
  tangents: Float32Array;
  normals: Float32Array;
  binormals: Float32Array;
  curvatures: Float32Array;
  elevations: Float32Array;
  arcLengths: Float32Array;
  totalLength: number;
  numSamples: number;
  cornerPositions: { name: string; index: number; fraction: number; pos: THREE.Vector3; dir: THREE.Vector3 }[];
  trackWidth: number;
  isGpx: boolean;
  bounds: { min: THREE.Vector3; max: THREE.Vector3; center: THREE.Vector3 };
}

export function buildBuiltInTrack(): TrackData {
  const NUM_SAMPLES = 4500;
  const TRACK_WIDTH = 9;
  const controlPoints: THREE.Vector3[] = [];
  const numCorners = CORNER_SPECS.length;

  // Build control points in XZ plane (Y = elevation)
  for (let i = 0; i < numCorners; i++) {
    const spec = CORNER_SPECS[i];
    const fraction = i / numCorners;
    const angle = fraction * Math.PI * 2;

    const a = 3200;
    const b = 1800;
    const wobble1 = 500 * Math.sin(angle * 3 + 0.5);
    const wobble2 = 300 * Math.cos(angle * 5 + 1.2);
    const wobble3 = 200 * Math.sin(angle * 7);
    const straightBoost = 600 * Math.exp(-Math.pow((fraction - 0.85) * 8, 2));
    const r = 1 + (wobble1 + wobble2 + wobble3 + straightBoost) / (a + b);

    const x = a * r * Math.cos(angle) + 350 * Math.sin(angle * 2.3);
    const z = b * r * Math.sin(angle) + 250 * Math.cos(angle * 3.1);

    controlPoints.push(new THREE.Vector3(x, spec.elevation, z));
  }

  const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.5);

  const positions = new Float32Array(NUM_SAMPLES * 3);
  const tangents = new Float32Array(NUM_SAMPLES * 3);
  const normals = new Float32Array(NUM_SAMPLES * 3);
  const binormals = new Float32Array(NUM_SAMPLES * 3);
  const curvatures = new Float32Array(NUM_SAMPLES);
  const elevations = new Float32Array(NUM_SAMPLES);
  const arcLengths = new Float32Array(NUM_SAMPLES);

  // Sample curve
  const rawPoints: THREE.Vector3[] = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / NUM_SAMPLES;
    rawPoints.push(curve.getPointAt(t));
  }

  // Arc lengths
  let totalLen = 0;
  arcLengths[0] = 0;
  for (let i = 1; i < NUM_SAMPLES; i++) {
    const dx = rawPoints[i].x - rawPoints[i - 1].x;
    const dy = rawPoints[i].y - rawPoints[i - 1].y;
    const dz = rawPoints[i].z - rawPoints[i - 1].z;
    totalLen += Math.sqrt(dx * dx + dy * dy + dz * dz);
    arcLengths[i] = totalLen;
  }

  // Scale to ~20.832 km
  const targetLength = 20832;
  const scale = targetLength / totalLen;

  for (let i = 0; i < NUM_SAMPLES; i++) {
    positions[i * 3] = rawPoints[i].x * scale;
    positions[i * 3 + 1] = rawPoints[i].y; // elevation stays in meters
    positions[i * 3 + 2] = rawPoints[i].z * scale;
    elevations[i] = rawPoints[i].y;
    arcLengths[i] *= scale;
  }
  totalLen = arcLengths[NUM_SAMPLES - 1];

  // Compute tangents
  const _tmp = new THREE.Vector3();
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const prev = (i - 1 + NUM_SAMPLES) % NUM_SAMPLES;
    const next = (i + 1) % NUM_SAMPLES;
    _tmp.set(
      positions[next * 3] - positions[prev * 3],
      positions[next * 3 + 1] - positions[prev * 3 + 1],
      positions[next * 3 + 2] - positions[prev * 3 + 2]
    ).normalize();
    tangents[i * 3] = _tmp.x;
    tangents[i * 3 + 1] = _tmp.y;
    tangents[i * 3 + 2] = _tmp.z;
  }

  // Compute binormals (horizontal perpendicular) and normals (up)
  const _up = new THREE.Vector3(0, 1, 0);
  const _tangent = new THREE.Vector3();
  const _normal = new THREE.Vector3();
  const _binormal = new THREE.Vector3();

  for (let i = 0; i < NUM_SAMPLES; i++) {
    _tangent.set(tangents[i * 3], tangents[i * 3 + 1], tangents[i * 3 + 2]);
    // binormal = tangent × up (gives horizontal perpendicular)
    _binormal.crossVectors(_tangent, _up).normalize();
    if (_binormal.lengthSq() < 0.001) {
      _binormal.set(1, 0, 0);
    }
    // normal = binormal × tangent (gives surface up)
    _normal.crossVectors(_binormal, _tangent).normalize();

    normals[i * 3] = _normal.x;
    normals[i * 3 + 1] = _normal.y;
    normals[i * 3 + 2] = _normal.z;
    binormals[i * 3] = _binormal.x;
    binormals[i * 3 + 1] = _binormal.y;
    binormals[i * 3 + 2] = _binormal.z;
  }

  // Compute curvatures
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const prev = (i - 1 + NUM_SAMPLES) % NUM_SAMPLES;
    const next = (i + 1) % NUM_SAMPLES;
    const ds = arcLengths[next] - arcLengths[prev];
    if (ds > 0.01) {
      const dtx = (tangents[next * 3] - tangents[prev * 3]) / ds;
      const dty = (tangents[next * 3 + 1] - tangents[prev * 3 + 1]) / ds;
      const dtz = (tangents[next * 3 + 2] - tangents[prev * 3 + 2]) / ds;
      const curvature = Math.sqrt(dtx * dtx + dty * dty + dtz * dtz);
      curvatures[i] = Math.min(curvature, 1 / 20);
    }
  }

  // Corner positions
  const cornerPositions = CORNER_SPECS.map((spec, idx) => {
    const fraction = idx / (CORNER_SPECS.length - 1);
    const sampleIdx = Math.floor(fraction * (NUM_SAMPLES - 1));
    return {
      name: spec.name,
      index: sampleIdx,
      fraction,
      pos: new THREE.Vector3(
        positions[sampleIdx * 3],
        positions[sampleIdx * 3 + 1],
        positions[sampleIdx * 3 + 2]
      ),
      dir: new THREE.Vector3(
        tangents[sampleIdx * 3],
        tangents[sampleIdx * 3 + 1],
        tangents[sampleIdx * 3 + 2]
      )
    };
  });

  // Compute bounds
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    min.x = Math.min(min.x, positions[i * 3]);
    min.y = Math.min(min.y, positions[i * 3 + 1]);
    min.z = Math.min(min.z, positions[i * 3 + 2]);
    max.x = Math.max(max.x, positions[i * 3]);
    max.y = Math.max(max.y, positions[i * 3 + 1]);
    max.z = Math.max(max.z, positions[i * 3 + 2]);
  }
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);

  console.log(`[Track] Built-in Nordschleife: length=${(totalLen/1000).toFixed(2)} km, samples=${NUM_SAMPLES}`);
  console.log(`[Track] Bounds: min=(${min.x.toFixed(0)},${min.y.toFixed(0)},${min.z.toFixed(0)}) max=(${max.x.toFixed(0)},${max.y.toFixed(0)},${max.z.toFixed(0)})`);

  return {
    positions, tangents, normals, binormals, curvatures, elevations, arcLengths,
    totalLength: totalLen, numSamples: NUM_SAMPLES, cornerPositions,
    trackWidth: TRACK_WIDTH, isGpx: false,
    bounds: { min, max, center }
  };
}

// Parse GPX
export function parseGpx(xmlText: string, builtIn: TrackData): { track: TrackData; pointCount: number; lengthKm: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const trkpts = doc.querySelectorAll('trkpt');
  if (trkpts.length < 10) throw new Error('GPX has too few points');

  const rawPoints: { lat: number; lon: number; ele: number }[] = [];
  trkpts.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat') || '0');
    const lon = parseFloat(pt.getAttribute('lon') || '0');
    const eleEl = pt.querySelector('ele');
    const ele = eleEl ? parseFloat(eleEl.textContent || '0') : 0;
    rawPoints.push({ lat, lon, ele });
  });

  let cLat = 0, cLon = 0;
  rawPoints.forEach(p => { cLat += p.lat; cLon += p.lon; });
  cLat /= rawPoints.length;
  cLon /= rawPoints.length;
  const cosLat = Math.cos(cLat * Math.PI / 180);
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * cosLat;

  const localPoints: THREE.Vector3[] = [];
  let hasEle = false;
  rawPoints.forEach(p => {
    const x = (p.lon - cLon) * mPerDegLon;
    const z = -(p.lat - cLat) * mPerDegLat;
    const y = p.ele;
    if (Math.abs(p.ele) > 1) hasEle = true;
    localPoints.push(new THREE.Vector3(x, y, z));
  });

  if (!hasEle) {
    const n = localPoints.length;
    for (let i = 0; i < n; i++) {
      const frac = i / (n - 1);
      const srcIdx = Math.floor(frac * (builtIn.numSamples - 1));
      localPoints[i].y = builtIn.elevations[srcIdx];
    }
  }

  const curve = new THREE.CatmullRomCurve3(localPoints, true, 'catmullrom', 0.5);
  const NUM_SAMPLES = Math.max(4000, rawPoints.length * 3);
  const positions = new Float32Array(NUM_SAMPLES * 3);
  const tangents = new Float32Array(NUM_SAMPLES * 3);
  const normals = new Float32Array(NUM_SAMPLES * 3);
  const binormals = new Float32Array(NUM_SAMPLES * 3);
  const curvatures = new Float32Array(NUM_SAMPLES);
  const elevations = new Float32Array(NUM_SAMPLES);
  const arcLengths = new Float32Array(NUM_SAMPLES);

  let totalLen = 0;
  arcLengths[0] = 0;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / NUM_SAMPLES;
    const p = curve.getPointAt(t);
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
    elevations[i] = p.y;
    if (i > 0) {
      const dx = p.x - positions[(i - 1) * 3];
      const dy = p.y - positions[(i - 1) * 3 + 1];
      const dz = p.z - positions[(i - 1) * 3 + 2];
      totalLen += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    arcLengths[i] = totalLen;
  }

  const _up = new THREE.Vector3(0, 1, 0);
  const _tangent = new THREE.Vector3();
  const _normal = new THREE.Vector3();
  const _binormal = new THREE.Vector3();

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const prev = (i - 1 + NUM_SAMPLES) % NUM_SAMPLES;
    const next = (i + 1) % NUM_SAMPLES;
    _tangent.set(
      positions[next * 3] - positions[prev * 3],
      positions[next * 3 + 1] - positions[prev * 3 + 1],
      positions[next * 3 + 2] - positions[prev * 3 + 2]
    ).normalize();
    tangents[i * 3] = _tangent.x;
    tangents[i * 3 + 1] = _tangent.y;
    tangents[i * 3 + 2] = _tangent.z;
    _binormal.crossVectors(_tangent, _up).normalize();
    if (_binormal.lengthSq() < 0.001) _binormal.set(1, 0, 0);
    _normal.crossVectors(_binormal, _tangent).normalize();
    normals[i * 3] = _normal.x;
    normals[i * 3 + 1] = _normal.y;
    normals[i * 3 + 2] = _normal.z;
    binormals[i * 3] = _binormal.x;
    binormals[i * 3 + 1] = _binormal.y;
    binormals[i * 3 + 2] = _binormal.z;
  }

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const prev = (i - 1 + NUM_SAMPLES) % NUM_SAMPLES;
    const next = (i + 1) % NUM_SAMPLES;
    const ds = arcLengths[next] - arcLengths[prev];
    if (ds > 0.001) {
      const dtx = (tangents[next * 3] - tangents[prev * 3]) / ds;
      const dty = (tangents[next * 3 + 1] - tangents[prev * 3 + 1]) / ds;
      const dtz = (tangents[next * 3 + 2] - tangents[prev * 3 + 2]) / ds;
      curvatures[i] = Math.min(Math.sqrt(dtx * dtx + dty * dty + dtz * dtz), 1 / 20);
    }
  }

  const cornerPositions = CORNER_SPECS.map((spec, idx) => {
    const fraction = idx / (CORNER_SPECS.length - 1);
    const sampleIdx = Math.floor(fraction * (NUM_SAMPLES - 1));
    return {
      name: spec.name, index: sampleIdx, fraction,
      pos: new THREE.Vector3(positions[sampleIdx * 3], positions[sampleIdx * 3 + 1], positions[sampleIdx * 3 + 2]),
      dir: new THREE.Vector3(tangents[sampleIdx * 3], tangents[sampleIdx * 3 + 1], tangents[sampleIdx * 3 + 2])
    };
  });

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    min.x = Math.min(min.x, positions[i * 3]);
    min.y = Math.min(min.y, positions[i * 3 + 1]);
    min.z = Math.min(min.z, positions[i * 3 + 2]);
    max.x = Math.max(max.x, positions[i * 3]);
    max.y = Math.max(max.y, positions[i * 3 + 1]);
    max.z = Math.max(max.z, positions[i * 3 + 2]);
  }
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);

  const track: TrackData = {
    positions, tangents, normals, binormals, curvatures, elevations, arcLengths,
    totalLength: totalLen, numSamples: NUM_SAMPLES, cornerPositions,
    trackWidth: 9, isGpx: true, bounds: { min, max, center }
  };
  return { track, pointCount: rawPoints.length, lengthKm: totalLen / 1000 };
}
