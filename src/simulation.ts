// ============================================================
// SECTION: Deterministic Precomputed Simulation
// Renault Clio R.S. III: 1240kg, CoG 0.50m, 61/39 F/R, FWD, ~148kW
// ============================================================
import { TrackData } from './track';

export interface SimData {
  numFrames: number;
  dt: number;
  totalTime: number;
  // Typed arrays - one entry per frame
  t: Float32Array;           // time
  s: Float32Array;           // arc-length position
  posX: Float32Array;
  posY: Float32Array;
  posZ: Float32Array;
  heading: Float32Array;     // yaw
  pitch: Float32Array;       // road pitch angle
  speed: Float32Array;       // m/s
  gear: Float32Array;        // 1-6
  rpm: Float32Array;
  throttle: Float32Array;    // 0-1
  brake: Float32Array;       // 0-1
  aLat: Float32Array;        // lateral acceleration m/s²
  aLong: Float32Array;       // longitudinal acceleration m/s²
  wheelLoadFL: Float32Array; // front-left load N
  wheelLoadFR: Float32Array; // front-right load N
  wheelLoadRL: Float32Array; // rear-left load N
  wheelLoadRR: Float32Array; // rear-right load N
  rollAngle: Float32Array;   // body roll degrees
  pitchAngle: Float32Array;  // body pitch degrees
}

// Car parameters
const MASS = 1240;          // kg
const COG_H = 0.50;         // m
const WHEELBASE = 2.59;     // m
const TRACK_W = 1.53;       // m (front track)
const TRACK_W_R = 1.50;     // m (rear track)
const FRONT_BIAS = 0.61;    // 61% front
const G = 9.81;
const MU = 1.1;             // friction coefficient
const DRAG_CD_A = 0.72;     // Cd*A
const RHO = 1.225;          // air density
const ROLL_RESIST = 0.015;

// Gear ratios (final drive included)
const GEAR_RATIOS = [0, 3.36, 2.18, 1.54, 1.16, 0.94, 0.79]; // 6-speed + reverse
const FINAL_DRIVE = 3.7;
const WHEEL_R = 0.31;       // wheel radius m
const MAX_POWER = 148000;   // W (148 kW)
const MAX_RPM = 6800;
const IDLE_RPM = 850;
const SHIFT_RPM = 6500;
const SHIFT_DOWN_RPM = 4200;

// Effective ratios (gear * final drive / wheel radius)
function effectiveRatio(gear: number): number {
  return GEAR_RATIOS[gear] * FINAL_DRIVE / WHEEL_R;
}

// Engine torque curve (simplified)
function engineTorque(rpm: number): number {
  // Peak torque ~240 Nm at ~4000 rpm, drops off at high rpm
  const norm = rpm / MAX_RPM;
  return 240 * (1.0 - 0.3 * (norm - 0.6) * (norm - 0.6) / (0.4 * 0.4));
}

// Max deceleration for braking
const MAX_BRAKE_DECEL = 1.2 * G; // ~1.2g

