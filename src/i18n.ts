// ============================================================
// SECTION: Internationalization Dictionary (RU/EN)
// ============================================================
export type Lang = 'en' | 'ru';

export const dict = {
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
  cameraTooltips: {
    1: { en: 'Orbit — rotate around car', ru: 'Орбита — вращение вокруг машины' },
    2: { en: 'Chase — follow behind', ru: 'Преследование — следовать сзади' },
    3: { en: 'Hood — driver view', ru: 'Капот — вид водителя' },
    4: { en: 'Top-down — full track', ru: 'Вид сверху — вся трасса' },
    5: { en: 'TV cam — corner view', ru: 'ТВ камера — вид с поворота' },
    6: { en: 'Free fly — WASD+mouse', ru: 'Свободный полёт — WASD+мышь' },
  },
  massOverlay: { en: 'Mass Overlay', ru: 'Визуализация массы' },
  wheelLoads: { en: 'Wheel loads', ru: 'Нагрузки колёс' },
  cogSphere: { en: 'CoG', ru: 'Центр масс' },
  bodyRoll: { en: 'Roll & pitch', ru: 'Крен и клев' },
  play: { en: 'Play', ru: 'Пуск' },
  pause: { en: 'Pause', ru: 'Пауза' },
  loadGpx: { en: 'GPX track', ru: 'GPX трек' },
  gpxLoaded: { en: 'GPX loaded: {n} points, {len} km', ru: 'GPX загружен: {n} точек, {len} км' },
  roll: { en: 'Roll', ru: 'Крен' },
  pitch: { en: 'Pitch', ru: 'Тангаж' },
  hint: {
    en: 'Left-drag: rotate · Wheel: zoom · Right-drag: pan',
    ru: 'Левая кнопка — вращать · колесо — масштаб · ПКМ — панорама'
  },
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
  // New strings for polish pass
  racingLine: { en: 'Racing line', ru: 'Гоночная траектория' },
  photoPlates: { en: 'Photo plates', ru: 'Фото-таблички' },
  elevationTint: { en: 'Elevation tint', ru: 'Тон по высоте' },
  minimap: { en: 'Minimap', ru: 'Мини-карта' },
  signMode: { en: 'Signs', ru: 'Таблички' },
  signNearest: { en: 'Nearest', ru: 'Ближайшие' },
  signAll: { en: 'All', ru: 'Все' },
  signSelected: { en: 'Selected', ru: 'Выбранные' },
  recenter: { en: 'Recenter', ru: 'Центрировать' },
  about: { en: 'About', ru: 'О программе' },
  aboutText: {
    en: 'Photos from Wikimedia Commons (CC BY-SA / Public Domain). Track data: stylized Nürburgring Nordschleife.',
    ru: 'Фото из Wikimedia Commons (CC BY-SA / Public Domain). Данные трассы: стилизованная Нюрбургринг Нордшляйфе.'
  },
  elevationLegend: { en: 'Elevation: 320m → 617m', ru: 'Высота: 320м → 617м' },
  // Model-related strings
  model: { en: 'model', ru: 'модель' },
  unknown: { en: 'unknown', ru: 'неизвестно' },
  findModel: { en: 'Find model', ru: 'Найти модель' },
  rotateModel: { en: 'Rotate', ru: 'Повернуть' },
  modelCredits: { en: 'Model Credits', ru: 'Авторы моделей' },
  modelAuthor: { en: 'Author', ru: 'Автор' },
  modelLicense: { en: 'License', ru: 'Лицензия' },
  modelSource: { en: 'Source', ru: 'Источник' },
  heavyModel: { en: 'Heavy model, may lag', ru: 'Тяжёлая модель, возможны задержки' },
  enterModelInfo: { en: 'Enter model information', ru: 'Введите информацию о модели' },
  skip: { en: 'Skip', ru: 'Пропустить' },
  save: { en: 'Save', ru: 'Сохранить' },
};

export type DictKey = keyof typeof dict;

export function t(key: 'title' | 'lap' | 'speed' | 'gear' | 'corner' | 'camera' | 'cameraHints' | 'massOverlay' | 'wheelLoads' | 'cogSphere' | 'bodyRoll' | 'play' | 'pause' | 'loadGpx' | 'roll' | 'pitch' | 'hint' | 'racingLine' | 'photoPlates' | 'elevationTint' | 'minimap' | 'signMode' | 'signNearest' | 'signAll' | 'signSelected' | 'recenter' | 'about' | 'aboutText' | 'elevationLegend' | 'model' | 'unknown' | 'findModel' | 'rotateModel' | 'modelCredits' | 'modelAuthor' | 'modelLicense' | 'modelSource' | 'heavyModel' | 'enterModelInfo' | 'skip' | 'save', lang: Lang): string {
  const val = dict[key];
  if (typeof val === 'string') return val;
  return '';
}

export function tNarrative(lang: Lang, name: string, brake: string, load: string, roll: string, grip: string, note: string): string {
  return dict.narrative[lang](name, brake, load, roll, grip, note);
}

export function tTooltip(num: number, lang: Lang): string {
  const entry = dict.cameraTooltips[num as keyof typeof dict.cameraTooltips];
  return entry ? entry[lang] : '';
}

// Language persistence
export function loadLang(): Lang {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'ru' || hash === 'en') return hash;
  const stored = localStorage.getItem('nsl_lang');
  if (stored === 'ru' || stored === 'en') return stored;
  return 'en';
}

export function saveLang(lang: Lang) {
  localStorage.setItem('nsl_lang', lang);
  window.location.hash = lang;
}
