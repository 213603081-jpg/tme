import { useEffect, useMemo, useRef } from 'react'
import { createPortal, ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { playlistTracks, useMusic } from './Music'
import { recordPhase } from './recordTransition'

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const ARM_PARK_ANGLE = 0.08
const ARM_DROP_ANGLE = 0.3
const ARM_TRACK_SWEEP = 0.12
const ARM_DRAG_PER_PIXEL = 0.0045
const ARM_ZONE_MARGIN = 0.04
const ARM_SKIP_DRAG_PIXELS = 8

function Control({ object, kind }: { object: THREE.Mesh | THREE.Group; kind: string }) {
  const m = useMusic()
  const gl = useThree(s => s.gl)
  const drag = useRef<{ id: number; x: number; y: number; value: number; rotation: number; playing: boolean; moved: boolean; radial: { x: number; y: number; angle: number } | null } | null>(null)
  const clearArmListeners = useRef<(() => void) | null>(null)
  const pressed = useRef(0)
  const armStart = useRef(0)
  useEffect(() => { if (kind === 'Reader_Arm' && m.switching) armStart.current = object.rotation.y }, [m.transition, kind, object])
  const base = useMemo(() => ({ position: object.position.clone(), rotation: object.rotation.clone() }), [object])
  const bounds = useMemo(() => {
    // Volume_Knob 是 Group（含 Volume_Knob_Mesh 等子节点），取首个 mesh 子节点计算命中框
    const mesh = (object as THREE.Mesh).isMesh
      ? object as THREE.Mesh
      : object.children.find((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh)
    if (!mesh) return { center: new THREE.Vector3(), size: new THREE.Vector3(0.15, 0.15, 0.15) }
    mesh.geometry.computeBoundingBox()
    const box = mesh.geometry.boundingBox!
    const padding = kind === 'Reader_Arm' ? 0.05 : kind === 'Volume_Knob' || kind === 'EQ_Knob' ? 0.2 : 0.014
    return { center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()).addScalar(padding) }
  }, [object, kind])
  useEffect(() => () => { clearArmListeners.current?.(); object.position.copy(base.position); object.rotation.copy(base.rotation); gl.domElement.style.cursor = '' }, [object, base, gl])
  useFrame((_, dt) => {
    pressed.current = Math.max(0, pressed.current - dt)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (kind.startsWith('Button')) object.position.y = THREE.MathUtils.damp(object.position.y, base.position.y - (pressed.current > 0 ? 0.004 : 0), 24, dt)
    if (kind === 'Volume_Knob' || kind === 'EQ_Knob') {
      const value = kind === 'Volume_Knob' ? m.volume : (m.tone + 12) / 24
      object.rotation.y = THREE.MathUtils.damp(object.rotation.y, base.rotation.y + (value - 0.5) * Math.PI * 1.5, 15, dt)
    }
    if (kind === 'Speed_Switch') object.position.x = THREE.MathUtils.damp(object.position.x, base.position.x + (m.rpm === 45 ? 0.032 : 0), 15, dt)
    if (kind === 'Reader_Arm') {
      if (drag.current) return
      if (m.switching) {
        const phase = recordPhase(m.swapStartedAt)
        const parked = base.rotation.y + ARM_PARK_ANGLE
        object.rotation.y = THREE.MathUtils.lerp(armStart.current, parked, phase.parkArm) - (ARM_PARK_ANGLE + ARM_DROP_ANGLE) * phase.cueArm
        object.position.y = base.position.y + (reduced ? 0 : 0.025 * phase.liftArm)
        return
      }
      // 模型原始角度仍在唱片边缘；暂停时向右摆到唱片外的停放支架。
      const target = m.playing ? base.rotation.y - ARM_DROP_ANGLE - (m.duration ? m.time / m.duration * ARM_TRACK_SWEEP : 0) : base.rotation.y + ARM_PARK_ANGLE
      object.rotation.y = reduced ? target : THREE.MathUtils.damp(object.rotation.y, target, 6, dt)
      object.position.y = THREE.MathUtils.damp(object.position.y, base.position.y + (m.switching ? 0.025 : 0), 10, dt)
    }
  })
  const activate = () => {
    pressed.current = 0.16
    if (kind === 'Button_Play') { m.toggle(); m.buttonClick() }
    if (kind === 'Button_Next') { m.next(); m.buttonClick() }
    if (kind === 'Button_Previous') { m.previous(); m.buttonClick() }
    if (kind === 'Speed_Switch') m.changeRpm(m.rpm === 33 ? 45 : 33)
  }
  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (kind === 'Reader_Arm' && m.switching) return
    // 音量旋钮与音调旋钮统一使用线性拖拽（上下/左右拖动），不启用旋转模式。
    const radial = null
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      value: kind === 'Volume_Knob' ? m.volume : m.tone,
      rotation: object.rotation.y,
      playing: m.playing,
      moved: false,
      radial,
    }
    // 捕获到 Canvas 本身，确保鼠标/触摸拖出旋钮命中框后仍持续收到移动事件。
    gl.domElement.setPointerCapture(e.pointerId)
    if (kind === 'Reader_Arm') {
      clearArmListeners.current?.()
      const start = drag.current
      const onMove = (event: PointerEvent) => {
        if (event.pointerId !== start.id) return
        const dx = event.clientX - start.x
        if (!start.moved && Math.hypot(dx, event.clientY - start.y) > 3) { start.moved = true; m.tonearmMove() }
        object.rotation.y = THREE.MathUtils.clamp(start.rotation + dx * ARM_DRAG_PER_PIXEL, base.rotation.y - ARM_DROP_ANGLE - ARM_TRACK_SWEEP, base.rotation.y + ARM_PARK_ANGLE)
      }
      const onUp = (event: PointerEvent) => {
        if (event.pointerId !== start.id) return
        clearArmListeners.current?.(); clearArmListeners.current = null; drag.current = null
        if (gl.domElement.hasPointerCapture(event.pointerId)) gl.domElement.releasePointerCapture(event.pointerId)
        if (event.type === 'pointercancel' || m.switching) return
        const dx = event.clientX - start.x
        const moved = start.moved || Math.hypot(dx, event.clientY - start.y) > 3
        if (!moved) return
        if (!start.moved) m.tonearmMove()
        const releaseAngle = THREE.MathUtils.clamp(start.rotation + dx * ARM_DRAG_PER_PIXEL, base.rotation.y - ARM_DROP_ANGLE - ARM_TRACK_SWEEP, base.rotation.y + ARM_PARK_ANGLE)
        object.rotation.y = releaseAngle
        if (start.playing) {
          if (releaseAngle >= base.rotation.y + ARM_PARK_ANGLE - ARM_ZONE_MARGIN) m.toggle(true)
          else if (dx <= -ARM_SKIP_DRAG_PIXELS) m.next()
          else if (dx >= ARM_SKIP_DRAG_PIXELS) m.previous()
        } else if (releaseAngle <= base.rotation.y - ARM_DROP_ANGLE + ARM_ZONE_MARGIN) m.toggle(true)
      }
      gl.domElement.addEventListener('pointermove', onMove)
      gl.domElement.addEventListener('pointerup', onUp)
      gl.domElement.addEventListener('pointercancel', onUp)
      clearArmListeners.current = () => {
        gl.domElement.removeEventListener('pointermove', onMove)
        gl.domElement.removeEventListener('pointerup', onUp)
        gl.domElement.removeEventListener('pointercancel', onUp)
      }
    }
  }
  const volumeAt = (d: NonNullable<typeof drag.current>, x: number, y: number) => {
    const dx = x - d.x, dy = y - d.y
    if (d.radial) {
      const rx = d.x - d.radial.x, ry = d.y - d.radial.y
      const tangential = Math.abs(rx * dy - ry * dx)
      const outward = Math.abs(rx * dx + ry * dy)
      if (tangential >= outward * 0.65) {
        const angle = Math.atan2(y - d.radial.y, x - d.radial.x)
        const delta = Math.atan2(Math.sin(angle - d.radial.angle), Math.cos(angle - d.radial.angle))
        return THREE.MathUtils.clamp(d.value + delta / (Math.PI * 1.5), 0, 1)
      }
    }
    return THREE.MathUtils.clamp(d.value + (Math.abs(dx) > Math.abs(dy) ? dx : dy) / 90, 0, 1)
  }
  const move = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (kind === 'Reader_Arm') return
    const d = drag.current; if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x, dy = d.y - e.clientY
    if (Math.hypot(dx, dy) > (kind === 'Reader_Arm' ? 3 : 6)) d.moved = true
    if (kind === 'Volume_Knob') m.changeVolume(volumeAt(d, e.clientX, e.clientY))
    if (kind === 'EQ_Knob') m.changeTone(THREE.MathUtils.clamp(d.value + (dx + dy) / 8, -12, 12))
    if (kind === 'Reader_Arm') object.rotation.y = THREE.MathUtils.clamp(d.rotation + dx * ARM_DRAG_PER_PIXEL, base.rotation.y - ARM_DROP_ANGLE - ARM_TRACK_SWEEP, base.rotation.y + ARM_PARK_ANGLE)
  }
  const up = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (kind === 'Reader_Arm') return
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (gl.domElement.hasPointerCapture(e.pointerId)) gl.domElement.releasePointerCapture(e.pointerId)
    const dx = e.clientX - d.x
    const moved = d.moved || Math.hypot(dx, e.clientY - d.y) > (kind === 'Reader_Arm' ? 3 : 6)
    if (kind === 'Volume_Knob' && moved) m.changeVolume(volumeAt(d, e.clientX, e.clientY))
    if (!moved) activate()
  }
  return createPortal(<mesh position={bounds.center} onPointerDown={down} onPointerMove={move} onPointerUp={up}
    onPointerCancel={() => { clearArmListeners.current?.(); clearArmListeners.current = null; drag.current = null }} onClick={e => e.stopPropagation()}
    onPointerOver={e => { e.stopPropagation(); gl.domElement.style.cursor = kind.includes('Knob') ? 'ns-resize' : 'pointer' }}
    onPointerOut={() => { gl.domElement.style.cursor = '' }}>
    <boxGeometry args={[bounds.size.x, bounds.size.y, bounds.size.z]} />
    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
  </mesh>, object)
}

