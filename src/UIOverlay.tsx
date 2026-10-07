import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Color } from 'three'

// 线性圆润 SVG 图标（stroke 风格）；paths 每项 fill 控制"选中时是否填充"
const Icon = ({ children, size = 22, viewBox = '0 0 24 24', strokeWidth = 1.8 }: {
  children: React.ReactNode; size?: number; viewBox?: string; strokeWidth?: number
}) => (
  <svg width={size} height={size} viewBox={viewBox}
    fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

// 每个 icon：vw = viewBox 边长；paths = [{d, fillActive(选中时填充), fillInactive(未选中填充色)}]；lines = 装饰线；sw = 描边宽；fill = 选中填充主色；stroke = 固定描边色(覆盖 currentColor)
type IPath = { d: string; fillActive?: boolean | string; fillInactive?: string }
const ICONS: Record<string, { vw: number; paths: IPath[]; lines?: string[]; sw?: number; fill?: string; stroke?: string }> = {
  wall: {
    vw: 48, sw: 3,
    paths: [
      { d: 'M34 5H6V20H34V5Z', fillActive: true },
      { d: 'M34.0251 12H43V28.1014L19 31.2004V43' },
    ],
  },
  floor: {
    vw: 48, sw: 3,
    paths: [
      { d: 'M9 6H39A3 3 0 0 1 42 9V39A3 3 0 0 1 39 42H9A3 3 0 0 1 6 39V9A3 3 0 0 1 9 6Z' },
      { d: 'M28 6L6 28' },
      { d: 'M42 20L20 42' },
      { d: 'M40 8L8 40' },
      { d: 'M12 22L19 29' },
      { d: 'M29 19L36 26' },
    ],
  },
  cabinet: {
    vw: 48, sw: 3,
    paths: [
      { d: 'M42 4H6V14H42V4Z', fillActive: true },
      { d: 'M42 19H6V29H42V19Z', fillActive: true },
      { d: 'M42 34H6V44H42V34Z', fillActive: true },
    ],
    lines: ['M21 9H27', 'M21 24H27', 'M21 39H27'],
  },
  vinyl: {
    vw: 48, sw: 3,
    paths: [
      { d: 'M24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44C35.0457 44 44 35.0457 44 24C44 21.2883 43.4603 18.7026 42.4825 16.3446C42.2308 15.7376 41.9501 15.1457 41.6421 14.5707' },
      { d: 'M35 10C37.2091 10 39 8.65685 39 7C39 5.34315 37.2091 4 35 4C32.7909 4 31 5.34315 31 7C31 8.65685 32.7909 10 35 10Z', fillActive: true },
      { d: 'M24 31C27.866 31 31 27.866 31 24C31 20.134 27.866 17 24 17C20.134 17 17 20.134 17 24C17 27.866 20.134 31 24 31Z', fillActive: true },
      { d: 'M31 6.5V24' },
    ],
  },
  poster: {
    vw: 48, sw: 3,
    paths: [
      { d: 'M5 10C5 8.89543 5.89543 8 7 8L41 8C42.1046 8 43 8.89543 43 10V38C43 39.1046 42.1046 40 41 40H7C5.89543 40 5 39.1046 5 38V10Z' },
      { d: 'M14.5 18C15.3284 18 16 17.3284 16 16.5C16 15.6716 15.3284 15 14.5 15C13.6716 15 13 15.6716 13 16.5C13 17.3284 13.6716 18 14.5 18Z' },
      { d: 'M15 24L20 28L26 21L43 34V38C43 39.1046 42.1046 40 41 40H7C5.89543 40 5 39.1046 5 38V34L15 24Z', fillActive: true },
    ],
  },
  scene: {
    vw: 48, sw: 3,
    paths: [
      { d: 'M9.15039 9.15088L11.3778 11.3783' },
      { d: 'M3 24H6.15' },
      { d: 'M9.15039 38.8495L11.3778 36.6221' },
      { d: 'M38.8495 38.8495L36.6221 36.6221' },
      { d: 'M44.9996 24H41.8496' },
      { d: 'M38.8495 9.15088L36.6221 11.3783' },
      { d: 'M24 3V6.15' },
      { d: 'M24 36C30.6274 36 36 30.6274 36 24C36 17.3726 30.6274 12 24 12C17.3726 12 12 17.3726 12 24C12 30.6274 17.3726 36 24 36Z', fillActive: true },
      { d: 'M24 45.0001V41.8501' },
    ],
  },
}

const TABS = [
  { id: 'wall', label: '墙面' },
  { id: 'floor', label: '地板' },
  { id: 'cabinet', label: '柜子' },
  { id: 'vinyl', label: '唱片' },
  { id: 'poster', label: '海报' },
  { id: 'scene', label: '氛围' },
]

// 地板贴图选项（内置）
const FLOOR_OPTIONS: { val: string; src: string; label: string }[] = [
  { val: 'texture:wood_floor', src: '/textures/floor/wood_floor.png', label: '浅木' },
  { val: 'texture:parquet', src: '/textures/floor/parquet.png', label: '拼花木' },
  { val: 'texture:marble', src: '/textures/floor/marble.png', label: '大理石' },
  { val: 'texture:diamond', src: '/textures/floor/diamond.png', label: '菱形白' },
  { val: 'texture:herringbone', src: '/textures/floor/herringbone.png', label: '人字拼' },
  { val: 'texture:marble_white', src: '/textures/floor/marble_white.png', label: '白大理石' },
  { val: 'texture:checker', src: '/textures/floor/checker.png', label: '黑白格' },
  { val: 'texture:checker_pink', src: '/textures/floor/checker_pink.png', label: '粉格' },
]

// 唱片盘面贴图选项（内置；黑色原始 = 恢复原黑胶）
const VINYL_OPTIONS: { val: string; src: string | null; label: string }[] = [
  { val: 'texture:vinyl_black', src: null, label: '原始黑' },
  { val: 'texture:vinyl_flow', src: '/textures/vinyl/img.png', label: '流光' },
  { val: 'texture:vinyl_1', src: '/textures/vinyl/vinyl_1.png', label: '虹彩' },
  { val: 'texture:vinyl_2', src: '/textures/vinyl/vinyl_2.png', label: '金属' },
  { val: 'texture:vinyl_3', src: '/textures/vinyl/vinyl_3.png', label: '星芒' },
  { val: 'texture:vinyl_4', src: '/textures/vinyl/vinyl_4.png', label: '水波' },
  { val: 'texture:vinyl_5', src: '/textures/vinyl/vinyl_5.png', label: '星空' },
  { val: 'texture:vinyl_6', src: '/textures/vinyl/vinyl_6.png', label: '银闪' },
  { val: 'texture:vinyl_7', src: '/textures/vinyl/vinyl_7.png', label: '粉闪' },
  { val: 'texture:vinyl_8', src: '/textures/vinyl/vinyl_8.png', label: '金沙' },
  { val: 'texture:vinyl_9', src: '/textures/vinyl/vinyl_9.png', label: '蓝星' },
  { val: 'texture:vinyl_10', src: '/textures/vinyl/vinyl_10.png', label: '流光蓝' },
]

const SWATCHES: Record<string, string[]> = {
  wall: ['#2a2a2e', '#3a3632', '#5a5048', '#8a7a6a', '#c8b8a0', '#e8e0d4', '#4a5568', '#6b7a8f'],
  cabinet: [
    // ── 深色稳定系 ──
    '#1a2a4a', '#2d3436', '#4a3728', '#1e3a3a', '#3d2c5a', '#4a2c2a',
    // ── 中性经典系 ──
    '#4a5568', '#6b7a8f', '#7a6b5a', '#5a6a5a', '#6a5a6a', '#8b7355',
    // ── 浅色柔和系 ──
    '#e8e0d4', '#d4c5b9', '#c8b8a0', '#b8c5d4', '#d4c8d8', '#c8d4c5',
    // ── 活泼亮色系 ──
    '#e85a71', '#5ac8c8', '#f0c040', '#7a8fd4', '#b08ad4', '#f0a060',
    '#e8a07a', '#6bc47e', '#d46a9a', '#7ec8d4',
  ],
  vinyl: [],
}

// 柜子颜色模式
type CabinetMode = 'single' | 'dual' | 'triple'
interface CabinetColors {
  mode: CabinetMode
  body: string      // 柜体（深蓝拉丝金属.001）
  drawer: string    // 抽屉（抽屉面板蓝）
  accent: string    // 抽屉把手（镀铬银.001）— 仅多色模式用
}
const CABINET_MODES: { id: CabinetMode; label: string }[] = [
  { id: 'single', label: '单色' },
  { id: 'dual', label: '双色' },
  { id: 'triple', label: '多色' },
]

// ── 双色预设搭配 ──
interface DualPreset { name: string; body: string; drawer: string }
const DUAL_PRESETS: DualPreset[] = [
  { name: '深海蓝', body: '#1a2a4a', drawer: '#4a5568' },
  { name: '墨绿配灰', body: '#1e3a3a', drawer: '#6b7a8f' },
  { name: '暖棕驼色', body: '#4a3728', drawer: '#c8b8a0' },
  { name: '酒红深棕', body: '#4a2c2a', drawer: '#7a6b5a' },
  { name: '炭灰雾霾', body: '#2d3436', drawer: '#b8c5d4' },
  { name: '珊瑚撞墨', body: '#2d3436', drawer: '#e85a71' },
  { name: '薄荷深海', body: '#1a2a4a', drawer: '#5ac8c8' },
  { name: '姜黄藏青', body: '#1a2a4a', drawer: '#f0c040' },
  { name: '薰衣草灰', body: '#4a5568', drawer: '#b08ad4' },
  { name: '蜜桃奶油', body: '#e8e0d4', drawer: '#f0a060' },
  { name: '天空深蓝', body: '#1a2a4a', drawer: '#7a8fd4' },
  { name: '橄榄橙橘', body: '#5a6a5a', drawer: '#f0a060' },
]

// ── 多色（三色）预设搭配 ──
interface TriplePreset { name: string; body: string; drawer: string; accent: string }
const TRIPLE_PRESETS: TriplePreset[] = [
  { name: '经典蓝调', body: '#1a2a4a', drawer: '#4a5568', accent: '#7a8fd4' },
  { name: '森林系', body: '#1e3a3a', drawer: '#5a6a5a', accent: '#6bc47e' },
  { name: '暖秋色', body: '#4a3728', drawer: '#c8b8a0', accent: '#f0a060' },
  { name: '酒红优雅', body: '#4a2c2a', drawer: '#e8e0d4', accent: '#d46a9a' },
  { name: '北欧灰蓝', body: '#4a5568', drawer: '#b8c5d4', accent: '#5ac8c8' },
  { name: '活力撞色', body: '#2d3436', drawer: '#e85a71', accent: '#f0c040' },
  { name: '梦幻紫', body: '#3d2c5a', drawer: '#d4c8d8', accent: '#b08ad4' },
  { name: '海洋风', body: '#1a2a4a', drawer: '#5ac8c8', accent: '#7ec8d4' },
  { name: '蜜桃奶茶', body: '#d4c5b9', drawer: '#f0a060', accent: '#e85a71' },
  { name: '复古绿', body: '#5a6a5a', drawer: '#c8d4c5', accent: '#8b7355' },
]

// 解析柜子颜色（兼容旧格式纯色字符串）
function parseCabinetColors(val: string | undefined): CabinetColors {
  if (!val) return { mode: 'single', body: '#1a2a4a', drawer: '#1a2a4a', accent: '#1a2a4a' }
  // 新格式：JSON
  if (val.startsWith('{')) {
    try {
      const parsed = JSON.parse(val) as CabinetColors
      return {
        mode: parsed.mode || 'single',
        body: parsed.body || '#1a2a4a',
        drawer: parsed.drawer || parsed.body || '#1a2a4a',
        accent: parsed.accent || parsed.body || '#1a2a4a',
      }
    } catch { /* fall through */ }
  }
  // 旧格式：纯色 hex
  return { mode: 'single', body: val, drawer: val, accent: val }
}

// 把 texture:xxx 标记解析成贴图路径
function texPathOf(v: string): string | null {
  if (!v.startsWith('texture:')) return null
  const name = v.slice('texture:'.length)
  return `/textures/wallpaper/${name}.png`
}

// hex <-> HSL（墙面滑块用）
function hexToHsl(hex: string) {
  const c = new Color(hex)
  const o = { h: 0, s: 0, l: 0 }
  c.getHSL(o)
  return { h: Math.round(o.h * 360), s: Math.round(o.s * 100), l: Math.round(o.l * 100) }
}
function hslToHex({ h, s, l }: { h: number; s: number; l: number }) {
  const c = new Color().setHSL(h / 360, s / 100, l / 100)
  return '#' + c.getHexString()
}

// 按滑块类型生成滑轨渐变 + 滑块头颜色，让滑块"看得见颜色"
function sliderStyle(label: string, { h, s, l }: { h: number; s: number; l: number }) {
  if (label === 'H') {
    return {
      grad: 'linear-gradient(to right,#f00,#ff8000,#ff0,#0f0,#0ff,#00f,#8000ff,#f0f,#f00)',
      thumb: `hsl(${h},100%,50%)`,
    }
  }
  if (label === 'S') {
    return {
      grad: `linear-gradient(to right,hsl(${h},0%,${l}%),hsl(${h},100%,${l}%))`,
      thumb: `hsl(${h},${s}%,${l}%)`,
    }
  }
  return {
    grad: `linear-gradient(to right,hsl(${h},${s}%,0%),hsl(${h},${s}%,100%))`,
    thumb: `hsl(${h},${s}%,${l}%)`,
  }
}

// 默认装扮值（复位时恢复）
const DEFAULT_SKIN = {
  wall: '#aeb6bc',
  floor: 'texture:wood_floor',
  cabinet: JSON.stringify({ mode: 'single' as const, body: '#1a2a4a', drawer: '#1a2a4a', accent: '#1a2a4a' }),
  vinyl: '#1a1a1a',
  poster: '{}',
}

// 海报数据格式：JSON string { left?: base64dataURL, right?: base64dataURL }
interface PosterData { left?: string; right?: string }
function parsePoster(val: string | undefined): PosterData {
  if (!val) return {}
  try { return JSON.parse(val) as PosterData } catch { return {} }
}

export default function UIOverlay({ colors, onColor, children, decorGuideActive, onDismissDecorGuide }: {
  colors: Record<string, string>
  onColor: (key: string, c: string) => void
  children?: ReactNode
  decorGuideActive: boolean
  onDismissDecorGuide: () => void
}) {
  const [open, setOpen] = useState(false)
  const decorButton = useRef<HTMLButtonElement>(null)
  const [decorGuideRect, setDecorGuideRect] = useState({ x: 0, y: 0, width: 0, height: 0 })
  useEffect(() => {
    if (!decorGuideActive || !decorButton.current) return
    const button = decorButton.current
    const update = () => {
      const rect = button.getBoundingClientRect()
      setDecorGuideRect({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(button)
    window.addEventListener('resize', update)
    return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [decorGuideActive])
  // 全局场景切换后刷新按钮选中态，包括复位操作。
  const [, refreshSceneMode] = useState(0)
  useEffect(() => {
    const refresh = () => refreshSceneMode(v => v + 1)
    window.addEventListener('scene-mode-change', refresh)
    return () => window.removeEventListener('scene-mode-change', refresh)
  }, [])
  const [tab, setTab] = useState('wall')

  // 柜子颜色模式状态
  const cab = parseCabinetColors(colors.cabinet)
  const [cabinetMode, setCabinetMode] = useState<CabinetMode>(cab.mode)
  const [cabinetBody, setCabinetBody] = useState(cab.body)
  const [cabinetDrawer, setCabinetDrawer] = useState(cab.drawer)
  const [cabinetAccent, setCabinetAccent] = useState(cab.accent)

  // 海报状态
  const poster = parsePoster(colors.poster)
  const [posterLeft, setPosterLeft] = useState(poster.left || '')
  const [posterRight, setPosterRight] = useState(poster.right || '')

  // 上传海报图片
  const handlePosterUpload = (side: 'left' | 'right', file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      if (side === 'left') setPosterLeft(dataUrl)
      else setPosterRight(dataUrl)
      const next: PosterData = { ...parsePoster(colors.poster), [side]: dataUrl }
      onColor('poster', JSON.stringify(next))
    }
    reader.readAsDataURL(file)
  }

  // 删除海报
  const handlePosterRemove = (side: 'left' | 'right') => {
    if (side === 'left') setPosterLeft('')
    else setPosterRight('')
    const next = { ...parsePoster(colors.poster) }
    delete next[side]
    onColor('poster', JSON.stringify(next))
  }

  // 切换柜子模式时同步颜色
  const switchCabinetMode = (mode: CabinetMode) => {
    setCabinetMode(mode)
    // 单色时把所有色统一
    if (mode === 'single') {
      const c = cabinetBody
      setCabinetDrawer(c)
      setCabinetAccent(c)
      commitCabinet({ mode, body: c, drawer: c, accent: c })
    } else {
      commitCabinet({ mode, body: cabinetBody, drawer: cabinetDrawer, accent: cabinetAccent })
    }
  }

  // 提交柜子颜色变更
  const commitCabinet = (c?: Partial<CabinetColors>) => {
    const data: CabinetColors = {
      mode: c?.mode ?? cabinetMode,
      body: c?.body ?? cabinetBody,
      drawer: c?.drawer ?? cabinetDrawer,
      accent: c?.accent ?? cabinetAccent,
    }
    onColor('cabinet', JSON.stringify(data))
  }

  const onCabinetBodyChange = (color: string) => { setCabinetBody(color); commitCabinet({ body: color }) }
  const onCabinetDrawerChange = (color: string) => { setCabinetDrawer(color); commitCabinet({ drawer: color }) }
  const onCabinetAccentChange = (color: string) => { setCabinetAccent(color); commitCabinet({ accent: color }) }

  // 复位：恢复所有装扮到默认值 + 重置 UI 状态
  const handleReset = () => {
    // 逐项重置装扮数据
    Object.entries(DEFAULT_SKIN).forEach(([key, val]) => {
      onColor(key, val)
    })
    // 恢复氛围为白天
    ;(window as any).__setSceneMode?.('day')
    // 重置 UI 状态
    setWallHsl(hexToHsl(DEFAULT_SKIN.wall))
    setCabinetMode('single')
    setCabinetBody('#1a2a4a')
    setCabinetDrawer('#1a2a4a')
    setCabinetAccent('#1a2a4a')
    setPosterLeft('')
    setPosterRight('')
  }

  // 完成：关闭面板
  const [closing, setClosing] = useState(false)
  const handleClose = () => {
    setClosing(true)
    setTimeout(() => { setOpen(false); setClosing(false) }, 200)
  }

  // 墙面纯色 HSL 滑块：从当前墙色初始化；拖动实时预览(节流)，松开落库
  const [wallHsl, setWallHsl] = useState(() => {
    const cur = colors.wall
    if (cur && cur.startsWith('#') && cur.length === 7) return hexToHsl(cur)
    return { h: 210, s: 12, l: 82 }
  })
  const lastSave = useRef(0)
  const onHslChange = (next: { h: number; s: number; l: number }) => {
    setWallHsl(next)
    const now = Date.now()
    if (now - lastSave.current > 100) {
      lastSave.current = now
      onColor('wall', hslToHex(next))
    }
  }
  const onHslCommit = () => {
    onColor('wall', hslToHex(wallHsl))
  }
  const SLIDERS: [string, number, number, number][] = [
    ['H', wallHsl.h, 0, 360],
    ['S', wallHsl.s, 0, 70],
    ['L', wallHsl.l, 4, 96],
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 12, fontSize: 14, color: '#292F42', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        .skin-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 7px;
          border-radius: 999px;
          background: var(--grad);
          outline: none;
          cursor: pointer;
        }
        .skin-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 17px;
          height: 17px;
          border-radius: 50%;
          background: var(--thumb);
          border: 2px solid #ffffff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.35);
          cursor: pointer;
        }
        .skin-slider::-moz-range-thumb {
          width: 17px;
          height: 17px;
          border-radius: 50%;
          background: var(--thumb);
          border: 2px solid #ffffff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.35);
          cursor: pointer;
        }
        .skin-slider::-moz-range-track {
          background: var(--grad);
          border-radius: 999px;
          height: 7px;
        }
      `}</style>
      <div className="bottom-dock">
      {children}
      {/* 悬浮编辑按钮 - 白色液态玻璃 */}
      <button
        ref={decorButton}
        onClick={() => { onDismissDecorGuide(); setOpen(true) }}
        className="lg-btn"
        style={{
          position: "relative",
          right: "auto",
          bottom: open ? -100 : 0,
          width: 49,
          height: 49,
          borderRadius: "50%",
          color: "#131630",
          cursor: "pointer",
          pointerEvents: "auto",
          transition: "all 0.35s cubic-bezier(0.4,0,0.2,1)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 44C29.9601 44 26.3359 35.136 30 31C33.1264 27.4709 44 29.0856 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" fill="currentColor"/><path d="M28 17C29.6569 17 31 15.6569 31 14C31 12.3431 29.6569 11 28 11C26.3431 11 25 12.3431 25 14C25 15.6569 26.3431 17 28 17Z" fill="#FFF"/><path d="M16 21C17.6569 21 19 19.6569 19 18C19 16.3431 17.6569 15 16 15C14.3431 15 13 16.3431 13 18C13 19.6569 14.3431 21 16 21Z" fill="#FFF"/><path d="M17 34C18.6569 34 20 32.6569 20 31C20 29.3431 18.6569 28 17 28C15.3431 28 14 29.3431 14 31C14 32.6569 15.3431 34 17 34Z" fill="#FFF"/></svg>
      </button>
      </div>

      {decorGuideActive && decorGuideRect.width > 0 && createPortal(
        <div className="decor-onboarding" role="button" tabIndex={0} aria-label="装扮功能指引，点击任意位置关闭"
          onClick={onDismissDecorGuide}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') { event.preventDefault(); onDismissDecorGuide() } }}>
          <div className="shelf-onboarding-target decor-onboarding-target" style={{ left: decorGuideRect.x - 5, top: decorGuideRect.y - 5, width: decorGuideRect.width + 10, height: decorGuideRect.height + 10 }} />
          <div className="shelf-onboarding-callout" style={{ left: Math.max(125, Math.min(window.innerWidth - 125, decorGuideRect.x + decorGuideRect.width / 2)), top: Math.max(16, decorGuideRect.y - 112) }}>
            <strong>点击这里装扮房间</strong>
            <small>更换墙面、唱片与家具外观</small>
            <small>点击任意位置关闭提示</small>
          </div>
        </div>, document.body
      )}

      {/* 遮罩 */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', pointerEvents: 'auto' }}
        />
      )}

      {/* Bottom Sheet */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: open ? 104 : 0,
          transform: open ? 'translateY(0)' : 'translateY(105%)',
          transition: 'transform 0.45s cubic-bezier(0.32,0.72,0,1)',
          pointerEvents: 'auto',
        }}
      >
        <div
          className="lg-panel"
          style={{
            maxWidth: 700, margin: '0 auto',
            borderRadius: '28px 28px 0 0',
            padding: '10px 32px 24px',
          }}
        >
          {/* 拖拽条 */}
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.2)', margin: '0 auto 14px' }} />

          {/* Tab 栏 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 14 }}>
            {TABS.map(t => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: 0, border: 'none', cursor: 'pointer',
                    background: 'transparent',
                    color: active ? '#292F42' : '#646C85',
                    transition: 'all 0.2s',
                    fontSize: 14, fontWeight: active ? 600 : 400,
                  }}
                >
                  <div style={{
                    width: 32, height: 32,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {(() => {
                      const icon = ICONS[t.id]
                      return (
                        <Icon size={22} viewBox={`0 0 ${icon.vw} ${icon.vw}`} strokeWidth={icon.sw || 1.8}>
                          {icon.paths.map((p, i) =>
                            <path key={i} d={p.d} stroke={icon.stroke || undefined}
                              fill={active
                                ? (typeof p.fillActive === 'string' ? p.fillActive : (p.fillActive ? (icon.fill || 'currentColor') : 'none'))
                                : (typeof p.fillInactive === 'string' ? p.fillInactive : 'none')} />)}
                          {icon.lines && icon.lines.map(d =>
                            <path key={d} d={d}
                              stroke={active ? 'rgba(255,255,255,0.92)' : undefined}
                              strokeLinecap="round" />)}
                        </Icon>
                      )
                    })()}
                  </div>
                  {t.label}
                </button>
              )
            })}
          </div>

          {/* 内容区 */}
          <div style={{ minHeight: 70, padding: '4px 4px 8px' }}>
            {tab === 'wall' ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: '50%',
                    background: hslToHex(wallHsl),
                    flexShrink: 0,
                    border: '2px solid rgba(0,0,0,0.1)',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
                  }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {SLIDERS.map(([label, val, min, max]) => {
                      const sg = sliderStyle(label, wallHsl)
                      return (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 14, fontSize: 12, color: '#646C85' }}>{label}</span>
                          <input
                            type="range"
                            className="skin-slider"
                            min={min} max={max} value={val}
                            onChange={(e) => onHslChange({ ...wallHsl, [label.toLowerCase()]: +e.target.value })}
                            onPointerUp={onHslCommit}
                            onMouseUp={onHslCommit}
                            onTouchEnd={onHslCommit}
                            style={{ flex: 1, '--grad': sg.grad, '--thumb': sg.thumb } as React.CSSProperties}
                          />
                          <span style={{ width: 32, fontSize: 12, color: '#646C85', textAlign: 'right' }}>{val}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : tab === 'floor' ? (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {FLOOR_OPTIONS.map(o => {
                  const selected = colors.floor === o.val
                  return (
                    <button
                      key={o.val}
                      onClick={() => onColor('floor', o.val)}
                      style={{
                        width: 42, height: 42, borderRadius: '50%',
                        background: `url(${o.src}) center/cover`,
                        border: selected ? '3px solid #292F42' : '2px solid rgba(255,255,255,0.8)',
                        cursor: 'pointer',
                        boxShadow: selected
                          ? '0 0 0 3px rgba(41,47,66,0.2)'
                          : '0 2px 8px rgba(0,0,0,0.15)',
                        transform: selected ? 'scale(1.05)' : 'scale(1)',
                        transition: 'all 0.18s',
                      }}
                    />
                  )
                })}
              </div>
            ) : tab === 'cabinet' ? (
              <div>
                {/* 模式切换 */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {CABINET_MODES.map(m => (
                    <button
                      key={m.id}
                      onClick={() => switchCabinetMode(m.id)}
                      className="lg-chip"
                      style={{
                        background: cabinetMode === m.id ? '#292F42' : undefined,
                        color: cabinetMode === m.id ? '#fff' : '#1a1a1a',
                        fontWeight: cabinetMode === m.id ? 600 : 400,
                      }}
                    >{m.label}</button>
                  ))}
                </div>

                {/* ── 预设搭配（双色/多色模式显示） ── */}
                {(cabinetMode === 'dual' || cabinetMode === 'triple') && (
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 12, color: '#646C85', display: 'block', marginBottom: 8 }}>
                      {cabinetMode === 'dual' ? '🎨 双色搭配' : '🎨 多色搭配'}
                    </span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(cabinetMode === 'dual' ? DUAL_PRESETS : TRIPLE_PRESETS).map((p, i) => {
                        const preset = p as DualPreset | TriplePreset
                        const isTriple = cabinetMode === 'triple'
                        const tp = preset as TriplePreset
                        const dp = preset as DualPreset
                        // 判断当前是否选中此预设
                        const selected = isTriple
                          ? cabinetBody === tp.body && cabinetDrawer === tp.drawer && cabinetAccent === tp.accent
                          : cabinetBody === dp.body && cabinetDrawer === dp.drawer
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              if (isTriple) {
                                const t = tp
                                setCabinetBody(t.body); setCabinetDrawer(t.drawer); setCabinetAccent(t.accent)
                                commitCabinet({ mode: 'triple', body: t.body, drawer: t.drawer, accent: t.accent })
                              } else {
                                const d = dp
                                setCabinetBody(d.body); setCabinetDrawer(d.drawer); setCabinetAccent(d.body)
                                commitCabinet({ mode: 'dual', body: d.body, drawer: d.drawer, accent: d.body })
                              }
                            }}
                            className="lg-chip"
                            style={{
                              padding: '8px 12px',
                              display: 'flex', alignItems: 'center', gap: 6,
                              background: selected ? '#292F42' : undefined,
                              color: selected ? '#fff' : '#1a1a1a',
                              fontWeight: selected ? 600 : 400,
                              border: selected ? '2px solid #292F42' : '1px solid rgba(0,0,0,0.08)',
                            }}
                          >
                            {/* 色条预览 */}
                            <span style={{
                              display: 'flex', borderRadius: 4, overflow: 'hidden',
                              width: isTriple ? 36 : 24, height: 16, flexShrink: 0,
                            }}>
                              <span style={{ flex: 2, height: '100%', background: (preset as DualPreset).body }} />
                              <span style={{ flex: 1.5, height: '100%', background: (preset as DualPreset).drawer }} />
                              {isTriple && <span style={{ flex: 1, height: '100%', background: tp.accent }} />}
                            </span>
                            <span style={{ fontSize: 12 }}>{(preset as DualPreset).name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 自定义颜色（单色模式：全色板；多色模式：仅把手颜色） */}
                {cabinetMode === 'single' && (
                  <div>
                    <span style={{ fontSize: 12, color: '#646C85', display: 'block', marginBottom: 6 }}>选择颜色</span>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {SWATCHES.cabinet.map(c => (
                        <button
                          key={`body-${c}`}
                          onClick={() => {
                            onCabinetBodyChange(c)
                            setCabinetDrawer(c); setCabinetAccent(c)
                          }}
                          style={{
                            width: 36, height: 36, borderRadius: '50%', background: c,
                            border: cabinetBody === c ? '3px solid #292F42' : '2px solid rgba(255,255,255,0.8)',
                            cursor: 'pointer',
                            boxShadow: cabinetBody === c ? '0 0 0 3px rgba(41,47,66,0.2)' : '0 2px 6px rgba(0,0,0,0.12)',
                            transform: cabinetBody === c ? 'scale(1.08)' : 'scale(1)',
                            transition: 'all 0.18s',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

              </div>
            ) : tab === 'vinyl' ? (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {VINYL_OPTIONS.map(o => {
                  const selected = colors.vinyl === o.val
                  return (
                    <button
                      key={o.val}
                      onClick={() => onColor('vinyl', o.val)}
                      title={o.label}
                      style={{
                        width: 42, height: 42, borderRadius: '50%',
                        background: o.src ? `url(${o.src}) center/cover` : '#1a1a1a',
                        border: selected ? '3px solid #292F42' : '2px solid rgba(255,255,255,0.8)',
                        cursor: 'pointer',
                        boxShadow: selected
                          ? '0 0 0 3px rgba(41,47,66,0.2)'
                          : '0 2px 8px rgba(0,0,0,0.15)',
                        transform: selected ? 'scale(1.05)' : 'scale(1)',
                        transition: 'all 0.18s',
                      }}
                    />
                  )
                })}
              </div>
            ) : SWATCHES[tab] ? (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {SWATCHES[tab].map(c => {
                  const selected = colors[tab] === c
                  const tp = texPathOf(c)
                  const isFlow = c === 'flow'
                  return (
                    <button
                      key={c}
                      onClick={() => onColor(tab, c)}
                      title={isFlow ? '流光' : c}
                      style={{
                        width: 42, height: 42, borderRadius: '50%',
                        background: isFlow
                          ? 'url(/textures/vinyl/img.png) center/cover'
                          : tp ? `url(${tp}) center/cover` : c,
                        border: selected ? '3px solid #292F42' : '2px solid rgba(255,255,255,0.8)',
                        cursor: 'pointer',
                        boxShadow: selected
                          ? '0 0 0 3px rgba(41,47,66,0.2)'
                          : '0 2px 8px rgba(0,0,0,0.15)',
                        transform: selected ? 'scale(1.05)' : 'scale(1)',
                        transition: 'all 0.18s',
                      }}
                    />
                  )
                })}
              </div>
            ) : null}
            {tab === 'poster' && (
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                {(['left', 'right'] as const).map(side => {
                  const src = side === 'left' ? posterLeft : posterRight
                  const label = side === 'left' ? '左墙海报' : '右墙海报'
                  return (
                    <div key={side} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                      width: 120,
                    }}>
                      <span style={{ fontSize: 12, color: '#646C85' }}>{label}</span>
                      {/* 预览 / 上传区域 */}
                      <label style={{
                        width: 110, height: 145, borderRadius: 12,
                        border: '2px dashed rgba(0,0,0,0.15)',
                        overflow: 'hidden', cursor: 'pointer',
                        position: 'relative',
                        background: src
                          ? `url(${src}) center/cover`
                          : 'rgba(0,0,0,0.03)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                      }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = '#292F42')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)')}
                      >
                        {!src && (
                          <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            color: 'rgba(0,0,0,0.3)', fontSize: 12,
                          }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            点击上传
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) handlePosterUpload(side, f)
                            e.target.value = '' // 允许重复选同一文件
                          }}
                        />
                      </label>
                      {/* 删除按钮 */}
                      {src && (
                        <button
                          onClick={() => handlePosterRemove(side)}
                          style={{
                            padding: '4px 14px', borderRadius: 10,
                            background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.08)',
                            color: '#666', cursor: 'pointer', fontSize: 12,
                          }}
                        >移除</button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {tab === 'scene' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="lg-chip"
                  style={{
                    background: (window as any).__sceneMode === 'day' ? '#292F42' : undefined,
                    color: (window as any).__sceneMode === 'day' ? '#fff' : '#1a1a1a',
                  }}
                  onClick={() => (window as any).__setSceneMode?.('day')}>
                  <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{verticalAlign:"middle",marginRight:6}}><circle cx="24" cy="24" r="9" fill="currentColor"/><path d="M24 6V10M24 38V42M6 24H10M38 24H42M11.5 11.5L14.3 14.3M33.7 33.7L36.5 36.5M11.5 36.5L14.3 33.7M33.7 14.3L36.5 11.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>白天</button>
                <button
                  className="lg-chip"
                  style={{
                    background: (window as any).__sceneMode === 'night' ? '#292F42' : undefined,
                    color: (window as any).__sceneMode === 'night' ? '#fff' : '#1a1a1a',
                  }}
                  onClick={() => (window as any).__setSceneMode?.('night')}>
                  <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{verticalAlign:"middle",marginRight:6}}><path d="M16.8657 7.46924C16.3036 9.21181 16 11.0705 16 13C16 22.9411 24.0589 31 34 31C36.5346 31 38.9468 30.4762 41.1343 29.5308C38.8006 36.766 32.0116 42 24 42C14.0589 42 6 33.9411 6 24C6 16.5935 10.4734 10.2317 16.8657 7.46924Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M31.6605 10H41L31 18H41" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>夜晚</button>
              </div>
            )}
          </div>

          {/* 底部按钮 */}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button
              className="lg-chip"
              style={{
                flex: '0 0 auto', padding: '12px 22px', fontSize: 14,
                transition: 'transform 0.15s, opacity 0.15s',
              }}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.96)')}
              onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
              onMouseLeave={e => { if ((e as any).buttons === 0) e.currentTarget.style.transform = 'scale(1)' }}
              onClick={handleReset}
            >
              复位
            </button>
            <button
              onClick={handleClose}
              style={{
                flex: 1, padding: '13px', borderRadius: 16,
                background: '#292F42', border: 'none',
                color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                transition: closing ? 'opacity 0.2s, transform 0.2s' : undefined,
                opacity: closing ? 0 : 1,
                transform: closing ? 'translateY(8px)' : 'translateY(0)',
              }}
            >
              完成
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .lg-btn {
          background: var(--glass-bg);
          backdrop-filter: blur(20px) saturate(125%);
          -webkit-backdrop-filter: blur(20px) saturate(125%);
          border: 1px solid rgba(255,255,255,0.9);
          box-shadow: 0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.8);
          position: relative;
        }
        .lg-btn::after {
          content:''; position:absolute; inset:0; border-radius:50%;
          background: linear-gradient(135deg, rgba(255,255,255,0.6) 0%, transparent 55%);
          pointer-events:none;
        }
        .lg-panel {
          background: var(--glass-bg);
          backdrop-filter: blur(30px) saturate(125%);
          -webkit-backdrop-filter: blur(30px) saturate(125%);
          border: 1px solid rgba(255,255,255,0.7);
          border-top: 1px solid rgba(255,255,255,0.9);
          box-shadow: 0 -8px 40px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.6);
          position: relative;
          overflow: hidden;
        }
        .lg-panel::before {
          content:''; position:absolute; top:0; left:0; right:0; height:1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent);
        }
        .lg-chip {
          padding: 10px 20px; border-radius: 14px;
          background: rgba(0,0,0,0.06);
          border: 1px solid rgba(0,0,0,0.08);
          color: #1a1a1a; cursor: pointer; font-size: 14px;
        }
      `}</style>
    </div>
  )
}
