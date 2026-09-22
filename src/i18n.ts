// ============================================================
// SECTION: Internationalization Dictionary (RU/EN)
// ============================================================
export type Lang = 'en' | 'ru';

const dict = {
  title: { en: 'Nordschleife Mass Lab', ru: 'Нордшляйфе Mass Lab' },
  lap: { en: 'LAP', ru: 'КРУГ' },
  speed: { en: 'SPEED', ru: 'СКОРОСТЬ' },
  gear: { en: 'GEAR', ru: 'ПЕРЕДАЧА' },
  corner: { en: 'CORNER', ru: 'ПОВОРОТ' },
  camera: { en: 'Camera', ru: 'Камера' },
  cameraHints: {
    en: '1:Orbit 2:Chase 3:Hood 4:Top 5:TV 6:Free',
    ru: '1:Орбита 2:Преслед 3:Капот 4:Вид 5:ТВ 6:Свобод'
  },
  massOverlay: { en: 'Mass Overlay', ru: 'Визуализация массы' },
  wheelLoads: { en: 'Wheel Loads', ru: 'Нагрузка колёс' },
  cogSphere: { en: 'CoG Sphere', ru: 'Сфера ЦМ' },
  bodyRoll: { en: 'Body Roll/Pitch', ru: 'Крен/Тангаж' },
  play: { en: 'Play', ru: 'Пуск' },
  pause: { en: 'Pause', ru: 'Пауза' },
  loadGpx: { en: 'Load GPX', ru: 'Загрузить GPX' },
  gpxLoaded: { en: 'GPX loaded: {n} points, {len} km', ru: 'GPX загружен: {n} точек, {len} км' },
  builtInTrack: { en: 'Built-in Nordschleife', ru: 'Встроенная Нордшляйфе' },
  roll: { en: 'Roll', ru: 'Крен' },
  pitch: { en: 'Pitch', ru: 'Тангаж' },
  narrative: {
    en: (name: string, brake: string, load: string, roll: string, grip: string, note: string) =>
      `${name}: braking ${brake}, ${load} load on front axle, roll ${roll}, front at ${grip} of grip limit — ${note}`,
    ru: (name: string, brake: string, load: string, roll: string, grip: string, note: string) =>
      `${name}: торможение ${brake}, ${load} нагрузки на переднюю ось, крен ${roll}, передок на ${grip} предела сцепления — ${note}`
  },
  understeer: { en: 'mild understeer', ru: 'лёгкая недостаточная поворачиваемость' },
  oversteer: { en: 'slight oversteer tendency', ru: 'лёгкая склонность к заносу' },
  balanced: { en: 'balanced', ru: 'сбалансированно' },
  crest: { en: 'crest unloads suspension', ru: 'перегруз разгружает подвеску' },
  accelerating: { en: 'full throttle acceleration', ru: 'полный газ, разгон' },
  coasting: { en: 'coasting through corner', ru: 'прохождение поворота' },
};

export type DictKey = keyof typeof dict;

export function t(key: DictKey, lang: Lang): string {
  const val = dict[key];
  if (typeof val === 'string') return val;
  return '';
}

export function tNarrative(lang: Lang, name: string, brake: string, load: string, roll: string, grip: string, note: string): string {
  return dict.narrative[lang](name, brake, load, roll, grip, note);
}

export { dict };