export function runSimulation(track: TrackData): SimData {
  const DT = 1 / 120;
  const N = track.numSamples;
  const totalArcLen = track.totalLength;
  
  // Estimate lap time (will be refined)
  // Average speed estimate: ~130 km/h = 36 m/s → lap time ≈ 20832/36 ≈ 578s ≈ 9:38
  const EST_LAP_TIME = 560; // ~9:20
  const NUM_FRAMES = Math.floor(EST_LAP_TIME / DT);
  
  // Allocate typed arrays
  const t = new Float32Array(NUM_FRAMES);
  const s = new Float32Array(NUM_FRAMES);
  const posX = new Float32Array(NUM_FRAMES);
  const posY = new Float32Array(NUM_FRAMES);
  const posZ = new Float32Array(NUM_FRAMES);
  const heading = new Float32Array(NUM_FRAMES);
  const pitch = new Float32Array(NUM_FRAMES);
  const speed = new Float32Array(NUM_FRAMES);
  const gear = new Float32Array(NUM_FRAMES);
  const rpm = new Float32Array(NUM_FRAMES);
  const throttle = new Float32Array(NUM_FRAMES);
  const brake = new Float32Array(NUM_FRAMES);
  const aLat = new Float32Array(NUM_FRAMES);
  const aLong = new Float32Array(NUM_FRAMES);
  const wheelLoadFL = new Float32Array(NUM_FRAMES);
  const wheelLoadFR = new Float32Array(NUM_FRAMES);
  const wheelLoadRL = new Float32Array(NUM_FRAMES);
  const wheelLoadRR = new Float32Array(NUM_FRAMES);
  const rollAngle = new Float32Array(NUM_FRAMES);
  const pitchAngle = new Float32Array(NUM_FRAMES);

  // Helper: sample track at arc-length position
  function sampleTrack(arcPos: number) {
    const frac = ((arcPos % totalArcLen) + totalArcLen) % totalArcLen / totalArcLen;
    const idx = Math.floor(frac * (N - 1));
    const nextIdx = (idx + 1) % N;
    const blend = frac * (N - 1) - idx;
    
    const px = track.positions[idx * 3] * (1 - blend) + track.positions[nextIdx * 3] * blend;
    const py = track.positions[idx * 3 + 1] * (1 - blend) + track.positions[nextIdx * 3 + 1] * blend;
    const pz = track.positions[idx * 3 + 2] * (1 - blend) + track.positions[nextIdx * 3 + 2] * blend;
    
    const tx = track.tangents[idx * 3] * (1 - blend) + track.tangents[nextIdx * 3] * blend;
    const ty = track.tangents[idx * 3 + 1] * (1 - blend) + track.tangents[nextIdx * 3 + 1] * blend;
    const tz = track.tangents[idx * 3 + 2] * (1 - blend) + track.tangents[nextIdx * 3 + 2] * blend;
    
    const curv = track.curvatures[idx] * (1 - blend) + track.curvatures[nextIdx] * blend;
    
    return { px, py, pz, tx, ty, tz, curv, idx };
  }

  // Look-ahead: compute braking distance needed from current speed
  function brakingDistance(v: number): number {
    return v * v / (2 * MAX_BRAKE_DECEL);
  }

  // Target speed for a given curvature
  function targetSpeed(curv: number, elevation: number): number {
    if (curv < 0.002) return 80; // straight, high speed
    const radius = 1 / curv;
    // v = sqrt(mu * g * r) with load sensitivity
    const vMax = Math.sqrt(MU * G * radius * 0.85);
    return Math.min(vMax, 80); // cap at 80 m/s (~288 km/h)
  }

  // Look ahead to find minimum target speed in braking zone
  function lookAheadTarget(currentS: number, currentV: number): { targetV: number; needBrake: boolean } {
    let minTarget = 80;
    const lookDist = Math.max(200, brakingDistance(currentV) * 1.3);
    const steps = 40;
    const stepSize = lookDist / steps;
    
    for (let i = 1; i <= steps; i++) {
      const ahead = currentS + i * stepSize;
      const sample = sampleTrack(ahead);
      const tSpeed = targetSpeed(sample.curv, sample.py);
      if (tSpeed < minTarget) minTarget = tSpeed;
    }
    
    // Check if we need to brake now
    const needBrake = currentV > minTarget && brakingDistance(currentV) > lookDist * 0.5;
    
    return { targetV: minTarget, needBrake };
  }

  // Main simulation loop
  let currentS = 10; // start slightly past start line
  let currentV = 30; // start at ~108 km/h (rolling start)
  let currentGear = 3;
  let currentRpm = 3500;
  let prevV = currentV;
  let actualFrames = 0;
  let lapStarted = false;
  let crossedStart = false;

  for (let frame = 0; frame < NUM_FRAMES; frame++) {
    const time = frame * DT;
    const sample = sampleTrack(currentS);
    
    // Road slope
    const slopeAngle = Math.atan2(sample.ty, Math.sqrt(sample.tx * sample.tx + sample.tz * sample.tz));
    const gravityForce = -MASS * G * Math.sin(slopeAngle);
    
    // Look ahead for braking
    const { targetV, needBrake } = lookAheadTarget(currentS, currentV);
    
    // Throttle and brake logic
    let thr = 0;
    let brk = 0;
    
    if (needBrake || currentV > targetV + 2) {
      // Braking
      const vDiff = currentV - targetV;
      brk = Math.min(1, vDiff / 10);
      thr = 0;
    } else if (currentV < targetV - 1) {
      // Accelerating
      thr = Math.min(1, (targetV - currentV) / 15);
      brk = 0;
    } else {
      // Maintain speed
      thr = 0.3;
      brk = 0;
    }

    // Gear logic
    if (currentRpm > SHIFT_RPM && currentGear < 6) {
      currentGear++;
      currentRpm *= 0.7;
    } else if (currentRpm < SHIFT_DOWN_RPM && currentGear > 1 && thr > 0.5) {
      currentGear--;
      currentRpm *= 1.4;
    }

    // Engine force
    const effRatio = effectiveRatio(currentGear);
    currentRpm = Math.max(IDLE_RPM, Math.min(MAX_RPM, currentV * effRatio * 60 / (2 * Math.PI)));
    
    let engineForce = 0;
    if (thr > 0) {
      const torque = engineTorque(currentRpm);
      engineForce = torque * effRatio * thr;
      // Power limit
      const power = engineForce * currentV;
      if (power > MAX_POWER && currentV > 1) {
        engineForce = MAX_POWER / currentV;
      }
    }
    
    // Braking force
    const brakeForce = brk * MAX_BRAKE_DECEL * MASS;
    
    // Drag
    const dragForce = 0.5 * DRAG_CD_A * RHO * currentV * currentV;
    const rollingResist = ROLL_RESIST * MASS * G * Math.cos(slopeAngle);
    
    // Net force
    const netForce = engineForce - brakeForce - dragForce - rollingResist + gravityForce;
    const accel = netForce / MASS;
    
    // Crest effect: reduce load on convex crests
    const curvatureVertical = sample.curv;
    const crestFactor = Math.max(0.3, 1 - curvatureVertical * currentV * currentV / G);
    
    // Update speed
    prevV = currentV;
    currentV = Math.max(0, currentV + accel * DT);
    
    // Lateral acceleration
    const latAccel = currentV * currentV * sample.curv;
    
    // Update position
    currentS += currentV * DT;
    
    // Track lap completion: after passing halfway, detect crossing start
    if (currentS > totalArcLen * 0.5) lapStarted = true;
    if (lapStarted && currentS >= totalArcLen) {
      // Lap complete
      currentS = currentS % totalArcLen;
      actualFrames = frame + 1;
      crossedStart = true;
      break;
    }
    
    // Safety: if we've been running too long, stop
    if (time > 720) { // 12 minutes max
      actualFrames = frame + 1;
      break;
    }
    
    // Get position at new s
    const newSample = sampleTrack(currentS);
    
    // Wheel loads (quasi-static with load transfer)
    const staticFront = MASS * G * FRONT_BIAS;
    const staticRear = MASS * G * (1 - FRONT_BIAS);
    
    // Longitudinal transfer
    const longTransfer = MASS * accel * COG_H / WHEELBASE;
    // Lateral transfer
    const latTransfer = MASS * latAccel * COG_H / TRACK_W;
    
    // Crest reduces total load
    const totalLoad = MASS * G * crestFactor;
    const frontTotal = totalLoad * FRONT_BIAS - longTransfer;
    const rearTotal = totalLoad * (1 - FRONT_BIAS) + longTransfer;
    
    const fl = Math.max(0, frontTotal / 2 - latTransfer * 0.6);
    const fr = Math.max(0, frontTotal / 2 + latTransfer * 0.6);
    const rl = Math.max(0, rearTotal / 2 - latTransfer * 0.4);
    const rr = Math.max(0, rearTotal / 2 + latTransfer * 0.4);
    
    // Body roll/pitch angles (simplified spring model)
    const rollStiffness = 30000; // Nm/rad
    const rollAng = (latAccel * MASS * COG_H) / rollStiffness * (180 / Math.PI);
    const pitchStiffness = 40000;
    const pitchAng = (accel * MASS * COG_H) / pitchStiffness * (180 / Math.PI);
    
    // Heading from tangent
    const head = Math.atan2(newSample.tx, newSample.tz);
    
    // Store frame data
    t[frame] = time;
    s[frame] = currentS;
    posX[frame] = newSample.px;
    posY[frame] = newSample.py;
    posZ[frame] = newSample.pz;
    heading[frame] = head;
    pitch[frame] = slopeAngle;
    speed[frame] = currentV;
    gear[frame] = currentGear;
    rpm[frame] = currentRpm;
    throttle[frame] = thr;
    brake[frame] = brk;
    aLat[frame] = latAccel;
    aLong[frame] = accel;
    wheelLoadFL[frame] = fl;
    wheelLoadFR[frame] = fr;
    wheelLoadRL[frame] = rl;
    wheelLoadRR[frame] = rr;
    rollAngle[frame] = rollAng;
    pitchAngle[frame] = pitchAng;
    
    actualFrames = frame + 1;
  }

  // Trim arrays to actual frame count
  const trim = (arr: Float32Array) => arr.slice(0, actualFrames);
  
  return {
    numFrames: actualFrames,
    dt: DT,
    totalTime: (actualFrames - 1) * DT,
    t: trim(t),
    s: trim(s),
    posX: trim(posX),
    posY: trim(posY),
    posZ: trim(posZ),
    heading: trim(heading),
    pitch: trim(pitch),
    speed: trim(speed),
    gear: trim(gear),
    rpm: trim(rpm),
    throttle: trim(throttle),
    brake: trim(brake),
    aLat: trim(aLat),
    aLong: trim(aLong),
    wheelLoadFL: trim(wheelLoadFL),
    wheelLoadFR: trim(wheelLoadFR),
    wheelLoadRL: trim(wheelLoadRL),
    wheelLoadRR: trim(wheelLoadRR),
    rollAngle: trim(rollAngle),
    pitchAngle: trim(pitchAngle),
  };
}

