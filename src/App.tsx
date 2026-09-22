// ============================================================
// SECTION: Main App — Nordschleife Mass Lab v1.5
// ============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import { buildBuiltInTrack, parseGpx, TrackData, CORNER_SPECS } from './track';
import { runSimulation, SimData, interpSim } from './simulation';
import { initScene, updateScene, resizeScene, recenterCamera, SceneState } from './scene';
import { Lang, t, tNarrative, tTooltip, dict, loadLang, saveLang } from './i18n';

function MiniGraph({ sim, currentTime, onJumpTo }: { sim: SimData; currentTime: number; onJumpTo: (t: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,15,25,0.8)';
    ctx.fillRect(0, 0, w, h);
    let maxSpeed = 0;
    for (let i = 0; i < sim.numFrames; i += 8) if (sim.speed[i] > maxSpeed) maxSpeed = sim.speed[i];
    maxSpeed *= 1.1;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,180,0,0.7)';
    ctx.lineWidth = 1;
    for (let i = 0; i < sim.numFrames; i += 6) {
      const x = (i / sim.numFrames) * w;
      const y = h - (sim.speed[i] / maxSpeed) * h * 0.85;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    let maxEle = -Infinity, minEle = Infinity;
    for (let i = 0; i < sim.numFrames; i += 8) {
      if (sim.posY[i] > maxEle) maxEle = sim.posY[i];
      if (sim.posY[i] < minEle) minEle = sim.posY[i];
    }
    const eleRange = maxEle - minEle || 1;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,255,200,0.4)';
    for (let i = 0; i < sim.numFrames; i += 6) {
      const x = (i / sim.numFrames) * w;
      const y = h - ((sim.posY[i] - minEle) / eleRange) * h * 0.5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const tx = (currentTime / sim.totalTime) * w;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.moveTo(tx, 0); ctx.lineTo(tx, h);
    ctx.stroke();
  }, [sim, currentTime]);
  return (
    <canvas ref={canvasRef} width={800} height={40} className="w-full cursor-pointer"
      onClick={e => { const r = (e.target as HTMLCanvasElement).getBoundingClientRect(); onJumpTo(((e.clientX - r.left) / r.width) * sim.totalTime); }} />
  );
}

