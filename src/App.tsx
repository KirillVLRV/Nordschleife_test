// ============================================================
// SECTION: Main App — Nordschleife Mass Lab v2.0
// ============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import { buildBuiltInTrack, parseGpx, TrackData, CORNER_SPECS } from './track';
import { runSimulation, SimData, interpSim } from './simulation';
import { initScene, updateScene, resizeScene, recenterCamera, SceneState } from './scene';
import { Lang, t, tNarrative, tTooltip, dict, loadLang, saveLang } from './i18n';
import { CARS, CarConfig, getEffectiveParams, SKETCHFAB_SEARCH_URLS } from './cars';
import { soundSystem } from './sound';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(2)}`;
}

function getCornerIcon(c: string): string {
  switch (c) { case 'right': return '↱'; case 'left': return '↰'; case 'kink': return '⚡'; case 'crest': return '⛰'; case 'chicane': return '⚡⚡'; case 'straight': return '→'; default: return '•'; }
}

// Telemetry graph component
function TelemetryGraph({ sim, currentTime, onJumpTo }: { sim: SimData; currentTime: number; onJumpTo: (t: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,10,20,0.9)';
    ctx.fillRect(0, 0, w, h);

    // Gear bands (background)
    let lastGear = 0;
    let gearStart = 0;
    for (let i = 0; i < sim.numFrames; i += 10) {
      const g = sim.gear[i];
      if (g !== lastGear) {
        if (lastGear > 0) {
          const x1 = (gearStart / sim.numFrames) * w;
          const x2 = (i / sim.numFrames) * w;
          ctx.fillStyle = lastGear % 2 === 0 ? 'rgba(0,100,150,0.15)' : 'rgba(0,80,120,0.1)';
          ctx.fillRect(x1, 0, x2 - x1, h);
        }
        lastGear = g;
        gearStart = i;
      }
    }

    // Speed graph (amber)
    let maxSpeed = 0;
    for (let i = 0; i < sim.numFrames; i += 10) if (sim.speed[i] > maxSpeed) maxSpeed = sim.speed[i];
    maxSpeed *= 1.1;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,180,0,0.8)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < sim.numFrames; i += 4) {
      const x = (i / sim.numFrames) * w;
      const y = h - (sim.speed[i] / maxSpeed) * h * 0.9;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // aLat graph (cyan)
    const maxALat = 15;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,255,200,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < sim.numFrames; i += 4) {
      const x = (i / sim.numFrames) * w;
      const y = h / 2 - (sim.aLat[i] / maxALat) * h * 0.4;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // aLong graph (green)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,255,100,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < sim.numFrames; i += 4) {
      const x = (i / sim.numFrames) * w;
      const y = h / 2 - (sim.aLong[i] / maxALat) * h * 0.4;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Corner ticks
    ctx.fillStyle = 'rgba(0,255,200,0.3)';
    CORNER_SPECS.forEach((_, idx) => {
      const frac = idx / (CORNER_SPECS.length - 1);
      const x = frac * w;
      ctx.fillRect(x, 0, 1, h);
    });

    // Current time indicator
    const tx = (currentTime / sim.totalTime) * w;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.moveTo(tx, 0); ctx.lineTo(tx, h);
    ctx.stroke();

    // Legend
    ctx.font = '9px monospace';
    ctx.fillStyle = '#ffaa00';
    ctx.fillText('v(t)', 5, 12);
    ctx.fillStyle = '#00ffcc';
    ctx.fillText('aLat', 35, 12);
    ctx.fillStyle = '#00ff66';
    ctx.fillText('aLong', 70, 12);
  }, [sim, currentTime]);

  return (
    <canvas ref={canvasRef} width={800} height={60} className="w-full cursor-pointer"
      onClick={e => { const r = (e.target as HTMLCanvasElement).getBoundingClientRect(); onJumpTo(((e.clientX - r.left) / r.width) * sim.totalTime); }}
      onMouseDown={e => {
        const handleMove = (ev: MouseEvent) => {
          const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
          onJumpTo(((ev.clientX - r.left) / r.width) * sim.totalTime);
        };
        const handleUp = () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
      }}
    />
  );
}

// Car preview component (small canvas)
function CarPreview({ car, selected, lang, onFindModel, onRotateModel, onLoadModel }: { 
  car: CarConfig; 
  selected: boolean; 
  lang: Lang;
  onFindModel: () => void;
  onRotateModel: (degrees: number) => void;
  onLoadModel: (file: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showModelForm, setShowModelForm] = useState(false);
  const [modelAuthor, setModelAuthor] = useState(car.modelAuthor || '');
  const [modelLicense, setModelLicense] = useState(car.modelLicense || '');
  const [modelSource, setModelSource] = useState(car.modelSource || '');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,20,30,0.8)';
    ctx.fillRect(0, 0, w, h);

    // Simple top-down car shape
    const cx = w / 2, cy = h / 2;
    const scale = Math.min(w, h) / (car.length * 1.5);
    const halfL = car.length * scale / 2;
    const halfW = car.trackWidth * scale / 2 + 5;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((car.modelRotation || 0) * Math.PI / 180);

    // Body
    const color = '#' + car.paintColor.toString(16).padStart(6, '0');
    ctx.fillStyle = color;
    ctx.fillRect(-halfW, -halfL, halfW * 2, halfL * 2);

    // Wheels
    ctx.fillStyle = '#222';
    const wheelW = 4, wheelL = 8;
    const wb = car.wheelbase * scale / 2;
    ctx.fillRect(-halfW - 2, -wb - wheelL / 2, wheelW, wheelL);
    ctx.fillRect(halfW - 2, -wb - wheelL / 2, wheelW, wheelL);
    ctx.fillRect(-halfW - 2, wb - wheelL / 2, wheelW, wheelL);
    ctx.fillRect(halfW - 2, wb - wheelL / 2, wheelW, wheelL);

    ctx.restore();

    // Border
    if (selected) {
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
    }

    // Custom model indicator
    if (car.customModelLoaded) {
      ctx.fillStyle = '#00ff00';
      ctx.font = '10px Arial';
      ctx.fillText('3D', 5, 12);
    }
  }, [car, selected]);

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
      onLoadModel(file);
      setShowModelForm(true);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadModel(file);
      setShowModelForm(true);
    }
  };

  return (
    <div className="relative">
      <div 
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={handleFileDrop}
        className="relative"
      >
        <canvas ref={canvasRef} width={80} height={50} className="rounded cursor-pointer" />
        
        {/* Model info line */}
        <div className="text-[8px] text-cyan-600 mt-0.5 text-center truncate">
          {car.customModelLoaded ? (
            <span>{t('model', lang)}: {car.modelAuthor || t('unknown', lang)} ({car.modelLicense || t('unknown', lang)})</span>
          ) : (
            <span className="text-gray-600">{t('model', lang)}: —</span>
          )}
        </div>
      </div>

      {/* Control buttons */}
      <div className="flex gap-0.5 mt-1 justify-center">
        {!car.customModelLoaded && (
          <button 
            onClick={(e) => { e.stopPropagation(); onFindModel(); }}
            className="text-[9px] px-1 py-0.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-400 rounded cursor-pointer"
            title={t('findModel', lang)}
          >
            🔍
          </button>
        )}
        {car.customModelLoaded && (
          <>
            <button 
              onClick={(e) => { e.stopPropagation(); onRotateModel(-90); }}
              className="text-[9px] px-1 py-0.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-400 rounded cursor-pointer"
              title={`${t('rotateModel', lang)} -90°`}
            >
              ↺
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onRotateModel(90); }}
              className="text-[9px] px-1 py-0.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-400 rounded cursor-pointer"
              title={`${t('rotateModel', lang)} +90°`}
            >
              ↻
            </button>
            <label className="text-[9px] px-1 py-0.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-400 rounded cursor-pointer">
              📁
              <input 
                type="file" 
                accept=".glb,.gltf" 
                onChange={handleFileInput}
                className="hidden"
              />
            </label>
          </>
        )}
      </div>

      {/* Model info form */}
      {showModelForm && (
        <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-cyan-950/95 border border-cyan-700 rounded text-[9px] z-20">
          <div className="text-cyan-400 mb-1">{t('enterModelInfo', lang)}</div>
          <input 
            type="text" 
            placeholder={t('modelAuthor', lang)}
            value={modelAuthor}
            onChange={(e) => setModelAuthor(e.target.value)}
            className="w-full mb-1 px-1 py-0.5 bg-black/50 border border-cyan-800 rounded text-cyan-300"
          />
          <input 
            type="text" 
            placeholder={t('modelLicense', lang)}
            value={modelLicense}
            onChange={(e) => setModelLicense(e.target.value)}
            className="w-full mb-1 px-1 py-0.5 bg-black/50 border border-cyan-800 rounded text-cyan-300"
          />
          <input 
            type="text" 
            placeholder={t('modelSource', lang)}
            value={modelSource}
            onChange={(e) => setModelSource(e.target.value)}
            className="w-full mb-1 px-1 py-0.5 bg-black/50 border border-cyan-800 rounded text-cyan-300"
          />
          <div className="flex gap-1">
            <button 
              onClick={() => setShowModelForm(false)}
              className="flex-1 px-1 py-0.5 bg-cyan-800 hover:bg-cyan-700 text-cyan-300 rounded cursor-pointer"
            >
              {t('skip', lang)}
            </button>
            <button 
              onClick={() => {
                // Save model info - this would need to be passed up to parent
                setShowModelForm(false);
              }}
              className="flex-1 px-1 py-0.5 bg-amber-700 hover:bg-amber-600 text-white rounded cursor-pointer"
            >
              {t('save', lang)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
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
  const [selectedCarIdx, setSelectedCarIdx] = useState(0);
  const [carConfigs, setCarConfigs] = useState<CarConfig[]>(CARS.map(c => ({ ...c })));
  const [isMuted, setIsMuted] = useState(false);
  const [showTelemetry, setShowTelemetry] = useState(true);

  // Sync refs
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { playbackSpeedRef.current = playbackSpeed; }, [playbackSpeed]);
  useEffect(() => { simRef.current = sim; }, [sim]);
  useEffect(() => { trackRef.current = track; }, [track]);

  useEffect(() => { const t = setTimeout(() => setShowHint(false), 6000); return () => clearTimeout(t); }, []);

  // Initialize sound on first user interaction
  useEffect(() => {
    const initSound = () => {
      soundSystem['init']();
      window.removeEventListener('click', initSound);
      window.removeEventListener('keydown', initSound);
    };
    window.addEventListener('click', initSound);
    window.addEventListener('keydown', initSound);
    return () => {
      window.removeEventListener('click', initSound);
      window.removeEventListener('keydown', initSound);
    };
  }, []);

  // Handle mute
  useEffect(() => {
    soundSystem.setMuted(isMuted);
  }, [isMuted]);

  // Handle audio file drag & drop
  useEffect(() => {
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file && (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg)$/i))) {
        try {
          const name = await soundSystem.loadUserAudio(file);
          setToast(`${lang === 'en' ? 'Loaded' : 'Загружен'}: ${name}`);
          setTimeout(() => setToast(''), 3000);
        } catch (err) {
          setToast(`${lang === 'en' ? 'Error loading audio' : 'Ошибка загрузки аудио'}`);
          setTimeout(() => setToast(''), 3000);
        }
      }
    };
    const handleDragOver = (e: DragEvent) => e.preventDefault();
    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragover', handleDragOver);
    return () => {
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragover', handleDragOver);
    };
  }, [lang]);

  const setLang = useCallback((l: Lang) => { setLangState(l); saveLang(l); }, []);

  // Init
  useEffect(() => {
    const builtInTrack = buildBuiltInTrack();
    setTrack(builtInTrack);
    trackRef.current = builtInTrack;
    const simData = runSimulation(builtInTrack, carConfigs[0]);
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
    updateScene(st, currentTime);
    st.renderer.render(st.scene, st.camera);
    if (track) {
      const data = interpSim(sim, currentTime);
      let nearest = CORNER_SPECS[0].name;
      let minDist = Infinity;
      track.cornerPositions.forEach((cp, idx) => {
        const d = Math.abs(cp.fraction * track.totalLength - data.s);
        if (d < minDist) { minDist = d; nearest = CORNER_SPECS[idx].name; }
      });
      setCurrentCorner(nearest);
    }
  }, [currentTime, sim, track]);

  // Resize
  useEffect(() => {
    const h = () => { if (containerRef.current && stateRef.current) resizeScene(stateRef.current, containerRef.current.clientWidth, containerRef.current.clientHeight); };
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Car selection
  const selectCar = useCallback((idx: number) => {
    if (!trackRef.current) return;
    setSelectedCarIdx(idx);
    const timeFrac = simRef.current ? currentTimeRef.current / simRef.current.totalTime : 0;
    const newSim = runSimulation(trackRef.current, carConfigs[idx]);
    setSim(newSim);
    simRef.current = newSim;
    const newTime = timeFrac * newSim.totalTime;
    currentTimeRef.current = newTime;
    setCurrentTime(newTime);
    // Swap car mesh
    if (stateRef.current) {
      // TODO: swap car mesh based on carConfigs[idx]
    }
  }, [carConfigs]);

  // Slider update
  const updateCarParam = useCallback((key: keyof CarConfig, value: number | boolean) => {
    setCarConfigs(prev => {
      const next = [...prev];
      next[selectedCarIdx] = { ...next[selectedCarIdx], [key]: value };
      return next;
    });
    // Re-run simulation
    if (!trackRef.current) return;
    const timeFrac = simRef.current ? currentTimeRef.current / simRef.current.totalTime : 0;
    setTimeout(() => {
      const newSim = runSimulation(trackRef.current!, carConfigs[selectedCarIdx]);
      setSim(newSim);
      simRef.current = newSim;
      const newTime = timeFrac * newSim.totalTime;
      currentTimeRef.current = newTime;
      setCurrentTime(newTime);
    }, 0);
  }, [selectedCarIdx, carConfigs]);

  // Export PNG
  const exportFrame = useCallback(() => {
    if (!stateRef.current) return;
    const canvas = stateRef.current.renderer.domElement;
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `nordschleife-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }, []);

  const jumpTo = useCallback((tv: number) => {
    currentTimeRef.current = tv; setCurrentTime(tv);
    if (stateRef.current) { updateScene(stateRef.current, tv); stateRef.current.renderer.render(stateRef.current.scene, stateRef.current.camera); }
  }, []);

  const currentCar = carConfigs[selectedCarIdx];
  const data = sim ? interpSim(sim, currentTime) : null;

  // Update sound with simulation data
  useEffect(() => {
    if (!data || isMuted) return;
    soundSystem.update(data.rpm, data.throttle);
  }, [data, isMuted]);
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
    const gripPct = Math.min(100, Math.sqrt(data.aLat * data.aLat + data.aLong * data.aLong) / (currentCar.gripMu * 9.81) * 100).toFixed(0);
    let note = dict.balanced[lang];
    if (data.aLat > 3 && data.brake > 0.3) note = dict.understeer[lang];
    else if (data.aLat > 3 && data.brake < 0.1) note = dict.oversteer[lang];
    else if (data.pitch < -0.02) note = dict.crest[lang];
    else if (data.throttle > 0.7) note = dict.accelerating[lang];
    else if (data.throttle < 0.1 && data.brake < 0.1) note = dict.coasting[lang];
    if (currentCar.surfaceWet) note += ` (${lang === 'en' ? 'wet' : 'мокро'})`;
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
              <span className="text-cyan-300 text-amber-300">{lang === 'en' ? currentCar.name : currentCar.nameRu}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsMuted(m => !m)} className={`${pillBtn} bg-cyan-900/80 hover:bg-cyan-800 text-cyan-300`}>
              {isMuted ? '🔇' : '🔊'}
            </button>
            <button onClick={exportFrame} className={`${pillBtn} bg-cyan-900/80 hover:bg-cyan-800 text-cyan-300`}>
              📷
            </button>
          </div>
        </div>

        {/* Top-right pills */}
        <div className="absolute top-14 right-2 flex gap-1.5" style={{ pointerEvents: 'auto' }}>
          <button onClick={() => setLang(lang === 'en' ? 'ru' : 'en')} className={`${pillBtn} bg-cyan-900/80 hover:bg-cyan-800 text-cyan-300`}>
            {lang === 'en' ? 'RU' : 'EN'}
          </button>
        </div>

        {/* Right Panel: Garage + Sliders */}
        <div className="absolute right-2 top-24 bottom-36 w-64 overflow-y-auto"
          style={{ pointerEvents: 'auto', background: 'rgba(0,15,25,0.88)', border: '1px solid rgba(0,255,200,0.15)', borderRadius: '4px' }}>
          <div className="p-2 border-b border-cyan-900 text-cyan-400 text-xs font-bold">{lang === 'en' ? 'Garage' : 'Гараж'}</div>
          <div className="p-2 grid grid-cols-2 gap-2">
            {carConfigs.map((car, idx) => (
              <div key={car.id} onClick={() => selectCar(idx)} className="cursor-pointer">
                <CarPreview 
                  car={car} 
                  selected={idx === selectedCarIdx} 
                  lang={lang}
                  onFindModel={() => {
                    const url = SKETCHFAB_SEARCH_URLS[car.id];
                    if (url) window.open(url, '_blank');
                  }}
                  onRotateModel={(degrees) => {
                    const newRotation = ((car.modelRotation || 0) + degrees + 360) % 360;
                    setCarConfigs(prev => {
                      const next = [...prev];
                      next[idx] = { ...next[idx], modelRotation: newRotation };
                      return next;
                    });
                  }}
                  onLoadModel={async (file) => {
                    try {
                      // Import model loader dynamically to avoid circular deps
                      const { loadModel, normalizeModel } = await import('./modelLoader');
                      const loaded = await loadModel(file);
                      
                      // Check for heavy model
                      if (loaded.triangleCount > 200000) {
                        setToast(t('heavyModel', lang));
                        setTimeout(() => setToast(''), 3000);
                      }
                      
                      // Normalize model
                      normalizeModel(loaded.scene, car.length);
                      
                      // Update car config
                      setCarConfigs(prev => {
                        const next = [...prev];
                        next[idx] = { 
                          ...next[idx], 
                          customModelLoaded: true,
                          // Store loaded model reference (would need to be in scene state)
                        };
                        return next;
                      });
                      
                      setToast(`${lang === 'en' ? 'Loaded' : 'Загружен'}: ${file.name} (${loaded.triangleCount.toLocaleString()} tris, ${loaded.wheelNodes.length} wheels)`);
                      setTimeout(() => setToast(''), 3000);
                    } catch (err) {
                      setToast(`${lang === 'en' ? 'Error loading model' : 'Ошибка загрузки модели'}: ${err}`);
                      setTimeout(() => setToast(''), 3000);
                    }
                  }}
                />
                <div className="text-[9px] text-cyan-400 mt-1 text-center truncate">
                  {lang === 'en' ? car.name : car.nameRu}
                </div>
              </div>
            ))}
          </div>

          <div className="p-2 border-t border-cyan-900">
            <div className="text-cyan-400 text-xs font-bold mb-2">{lang === 'en' ? 'Parameters' : 'Параметры'}</div>
            {[
              { key: 'massMultiplier', label: lang === 'en' ? 'Mass' : 'Масса', min: 0.7, max: 1.3, step: 0.05, format: (v: number) => `${(v * 100).toFixed(0)}%` },
              { key: 'cogHeightOffset', label: lang === 'en' ? 'CoG Height' : 'Высота ЦМ', min: -0.1, max: 0.1, step: 0.01, format: (v: number) => `${(v * 100).toFixed(0)}cm` },
              { key: 'powerMultiplier', label: lang === 'en' ? 'Power' : 'Мощность', min: 0.6, max: 1.4, step: 0.05, format: (v: number) => `${(v * 100).toFixed(0)}%` },
              { key: 'gripMu', label: lang === 'en' ? 'Grip μ' : 'Сцепление μ', min: 0.6, max: 1.6, step: 0.05, format: (v: number) => v.toFixed(2) },
              { key: 'driverSkill', label: lang === 'en' ? 'Driver Skill' : 'Мастерство', min: 0.7, max: 1.0, step: 0.02, format: (v: number) => `${(v * 100).toFixed(0)}%` },
            ].map(slider => (
              <div key={slider.key} className="mb-2">
                <div className="flex justify-between text-[10px] text-cyan-500 mb-0.5">
                  <span>{slider.label}</span>
                  <span className="text-amber-400">{slider.format(currentCar[slider.key as keyof CarConfig] as number)}</span>
                </div>
                <input type="range" min={slider.min} max={slider.max} step={slider.step}
                  value={currentCar[slider.key as keyof CarConfig] as number}
                  onChange={e => updateCarParam(slider.key as keyof CarConfig, parseFloat(e.target.value))}
                  className="w-full h-1 accent-cyan-500" />
              </div>
            ))}
            <label className="flex items-center gap-2 text-xs text-cyan-400 mt-2 cursor-pointer">
              <input type="checkbox" checked={currentCar.surfaceWet} onChange={e => updateCarParam('surfaceWet', e.target.checked)} className="accent-cyan-500" />
              {lang === 'en' ? 'Wet Surface' : 'Мокрая поверхность'}
            </label>
          </div>
        </div>

        {/* Bottom */}
        <div className="absolute bottom-0 left-0 right-0"
          style={{ pointerEvents: 'auto', background: 'linear-gradient(0deg, rgba(0,20,30,0.95) 0%, rgba(0,10,20,0.8) 100%)', borderTop: '1px solid rgba(0,255,200,0.2)' }}>
          
          {/* Telemetry drawer */}
          {showTelemetry && sim && (
            <div className="px-2 pt-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-cyan-400 text-xs font-bold">{lang === 'en' ? 'Telemetry' : 'Телеметрия'}</span>
                <button onClick={() => setShowTelemetry(false)} className="text-cyan-600 text-xs hover:text-cyan-400">▼</button>
              </div>
              <TelemetryGraph sim={sim} currentTime={currentTime} onJumpTo={jumpTo} />
            </div>
          )}
          {!showTelemetry && (
            <button onClick={() => setShowTelemetry(true)} className="w-full text-cyan-600 text-xs hover:text-cyan-400 py-1">▲ {lang === 'en' ? 'Telemetry' : 'Телеметрия'}</button>
          )}

          {/* Scrubber */}
          <div className="px-4 py-1">
            <input type="range" min={0} max={sim?.totalTime || 100} step={1 / 120}
              value={currentTime} onChange={e => jumpTo(parseFloat(e.target.value))}
              className="w-full h-2 cursor-pointer" />
          </div>

          {/* Transport */}
          <div className="flex items-center justify-center gap-3 pb-2 px-4">
            <button onClick={() => setIsPlaying(p => !p)} className="bg-cyan-800 hover:bg-cyan-700 text-white px-4 py-1 rounded text-sm font-bold">{isPlaying ? '⏸' : '▶'}</button>
            <div className="flex gap-1">
              {[0.1, 0.25, 0.5, 1, 2, 4].map(s => (
                <button key={s} className={`px-2 py-0.5 text-xs rounded ${playbackSpeed === s ? 'bg-amber-700 text-white' : 'bg-cyan-900/50 text-cyan-400 hover:bg-cyan-800'}`}
                  onClick={() => { setPlaybackSpeed(s); playbackSpeedRef.current = s; }}>{s}×</button>
              ))}
            </div>
            <span className="text-amber-400 text-sm font-mono ml-4">{timeStr}</span>
          </div>
        </div>

        {/* Narrative */}
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 max-w-xl text-center">
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
      </div>
    </div>
  );
}
