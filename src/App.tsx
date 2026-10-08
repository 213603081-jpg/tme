import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import Scene from './Scene'
import ProfilePage from './pages/ProfilePage'
import UIOverlay from './UIOverlay'
import { MusicProvider, MusicUI, useMusic } from './Music'
import { CameraViewControls, CameraViewProvider } from './CameraView'

const SKIN_KEY = 'soundroom-skin'

// 从浏览器本地读取上次的装扮颜色
function loadSkin(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SKIN_KEY) || '{}')
  } catch {
    return {}
  }
}

// 加载动画：旋转唱片 + 真实加载进度
function LoadingScreen() {
  const { active, progress } = useProgress()
  const [visible, setVisible] = useState(() => active || progress < 100)
  const [exiting, setExiting] = useState(false)
  const shownAt = useRef(performance.now())
  useEffect(() => {
    if (active || progress < 100) {
      if (!visible) {
        shownAt.current = performance.now()
        setVisible(true)
      }
      setExiting(false)
      return
    }
    if (!visible) return
    const settleDelay = Math.max(0, 420 - (performance.now() - shownAt.current))
    let removeTimer: ReturnType<typeof setTimeout> | undefined
    const settleTimer = setTimeout(() => {
      setExiting(true)
      removeTimer = setTimeout(() => setVisible(false), 260)
    }, settleDelay)
    return () => { clearTimeout(settleTimer); if (removeTimer) clearTimeout(removeTimer) }
  }, [active, progress, visible])
  if (!visible) return null
  return (
    <>
      <style>{`
        .vr-loading{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;background:linear-gradient(170deg,#ffffff 0%,#eef4f2 100%);z-index:300;opacity:1;transition:opacity .26s ease;will-change:opacity}
        .vr-loading.vr-loading-exit{opacity:0;pointer-events:none}
        .vr-wrap{position:relative;width:136px;height:136px}
        .vr-vinyl{position:absolute;inset:0;border-radius:50%;background:repeating-radial-gradient(circle at 50% 50%,transparent 0 1px,rgba(210,165,0,.12) 1px 2px),radial-gradient(circle at 35% 28%,#fff34d,#ffe600 58%,#ffd500);box-shadow:inset 0 0 12px rgba(255,255,255,.35),0 6px 22px rgba(240,195,0,.12);animation:vrspin 1.4s linear infinite}
        .vr-vinyl::before{content:'';position:absolute;inset:40px;border-radius:50%;background:radial-gradient(ellipse at 24% 28%,#73eda8 0%,transparent 48%),radial-gradient(ellipse at 76% 72%,#00b99d 0%,transparent 55%),linear-gradient(135deg,#31c27c,#19c889 48%,#31c27c);background-size:160% 160%,180% 180%,100% 100%;box-shadow:inset 0 0 10px rgba(255,255,255,.22);animation:vrgreen 4.5s ease-in-out infinite}
        .vr-vinyl::after{content:'';position:absolute;inset:63px;border-radius:50%;background:#eaffb6;box-shadow:0 0 0 2px rgba(17,151,92,.16),inset 0 0 3px rgba(255,255,255,.6)}
        .vr-shine{position:absolute;inset:0;border-radius:50%;background:linear-gradient(120deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,0) 42%);pointer-events:none}
        .vr-sparkles{position:absolute;inset:-14px;border-radius:50%;pointer-events:none}
        .vr-orbit{position:absolute;inset:0;border-radius:50%;animation:vrspin 6s linear infinite}
        .vr-orbit:nth-child(2){inset:-5px;animation-duration:8s;animation-delay:-2.8s}
        .vr-orbit:nth-child(3){inset:5px;animation-duration:10s;animation-delay:-6.5s}
        .vr-orbit i{position:absolute;left:50%;top:0;width:6px;height:6px;border-radius:50%;background:#ffe600;box-shadow:0 0 7px rgba(255,215,0,.6);animation:vrsparkle 2.4s ease-in-out infinite}
        .vr-orbit:nth-child(2) i{width:4px;height:4px;animation-delay:-.8s}
        .vr-orbit:nth-child(3) i{width:3px;height:3px;animation-delay:-1.6s}
        @keyframes vrspin{to{transform:rotate(360deg)}}
        @keyframes vrgreen{0%,100%{background-position:0% 20%,100% 80%,0 0}50%{background-position:100% 70%,0% 30%,0 0}}
        @keyframes vrsparkle{0%,100%{opacity:.45;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
        @media(prefers-reduced-motion:reduce){.vr-vinyl,.vr-vinyl::before,.vr-orbit,.vr-orbit i{animation:none}.vr-orbit:nth-child(2){transform:rotate(120deg)}.vr-orbit:nth-child(3){transform:rotate(240deg)}}
        .vr-progress{width:200px;display:flex;flex-direction:column;gap:9px;align-items:center}
        .vr-progress-track{width:100%;height:6px;border-radius:999px;background:rgba(41,47,66,.12);overflow:hidden}
        .vr-progress-bar{height:100%;border-radius:999px;background:linear-gradient(90deg,#292F42,#646C85);transition:width .2s ease}
        .vr-progress-text{color:#292F42;font-size:12px;letter-spacing:.5px;font-variant-numeric:tabular-nums}
      `}</style>
      <div className={`vr-loading${exiting ? ' vr-loading-exit' : ''}`}>
        <div className="vr-wrap">
          <div className="vr-vinyl" />
          <div className="vr-sparkles" aria-hidden="true">
            <span className="vr-orbit"><i /></span>
            <span className="vr-orbit"><i /></span>
            <span className="vr-orbit"><i /></span>
          </div>
          <div className="vr-shine" />
        </div>
        <div className="vr-progress">
          <div className="vr-progress-track">
            <div className="vr-progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <span className="vr-progress-text">正在加载 {Math.round(progress)}%</span>
        </div>
      </div>
    </>
  )
}

