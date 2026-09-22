// ============================================================
// SECTION: Car Configurations — Garage System
// ============================================================

export interface CarConfig {
  id: string;
  name: string;
  nameRu: string;
  mass: number;           // kg
  cogHeight: number;      // m
  frontBias: number;      // 0-1 (front weight %)
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  power: number;          // kW
  wheelbase: number;      // m
  trackWidth: number;     // m
  trackWidthRear: number; // m
  length: number;         // m
  height: number;         // m
  bodyType: 'hatch' | 'sedan' | 'suv' | 'roadster' | 'classic';
  paintColor: number;
  emissiveColor: number;
  lapRef: number;         // reference lap time (s)
  rollStiffness: number;  // Nm/rad
  pitchStiffness: number; // Nm/rad
  brakeBias: number;      // 0-1 (front brake %)
  downforce: number;      // multiplier (0-2)
  aeroEfficiency: number; // Cd*A for drag
  // Adjustable params
  massMultiplier: number; // 0.7-1.3
  cogHeightOffset: number; // -0.1 to +0.1
  powerMultiplier: number; // 0.6-1.4
  gripMu: number;         // 0.6-1.6
  driverSkill: number;    // 0.7-1.0
  surfaceWet: boolean;
}

export const CARS: CarConfig[] = [
  {
    id: 'clio',
    name: 'Renault Clio R.S. III',
    nameRu: 'Рено Клио R.S. III',
    mass: 1240, cogHeight: 0.50, frontBias: 0.61, drivetrain: 'FWD',
    power: 148, wheelbase: 2.59, trackWidth: 1.53, trackWidthRear: 1.50,
    length: 4.09, height: 1.42, bodyType: 'hatch',
    paintColor: 0xcc1111, emissiveColor: 0x330000,
    lapRef: 540, rollStiffness: 28000, pitchStiffness: 38000,
    brakeBias: 0.65, downforce: 0.3, aeroEfficiency: 0.80,
    massMultiplier: 1, cogHeightOffset: 0, powerMultiplier: 1,
    gripMu: 1.25, driverSkill: 0.92, surfaceWet: false,
  },
  {
    id: 'defender',
    name: 'Land Rover Defender 110',
    nameRu: 'Лэнд Ровер Дефендер 110',
    mass: 2500, cogHeight: 0.85, frontBias: 0.50, drivetrain: 'AWD',
    power: 294, wheelbase: 3.02, trackWidth: 1.68, trackWidthRear: 1.68,
    length: 5.02, height: 2.18, bodyType: 'suv',
    paintColor: 0x2a4a2a, emissiveColor: 0x0a1a0a,
    lapRef: 765, rollStiffness: 15000, pitchStiffness: 20000,
    brakeBias: 0.55, downforce: 0.1, aeroEfficiency: 1.40,
    massMultiplier: 1, cogHeightOffset: 0, powerMultiplier: 1,
    gripMu: 1.10, driverSkill: 0.85, surfaceWet: false,
  },
  {
    id: 'tesla',
    name: 'Tesla Model 3 Performance',
    nameRu: 'Тесла Модель 3 Performance',
    mass: 1848, cogHeight: 0.46, frontBias: 0.50, drivetrain: 'AWD',
    power: 377, wheelbase: 2.88, trackWidth: 1.58, trackWidthRear: 1.60,
    length: 4.69, height: 1.44, bodyType: 'sedan',
    paintColor: 0x1a1a2e, emissiveColor: 0x0a0a1a,
    lapRef: 510, rollStiffness: 35000, pitchStiffness: 45000,
    brakeBias: 0.60, downforce: 0.4, aeroEfficiency: 0.75,
    massMultiplier: 1, cogHeightOffset: 0, powerMultiplier: 1,
    gripMu: 1.30, driverSkill: 0.95, surfaceWet: false,
  },
  {
    id: 'gt3',
    name: 'Porsche 911 GT3 (992)',
    nameRu: 'Порше 911 GT3 (992)',
    mass: 1435, cogHeight: 0.45, frontBias: 0.38, drivetrain: 'RWD',
    power: 375, wheelbase: 2.45, trackWidth: 1.56, trackWidthRear: 1.62,
    length: 4.57, height: 1.28, bodyType: 'sedan',
    paintColor: 0xffffff, emissiveColor: 0x222222,
    lapRef: 440, rollStiffness: 40000, pitchStiffness: 50000,
    brakeBias: 0.68, downforce: 1.5, aeroEfficiency: 0.95,
    massMultiplier: 1, cogHeightOffset: 0, powerMultiplier: 1,
    gripMu: 1.40, driverSkill: 0.97, surfaceWet: false,
  },
  {
    id: 'caterham',
    name: 'Caterham Seven 620R',
    nameRu: 'Катерхэм Севен 620R',
    mass: 540, cogHeight: 0.40, frontBias: 0.45, drivetrain: 'RWD',
    power: 154, wheelbase: 2.30, trackWidth: 1.45, trackWidthRear: 1.45,
    length: 3.10, height: 1.20, bodyType: 'roadster',
    paintColor: 0xffcc00, emissiveColor: 0x443300,
    lapRef: 470, rollStiffness: 45000, pitchStiffness: 55000,
    brakeBias: 0.70, downforce: 0.2, aeroEfficiency: 0.60,
    massMultiplier: 1, cogHeightOffset: 0, powerMultiplier: 1,
    gripMu: 1.35, driverSkill: 0.96, surfaceWet: false,
  },
  {
    id: 'rs27',
    name: 'Porsche 911 Carrera RS 2.7 (1973)',
    nameRu: 'Порше 911 Каррера RS 2.7 (1973)',
    mass: 980, cogHeight: 0.55, frontBias: 0.40, drivetrain: 'RWD',
    power: 154, wheelbase: 2.27, trackWidth: 1.42, trackWidthRear: 1.48,
    length: 4.14, height: 1.32, bodyType: 'classic',
    paintColor: 0xcc0000, emissiveColor: 0x330000,
    lapRef: 630, rollStiffness: 18000, pitchStiffness: 22000,
    brakeBias: 0.60, downforce: 0.0, aeroEfficiency: 0.70,
    massMultiplier: 1, cogHeightOffset: 0, powerMultiplier: 1,
    gripMu: 1.15, driverSkill: 0.88, surfaceWet: false,
  },
];

export function getEffectiveParams(car: CarConfig) {
  const mass = car.mass * car.massMultiplier;
  const cogH = car.cogHeight + car.cogHeightOffset;
  const power = car.power * car.powerMultiplier;
  const mu = car.gripMu * (car.surfaceWet ? 0.65 : 1.0);
  const skill = car.driverSkill;
  
  return { mass, cogH, power, mu, skill, frontBias: car.frontBias };
}
