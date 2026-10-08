import { useEffect, useMemo, useRef } from 'react'
import { useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { playlists, Playlist, useMusic } from './Music'
import { useCameraView } from './CameraView'

function Book({ playlist, index, count, progress, active, geometry, open }: {
  playlist: Playlist; index: number; count: number; progress: React.MutableRefObject<number>; active: boolean;
  geometry: THREE.BufferGeometry; open: () => void
}) {
  const texture = useTexture(playlist.coverUrl)
  const gl = useThree(s => s.gl)
  const group = useRef<THREE.Group>(null)
  const amount = useRef(0)
  const color = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16
    const ctx = canvas.getContext('2d')!; ctx.drawImage(texture.image, 0, 0, 16, 16)
    const data = ctx.getImageData(0, 0, 16, 16).data, rgb = [0, 0, 0]
    for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) rgb[k] += data[i + k] / 256 / 255
    return new THREE.Color().setRGB(...rgb as [number, number, number], THREE.SRGBColorSpace)
  }, [texture])
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = gl.capabilities.getMaxAnisotropy()
    texture.needsUpdate = true
  }, [texture, gl])
  useFrame((_, dt) => {
    if (!group.current) return
    const offset = index - progress.current
    const selected = active ? Math.max(0, 1 - Math.abs(offset)) : 0
    amount.current = THREE.MathUtils.damp(amount.current, selected, 12, dt)
    // 对齐柜格底板：只绕竖直轴翻动，不再上浮或远距离抽出。
    const fan = active ? Math.tanh(offset * 0.85) : 1
    const yaw = active ? fan * -1.2 + 0.12 * (1 - Math.abs(fan)) : 1.32
    const halfWidth = 0.15 * Math.abs(Math.cos(yaw)) + 0.004 * Math.abs(Math.sin(yaw))
    const spacing = Math.min(0.035, 0.46 / Math.max(1, count - 1))
    const homeX = (index - (count - 1) / 2) * spacing
    const fanX = Math.tanh(offset * 0.38) * 0.225
    const targetX = THREE.MathUtils.clamp(active ? fanX : homeX, -0.27 + halfWidth, 0.27 - halfWidth)
    group.current.position.x = THREE.MathUtils.damp(group.current.position.x, targetX, 10, dt)
    group.current.position.z = THREE.MathUtils.damp(group.current.position.z, active ? 0.025 + amount.current * 0.13 : 0.015, 10, dt)
    group.current.position.y = 0
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, yaw, 10, dt)
    group.current.rotation.z = 0
  })
  return <group ref={group} name={'CabinetAlbum_' + playlist.id} onClick={e => { e.stopPropagation(); if (e.delta < 6) open() }}>
    <group position={[0, 0.15, 0]}>
    <mesh geometry={geometry} castShadow><meshBasicMaterial color={color} toneMapped={false} /></mesh>
    {[1, -1].map(side => <mesh key={side} position={[0, 0, side * 0.0042]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
      <planeGeometry args={[0.30, 0.30]} /><meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>)}
    {/* 书脊印上封面色彩图案，侧放时也能辨认，不再显示灰色占位。 */}
    <mesh position={[-0.1502, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <planeGeometry args={[0.008, 0.30]} /><meshBasicMaterial map={texture} color={color} toneMapped={false} />
    </mesh>
    </group>
  </group>
}

export default function CabinetAlbums({ root }: { root: THREE.Object3D }) {
  const m = useMusic()
  const view = useCameraView()
  const active = !!view.bounds && view.mode === 'cabinet'
  const items = playlists.filter(p => !m.shelf.slots.includes(p.id))
  const progress = useRef(0)
  const index = m.cabinetIndex
  const setIndex = m.setCabinetIndex
  const { camera, gl } = useThree()
  const suppressed = useRef(false)
  useEffect(() => { progress.current = Math.min(progress.current, Math.max(0, items.length - 1)); setIndex(Math.round(progress.current)) }, [items.length])
  useEffect(() => { if (Math.round(progress.current) !== index) progress.current = index }, [index])
  const geometry = useMemo(() => {
    const source = root.userData.cabinetAlbumGeometry as THREE.BufferGeometry | undefined
    if (!source) return null
    const g = source.clone()
    g.computeBoundingBox()
    const size = g.boundingBox!.getSize(new THREE.Vector3())
    g.center(); g.scale(0.30 / size.x, 0.30 / size.y, 0.008 / size.z)
    return g
  }, [root])
  useEffect(() => () => geometry?.dispose(), [geometry])
  function focus() { view.focus(new THREE.Box3(new THREE.Vector3(-0.53, 0.24, -0.15), new THREE.Vector3(0.15, 0.68, 0.24)), 'cabinet') }
  // 从 Canvas 接收手势，避免封面被柜门遮挡或手指移出封面后丢失事件。
  useEffect(() => {
    if (!active) return
    const canvas = gl.domElement
    const cabinet = new THREE.Box3(new THREE.Vector3(-0.53, 0.287, -0.15), new THREE.Vector3(0.15, 0.68, 0.24))
    const raycaster = new THREE.Raycaster()
    const pointers = new Set<number>()
    let gesture: { id: number; x: number; y: number; origin: number; dx: number; horizontal: boolean; vertical: boolean; step: number } | null = null
    const last = Math.max(0, items.length - 1)
    const snap = () => {
      progress.current = Math.round(THREE.MathUtils.clamp(progress.current, 0, last))
      setIndex(progress.current)
    }
    const down = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      pointers.add(event.pointerId)
      if (pointers.size > 1) { gesture = null; suppressed.current = true; snap(); return }
      suppressed.current = false
      const rect = canvas.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2(
        (event.clientX - rect.left) / rect.width * 2 - 1,
        1 - (event.clientY - rect.top) / rect.height * 2,
      ), camera)
      if (!raycaster.ray.intersectsBox(cabinet)) return
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: progress.current, dx: 0, horizontal: false, vertical: false, step: Math.max(65, Math.min(140, rect.width * 0.28)) }
      canvas.setPointerCapture(event.pointerId)
    }
    const move = (event: PointerEvent) => {
      const d = gesture
      if (!d || d.id !== event.pointerId || d.vertical) return
      const dx = event.clientX - d.x, dy = event.clientY - d.y
      d.dx = dx
      if (!d.horizontal && Math.hypot(dx, dy) >= 8) {
        if (Math.abs(dx) <= Math.abs(dy) * 1.2) { d.vertical = true; return }
        d.horizontal = true
        suppressed.current = true
      }
      if (!d.horizontal) return
      event.preventDefault()
      progress.current = THREE.MathUtils.clamp(d.origin - dx / d.step, 0, last)
      setIndex(Math.round(progress.current))
    }
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      if (!gesture || gesture.id !== event.pointerId) {
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
        return
      }
      if (event.type !== 'pointercancel') move(event)
      const d = gesture
      gesture = null
      if (d.horizontal && event.type !== 'pointercancel') {
        let next = Math.round(progress.current)
        // 一次明确的短划至少翻一张；长拖动允许连续翻阅多张。
        if (Math.abs(d.dx) >= 28 && next === Math.round(d.origin)) next += d.dx < 0 ? 1 : -1
        progress.current = THREE.MathUtils.clamp(next, 0, last)
        setIndex(progress.current)
      } else snap()
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }
    const click = (event: MouseEvent) => {
      if (!suppressed.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move, { passive: false })
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('click', click, true)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('click', click, true)
      if (gesture && canvas.hasPointerCapture(gesture.id)) canvas.releasePointerCapture(gesture.id)
    }
  }, [active, camera, gl, items.length, setIndex])
  return <group position={[-0.19, 0.287, 0]}>
    {geometry && items.map((p, i) => <Book key={p.id} geometry={geometry} playlist={p} index={i} count={items.length} progress={progress} active={active} open={() => { if (!active) focus(); else if (!suppressed.current) { progress.current = i; setIndex(i) } }} />)}
    {/* Only expose the focus hitbox in the panorama; while focused it would block album clicks. */}
    {!active && <mesh position={[0, 0.15, 0.38]} onClick={e => { e.stopPropagation(); if (e.delta < 6) focus() }}><boxGeometry args={[0.85, 0.5, 0.02]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>}
  </group>
}

