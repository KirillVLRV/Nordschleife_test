// ============================================================
// SECTION: Car Configurations — Garage System
// ============================================================

export interface CarConfig {
  id: string;
  name: string;
  nameRu: string;
  // Spec-sheet dimensions
  length: number;         // m (overall)
  width: number;          // m (overall)
  height: number;         // m (overall)
  wheelbase: number;      // m
  trackWidth: number;     // m (front)
  trackWidthRear: number; // m (rear)
  // Physics parameters
  mass: number;           // kg
  cogHeight: number;      // m
  frontBias: number;      // 0-1 (front weight %)
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  power: number;          // kW
  gripMu: number;         // friction coefficient
  rollDegPerG: number;    // degrees per g lateral acceleration
  aeroDownforce: number;  // downforce coefficient (0 for no aero)
  // Visual parameters
  bodyType: 'hatch' | 'sedan' | 'suv' | 'roadster' | 'classic';
  paintColor: number;
  emissiveColor: number;
  lapRef: number;         // reference lap time (s)
  // Adjustable params (user sliders)
  massMultiplier: number; // 0.7-1.3
  cogHeightOffset: number; // -0.1 to +0.1
  powerMultiplier: number; // 0.6-1.4
  driverSkill: number;    // 0.7-1.0
  surfaceWet: boolean;
  // Model metadata
  modelAuthor?: string;
  modelLicense?: string;
  modelSource?: string;
  modelRotation?: number; // Y-axis rotation in degrees
  customModelLoaded?: boolean;
}

