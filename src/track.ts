// ============================================================
// SECTION: Track Geometry — Nordschleife Centerline, GPX, Racing Line
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

// Known slow corners where <45 km/h is expected
export const SLOW_CORNERS = ['Caracciola-Karussell', 'Bergwerk', 'Wehrseifen', 'Kallenhard', 'Veedol-Schikane', 'Ex-Mühle'];

export interface TrackData {
  positions: Float32Array;
  tangents: Float32Array;
  normals: Float32Array;
  binormals: Float32Array;
  curvatures: Float32Array;
  racingCurvatures: Float32Array; // curvature of racing line
  elevations: Float32Array;
  arcLengths: Float32Array;
  totalLength: number;
  numSamples: number;
  cornerPositions: { name: string; index: number; fraction: number; pos: THREE.Vector3; dir: THREE.Vector3 }[];
  trackWidth: number;
  isGpx: boolean;
  bounds: { min: THREE.Vector3; max: THREE.Vector3; center: THREE.Vector3 };
  // Racing line data
  racingLineOffsets: Float32Array; // lateral offset from centerline per sample
  racingLinePositions: Float32Array; // xyz of racing line
  // Driver line data (humanized racing line)
  driverLineOffsets: Float32Array; // lateral offset with driver variations
  driverLinePositions: Float32Array; // xyz of driver line
  driverCurvatures: Float32Array; // curvature of driver line
}

// ============================================================
// GPX Sanitization: drop duplicates, smooth, resample
// ============================================================
function sanitizeGpxPoints(raw: { lat: number; lon: number; ele: number }[]): { lat: number; lon: number; ele: number }[] {
  // Drop duplicates and outliers
  const filtered: { lat: number; lon: number; ele: number }[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const dlat = raw[i].lat - raw[i - 1].lat;
    const dlon = raw[i].lon - raw[i - 1].lon;
    const dist = Math.sqrt(dlat * dlat + dlon * dlon);
    // Drop if duplicate (< 0.0000001 deg ~ 0.01m) or huge jump (> 0.01 deg ~ 1km)
    if (dist > 0.0000001 && dist < 0.01) {
      filtered.push(raw[i]);
    }
  }
  console.log(`[GPX] Sanitized: ${raw.length} → ${filtered.length} points`);
  return filtered;
}

// Moving average smoothing (horizontal only, preserve elevation)
function smoothPoints(pts: { lat: number; lon: number; ele: number }[], windowM: number, mPerDeg: number): { lat: number; lon: number; ele: number }[] {
  const n = pts.length;
  const windowPts = Math.max(3, Math.round(windowM / mPerDeg * 111320));
  const halfW = Math.floor(windowPts / 2);
  const out: { lat: number; lon: number; ele: number }[] = [];
  for (let i = 0; i < n; i++) {
    let sumLat = 0, sumLon = 0, count = 0;
    for (let j = Math.max(0, i - halfW); j <= Math.min(n - 1, i + halfW); j++) {
      sumLat += pts[j].lat;
      sumLon += pts[j].lon;
      count++;
    }
    out.push({ lat: sumLat / count, lon: sumLon / count, ele: pts[i].ele });
  }
  return out;
}

// Uniform resample by arc length
function resampleUniform(pts: { lat: number; lon: number; ele: number }[], stepM: number, mPerDegLat: number, mPerDegLon: number): { lat: number; lon: number; ele: number }[] {
  // Compute cumulative arc length
  const arcLen: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = (pts[i].lon - pts[i - 1].lon) * mPerDegLon;
    const dz = (pts[i].lat - pts[i - 1].lat) * mPerDegLat;
    arcLen.push(arcLen[i - 1] + Math.sqrt(dx * dx + dz * dz));
  }
  const totalLen = arcLen[arcLen.length - 1];
  const numOut = Math.max(100, Math.floor(totalLen / stepM));
  const out: { lat: number; lon: number; ele: number }[] = [];

  for (let i = 0; i < numOut; i++) {
    const targetArc = (i / (numOut - 1)) * totalLen;
    // Find segment
    let seg = 0;
    for (let j = 1; j < arcLen.length; j++) {
      if (arcLen[j] >= targetArc) { seg = j - 1; break; }
    }
    const segLen = arcLen[seg + 1] - arcLen[seg];
    const t = segLen > 0 ? (targetArc - arcLen[seg]) / segLen : 0;
    out.push({
      lat: pts[seg].lat * (1 - t) + pts[seg + 1].lat * t,
      lon: pts[seg].lon * (1 - t) + pts[seg + 1].lon * t,
      ele: pts[seg].ele * (1 - t) + pts[seg + 1].ele * t,
    });
  }
  return out;
}

