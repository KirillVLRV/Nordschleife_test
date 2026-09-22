// ============================================================
// SECTION: Deterministic Precomputed Simulation
// Renault Clio R.S. III: 1240kg, CoG 0.50m, 61/39 F/R, FWD, ~148kW
// Target: lap time 8:30–9:30, top speed ~220-235 km/h on Döttinger Höhe
// ============================================================
import { TrackData } from './track';

export interface SimData {
  numFrames: number;
  dt: number;
  totalTime: number;
  t: Float32Array;
  s: Float32Array;
  posX: Float32Array;
  posY: Float32Array;
  posZ: Float32Array;
  heading: Float32Array;
  pitch: Float32Array;
  speed: Float32Array;
  gear: Float32Array;
  rpm: Float32Array;
  throttle: Float32Array;
  brake: Float32Array;
  aLat: Float32Array;
  aLong: Float32Array;
  wheelLoadFL: Float32Array;
  wheelLoadFR: Float32Array;
  wheelLoadRL: Float32Array;
  wheelLoadRR: Float32Array;
  rollAngle: Float32Array;
  pitchAngle: Float32Array;
}

// Car parameters — Renault Clio R.S. III
const MASS = 1240;
const COG_H = 0.50;
const WHEELBASE = 2.59;
const TRACK_W = 1.53;
const FRONT_BIAS = 0.61;
const G = 9.81;
const MU = 1.25;             // dry grip coefficient
const MAX_BRAKE_G = 1.15;    // max braking decel in g
const DRAG_CD_A = 0.80;      // Cd*A (Clio RS3: Cd~0.33, A~2.4)
const RHO = 1.225;
const ROLL_RESIST = 0.015;
const MAX_POWER = 148000;     // 148 kW

// Gear ratios (including final drive)
const GEAR_RATIOS = [0, 11.8, 7.7, 5.4, 4.1, 3.4, 2.8];
const WHEEL_R = 0.31;

function effectiveRatio(gear: number): number {
  return GEAR_RATIOS[gear] / WHEEL_R;
}

// Engine torque curve (Nm at flywheel)
function engineTorque(rpm: number): number {
  // Peak ~240 Nm around 4000 rpm, drops off
  const norm = rpm / 7000;
  if (norm < 0.15) return 180 * (norm / 0.15);
  if (norm < 0.65) return 240;
  return 240 * (1 - 0.4 * ((norm - 0.65) / 0.35));
}

const SHIFT_UP_RPM = 6600;
const SHIFT_DOWN_RPM = 3800;
const IDLE_RPM = 900;
const MAX_RPM = 6800;