function Display({ object }: { object: THREE.Object3D }) {
  const m = useMusic()
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 428
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  const coverRef = useRef<{ src: string; image: HTMLImageElement } | null>(null)
  const coverSrc = m.current?.coverUrl || ''
  useEffect(() => {
    if (!coverSrc) { coverRef.current = null; return }
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => { coverRef.current = { src: coverSrc, image } }
    image.src = coverSrc
    return () => { image.onload = null }
  }, [coverSrc])
  useEffect(() => () => texture.dispose(), [texture])
  const last = useRef('')
  useFrame(({ clock }) => {
    const track = m.current && playlistTracks(m.current)[m.index]
    const tick = Math.floor(clock.elapsedTime * 12)
    const key = `${track?.id}:${Math.floor(m.time)}:${m.playing}:${m.switching}:${m.error}:${m.rpm}:${m.volume}:${m.tone}:${tick}`
    if (last.current === key) return; last.current = key
    const c = texture.image as HTMLCanvasElement, ctx = c.getContext('2d')!
    ctx.fillStyle = '#10171a'; ctx.fillRect(0, 0, c.width, c.height)
    const cover = coverRef.current?.src === coverSrc ? coverRef.current.image : null
    const x = 36, y = 48, size = 326
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, size, size, 18); ctx.clip()
    if (cover) ctx.drawImage(cover, x, y, size, size)
    else {
      ctx.fillStyle = '#27343a'; ctx.fillRect(x, y, size, size)
      ctx.strokeStyle = '#73868b'; ctx.lineWidth = 2
      for (let r = 20; r < 210; r += 18) { ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, r, 0, Math.PI * 2); ctx.stroke() }
      ctx.fillStyle = '#c99b68'; ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, 34, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#263039'; ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, 5, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
    ctx.fillStyle = '#d7e0dd'; ctx.font = '20px sans-serif'
    ctx.fillText(m.error ? '播放失败' : m.switching ? '正在换片' : m.playing ? 'NOW PLAYING' : track ? 'PAUSED' : 'READY', 408, 83)
    ctx.fillStyle = '#b3c0bd'; ctx.font = '18px monospace'; ctx.fillText(`${m.rpm} RPM  ·  SIDE A`, 408, 119)
    ctx.fillStyle = '#f1f3ec'; ctx.font = 'bold 42px sans-serif'
    const title = track?.title || '选择一张唱片'
    ctx.save(); ctx.beginPath(); ctx.rect(404, 145, 578, 72); ctx.clip()
    const offset = ctx.measureText(title).width > 570 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? Math.max(0, (clock.elapsedTime * 28) % (ctx.measureText(title).width + 100) - 60) : 0
    ctx.fillText(title, 408 - offset, 196); ctx.restore()
    ctx.fillStyle = '#aebbb7'; ctx.font = '28px sans-serif'; ctx.fillText(track?.artist || '你的房间，你的音乐', 408, 247, 570)
    ctx.fillStyle = '#364448'; ctx.fillRect(408, 286, 574, 3)
    ctx.fillStyle = '#d4ad7a'; ctx.fillRect(408, 286, m.duration ? 574 * m.time / m.duration : 0, 3)
    ctx.fillStyle = '#d5ddda'; ctx.font = '19px monospace'
    ctx.fillText(formatTime(m.time), 408, 322); ctx.textAlign = 'right'; ctx.fillText(formatTime(m.duration), 982, 322); ctx.textAlign = 'left'
    ctx.fillStyle = '#7d8b87'; ctx.font = '17px monospace'; ctx.fillText('VINYL  ·  STEREO', 408, 374)
    ctx.fillStyle = '#d4ad7a'
    for (let i = 0; i < 18; i++) {
      const h = m.playing && !m.switching ? 6 + (Math.sin(tick * 0.38 + i * 1.7) + 1) * 9 : 5
      ctx.fillRect(408 + i * 32, 411 - h, 3, h)
    }
    ctx.fillStyle = '#ffffff0a'; for (let yy = 0; yy < 428; yy += 5) ctx.fillRect(0, yy, 1024, 1)
    texture.needsUpdate = true
  })
  return createPortal(<mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={e => e.stopPropagation()}>
    <planeGeometry args={[0.294, 0.123]} />
    <meshBasicMaterial map={texture} toneMapped={false} />
  </mesh>, object)
}

export default function PlayerControls({ root }: { root: THREE.Object3D }) {
  const names = ['Button_Previous', 'Button_Play', 'Button_Next', 'Reader_Arm', 'Volume_Knob', 'EQ_Knob', 'Speed_Switch']
  const display = root.getObjectByName('LCD_Display')
  return <>{names.map(kind => {
    const object = root.getObjectByName(kind) as THREE.Mesh | THREE.Group | undefined
    // Volume_Knob 是 Group，仍需挂载命中层（Control 内部会取子 mesh 计算命中框）
    return object ? <Control key={object.uuid} object={object} kind={kind} /> : null
  })}{display && <Display object={display} />}</>
}