// Interpolate simulation data at a given time
export function interpSim(sim: SimData, time: number): {
  frameIdx: number;
  posX: number; posY: number; posZ: number;
  heading: number; pitch: number;
  speed: number; gear: number; rpm: number;
  throttle: number; brake: number;
  aLat: number; aLong: number;
  wheelLoadFL: number; wheelLoadFR: number;
  wheelLoadRL: number; wheelLoadRR: number;
  rollAngle: number; pitchAngle: number;
  s: number;
} {
  const clampedTime = Math.max(0, Math.min(time, sim.totalTime));
  const frameF = clampedTime / sim.dt;
  const f0 = Math.floor(frameF);
  const f1 = Math.min(f0 + 1, sim.numFrames - 1);
  const blend = frameF - f0;
  
  const lerp = (a: Float32Array, b: Float32Array) => a[f0] * (1 - blend) + b[f1] * blend;
  
  return {
    frameIdx: f0,
    posX: sim.posX[f0] * (1 - blend) + sim.posX[f1] * blend,
    posY: sim.posY[f0] * (1 - blend) + sim.posY[f1] * blend,
    posZ: sim.posZ[f0] * (1 - blend) + sim.posZ[f1] * blend,
    heading: sim.heading[f0] * (1 - blend) + sim.heading[f1] * blend,
    pitch: sim.pitch[f0] * (1 - blend) + sim.pitch[f1] * blend,
    speed: sim.speed[f0] * (1 - blend) + sim.speed[f1] * blend,
    gear: sim.gear[f0],
    rpm: sim.rpm[f0] * (1 - blend) + sim.rpm[f1] * blend,
    throttle: sim.throttle[f0] * (1 - blend) + sim.throttle[f1] * blend,
    brake: sim.brake[f0] * (1 - blend) + sim.brake[f1] * blend,
    aLat: sim.aLat[f0] * (1 - blend) + sim.aLat[f1] * blend,
    aLong: sim.aLong[f0] * (1 - blend) + sim.aLong[f1] * blend,
    wheelLoadFL: sim.wheelLoadFL[f0] * (1 - blend) + sim.wheelLoadFL[f1] * blend,
    wheelLoadFR: sim.wheelLoadFR[f0] * (1 - blend) + sim.wheelLoadFR[f1] * blend,
    wheelLoadRL: sim.wheelLoadRL[f0] * (1 - blend) + sim.wheelLoadRL[f1] * blend,
    wheelLoadRR: sim.wheelLoadRR[f0] * (1 - blend) + sim.wheelLoadRR[f1] * blend,
    rollAngle: sim.rollAngle[f0] * (1 - blend) + sim.rollAngle[f1] * blend,
    pitchAngle: sim.pitchAngle[f0] * (1 - blend) + sim.pitchAngle[f1] * blend,
    s: sim.s[f0] * (1 - blend) + sim.s[f1] * blend,
  };
}