export const CARS: CarConfig[] = [
  {
    id: 'clio3rs',
    name: 'Renault Clio R.S. III',
    nameRu: 'Рено Клио R.S. III',
    length: 4.09, width: 1.75, height: 1.44,
    wheelbase: 2.585, trackWidth: 1.52, trackWidthRear: 1.52,
    mass: 1240, cogHeight: 0.50, frontBias: 0.61, drivetrain: 'FWD',
    power: 148, gripMu: 1.15, rollDegPerG: 3.8, aeroDownforce: 0.2,
    bodyType: 'hatch', paintColor: 0xcc1111, emissiveColor: 0x330000,
    lapRef: 540, massMultiplier: 1, cogHeightOffset: 0, powerMultiplier: 1,
    driverSkill: 0.92, surfaceWet: false,
    modelAuthor: undefined, modelLicense: undefined, modelSource: undefined,
    modelRotation: 0, customModelLoaded: false,
  },
  {
    id: 'defender110',
    name: 'Land Rover Defender 110',
    nameRu: 'Лэнд Ровер Дефендер 110',
    length: 5.02, width: 2.01, height: 1.97,
    wheelbase: 3.02, trackWidth: 1.70, trackWidthRear: 1.70,
    mass: 2475, cogHeight: 0.85, frontBias: 0.50, drivetrain: 'AWD',
    power: 294, gripMu: 0.95, rollDegPerG: 6.5, aeroDownforce: 0.1,
    bodyType: 'suv', paintColor: 0x2a4a2a, emissiveColor: 0x0a1a0a,
    lapRef: 765, massMultiplier: 1, cogHeightOffset: 0, powerMultiplier: 1,
    driverSkill: 0.85, surfaceWet: false,
    modelAuthor: undefined, modelLicense: undefined, modelSource: undefined,
    modelRotation: 0, customModelLoaded: false,
  },
  {
    id: 'model3perf',
    name: 'Tesla Model 3 Performance',
    nameRu: 'Тесла Модель 3 Performance',
    length: 4.69, width: 1.85, height: 1.44,
    wheelbase: 2.875, trackWidth: 1.58, trackWidthRear: 1.58,
    mass: 1847, cogHeight: 0.46, frontBias: 0.50, drivetrain: 'AWD',
    power: 377, gripMu: 1.25, rollDegPerG: 2.8, aeroDownforce: 0.2,
    bodyType: 'sedan', paintColor: 0x1a1a2e, emissiveColor: 0x0a0a1a,
    lapRef: 510, massMultiplier: 1, cogHeightOffset: 0, powerMultiplier: 1,
    driverSkill: 0.95, surfaceWet: false,
    modelAuthor: undefined, modelLicense: undefined, modelSource: undefined,
    modelRotation: 0, customModelLoaded: false,
  },
  {
    id: 'gt3_992',
    name: 'Porsche 911 GT3 (992)',
    nameRu: 'Порше 911 GT3 (992)',
    length: 4.57, width: 1.85, height: 1.28,
    wheelbase: 2.46, trackWidth: 1.60, trackWidthRear: 1.60,
    mass: 1435, cogHeight: 0.44, frontBias: 0.38, drivetrain: 'RWD',
    power: 375, gripMu: 1.40, rollDegPerG: 2.2, aeroDownforce: 2.0,
    bodyType: 'sedan', paintColor: 0xffffff, emissiveColor: 0x222222,
    lapRef: 440, massMultiplier: 1, cogHeightOffset: 0, powerMultiplier: 1,
    driverSkill: 0.97, surfaceWet: false,
    modelAuthor: undefined, modelLicense: undefined, modelSource: undefined,
    modelRotation: 0, customModelLoaded: false,
  },
  {
    id: 'caterhamR500',
    name: 'Caterham Seven 620R',
    nameRu: 'Катерхэм Севен 620R',
    length: 3.10, width: 1.47, height: 1.09,
    wheelbase: 2.22, trackWidth: 1.30, trackWidthRear: 1.30,
    mass: 540, cogHeight: 0.38, frontBias: 0.45, drivetrain: 'RWD',
    power: 196, gripMu: 1.20, rollDegPerG: 2.5, aeroDownforce: 0.1,
    bodyType: 'roadster', paintColor: 0xffcc00, emissiveColor: 0x443300,
    lapRef: 470, massMultiplier: 1, cogHeightOffset: 0, powerMultiplier: 1,
    driverSkill: 0.96, surfaceWet: false,
    modelAuthor: undefined, modelLicense: undefined, modelSource: undefined,
    modelRotation: 0, customModelLoaded: false,
  },
  {
    id: 'rs27',
    name: 'Porsche 911 Carrera RS 2.7 (1973)',
    nameRu: 'Порше 911 Каррера RS 2.7 (1973)',
    length: 4.15, width: 1.66, height: 1.32,
    wheelbase: 2.27, trackWidth: 1.40, trackWidthRear: 1.40,
    mass: 975, cogHeight: 0.55, frontBias: 0.40, drivetrain: 'RWD',
    power: 154, gripMu: 1.00, rollDegPerG: 4.5, aeroDownforce: 0.0,
    bodyType: 'classic', paintColor: 0xcc0000, emissiveColor: 0x330000,
    lapRef: 630, massMultiplier: 1, cogHeightOffset: 0, powerMultiplier: 1,
    driverSkill: 0.88, surfaceWet: false,
    modelAuthor: undefined, modelLicense: undefined, modelSource: undefined,
    modelRotation: 0, customModelLoaded: false,
  },
];

export const SKETCHFAB_SEARCH_URLS: Record<string, string> = {
  clio3rs: 'https://sketchfab.com/search?q=renault%20clio%20rs&downloadable=true',
  defender110: 'https://sketchfab.com/search?q=land%20rover%20defender%20110&downloadable=true',
  model3perf: 'https://sketchfab.com/search?q=tesla%20model%203&downloadable=true',
  gt3_992: 'https://sketchfab.com/search?q=porsche%20911%20gt3%20992&downloadable=true',
  caterhamR500: 'https://sketchfab.com/search?q=caterham%20seven&downloadable=true',
  rs27: 'https://sketchfab.com/search?q=porsche%20911%20carrera%20rs%202.7&downloadable=true',
};

export function getEffectiveParams(car: CarConfig) {
  const mass = car.mass * car.massMultiplier;
  const cogH = car.cogHeight + car.cogHeightOffset;
  const power = car.power * car.powerMultiplier;
  const mu = car.gripMu * (car.surfaceWet ? 0.65 : 1.0);
  const skill = car.driverSkill;
  
  return { 
    mass, cogH, power, mu, skill, frontBias: car.frontBias,
    wheelbase: car.wheelbase, trackWidth: car.trackWidth,
    rollDegPerG: car.rollDegPerG, aeroDownforce: car.aeroDownforce
  };
}