// ============================================================
// Racing Line: minimum-curvature path inside corridor
// Simplified iterative smoothing (TUM-style approach)
// ============================================================
function computeRacingLine(
  centerPts: Float32Array, // xyz per sample
  numSamples: number,
  trackHalfWidth: number,
  curvatures: Float32Array
): { offsets: Float32Array; positions: Float32Array; racingCurvatures: Float32Array } {
  const corridor = Math.min(4.0, trackHalfWidth - 0.5); // max 4m offset
  const offsets = new Float32Array(numSamples); // lateral offset
  const positions = new Float32Array(numSamples * 3);
  const racingCurvatures = new Float32Array(numSamples);

  // Compute binormals for offset direction
  const binormals = new Float32Array(numSamples * 3);
  const tangents = new Float32Array(numSamples * 3);

  for (let i = 0; i < numSamples; i++) {
    const prev = (i - 1 + numSamples) % numSamples;
    const next = (i + 1) % numSamples;
    const tx = centerPts[next * 3] - centerPts[prev * 3];
    const ty = centerPts[next * 3 + 1] - centerPts[prev * 3 + 1];
    const tz = centerPts[next * 3 + 2] - centerPts[prev * 3 + 2];
    const len = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    tangents[i * 3] = tx / len;
    tangents[i * 3 + 1] = ty / len;
    tangents[i * 3 + 2] = tz / len;
    // Binormal = tangent × up
    const bx = tz / len;
    const bz = -tx / len;
    const blen = Math.sqrt(bx * bx + bz * bz) || 1;
    binormals[i * 3] = bx / blen;
    binormals[i * 3 + 1] = 0;
    binormals[i * 3 + 2] = bz / blen;
  }

  // Initial guess: offset to outside of each curve (late apex strategy)
  for (let i = 0; i < numSamples; i++) {
    const curv = curvatures[i];
    if (curv > 0.005) {
      // Determine curve direction from tangent cross product
      const prev = (i - 5 + numSamples) % numSamples;
      const next = (i + 5) % numSamples;
      const cross = tangents[prev * 3] * tangents[next * 3 + 2] - tangents[prev * 3 + 2] * tangents[next * 3];
      // Offset to outside: opposite of curve direction
      offsets[i] = -Math.sign(cross) * Math.min(corridor, curv * 80);
    }
  }

  // Iterative smoothing: minimize curvature while staying in corridor
  for (let iter = 0; iter < 30; iter++) {
    const newOffsets = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const prev = (i - 1 + numSamples) % numSamples;
      const next = (i + 1) % numSamples;
      // Smooth: average of neighbors, weighted toward zero (center)
      const avg = (offsets[prev] + offsets[next]) * 0.5;
      // Blend toward average with center bias
      newOffsets[i] = avg * 0.7 + offsets[i] * 0.3;
      // Clamp to corridor
      newOffsets[i] = Math.max(-corridor, Math.min(corridor, newOffsets[i]));
    }
    offsets.set(newOffsets);
  }

  // Compute racing line positions and curvatures
  for (let i = 0; i < numSamples; i++) {
    positions[i * 3] = centerPts[i * 3] + binormals[i * 3] * offsets[i];
    positions[i * 3 + 1] = centerPts[i * 3 + 1];
    positions[i * 3 + 2] = centerPts[i * 3 + 2] + binormals[i * 3 + 2] * offsets[i];
  }

  // Compute racing line curvature (sliding chord ~25m)
  const chordSamples = Math.max(3, Math.round(25 / (centerPts[3] - centerPts[0] || 5)));
  for (let i = 0; i < numSamples; i++) {
    const prev = (i - chordSamples + numSamples) % numSamples;
    const next = (i + chordSamples) % numSamples;
    // Curvature from 3-point circle
    const ax = positions[prev * 3], ay = positions[prev * 3 + 1], az = positions[prev * 3 + 2];
    const bx = positions[i * 3], by = positions[i * 3 + 1], bz = positions[i * 3 + 2];
    const cx = positions[next * 3], cy = positions[next * 3 + 1], cz = positions[next * 3 + 2];
    // 2D curvature in XZ plane
    const d1x = bx - ax, d1z = bz - az;
    const d2x = cx - bx, d2z = cz - bz;
    const cross = d1x * d2z - d1z * d2x;
    const l1 = Math.sqrt(d1x * d1x + d1z * d1z) || 1;
    const l2 = Math.sqrt(d2x * d2x + d2z * d2z) || 1;
    const l3x = cx - ax, l3z = cz - az;
    const l3 = Math.sqrt(l3x * l3x + l3z * l3z) || 1;
    const curvature = Math.abs(2 * cross / (l1 * l2 * l3));
    racingCurvatures[i] = Math.min(curvature, 1 / 15); // clamp
  }

  return { offsets, positions, racingCurvatures };
}

