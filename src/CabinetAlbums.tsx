import { useEffect, useMemo, useRef } from 'react'
import { useTexture } from '@react-three/drei'
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber'
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
  const drag = useRef<{ id: number; start: number; origin: number; moved: boolean } | null>(null)
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
  function down(e: ThreeEvent<PointerEvent>) {
    if (!active) return
    e.stopPropagation(); suppressed.current = false
    drag.current = { id: e.pointerId, start: e.clientX, origin: progress.current, moved: false }
    ;(e.target as unknown as HTMLElement).setPointerCapture(e.pointerId)
  }
  function move(e: ThreeEvent<PointerEvent>) {
    const d = drag.current; if (!d || d.id !== e.pointerId) return
    e.stopPropagation()
    if (Math.abs(e.clientX - d.start) > 6) { d.moved = true; suppressed.current = true }
    progress.current = THREE.MathUtils.clamp(d.origin - (e.clientX - d.start) / 65, 0, Math.max(0, items.length - 1))
    setIndex(Math.round(progress.current))
  }
  function up(e: ThreeEvent<PointerEvent>) {
    if (!drag.current) return
    e.stopPropagation(); progress.current = Math.round(progress.current); drag.current = null
    ;(e.target as unknown as HTMLElement).releasePointerCapture(e.pointerId)
  }
  return <group position={[-0.19, 0.287, 0]} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    {geometry && items.map((p, i) => <Book key={p.id} geometry={geometry} playlist={p} index={i} count={items.length} progress={progress} active={active} open={() => { if (!active) focus(); else if (!suppressed.current) { progress.current = i; setIndex(i) } }} />)}
    {/* Only expose the focus hitbox in the panorama; while focused it would block album clicks. */}
    {!active && <mesh position={[0, 0.15, 0.38]} onClick={e => { e.stopPropagation(); if (e.delta < 6) focus() }}><boxGeometry args={[0.85, 0.5, 0.02]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>}
  </group>
}