export function runSimulation(track: TrackData): SimData {
  const DT = 1 / 120;
  const N = track.numSamples;
  const totalArcLen = track.totalLength;
  const MAX_FRAMES = 80000; // ~11 min max

  // Allocate typed arrays
  const t = new Float32Array(MAX_FRAMES);
  const s = new Float32Array(MAX_FRAMES);
  const posX = new Float32Array(MAX_FRAMES);
  const posY = new Float32Array(MAX_FRAMES);
  const posZ = new Float32Array(MAX_FRAMES);
  const heading = new Float32Array(MAX_FRAMES);
  const pitch = new Float32Array(MAX_FRAMES);
  const speed = new Float32Array(MAX_FRAMES);
  const gear = new Float32Array(MAX_FRAMES);
  const rpm = new Float32Array(MAX_FRAMES);
  const throttle = new Float32Array(MAX_FRAMES);
  const brake = new Float32Array(MAX_FRAMES);
  const aLat = new Float32Array(MAX_FRAMES);
  const aLong = new Float32Array(MAX_FRAMES);
  const wheelLoadFL = new Float32Array(MAX_FRAMES);
  const wheelLoadFR = new Float32Array(MAX_FRAMES);
  const wheelLoadRL = new Float32Array(MAX_FRAMES);
  const wheelLoadRR = new Float32Array(MAX_FRAMES);
  const rollAngle = new Float32Array(MAX_FRAMES);
  const pitchAngle = new Float32Array(MAX_FRAMES);

  // Sample track at arc-length position
  function sampleTrack(arcPos: number) {
    const wrappedPos = ((arcPos % totalArcLen) + totalArcLen) % totalArcLen;
    const frac = wrappedPos / totalArcLen;
    const idx = Math.min(Math.floor(frac * (N - 1)), N - 2);
    const blend = frac * (N - 1) - idx;
    const nextIdx = Math.min(idx + 1, N - 1);

    const px = track.positions[idx * 3] * (1 - blend) + track.positions[nextIdx * 3] * blend;
    const py = track.positions[idx * 3 + 1] * (1 - blend) + track.positions[nextIdx * 3 + 1] * blend;
    const pz = track.positions[idx * 3 + 2] * (1 - blend) + track.positions[nextIdx * 3 + 2] * blend;
    const tx = track.tangents[idx * 3] * (1 - blend) + track.tangents[nextIdx * 3] * blend;
    const ty = track.tangents[idx * 3 + 1] * (1 - blend) + track.tangents[nextIdx * 3 + 1] * blend;
    const tz = track.tangents[idx * 3 + 2] * (1 - blend) + track.tangents[nextIdx * 3 + 2] * blend;
    const curv = track.curvatures[idx] * (1 - blend) + track.curvatures[nextIdx] * blend;

    return { px, py, pz, tx, ty, tz, curv, idx };
  }

  // Target corner speed: v = sqrt(mu * g * r) with safety margin
  function cornerTargetSpeed(curv: number): number {
    if (curv < 0.003) return 66; // straight: power-limited ~238 km/h
    const radius = 1 / curv;
    // v = sqrt(mu * g * r), with 0.88 safety factor for real-world
    const v = Math.sqrt(MU * G * radius) * 0.88;
    return Math.min(v, 66); // cap at power-limited top speed
  }

  // Look ahead to find required braking
  function lookAheadTarget(currentS: number, currentV: number): number {
    let minTarget = 66; // max straight speed
    // Look ahead based on current speed (how far we need to see)
    const lookDist = Math.max(300, currentV * currentV / (2 * MAX_BRAKE_G * G) * 1.5);
    const steps = 60;
    const stepSize = lookDist / steps;

    for (let i = 1; i <= steps; i++) {
      const ahead = currentS + i * stepSize;
      const sample = sampleTrack(ahead);
      const tSpeed = cornerTargetSpeed(sample.curv);
      if (tSpeed < minTarget) minTarget = tSpeed;
    }
    return minTarget;
  }

  // Main simulation
  let currentS = 0;
  let currentV = 25; // start at ~90 km/h (rolling start)
  let currentGear = 3;
  let currentRpm = 3500;
  let actualFrames = 0;
  let lapStarted = false;

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    const time = frame * DT;
    const sample = sampleTrack(currentS);

    // Road slope
    const slopeAngle = Math.atan2(sample.ty, Math.sqrt(sample.tx * sample.tx + sample.tz * sample.tz));
    const gravityForce = -MASS * G * Math.sin(slopeAngle);

    // Look ahead for target speed
    const targetV = lookAheadTarget(currentS, currentV);

    // Decide throttle/brake
    let thr = 0;
    let brk = 0;

    if (currentV > targetV + 0.5) {
      // Need to brake — intensity based on how much we need to slow
      const vDiff = currentV - targetV;
      brk = Math.min(1, vDiff / 8);
      thr = 0;
    } else if (currentV < targetV - 1) {
      // Can accelerate — full throttle when well below target
      thr = Math.min(1, (targetV - currentV) / 8);
      brk = 0;
    } else {
      // Near target — light throttle to maintain
      thr = 0.15;
      brk = 0;
    }

    // Gear logic
    if (currentRpm > SHIFT_UP_RPM && currentGear < 6) {
      currentGear++;
      currentRpm *= 0.65;
    } else if (currentRpm < SHIFT_DOWN_RPM && currentGear > 1 && thr > 0.3) {
      currentGear--;
      currentRpm *= 1.5;
    }

    // Engine force
    const effRatio = effectiveRatio(currentGear);
    currentRpm = Math.max(IDLE_RPM, Math.min(MAX_RPM, Math.abs(currentV) * effRatio * 30 / Math.PI));

    let engineForce = 0;
    if (thr > 0) {
      const torque = engineTorque(currentRpm);
      engineForce = torque * effRatio * thr;
      // Limit max traction force (FWD, weight transfer limits rear grip for acceleration)
      const maxTractionForce = MASS * G * 0.5; // ~0.5g max accel at low speed
      engineForce = Math.min(engineForce, maxTractionForce);
      // Power limit
      const power = engineForce * Math.max(currentV, 1);
      if (power > MAX_POWER) {
        engineForce = MAX_POWER / Math.max(currentV, 1);
      }
    }

    // Braking force
    const brakeForce = brk * MAX_BRAKE_G * G * MASS;

    // Drag + rolling resistance
    const dragForce = 0.5 * DRAG_CD_A * RHO * currentV * currentV;
    const rollingResist = ROLL_RESIST * MASS * G;

    // Net force
    const netForce = engineForce - brakeForce - dragForce - rollingResist + gravityForce;
    const accel = netForce / MASS;

    // Crest effect
    const crestFactor = Math.max(0.3, 1 - sample.curv * currentV * currentV / G);

    // Update speed
    currentV = Math.max(0, currentV + accel * DT);

    // Lateral acceleration
    const latAccel = currentV * currentV * sample.curv;

    // Update position
    currentS += currentV * DT;

    // Lap detection
    if (currentS > totalArcLen * 0.3) lapStarted = true;
    if (lapStarted && currentS >= totalArcLen) {
      currentS = currentS % totalArcLen;
      actualFrames = frame + 1;
      break;
    }
    if (time > 780) { // 13 min safety
      actualFrames = frame + 1;
      break;
    }

    // Get position
    const newSample = sampleTrack(currentS);

    // Wheel loads
    const staticFront = MASS * G * FRONT_BIAS;
    const staticRear = MASS * G * (1 - FRONT_BIAS);
    const longTransfer = MASS * accel * COG_H / WHEELBASE;
    const latTransfer = MASS * latAccel * COG_H / TRACK_W;
    const totalLoad = MASS * G * crestFactor;
    const frontTotal = totalLoad * FRONT_BIAS - longTransfer;
    const rearTotal = totalLoad * (1 - FRONT_BIAS) + longTransfer;

    const fl = Math.max(0, frontTotal / 2 - latTransfer * 0.6);
    const fr = Math.max(0, frontTotal / 2 + latTransfer * 0.6);
    const rl = Math.max(0, rearTotal / 2 - latTransfer * 0.4);
    const rr = Math.max(0, rearTotal / 2 + latTransfer * 0.4);

    // Body roll/pitch
    const rollStiffness = 28000;
    const rollAng = (latAccel * MASS * COG_H) / rollStiffness * (180 / Math.PI);
    const pitchStiffness = 38000;
    const pitchAng = (accel * MASS * COG_H) / pitchStiffness * (180 / Math.PI);

    // Heading
    const head = Math.atan2(newSample.tx, newSample.tz);

    // Store
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

  // Log calibration
  const lapTime = (actualFrames - 1) * DT;
  let maxSpeed = 0;
  let maxSpeedIdx = 0;
  let bergwerkSpeed = 0;
  for (let i = 0; i < actualFrames; i++) {
    if (speed[i] > maxSpeed) { maxSpeed = speed[i]; maxSpeedIdx = i; }
    // Find Bergwerk (corner 13, fraction ≈ 12/27)
    const bergwerkFrac = 12 / 27;
    if (Math.abs(s[i] - bergwerkFrac * totalArcLen) < 50 && speed[i] < bergwerkSpeed + 5) {
      bergwerkSpeed = speed[i];
    }
  }

  console.log(`[Sim] Lap time: ${Math.floor(lapTime / 60)}:${(lapTime % 60).toFixed(2).padStart(5, '0')} (${lapTime.toFixed(1)}s)`);
  console.log(`[Sim] Top speed: ${(maxSpeed * 3.6).toFixed(0)} km/h at s=${(s[maxSpeedIdx]/1000).toFixed(1)}km`);
  console.log(`[Sim] Frames: ${actualFrames}, avg speed: ${(totalArcLen / lapTime * 3.6).toFixed(0)} km/h`);

  // Trim arrays
  const trim = (arr: Float32Array) => arr.slice(0, actualFrames);

  return {
    numFrames: actualFrames,
    dt: DT,
    totalTime: lapTime,
    t: trim(t), s: trim(s),
    posX: trim(posX), posY: trim(posY), posZ: trim(posZ),
    heading: trim(heading), pitch: trim(pitch),
    speed: trim(speed), gear: trim(gear), rpm: trim(rpm),
    throttle: trim(throttle), brake: trim(brake),
    aLat: trim(aLat), aLong: trim(aLong),
    wheelLoadFL: trim(wheelLoadFL), wheelLoadFR: trim(wheelLoadFR),
    wheelLoadRL: trim(wheelLoadRL), wheelLoadRR: trim(wheelLoadRR),
    rollAngle: trim(rollAngle), pitchAngle: trim(pitchAngle),
  };
}

