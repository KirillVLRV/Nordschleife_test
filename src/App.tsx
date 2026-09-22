// ============================================================
// SECTION: Main App — Nordschleife Mass Lab
// ============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import { buildBuiltInTrack, parseGpx, TrackData, CORNER_SPECS } from './track';
import { runSimulation, SimData, interpSim } from './simulation';
import { initScene, updateScene, resizeScene, SceneState } from './scene';
import { Lang, t, tNarrative, dict } from './i18n';

// ============================================================
// UI Component: HUD Overlay
// ============================================================
function HUD({ 
  lang, sim, currentTime, isPlaying, playbackSpeed, cameraMode,
  visibility, onTogglePlay, onSetSpeed, onSetCamera, onToggleVisibility,
  onJumpCorner, onJumpTo, currentCorner, toast
}: {
  lang: Lang;
  sim: SimData | null;
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  cameraMode: number;
  visibility: { wheelLoads: boolean; cogSphere: boolean; bodyRoll: boolean };
  onTogglePlay: () => void;
  onSetSpeed: (s: number) => void;
  onSetCamera: (m: number) => void;
  onToggleVisibility: (key: string) => void;
  onJumpCorner: (idx: number) => void;
  onJumpTo: (t: number) => void;
  currentCorner: string;
  toast: string;
}) {
  const data = sim ? interpSim(sim, currentTime) : null;
  const speedKmh = data ? (data.speed * 3.6).toFixed(0) : '0';
  const gearStr = data ? data.gear.toFixed(0) : '-';
  const timeStr = formatTime(currentTime);
  const totalTimeStr = sim ? formatTime(sim.totalTime) : '0:00.00';
  
  // g-meter values
  const gLat = data ? (data.aLat / 9.81).toFixed(2) : '0.00';
  const gLong = data ? (data.aLong / 9.81).toFixed(2) : '0.00';

  // Narrative
  let narrative = '';
  if (data && sim) {
    const brakeStr = data.brake > 0.1 ? `${(data.aLong / 9.81 * -1).toFixed(1)} g` : '—';
    const frontLoad = ((data.wheelLoadFL + data.wheelLoadFR) / (data.wheelLoadFL + data.wheelLoadFR + data.wheelLoadRL + data.wheelLoadRR) * 100).toFixed(0);
    const rollStr = `${Math.abs(data.rollAngle).toFixed(1)}°`;
    const gripStr = `${(Math.min(100, Math.sqrt(data.aLat * data.aLat + data.aLong * data.aLong) / (1.1 * 9.81) * 100)).toFixed(0)}%`;
    let note = dict.balanced[lang];
    if (data.aLat > 3 && data.brake > 0.3) note = dict.understeer[lang];
    else if (data.aLat > 3 && data.brake < 0.1) note = dict.oversteer[lang];
    else if (data.pitch < -0.02) note = dict.crest[lang];
    else if (data.throttle > 0.7) note = dict.accelerating[lang];
    else if (data.throttle < 0.1 && data.brake < 0.1) note = dict.coasting[lang];
    narrative = tNarrative(lang, currentCorner, brakeStr, `${frontLoad}%`, rollStr, gripStr, note);
  }

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 pointer-events-auto"
        style={{ background: 'linear-gradient(180deg, rgba(0,20,30,0.9) 0%, rgba(0,10,20,0.7) 100%)', borderBottom: '1px solid rgba(0,255,200,0.2)' }}>
        <div className="flex items-center gap-4">
          <h1 className="text-cyan-400 text-sm font-bold tracking-wider">{t('title', lang)}</h1>
          <div className="flex gap-3 text-xs">
            <span className="text-cyan-300">{t('lap', lang)}: <span className="text-amber-400 font-bold">{timeStr}</span> / {totalTimeStr}</span>
            <span className="text-cyan-300">{t('speed', lang)}: <span className="text-amber-400 font-bold">{speedKmh}</span> km/h</span>
            <span className="text-cyan-300">{t('gear', lang)}: <span className="text-amber-400 font-bold">{gearStr}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* G-meter */}
          <div className="relative w-12 h-12 border border-cyan-800 rounded-full flex items-center justify-center">
            <div className="absolute w-1 h-4 bg-red-500 rounded" style={{
              transform: `rotate(${parseFloat(gLat) * 30}deg) translateY(-4px)`,
              transformOrigin: 'bottom center'
            }} />
            <div className="absolute h-1 w-4 bg-green-500 rounded" style={{
              transform: `translateX(${parseFloat(gLong) * 8}px)`,
            }} />
            <span className="text-[8px] text-cyan-600 absolute bottom-0">G</span>
          </div>
          <span className="text-cyan-200 text-lg font-bold">{currentCorner}</span>
        </div>
      </div>

      {/* Left Panel: Corner List */}
      <div className="absolute left-2 top-16 bottom-32 w-48 overflow-y-auto pointer-events-auto"
        style={{ background: 'rgba(0,15,25,0.85)', border: '1px solid rgba(0,255,200,0.15)', borderRadius: '4px' }}>
        <div className="p-2 border-b border-cyan-900 text-cyan-400 text-xs font-bold">{t('corner', lang)}</div>
        <div className="p-1">
          {CORNER_SPECS.map((spec, idx) => (
            <button key={idx}
              className={`w-full text-left px-2 py-1 text-xs rounded transition-colors ${
                currentCorner === spec.name ? 'bg-cyan-900/50 text-cyan-200' : 'text-cyan-500 hover:bg-cyan-900/30'
              }`}
              onClick={() => onJumpCorner(idx)}>
              <span className="text-amber-500 mr-1">{idx + 1}.</span>
              <span className="mr-1">{getCornerIcon(spec.character)}</span>
              {spec.name}
            </button>
          ))}
        </div>
      </div>

      {/* Right Panel: Camera + Visibility Toggles */}
      <div className="absolute right-2 top-16 w-44 pointer-events-auto"
        style={{ background: 'rgba(0,15,25,0.85)', border: '1px solid rgba(0,255,200,0.15)', borderRadius: '4px' }}>
        <div className="p-2 border-b border-cyan-900">
          <div className="text-cyan-400 text-xs font-bold mb-1">{t('camera', lang)}</div>
          <div className="text-[10px] text-cyan-600 mb-2">{t('cameraHints', lang)}</div>
          <div className="flex flex-wrap gap-1">
            {[1,2,3,4,5,6].map(m => (
              <button key={m}
                className={`px-2 py-0.5 text-xs rounded ${cameraMode === m ? 'bg-cyan-700 text-white' : 'bg-cyan-900/50 text-cyan-400 hover:bg-cyan-800'}`}
                onClick={() => onSetCamera(m)}>
                {m}
              </button>
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
              <input type="checkbox"
                checked={visibility[item.key as keyof typeof visibility]}
                onChange={() => onToggleVisibility(item.key)}
                className="accent-cyan-500" />
              {item.label}
            </label>
          ))}
        </div>
        {/* Roll/Pitch readout */}
        {data && (
          <div className="p-2 text-xs text-cyan-500">
            <div>{t('roll', lang)}: <span className="text-amber-400">{data.rollAngle.toFixed(1)}°</span></div>
            <div>{t('pitch', lang)}: <span className="text-amber-400">{data.pitchAngle.toFixed(1)}°</span></div>
          </div>
        )}
      </div>

      {/* Bottom: Scrubber + Transport */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-auto"
        style={{ background: 'linear-gradient(0deg, rgba(0,20,30,0.95) 0%, rgba(0,10,20,0.8) 100%)', borderTop: '1px solid rgba(0,255,200,0.2)' }}>
        {/* Mini graph */}
        {sim && <MiniGraph sim={sim} currentTime={currentTime} onJumpTo={onJumpTo} />}
        
        {/* Scrubber */}
        <div className="px-4 py-1">
          <input type="range" min={0} max={sim?.totalTime || 100} step={1/120}
            value={currentTime}
            onChange={e => onJumpTo(parseFloat(e.target.value))}
            className="w-full h-2 accent-cyan-500 cursor-pointer"
            style={{ background: 'rgba(0,255,200,0.1)' }} />
          {/* Corner tick marks */}
          {sim && (
            <div className="relative h-3 mt-0.5">
              {CORNER_SPECS.map((_, idx) => {
                const frac = idx / (CORNER_SPECS.length - 1);
                const cornerTime = frac * sim.totalTime;
                return (
                  <div key={idx} className="absolute top-0 w-px h-2 bg-cyan-700"
                    style={{ left: `${frac * 100}%` }}
                    title={CORNER_SPECS[idx].name} />
                );
              })}
            </div>
          )}
        </div>
        
        {/* Transport controls */}
        <div className="flex items-center justify-center gap-3 pb-2 px-4">
          <button onClick={() => onJumpTo(Math.max(0, currentTime - 1/120))}
            className="text-cyan-400 hover:text-cyan-200 text-sm px-2">◀</button>
          <button onClick={onTogglePlay}
            className="bg-cyan-800 hover:bg-cyan-700 text-white px-4 py-1 rounded text-sm font-bold">
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button onClick={() => onJumpTo(Math.min(sim?.totalTime || 0, currentTime + 1/120))}
            className="text-cyan-400 hover:text-cyan-200 text-sm px-2">▶</button>
          
          <div className="flex gap-1 ml-4">
            {[0.1, 0.25, 0.5, 1, 2, 4].map(s => (
              <button key={s}
                className={`px-2 py-0.5 text-xs rounded ${playbackSpeed === s ? 'bg-amber-700 text-white' : 'bg-cyan-900/50 text-cyan-400 hover:bg-cyan-800'}`}
                onClick={() => onSetSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          
          <span className="text-amber-400 text-sm font-mono ml-4">{timeStr}</span>
        </div>
      </div>

      {/* Narrative */}
      <div className="absolute bottom-28 left-1/2 -translate-x-1/2 max-w-xl text-center">
        <p className="text-cyan-300/80 text-xs italic px-4 py-1"
          style={{ background: 'rgba(0,10,20,0.7)', borderRadius: '4px' }}>
          {narrative}
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-cyan-900/90 text-cyan-200 text-sm px-4 py-2 rounded border border-cyan-500/50">
          {toast}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Mini Graph Component
// ============================================================
function MiniGraph({ sim, currentTime, onJumpTo }: { sim: SimData; currentTime: number; onJumpTo: (t: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    // Background
    ctx.fillStyle = 'rgba(0,15,25,0.8)';
    ctx.fillRect(0, 0, w, h);
    
    // Speed graph (amber)
    const maxSpeed = Math.max(...Array.from(sim.speed)) * 1.1;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,180,0,0.6)';
    ctx.lineWidth = 1;
    for (let i = 0; i < sim.numFrames; i += 4) {
      const x = (i / sim.numFrames) * w;
      const y = h - (sim.speed[i] / maxSpeed) * h * 0.8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Elevation graph (cyan)
    const maxEle = Math.max(...Array.from(sim.posY)) * 1.1;
    const minEle = Math.min(...Array.from(sim.posY));
    const eleRange = maxEle - minEle || 1;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,255,200,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < sim.numFrames; i += 4) {
      const x = (i / sim.numFrames) * w;
      const y = h - ((sim.posY[i] - minEle) / eleRange) * h * 0.5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Current time indicator
    const tx = (currentTime / sim.totalTime) * w;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.moveTo(tx, 0);
    ctx.lineTo(tx, h);
    ctx.stroke();
  }, [sim, currentTime]);
  
  return (
    <canvas ref={canvasRef} width={800} height={40}
      className="w-full cursor-pointer"
      onClick={e => {
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const frac = (e.clientX - rect.left) / rect.width;
        onJumpTo(frac * sim.totalTime);
      }}
    />
  );
}

// ============================================================
// Helper functions
// ============================================================
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(2)}`;
}

function getCornerIcon(character: string): string {
  switch (character) {
    case 'right': return '↱';
    case 'left': return '↰';
    case 'kink': return '⚡';
    case 'crest': return '⛰';
    case 'chicane': return '⚡⚡';
    case 'straight': return '→';
    default: return '•';
  }
}

// ============================================================
// Main App Component
// ============================================================
export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<SceneState | null>(null);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const playbackSpeedRef = useRef<number>(1);
  const simRef = useRef<SimData | null>(null);
  
  const [lang, setLang] = useState<Lang>('en');
  const [sim, setSim] = useState<SimData | null>(null);
  const [track, setTrack] = useState<TrackData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [cameraMode, setCameraMode] = useState(1);
  const [currentCorner, setCurrentCorner] = useState('Start/Finish');
  const [toast, setToast] = useState('');
  const [visibility, setVisibility] = useState({
    wheelLoads: true,
    cogSphere: true,
    bodyRoll: true,
  });
  
  // Initialize
  useEffect(() => {
    const builtInTrack = buildBuiltInTrack();
    setTrack(builtInTrack);
    
    const simData = runSimulation(builtInTrack);
    setSim(simData);
    
    if (containerRef.current) {
      const sceneState = initScene(containerRef.current, builtInTrack, simData);
      stateRef.current = sceneState;
      
      // Initial render
      updateScene(sceneState, 0, { wheelLoads: true, cogSphere: true, bodyRoll: true });
      sceneState.renderer.render(sceneState.scene, sceneState.camera);
    }
    
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (stateRef.current) {
        stateRef.current.renderer.dispose();
      }
    };
  }, []);
  
  // Sync refs with state
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { playbackSpeedRef.current = playbackSpeed; }, [playbackSpeed]);
  useEffect(() => { simRef.current = sim; }, [sim]);
  
  // Animation loop
  useEffect(() => {
    if (!sim || !stateRef.current) return;
    
    const animate = (timestamp: number) => {
      if (!stateRef.current) return;
      
      if (isPlayingRef.current && simRef.current) {
        const dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0;
        lastTimeRef.current = timestamp;
        const newTime = Math.min(currentTimeRef.current + dt * playbackSpeedRef.current, simRef.current.totalTime);
        currentTimeRef.current = newTime;
        setCurrentTime(newTime);
        
        if (newTime >= simRef.current.totalTime) {
          isPlayingRef.current = false;
          setIsPlaying(false);
        }
      } else {
        lastTimeRef.current = timestamp;
      }
      
      animRef.current = requestAnimationFrame(animate);
    };
    
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [sim]);
  
  // Update scene when time changes
  useEffect(() => {
    if (!stateRef.current || !sim) return;
    
    stateRef.current.currentTime = currentTime;
    updateScene(stateRef.current, currentTime, visibility);
    stateRef.current.renderer.render(stateRef.current.scene, stateRef.current.camera);
    
    // Update current corner (throttled - only update every ~10 frames)
    if (Math.floor(currentTime * 10) !== Math.floor((currentTime - 0.01) * 10)) {
      const data = interpSim(sim, currentTime);
      let nearest = CORNER_SPECS[0].name;
      let minDist = Infinity;
      track?.cornerPositions.forEach((cp, idx) => {
        const d = Math.abs(cp.fraction * (track?.totalLength || 1) - data.s);
        if (d < minDist) { minDist = d; nearest = CORNER_SPECS[idx].name; }
      });
      setCurrentCorner(nearest);
    }
  }, [currentTime, visibility, sim, track]);
  
  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && stateRef.current) {
        resizeScene(stateRef.current, containerRef.current.clientWidth, containerRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          setIsPlaying(p => !p);
          break;
        case 'ArrowLeft':
          setCurrentTime(t => Math.max(0, t - 1/120));
          break;
        case 'ArrowRight':
          setCurrentTime(t => sim ? Math.min(sim.totalTime, t + 1/120) : t);
          break;
        case '1': case '2': case '3': case '4': case '5': case '6':
          setCameraMode(parseInt(e.key));
          break;
        case '[':
          // Previous corner
          const curIdx = CORNER_SPECS.findIndex(c => c.name === currentCorner);
          if (curIdx > 0) jumpToCorner(curIdx - 1);
          break;
        case ']':
          // Next corner
          const curIdx2 = CORNER_SPECS.findIndex(c => c.name === currentCorner);
          if (curIdx2 < CORNER_SPECS.length - 1) jumpToCorner(curIdx2 + 1);
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [sim, currentCorner]);
  
  // Free-fly WASD
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (stateRef.current && cameraMode === 6) {
        stateRef.current.freeFlyState.keys.add(e.key.toLowerCase());
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (stateRef.current) {
        stateRef.current.freeFlyState.keys.delete(e.key.toLowerCase());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [cameraMode]);
  
  // GPX drag & drop
  useEffect(() => {
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file && file.name.endsWith('.gpx')) {
        loadGpxFile(file);
      }
    };
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragover', handleDragOver);
    return () => {
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragover', handleDragOver);
    };
  }, [track]);
  
  const loadGpxFile = useCallback(async (file: File) => {
    if (!track) return;
    const text = await file.text();
    try {
      const { track: newTrack, pointCount, lengthKm } = parseGpx(text, track);
      const newSim = runSimulation(newTrack);
      
      // Rebuild scene
      if (stateRef.current && containerRef.current) {
        // Clean up old scene
        stateRef.current.renderer.dispose();
        containerRef.current.innerHTML = '';
        
        const newState = initScene(containerRef.current, newTrack, newSim);
        stateRef.current = newState;
      }
      
      setTrack(newTrack);
      setSim(newSim);
      setCurrentTime(0);
      setToast(dict.gpxLoaded[lang].replace('{n}', pointCount.toString()).replace('{len}', lengthKm.toFixed(1)));
      setTimeout(() => setToast(''), 4000);
    } catch (err) {
      setToast(`Error: ${err}`);
      setTimeout(() => setToast(''), 4000);
    }
  }, [track, lang]);
  
  const handleLoadGpx = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) loadGpxFile(file);
    };
    input.click();
  }, [loadGpxFile]);
  
  const jumpToCorner = useCallback((idx: number) => {
    if (!sim || !track) return;
    const cp = track.cornerPositions[idx];
    const targetTime = cp.fraction * sim.totalTime;
    currentTimeRef.current = targetTime;
    setCurrentTime(targetTime);
  }, [sim, track]);
  
  const jumpTo = useCallback((t: number) => {
    currentTimeRef.current = t;
    setCurrentTime(t);
  }, []);
  
  const toggleVisibility = useCallback((key: string) => {
    setVisibility(v => ({ ...v, [key]: !v[key as keyof typeof v] }));
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-black relative">
      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="absolute inset-0" />
      
      {/* HUD Overlay */}
      {sim && (
        <HUD
          lang={lang}
          sim={sim}
          currentTime={currentTime}
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          cameraMode={cameraMode}
          visibility={visibility}
          onTogglePlay={() => setIsPlaying(p => !p)}
          onSetSpeed={setPlaybackSpeed}
          onSetCamera={setCameraMode}
          onToggleVisibility={toggleVisibility}
          onJumpCorner={jumpToCorner}
          onJumpTo={jumpTo}
          currentCorner={currentCorner}
          toast={toast}
        />
      )}
      
      {/* Language Switch + GPX Load */}
      <div className="absolute top-2 right-2 flex gap-2 pointer-events-auto z-50">
        <button onClick={() => setLang(l => l === 'en' ? 'ru' : 'en')}
          className="bg-cyan-900/80 hover:bg-cyan-800 text-cyan-300 text-xs px-2 py-1 rounded border border-cyan-700">
          {lang === 'en' ? 'RU' : 'EN'}
        </button>
        <button onClick={handleLoadGpx}
          className="bg-cyan-900/80 hover:bg-cyan-800 text-cyan-300 text-xs px-2 py-1 rounded border border-cyan-700">
          {t('loadGpx', lang)}
        </button>
      </div>
    </div>
  );
}