// Minimap component
function Minimap({ track, sim, currentTime, onJumpTo }: { track: TrackData; sim: SimData; currentTime: number; onJumpTo: (t: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,15,25,0.85)';
    ctx.fillRect(0, 0, w, h);

    // Bounds
    const b = track.bounds;
    const pad = 10;
    const sx = (w - pad * 2) / (b.max.x - b.min.x || 1);
    const sy = (h - pad * 2) / (b.max.z - b.min.z || 1);
    const scale = Math.min(sx, sy);
    const ox = pad + ((w - pad * 2) - (b.max.x - b.min.x) * scale) / 2;
    const oy = pad + ((h - pad * 2) - (b.max.z - b.min.z) * scale) / 2;
    const toX = (x: number) => ox + (x - b.min.x) * scale;
    const toY = (z: number) => oy + (z - b.min.z) * scale;

    // Track outline
    ctx.beginPath();
    ctx.strokeStyle = '#3a3f46';
    ctx.lineWidth = 2;
    for (let i = 0; i < track.numSamples; i += 10) {
      const x = toX(track.positions[i * 3]);
      const y = toY(track.positions[i * 3 + 2]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // Corner ticks
    ctx.fillStyle = '#00ccaa';
    track.cornerPositions.forEach((cp, idx) => {
      const x = toX(cp.pos.x);
      const y = toY(cp.pos.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    });

    // Car dot
    const data = interpSim(sim, currentTime);
    const cx = toX(data.posX);
    const cy = toY(data.posZ);
    ctx.beginPath();
    ctx.fillStyle = '#ff3333';
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#ffaa00';
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }, [track, sim, currentTime]);

  return (
    <canvas ref={canvasRef} width={200} height={200}
      className="cursor-pointer rounded border border-cyan-800"
      style={{ width: '160px', height: '160px' }}
      onClick={e => {
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width;
        const my = (e.clientY - rect.top) / rect.height;
        // Find nearest track point by normalized position
        const b = track.bounds;
        const targetX = b.min.x + mx * (b.max.x - b.min.x);
        const targetZ = b.min.z + my * (b.max.z - b.min.z);
        let bestFrac = 0, bestDist = Infinity;
        for (let i = 0; i < track.numSamples; i += 20) {
          const dx = track.positions[i * 3] - targetX;
          const dz = track.positions[i * 3 + 2] - targetZ;
          const d = dx * dx + dz * dz;
          if (d < bestDist) { bestDist = d; bestFrac = i / track.numSamples; }
        }
        onJumpTo(bestFrac * sim.totalTime);
      }}
    />
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(2)}`;
}

function getCornerIcon(c: string): string {
  switch (c) { case 'right': return '↱'; case 'left': return '↰'; case 'kink': return '⚡'; case 'crest': return '⛰'; case 'chicane': return '⚡⚡'; case 'straight': return '→'; default: return '•'; }
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<SceneState | null>(null);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const playbackSpeedRef = useRef<number>(1);
  const simRef = useRef<SimData | null>(null);
  const trackRef = useRef<TrackData | null>(null);

  const [lang, setLangState] = useState<Lang>(loadLang());
  const [sim, setSim] = useState<SimData | null>(null);
  const [track, setTrack] = useState<TrackData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [cameraMode, setCameraMode] = useState(1);
  const [currentCorner, setCurrentCorner] = useState('Start/Finish');
  const [selectedCorner, setSelectedCorner] = useState(0);
  const [toast, setToast] = useState('');
  const [showHint, setShowHint] = useState(true);
  const [showAbout, setShowAbout] = useState(false);
  const [visibility, setVisibility] = useState({
    wheelLoads: true, cogSphere: true, bodyRoll: true,
    racingLine: false, photoPlates: true, elevationTint: false, minimap: true,
  });
  const [signMode, setSignMode] = useState<'nearest' | 'all' | 'selected'>('nearest');

  // Sync refs
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { playbackSpeedRef.current = playbackSpeed; }, [playbackSpeed]);
  useEffect(() => { simRef.current = sim; }, [sim]);
  useEffect(() => { trackRef.current = track; }, [track]);

  useEffect(() => { const t = setTimeout(() => setShowHint(false), 6000); return () => clearTimeout(t); }, []);

  // Language persistence
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    saveLang(l);
  }, []);

  // Init
  useEffect(() => {
    const builtInTrack = buildBuiltInTrack();
    setTrack(builtInTrack);
    trackRef.current = builtInTrack;
    const simData = runSimulation(builtInTrack);
    setSim(simData);
    simRef.current = simData;
    if (containerRef.current) {
      const ss = initScene(containerRef.current, builtInTrack, simData);
      stateRef.current = ss;
      updateScene(ss, 0);
      ss.renderer.render(ss.scene, ss.camera);
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); if (stateRef.current) stateRef.current.renderer.dispose(); };
  }, []);

  // Animation loop
  useEffect(() => {
    if (!sim) return;
    const animate = (timestamp: number) => {
      if (!stateRef.current) return;
      if (isPlayingRef.current && simRef.current) {
        const dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0;
        lastTimeRef.current = timestamp;
        const nt = Math.min(currentTimeRef.current + dt * playbackSpeedRef.current, simRef.current.totalTime);
        currentTimeRef.current = nt;
        setCurrentTime(nt);
        if (nt >= simRef.current.totalTime) { isPlayingRef.current = false; setIsPlaying(false); }
      } else { lastTimeRef.current = timestamp; }
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [sim]);

  // Update scene
  useEffect(() => {
    if (!stateRef.current || !sim) return;
    const st = stateRef.current;
    st.currentTime = currentTime;
    st.visibility = visibility;
    st.signDisplayMode = signMode;
    st.selectedCorner = selectedCorner;
    updateScene(st, currentTime);
    st.renderer.render(st.scene, st.camera);
    if (track) {
      const data = interpSim(sim, currentTime);
      let nearest = CORNER_SPECS[0].name;
      let minDist = Infinity;
      let nearestIdx = 0;
      track.cornerPositions.forEach((cp, idx) => {
        const d = Math.abs(cp.fraction * track.totalLength - data.s);
        if (d < minDist) { minDist = d; nearest = CORNER_SPECS[idx].name; nearestIdx = idx; }
      });
      setCurrentCorner(nearest);
    }
  }, [currentTime, visibility, signMode, selectedCorner, sim, track]);

  // Resize
  useEffect(() => {
    const h = () => { if (containerRef.current && stateRef.current) resizeScene(stateRef.current, containerRef.current.clientWidth, containerRef.current.clientHeight); };
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Keyboard
  useEffect(() => {
    const hk = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case ' ': e.preventDefault(); setIsPlaying(p => !p); break;
        case 'ArrowLeft': setCurrentTime(t => { const nt = Math.max(0, t - 1 / 120); currentTimeRef.current = nt; return nt; }); break;
        case 'ArrowRight': setCurrentTime(t => { const nt = sim ? Math.min(sim.totalTime, t + 1 / 120) : t; currentTimeRef.current = nt; return nt; }); break;
        case '1': case '2': case '3': case '4': case '5': case '6': setCameraMode(parseInt(e.key)); if (stateRef.current) stateRef.current.cameraMode = parseInt(e.key); break;
        case 'r': case 'R': if (stateRef.current) recenterCamera(stateRef.current); break;
        case '[': { const ci = CORNER_SPECS.findIndex(c => c.name === currentCorner); if (ci > 0) jumpToCorner(ci - 1); break; }
        case ']': { const ci = CORNER_SPECS.findIndex(c => c.name === currentCorner); if (ci < CORNER_SPECS.length - 1) jumpToCorner(ci + 1); break; }
      }
    };
    window.addEventListener('keydown', hk);
    return () => window.removeEventListener('keydown', hk);
  }, [sim, currentCorner]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (stateRef.current && cameraMode === 6) stateRef.current.freeFlyState.keys.add(e.key.toLowerCase()); };
    const ku = (e: KeyboardEvent) => { if (stateRef.current) stateRef.current.freeFlyState.keys.delete(e.key.toLowerCase()); };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [cameraMode]);

  // GPX
  useEffect(() => {
    const drop = (e: DragEvent) => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f && f.name.endsWith('.gpx')) loadGpxFile(f); };
    const drag = (e: DragEvent) => e.preventDefault();
    window.addEventListener('drop', drop); window.addEventListener('dragover', drag);
    return () => { window.removeEventListener('drop', drop); window.removeEventListener('dragover', drag); };
  }, [track]);

  const loadGpxFile = useCallback(async (file: File) => {
    if (!trackRef.current) return;
    const text = await file.text();
    try {
      const { track: nt, pointCount, lengthKm } = parseGpx(text, trackRef.current);
      const ns = runSimulation(nt);
      if (stateRef.current && containerRef.current) {
        stateRef.current.renderer.dispose();
        containerRef.current.innerHTML = '';
        stateRef.current = initScene(containerRef.current, nt, ns);
      }
      setTrack(nt); trackRef.current = nt;
      setSim(ns); simRef.current = ns;
      currentTimeRef.current = 0; setCurrentTime(0);
      setToast(dict.gpxLoaded[lang].replace('{n}', pointCount.toString()).replace('{len}', lengthKm.toFixed(1)));
      setTimeout(() => setToast(''), 4000);
    } catch (err) { setToast(`Error: ${err}`); setTimeout(() => setToast(''), 4000); }
  }, [lang]);

  const handleLoadGpx = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.gpx';
    input.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) loadGpxFile(f); };
    input.click();
  }, [loadGpxFile]);

  const jumpToCorner = useCallback((idx: number) => {
    if (!simRef.current || !trackRef.current) return;
    const cp = trackRef.current.cornerPositions[idx];
    const tt = cp.fraction * simRef.current.totalTime;
    currentTimeRef.current = tt; setCurrentTime(tt);
    setSelectedCorner(idx);
    if (stateRef.current) {
      stateRef.current.selectedCorner = idx;
      updateScene(stateRef.current, tt);
      stateRef.current.renderer.render(stateRef.current.scene, stateRef.current.camera);
    }
  }, []);

  const jumpTo = useCallback((tv: number) => {
    currentTimeRef.current = tv; setCurrentTime(tv);
    if (stateRef.current) { updateScene(stateRef.current, tv); stateRef.current.renderer.render(stateRef.current.scene, stateRef.current.camera); }
  }, []);

  const toggleVis = useCallback((key: string) => {
    setVisibility(v => ({ ...v, [key]: !v[key as keyof typeof v] }));
  }, []);

  const handleSetCamera = useCallback((m: number) => { setCameraMode(m); if (stateRef.current) stateRef.current.cameraMode = m; }, []);

  // Narrative
  const data = sim ? interpSim(sim, currentTime) : null;
  const speedKmh = data ? (data.speed * 3.6).toFixed(0) : '0';
  const gearStr = data ? data.gear.toFixed(0) : '-';
  const timeStr = formatTime(currentTime);
  const totalTimeStr = sim ? formatTime(sim.totalTime) : '0:00.00';

  let narrative = '';
  if (data && sim) {
    const brakeStr = data.brake > 0.1 ? `${(Math.abs(data.aLong) / 9.81).toFixed(1)} g` : '—';
    const totalLoad = data.wheelLoadFL + data.wheelLoadFR + data.wheelLoadRL + data.wheelLoadRR;
    const frontLoad = totalLoad > 0 ? ((data.wheelLoadFL + data.wheelLoadFR) / totalLoad * 100).toFixed(0) : '50';
    const rollStr = `${Math.abs(data.rollAngle).toFixed(1)}°`;
    const gripPct = Math.min(100, Math.sqrt(data.aLat * data.aLat + data.aLong * data.aLong) / (1.25 * 9.81) * 100).toFixed(0);
    let note = dict.balanced[lang];
    if (data.aLat > 3 && data.brake > 0.3) note = dict.understeer[lang];
    else if (data.aLat > 3 && data.brake < 0.1) note = dict.oversteer[lang];
    else if (data.pitch < -0.02) note = dict.crest[lang];
    else if (data.throttle > 0.7) note = dict.accelerating[lang];
    else if (data.throttle < 0.1 && data.brake < 0.1) note = dict.coasting[lang];
    narrative = tNarrative(lang, currentCorner, brakeStr, `${frontLoad}%`, rollStr, `${gripPct}%`, note);
  }

  const pillBtn = "px-3 py-1.5 text-xs rounded border border-cyan-700 cursor-pointer transition-colors";

  return (
    <div className="w-screen h-screen overflow-hidden bg-black relative">
      <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 0 }} />

      <div className="absolute inset-0" style={{ pointerEvents: 'none', zIndex: 10 }}>
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2"
          style={{ pointerEvents: 'auto', background: 'linear-gradient(180deg, rgba(0,20,30,0.92) 0%, rgba(0,10,20,0.75) 100%)', borderBottom: '1px solid rgba(0,255,200,0.2)' }}>
          <div className="flex items-center gap-4">
            <h1 className="text-cyan-400 text-sm font-bold tracking-wider">{t('title', lang)}</h1>
            <div className="flex gap-3 text-xs">
              <span className="text-cyan-300">{t('lap', lang)}: <span className="text-amber-400 font-bold">{timeStr}</span> / {totalTimeStr}</span>
              <span className="text-cyan-300">{t('speed', lang)}: <span className="text-amber-400 font-bold">{speedKmh}</span> km/h</span>
              <span className="text-cyan-300">{t('gear', lang)}: <span className="text-amber-400 font-bold">{gearStr}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 border border-cyan-800 rounded-full flex items-center justify-center">
              <div className="absolute w-1 h-4 bg-red-500 rounded" style={{ transform: `rotate(${data ? (data.aLat / 9.81) * 25 : 0}deg) translateY(-4px)`, transformOrigin: 'bottom center' }} />
              <div className="absolute h-1 w-4 bg-green-500 rounded" style={{ transform: `translateX(${data ? (data.aLong / 9.81) * 8 : 0}px)` }} />
              <span className="text-[8px] text-cyan-600 absolute bottom-0">G</span>
            </div>
            <span className="text-cyan-200 text-lg font-bold">{currentCorner}</span>
          </div>
        </div>

        {/* Top-right pills */}
        <div className="absolute top-14 right-2 flex gap-1.5" style={{ pointerEvents: 'auto' }}>
          <button onClick={() => setLang(lang === 'en' ? 'ru' : 'en')}
            className={`${pillBtn} bg-cyan-900/80 hover:bg-cyan-800 text-cyan-300`}>
            {lang === 'en' ? 'RU' : 'EN'}
          </button>
          <button onClick={handleLoadGpx}
            className={`${pillBtn} bg-cyan-900/80 hover:bg-cyan-800 text-cyan-300 flex items-center gap-1`}>
            <span>↓</span> {t('loadGpx', lang)}
          </button>
          <button onClick={() => { if (stateRef.current) recenterCamera(stateRef.current); }}
            className={`${pillBtn} bg-cyan-900/80 hover:bg-cyan-800 text-cyan-300`}
            title={t('recenter', lang)}>
            ⊕
          </button>
          <button onClick={() => setShowAbout(a => !a)}
            className={`${pillBtn} bg-cyan-900/80 hover:bg-cyan-800 text-cyan-300`}>
            ?
          </button>
        </div>

        {/* Left Panel */}
        <div className="absolute left-2 top-20 bottom-36 w-52 overflow-y-auto"
          style={{ pointerEvents: 'auto', background: 'rgba(0,15,25,0.88)', border: '1px solid rgba(0,255,200,0.15)', borderRadius: '4px' }}>
          <div className="p-2 border-b border-cyan-900 text-cyan-400 text-xs font-bold">{t('corner', lang)}</div>
          <div className="p-1">
            {CORNER_SPECS.map((spec, idx) => (
              <button key={idx}
                className={`w-full text-left px-2 py-1 text-xs rounded transition-colors ${
                  selectedCorner === idx ? 'bg-amber-900/50 text-amber-200' :
                  currentCorner === spec.name ? 'bg-cyan-900/60 text-cyan-100' : 'text-cyan-500 hover:bg-cyan-900/30'
                }`}
                onClick={() => jumpToCorner(idx)}>
                <span className="text-amber-500 mr-1">{idx + 1}.</span>
                <span className="mr-1">{getCornerIcon(spec.character)}</span>
                {spec.name}
              </button>
            ))}
          </div>
        </div>

        {/* Right Panel */}
        <div className="absolute right-2 top-24 w-52"
          style={{ pointerEvents: 'auto', background: 'rgba(0,15,25,0.88)', border: '1px solid rgba(0,255,200,0.15)', borderRadius: '4px' }}>
          <div className="p-2 border-b border-cyan-900">
            <div className="text-cyan-400 text-xs font-bold mb-1">{t('camera', lang)}</div>
            <div className="text-[10px] text-cyan-600 mb-2">{t('cameraHints', lang)}</div>
            <div className="flex flex-wrap gap-1">
              {[1, 2, 3, 4, 5, 6].map(m => (
                <button key={m} title={tTooltip(m, lang)}
                  className={`px-2 py-0.5 text-xs rounded ${cameraMode === m ? 'bg-cyan-700 text-white' : 'bg-cyan-900/50 text-cyan-400 hover:bg-cyan-800'}`}
                  onClick={() => handleSetCamera(m)}>{m}</button>
              ))}
            </div>
          </div>
          <div className="p-2 border-b border-cyan-900">
            <div className="text-cyan-400 text-xs font-bold mb-1">{t('massOverlay', lang)}</div>
            {[
              { key: 'wheelLoads', label: t('wheelLoads', lang) },
              { key: 'cogSphere', label: t('cogSphere', lang) },
              { key: 'bodyRoll', label: t('bodyRoll', lang) },
            ].map(item => (
              <label key={item.key} className="flex items-center gap-2 text-xs text-cyan-400 py-0.5 cursor-pointer">
                <input type="checkbox" checked={visibility[item.key as keyof typeof visibility]} onChange={() => toggleVis(item.key)} className="accent-cyan-500" />
                {item.label}
              </label>
            ))}
          </div>
          <div className="p-2 border-b border-cyan-900">
            <div className="text-cyan-400 text-xs font-bold mb-1">Layers</div>
            {[
              { key: 'racingLine', label: t('racingLine', lang) },
              { key: 'photoPlates', label: t('photoPlates', lang) },
              { key: 'elevationTint', label: t('elevationTint', lang) },
            ].map(item => (
              <label key={item.key} className="flex items-center gap-2 text-xs text-cyan-400 py-0.5 cursor-pointer">
                <input type="checkbox" checked={visibility[item.key as keyof typeof visibility]} onChange={() => toggleVis(item.key)} className="accent-cyan-500" />
                {item.label}
              </label>
            ))}
          </div>
          <div className="p-2 border-b border-cyan-900">
            <div className="text-cyan-400 text-xs font-bold mb-1">{t('signMode', lang)}</div>
            <div className="flex gap-1">
              {(['nearest', 'all', 'selected'] as const).map(m => (
                <button key={m}
                  className={`px-2 py-0.5 text-xs rounded ${signMode === m ? 'bg-cyan-700 text-white' : 'bg-cyan-900/50 text-cyan-400 hover:bg-cyan-800'}`}
                  onClick={() => setSignMode(m)}>
                  {t(`sign${m.charAt(0).toUpperCase() + m.slice(1)}` as 'signNearest' | 'signAll' | 'signSelected', lang)}
                </button>
              ))}
            </div>
          </div>
          {data && (
            <div className="p-2 text-xs text-cyan-500">
              <div>{t('roll', lang)}: <span className="text-amber-400">{data.rollAngle.toFixed(1)}°</span></div>
              <div>{t('pitch', lang)}: <span className="text-amber-400">{data.pitchAngle.toFixed(1)}°</span></div>
            </div>
          )}
        </div>

        {/* Minimap */}
        {visibility.minimap && track && sim && (
          <div className="absolute left-2 bottom-36" style={{ pointerEvents: 'auto' }}>
            <Minimap track={track} sim={sim} currentTime={currentTime} onJumpTo={jumpTo} />
          </div>
        )}

        {/* Bottom */}
        <div className="absolute bottom-0 left-0 right-0"
          style={{ pointerEvents: 'auto', background: 'linear-gradient(0deg, rgba(0,20,30,0.95) 0%, rgba(0,10,20,0.8) 100%)', borderTop: '1px solid rgba(0,255,200,0.2)' }}>
          {sim && <MiniGraph sim={sim} currentTime={currentTime} onJumpTo={jumpTo} />}
          <div className="px-4 py-1">
            <input type="range" min={0} max={sim?.totalTime || 100} step={1 / 120}
              value={currentTime} onChange={e => jumpTo(parseFloat(e.target.value))}
              className="w-full h-2 cursor-pointer" />
            {sim && (
              <div className="relative h-3 mt-0.5">
                {CORNER_SPECS.map((_, idx) => (
                  <div key={idx} className={`absolute top-0 w-px h-2 ${selectedCorner === idx ? 'bg-amber-500' : 'bg-cyan-700'}`}
                    style={{ left: `${(idx / (CORNER_SPECS.length - 1)) * 100}%` }} title={CORNER_SPECS[idx].name} />
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-3 pb-2 px-4">
            <button onClick={() => jumpTo(Math.max(0, currentTime - 1 / 120))} className="text-cyan-400 hover:text-cyan-200 text-sm px-2">◀</button>
            <button onClick={() => setIsPlaying(p => !p)} className="bg-cyan-800 hover:bg-cyan-700 text-white px-4 py-1 rounded text-sm font-bold">{isPlaying ? '⏸' : '▶'}</button>
            <button onClick={() => jumpTo(Math.min(sim?.totalTime || 0, currentTime + 1 / 120))} className="text-cyan-400 hover:text-cyan-200 text-sm px-2">▶</button>
            <div className="flex gap-1 ml-4">
              {[0.1, 0.25, 0.5, 1, 2, 4].map(s => (
                <button key={s} className={`px-2 py-0.5 text-xs rounded ${playbackSpeed === s ? 'bg-amber-700 text-white' : 'bg-cyan-900/50 text-cyan-400 hover:bg-cyan-800'}`}
                  onClick={() => { setPlaybackSpeed(s); playbackSpeedRef.current = s; }}>{s}×</button>
              ))}
            </div>
            <span className="text-amber-400 text-sm font-mono ml-4">{timeStr}</span>
          </div>
        </div>

        {/* Narrative */}
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 max-w-xl text-center">
          <p className="text-cyan-300/80 text-xs italic px-4 py-1" style={{ background: 'rgba(0,10,20,0.7)', borderRadius: '4px' }}>{narrative}</p>
        </div>

        {/* Toast */}
        {toast && <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-cyan-900/90 text-cyan-200 text-sm px-4 py-2 rounded border border-cyan-500/50">{toast}</div>}

        {/* Hint */}
        {showHint && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-300/70 text-sm text-center px-6 py-3 rounded-lg"
            style={{ background: 'rgba(0,20,30,0.8)', border: '1px solid rgba(0,255,200,0.3)', animation: 'fadeOut 6s forwards' }}>
            {t('hint', lang)}
          </div>
        )}

        {/* About */}
        {showAbout && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-cyan-950/95 border border-cyan-500/50 rounded-lg p-6 max-w-md text-cyan-200 text-sm"
            style={{ pointerEvents: 'auto' }}>
            <h3 className="text-cyan-400 font-bold mb-2">{t('about', lang)}</h3>
            <p className="mb-3">{t('aboutText', lang)}</p>
            <p className="text-xs text-cyan-500 mb-2">Photos: Karussell.jpg, Nordschleife_Brünnchen.jpg, Nürburgring_Flugplatz.jpg, Nürburgring_Bergwerk.jpg, Döttinger_Höhe.jpg, Nürburgring_start-finish.jpg</p>
            <p className="text-xs text-cyan-500">Licenses: CC BY-SA 3.0 / Public Domain (Wikimedia Commons)</p>
            <button onClick={() => setShowAbout(false)} className="mt-3 px-3 py-1 bg-cyan-800 hover:bg-cyan-700 rounded text-xs">OK</button>
          </div>
        )}
      </div>
    </div>
  );
}