// ============================================================
// Driver Model v2: Humanized racing line with variations
// ============================================================
function computeDriverLine(
  racingLineOffsets: Float32Array,
  racingLinePositions: Float32Array,
  centerPts: Float32Array,
  numSamples: number,
  trackHalfWidth: number,
  cornerPositions: { name: string; index: number; fraction: number }[]
): { offsets: Float32Array; positions: Float32Array; curvatures: Float32Array } {
  const offsets = new Float32Array(numSamples);
  const positions = new Float32Array(numSamples * 3);
  const curvatures = new Float32Array(numSamples);
  
  // Seeded pseudo-random number generator (deterministic)
  let seed = 12345;
  function seededRandom() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }
  
  // Generate smoothed pseudo-random lateral offset (amplitude 0.25m, wavelength 40-80m)
  const randomOffsets = new Float32Array(numSamples);
  const sampleSpacing = centerPts[3] - centerPts[0] || 5; // approximate meters per sample
  
  for (let i = 0; i < numSamples; i++) {
    // Wavelength varies between 40-80m
    const wavelength = 40 + seededRandom() * 40;
    const samplesPerWave = wavelength / sampleSpacing;
    
    // Generate smooth sinusoidal variation
    const phase = (i / samplesPerWave) * Math.PI * 2;
    const amplitude = 0.25; // meters
    randomOffsets[i] = Math.sin(phase + seededRandom() * Math.PI * 2) * amplitude;
  }
  
  // Smooth the random offsets with moving average
  const smoothWindow = Math.max(3, Math.round(15 / sampleSpacing)); // 15m window
  for (let i = 0; i < numSamples; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - smoothWindow); j <= Math.min(numSamples - 1, i + smoothWindow); j++) {
      sum += randomOffsets[j];
      count++;
    }
    randomOffsets[i] = sum / count;
  }
  
  // Per-corner apex bias: +0.3m late apex at corners exiting onto long straights
  // Identify corners before Döttinger Höhe and after Schwedenkreuz
  const lateApexCorners = ['Schwedenkreuz', 'Hatzenbach']; // corners before long straights
  const maxApexOffset = trackHalfWidth - 0.5; // clamp within track edges
  
  for (let i = 0; i < numSamples; i++) {
    // Start with racing line offset
    let driverOffset = racingLineOffsets[i];
    
    // Add pseudo-random variation
    driverOffset += randomOffsets[i];
    
    // Apply late apex bias near specific corners
    for (const corner of cornerPositions) {
      if (lateApexCorners.includes(corner.name)) {
        const cornerIdx = corner.index;
        // Apply bias in a window around the corner exit (±50 samples ≈ ±250m)
        const distFromCorner = Math.abs(i - cornerIdx);
        if (distFromCorner < 50 && i > cornerIdx) {
          // Late apex: offset toward outside of corner
          const curvature = Math.abs(racingLineOffsets[i] - racingLineOffsets[Math.max(0, i - 5)]);
          if (curvature > 0.1) {
            const bias = 0.3 * (1 - distFromCorner / 50); // fade out over distance
            driverOffset += Math.sign(racingLineOffsets[i]) * bias;
          }
        }
      }
    }
    
    // Clamp within track edges minus 0.5m
    driverOffset = Math.max(-maxApexOffset, Math.min(maxApexOffset, driverOffset));
    
    offsets[i] = driverOffset;
  }
  
  // Compute driver line positions
  // Need to compute binormals for offset direction
  const binormals = new Float32Array(numSamples * 3);
  const tangents = new Float32Array(numSamples * 3);
  
  for (let i = 0; i < numSamples; i++) {
    const prev = (i - 1 + numSamples) % numSamples;
    const next = (i + 1) % numSamples;
    const tx = centerPts[next * 3] - centerPts[prev * 3];
    const ty = centerPts[next * 3 + 1] - centerPts[prev * 3 + 1];
    const tz = centerPts[next * 3 + 2] - centerPts[prev * 3 + 2];
    const len = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    tangents[i * 3] = tx / len;
    tangents[i * 3 + 1] = ty / len;
    tangents[i * 3 + 2] = tz / len;
    // Binormal = tangent × up
    const bx = tz / len;
    const bz = -tx / len;
    const blen = Math.sqrt(bx * bx + bz * bz) || 1;
    binormals[i * 3] = bx / blen;
    binormals[i * 3 + 1] = 0;
    binormals[i * 3 + 2] = bz / blen;
  }
  
  for (let i = 0; i < numSamples; i++) {
    positions[i * 3] = centerPts[i * 3] + binormals[i * 3] * offsets[i];
    positions[i * 3 + 1] = centerPts[i * 3 + 1];
    positions[i * 3 + 2] = centerPts[i * 3 + 2] + binormals[i * 3 + 2] * offsets[i];
  }
  
  // Compute driver line curvature (sliding chord ~25m)
  const chordSamples = Math.max(3, Math.round(25 / (centerPts[3] - centerPts[0] || 5)));
  for (let i = 0; i < numSamples; i++) {
    const prev = (i - chordSamples + numSamples) % numSamples;
    const next = (i + chordSamples) % numSamples;
    // Curvature from 3-point circle
    const ax = positions[prev * 3], az = positions[prev * 3 + 2];
    const bx = positions[i * 3], bz = positions[i * 3 + 2];
    const cx = positions[next * 3], cz = positions[next * 3 + 2];
    // 2D curvature in XZ plane
    const d1x = bx - ax, d1z = bz - az;
    const d2x = cx - bx, d2z = cz - bz;
    const cross = d1x * d2z - d1z * d2x;
    const l1 = Math.sqrt(d1x * d1x + d1z * d1z) || 1;
    const l2 = Math.sqrt(d2x * d2x + d2z * d2z) || 1;
    const l3x = cx - ax, l3z = cz - az;
    const l3 = Math.sqrt(l3x * l3x + l3z * l3z) || 1;
    const curvature = Math.abs(2 * cross / (l1 * l2 * l3));
    curvatures[i] = Math.min(curvature, 1 / 15); // clamp
  }
  
  // Calculate RMS offset from racing line
  let sumSqDiff = 0;
  for (let i = 0; i < numSamples; i++) {
    const diff = offsets[i] - racingLineOffsets[i];
    sumSqDiff += diff * diff;
  }
  const rmsOffset = Math.sqrt(sumSqDiff / numSamples);
  console.log(`[Driver] RMS offset from racing line: ${rmsOffset.toFixed(3)}m`);
  
  return { offsets, positions, curvatures };
}