function RoomOverlay({ colors, onColor }: { colors: Record<string, string>; onColor: (key: string, color: string) => void }) {
  const { active, progress } = useProgress()
  const music = useMusic()
  const [ready, setReady] = useState(false)
  const [guide, setGuide] = useState<'shelf' | 'decor' | null>(() => {
    try {
      if (music.shelf.slots.every(id => !id)) return 'shelf'
      return localStorage.getItem('soundroom-decor-guide-v2') === 'done' ? null : 'decor'
    } catch { return music.shelf.slots.every(id => !id) ? 'shelf' : 'decor' }
  })
  useEffect(() => { if (!active && progress >= 100) setReady(true) }, [active, progress])
  if (!ready) return null
  const visibleGuide = active ? null : guide
  const dismissShelfGuide = () => {
    try { setGuide(localStorage.getItem('soundroom-decor-guide-v2') === 'done' ? null : 'decor') }
    catch { setGuide('decor') }
  }
  const dismissDecorGuide = () => {
    try { localStorage.setItem('soundroom-decor-guide-v2', 'done') } catch {}
    setGuide(null)
  }
  return <UIOverlay colors={colors} onColor={onColor} decorGuideActive={visibleGuide === 'decor'} onDismissDecorGuide={dismissDecorGuide}>
    <MusicUI shelfGuideActive={visibleGuide === 'shelf'} onDismissShelfGuide={dismissShelfGuide} />
  </UIOverlay>
}

export default function App() {
  const [colors, setColors] = useState<Record<string, string>>(loadSkin)
  const [view, setView] = useState<'profile' | 'room3d'>('profile')

  // 把装扮颜色同步到 window 全局，供 3D 场景的 useFrame 读取（R3F 渲染循环里访问不到 localStorage）
  ;(window as any).__skinColors = colors

  useEffect(() => {
    // 页面加载时递增版本号，让 useFrame 首次应用当前装扮
    ;(window as any).__skinVer = ((window as any).__skinVer || 0) + 1
  }, [])

  // 应用颜色并持久化到浏览器本地
  const applyColor = (key: string, c: string) => {
    // 同步更新 window 全局（先于 setState，避免渲染循环读到旧颜色）
    const next = { ...((window as any).__skinColors || {}), [key]: c }
    localStorage.setItem(SKIN_KEY, JSON.stringify(next))
    ;(window as any).__skinColors = next
    ;(window as any).__skinVer = ((window as any).__skinVer || 0) + 1
    setColors(next)
  }

  return (
    <CameraViewProvider><MusicProvider>
      {view === 'profile' ? (
        <ProfilePage onEnter3D={() => setView('room3d')} />
      ) : (
        <>
          <Canvas
            shadows
            camera={{ position: [0, 2.0, 3.6], fov: 55 }}
            gl={{ antialias: true, preserveDrawingBuffer: true }}
            dpr={[1.5, 2]}
          >
            <color attach="background" args={['#1a1815']} />
            <Suspense fallback={null}>
              <Scene />
            </Suspense>
          </Canvas>
          <LoadingScreen />
          <CameraViewControls />
          <RoomOverlay colors={colors} onColor={applyColor} />
          <button
            type="button"
            aria-label="返回唱片架"
            onClick={() => { try { (window as any).__captureRoomPreview?.() } catch {} ; setView('profile') }}
            style={{
              position: 'fixed', top: 16, left: 16, zIndex: 200,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 48, height: 48,
              background: 'rgba(255,255,255,0.9)',
              border: 'none', borderRadius: '50%', padding: 0, cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(0,0,0,0.12)', backdropFilter: 'blur(8px)',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', transform: 'translateX(-1px)' }}>
              <path d="M31 36L19 24L31 12" stroke="#333" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      )}
    </MusicProvider></CameraViewProvider>
  )
}
