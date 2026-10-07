import { createContext, Dispatch, ReactNode, SetStateAction, useContext, useEffect, useState } from 'react'
import * as THREE from 'three'

const ViewContext = createContext<{ bounds: THREE.Box3 | null; focus: (bounds: THREE.Box3 | null, mode?: 'player' | 'cabinet') => void; mode: 'player' | 'cabinet'; zoom: number; setZoom: Dispatch<SetStateAction<number>> }>({ bounds: null, focus: () => {}, mode: 'player', zoom: 0, setZoom: () => {} })
export const useCameraView = () => useContext(ViewContext)
export function CameraViewProvider({ children }: { children: ReactNode }) {
  const [bounds, setBounds] = useState<THREE.Box3 | null>(null)
  const [mode, setMode] = useState<'player' | 'cabinet'>('player')
  const [zoom, setZoom] = useState(0)
  const focus = (box: THREE.Box3 | null, next: 'player' | 'cabinet' = 'player') => { setBounds(box); setMode(next); setZoom(0) }
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.music-dialog')) focus(null) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  return <ViewContext.Provider value={{ bounds, focus, mode, zoom, setZoom }}>{children}</ViewContext.Provider>
}

export function CameraViewControls() {
  const { bounds, mode, focus, zoom, setZoom } = useCameraView()
  return <>
    {bounds && <button onClick={() => focus(null)} className="view-back"><span>返回全景</span></button>}
    {(!bounds || mode === 'cabinet') && <div className={`view-zoom-controls${bounds && mode === 'cabinet' ? ' cabinet-view' : ''}`} role="group" aria-label="场景缩放">
      <button type="button" aria-label="放大场景" disabled={zoom >= 1} onClick={() => setZoom(value => Math.min(1, value + 0.25))}>＋</button>
      <button type="button" aria-label="缩小场景" disabled={zoom <= 0} onClick={() => setZoom(value => Math.max(0, value - 0.25))}>−</button>
    </div>}
  </>
}

// 在手机与电脑上同时按水平、垂直视野取较远距离，预留顶部按钮和底部播放器。
export function fitPlayerView(bounds: THREE.Box3, width: number, height: number, mode: 'player' | 'cabinet' = 'player') {
  const fov = height > width ? 50 : 42
  const tangent = Math.tan(THREE.MathUtils.degToRad(fov / 2))
  const extent = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const top = Math.min(80, height * 0.16)
  const bottom = Math.min(210, height * 0.32)
  // 唱片机近景减少四周留白，同时仍为顶部按钮和底部播放器预留空间。
  const verticalFill = mode === 'player' ? 0.98 : 0.9
  const horizontalFill = mode === 'player' ? 0.96 : 0.84
  const availableHeight = (height - top - bottom) / height * verticalFill
  // 竖屏柜子近景收紧留白，让唱片封面更大；保留前沿深度，避免镜头进入柜格。
  const framingScale = height > width
    ? mode === 'player' ? 0.76 : mode === 'cabinet' ? 0.82 : 1
    : 1
  const distance = Math.max(extent.y / (2 * tangent * availableHeight), extent.x / (2 * tangent * width / height * horizontalFill)) * framingScale + extent.z / 2
  const offset = (bottom - top) / height
  return { fov, position: new THREE.Vector3(center.x, mode === 'player' ? center.y : center.y - offset * distance * tangent, center.z + distance) }
}