// ============================================================
// Build from raw 3D points (used by both built-in and GPX)
// ============================================================
function buildFromPoints(rawPoints: THREE.Vector3[], targetLength: number | null, isGpx: boolean): TrackData {
  const NUM_SAMPLES = 4500;
  const TRACK_WIDTH = 9;

  const curve = new THREE.CatmullRomCurve3(rawPoints, true, 'catmullrom', 0.5);

  const positions = new Float32Array(NUM_SAMPLES * 3);
  const tangents = new Float32Array(NUM_SAMPLES * 3);
  const normals = new Float32Array(NUM_SAMPLES * 3);
  const binormals = new Float32Array(NUM_SAMPLES * 3);
  const curvatures = new Float32Array(NUM_SAMPLES);
  const elevations = new Float32Array(NUM_SAMPLES);
  const arcLengths = new Float32Array(NUM_SAMPLES);

  // Sample curve
  const sampled: THREE.Vector3[] = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    sampled.push(curve.getPointAt(i / NUM_SAMPLES));
  }

  // Arc lengths
  let totalLen = 0;
  arcLengths[0] = 0;
  for (let i = 1; i < NUM_SAMPLES; i++) {
    const dx = sampled[i].x - sampled[i - 1].x;
    const dy = sampled[i].y - sampled[i - 1].y;
    const dz = sampled[i].z - sampled[i - 1].z;
    totalLen += Math.sqrt(dx * dx + dy * dy + dz * dz);
    arcLengths[i] = totalLen;
  }

  // Scale if target length given
  let scale = 1;
  if (targetLength) {
    scale = targetLength / totalLen;
  }

  for (let i = 0; i < NUM_SAMPLES; i++) {
    positions[i * 3] = sampled[i].x * scale;
    positions[i * 3 + 1] = sampled[i].y; // elevation stays in meters
    positions[i * 3 + 2] = sampled[i].z * scale;
    elevations[i] = sampled[i].y;
    arcLengths[i] *= scale;
  }
  totalLen = arcLengths[NUM_SAMPLES - 1];

  // Tangents
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

  // Binormals (horizontal perpendicular) and normals
  const _up = new THREE.Vector3(0, 1, 0);
  const _tangent = new THREE.Vector3();
  const _normal = new THREE.Vector3();
  const _binormal = new THREE.Vector3();

  for (let i = 0; i < NUM_SAMPLES; i++) {
    _tangent.set(tangents[i * 3], tangents[i * 3 + 1], tangents[i * 3 + 2]);
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

  // Curvatures (sliding chord ~25m)
  const chordSamples = Math.max(3, Math.round(25 / (totalLen / NUM_SAMPLES)));
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const prev = (i - chordSamples + NUM_SAMPLES) % NUM_SAMPLES;
    const next = (i + chordSamples) % NUM_SAMPLES;
    const ax = positions[prev * 3], az = positions[prev * 3 + 2];
    const bx = positions[i * 3], bz = positions[i * 3 + 2];
    const cx = positions[next * 3], cz = positions[next * 3 + 2];
    const d1x = bx - ax, d1z = bz - az;
    const d2x = cx - bx, d2z = cz - bz;
    const cross = d1x * d2z - d1z * d2x;
    const l1 = Math.sqrt(d1x * d1x + d1z * d1z) || 1;
    const l2 = Math.sqrt(d2x * d2x + d2z * d2z) || 1;
    const l3x = cx - ax, l3z = cz - az;
    const l3 = Math.sqrt(l3x * l3x + l3z * l3z) || 1;
    const curvature = Math.abs(2 * cross / (l1 * l2 * l3));
    curvatures[i] = Math.min(curvature, 1 / 15);
  }

  // Compute racing line
  const { offsets: racingLineOffsets, positions: racingLinePositions, racingCurvatures } =
    computeRacingLine(positions, NUM_SAMPLES, TRACK_WIDTH / 2, curvatures);

  // Log curvature stats
  let minRadiusBefore = Infinity, minRadiusAfter = Infinity;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    if (curvatures[i] > 0.001) {
      const r = 1 / curvatures[i];
      if (r < minRadiusBefore) minRadiusBefore = r;
    }
    if (racingCurvatures[i] > 0.001) {
      const r = 1 / racingCurvatures[i];
      if (r < minRadiusAfter) minRadiusAfter = r;
    }
  }
  console.log(`[Track] Min radius before racing line: ${minRadiusBefore.toFixed(1)}m, after: ${minRadiusAfter.toFixed(1)}m`);

  // Corner positions
  const cornerPositions = CORNER_SPECS.map((spec, idx) => {
    const fraction = idx / (CORNER_SPECS.length - 1);
    const sampleIdx = Math.floor(fraction * (NUM_SAMPLES - 1));
    return {
      name: spec.name, index: sampleIdx, fraction,
      pos: new THREE.Vector3(positions[sampleIdx * 3], positions[sampleIdx * 3 + 1], positions[sampleIdx * 3 + 2]),
      dir: new THREE.Vector3(tangents[sampleIdx * 3], tangents[sampleIdx * 3 + 1], tangents[sampleIdx * 3 + 2])
    };
  });

  // Bounds
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

  // Compute driver line (humanized racing line)
  const { offsets: driverLineOffsets, positions: driverLinePositions, curvatures: driverCurvatures } = computeDriverLine(
    racingLineOffsets,
    racingLinePositions,
    positions,
    NUM_SAMPLES,
    TRACK_WIDTH / 2,
    cornerPositions
  );

  console.log(`[Track] ${isGpx ? 'GPX' : 'Built-in'}: length=${(totalLen / 1000).toFixed(2)} km, samples=${NUM_SAMPLES}`);

  return {
    positions, tangents, normals, binormals, curvatures, racingCurvatures,
    elevations, arcLengths,
    totalLength: totalLen, numSamples: NUM_SAMPLES, cornerPositions,
    trackWidth: TRACK_WIDTH, isGpx,
    bounds: { min, max, center },
    racingLineOffsets, racingLinePositions,
    driverLineOffsets, driverLinePositions, driverCurvatures,
  };
}