// Interpolate simulation data at given time
export function interpSim(sim: SimData, time: number) {
  const clampedTime = Math.max(0, Math.min(time, sim.totalTime));
  const frameF = clampedTime / sim.dt;
  const f0 = Math.min(Math.floor(frameF), sim.numFrames - 1);
  const f1 = Math.min(f0 + 1, sim.numFrames - 1);
  const blend = frameF - f0;
  const lerp = (arr: Float32Array) => arr[f0] * (1 - blend) + arr[f1] * blend;

  return {
    frameIdx: f0,
    posX: lerp(sim.posX), posY: lerp(sim.posY), posZ: lerp(sim.posZ),
    heading: lerp(sim.heading), pitch: lerp(sim.pitch),
    speed: lerp(sim.speed), gear: sim.gear[f0], rpm: lerp(sim.rpm),
    throttle: lerp(sim.throttle), brake: lerp(sim.brake),
    aLat: lerp(sim.aLat), aLong: lerp(sim.aLong),
    wheelLoadFL: lerp(sim.wheelLoadFL), wheelLoadFR: lerp(sim.wheelLoadFR),
    wheelLoadRL: lerp(sim.wheelLoadRL), wheelLoadRR: lerp(sim.wheelLoadRR),
    rollAngle: lerp(sim.rollAngle), pitchAngle: lerp(sim.pitchAngle),
    s: lerp(sim.s),
  };
}