// ============================================================
// Build built-in track
// ============================================================
export function buildBuiltInTrack(): TrackData {
  const controlPoints: THREE.Vector3[] = [];
  const numCorners = CORNER_SPECS.length;

  for (let i = 0; i < numCorners; i++) {
    const spec = CORNER_SPECS[i];
    const fraction = i / numCorners;
    const angle = fraction * Math.PI * 2;
    const a = 3200, b = 1800;
    const wobble1 = 500 * Math.sin(angle * 3 + 0.5);
    const wobble2 = 300 * Math.cos(angle * 5 + 1.2);
    const wobble3 = 200 * Math.sin(angle * 7);
    const straightBoost = 600 * Math.exp(-Math.pow((fraction - 0.85) * 8, 2));
    const r = 1 + (wobble1 + wobble2 + wobble3 + straightBoost) / (a + b);
    const x = a * r * Math.cos(angle) + 350 * Math.sin(angle * 2.3);
    const z = b * r * Math.sin(angle) + 250 * Math.cos(angle * 3.1);
    controlPoints.push(new THREE.Vector3(x, spec.elevation, z));
  }

  return buildFromPoints(controlPoints, 20832, false);
}

// ============================================================
// Parse GPX with full sanitization pipeline
// ============================================================
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

  // Centroid
  let cLat = 0, cLon = 0;
  rawPoints.forEach(p => { cLat += p.lat; cLon += p.lon; });
  cLat /= rawPoints.length;
  cLon /= rawPoints.length;
  const cosLat = Math.cos(cLat * Math.PI / 180);
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * cosLat;

  // Pipeline: sanitize → smooth → resample
  const sanitized = sanitizeGpxPoints(rawPoints);
  const smoothed = smoothPoints(sanitized, 15, mPerDegLat); // 15m window
  const resampled = resampleUniform(smoothed, 3, mPerDegLat, mPerDegLon); // 3m step

  let hasEle = false;
  rawPoints.forEach(p => { if (Math.abs(p.ele) > 1) hasEle = true; });

  // Convert to local meters
  const localPoints: THREE.Vector3[] = resampled.map(p => {
    const x = (p.lon - cLon) * mPerDegLon;
    const z = -(p.lat - cLat) * mPerDegLat;
    const y = hasEle ? p.ele : 0;
    return new THREE.Vector3(x, y, z);
  });

  // If no elevation, use built-in profile stretched
  if (!hasEle) {
    const n = localPoints.length;
    for (let i = 0; i < n; i++) {
      const frac = i / (n - 1);
      const srcIdx = Math.floor(frac * (builtIn.numSamples - 1));
      localPoints[i].y = builtIn.elevations[srcIdx];
    }
  }

  const track = buildFromPoints(localPoints, null, true);
  return { track, pointCount: rawPoints.length, lengthKm: track.totalLength / 1000 };
}
