import { useEffect, useMemo, useRef } from 'react'
import { useTexture } from '@react-three/drei'
import { createPortal, useFrame, useThree, ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { playlists, Playlist, useMusic } from './Music'
import CabinetAlbums from './CabinetAlbums'
import PlayerControls from './PlayerControls'
import { useCameraView } from './CameraView'
import { recordPhase } from './recordTransition'

function Cover({ playlist, object, mode }: { playlist: Playlist; object: THREE.Mesh; mode: 'day' | 'night' }) {
  const texture = useTexture(playlist.coverUrl)
  const gl = useThree(state => state.gl)
  const m = useMusic()
  texture.colorSpace = THREE.SRGBColorSpace
  useEffect(() => {
    texture.anisotropy = gl.capabilities.getMaxAnisotropy()
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.needsUpdate = true
  }, [texture, gl])
  const bounds = useMemo(() => {
    object.geometry.computeBoundingBox()
    return object.geometry.boundingBox!.clone()
  }, [object])
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 24
    const context = canvas.getContext('2d')!
    context.drawImage(texture.image, 0, 0, 24, 24)
    const pixels = context.getImageData(0, 0, 24, 24).data
    let r = 0, g = 0, b = 0
    for (let i = 0; i < pixels.length; i += 4) { r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2] }
    const count = pixels.length / 4
    const color = new THREE.Color().setRGB(r / count / 255, g / count / 255, b / count / 255, THREE.SRGBColorSpace)
    const original = object.material
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
    object.material = material
    return () => { object.material = original; material.dispose() }
  }, [object, texture])
  const click = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta < 6) m.select(playlist) }
  const center = bounds.getCenter(new THREE.Vector3())
  const width = bounds.max.x - bounds.min.x, height = bounds.max.y - bounds.min.y
  return createPortal(<mesh name={'PlaylistCover_' + object.name} position={[center.x, center.y, bounds.max.z + 0.0005]} onClick={click}>
      <planeGeometry args={[width, height]} />
      {/* 夜间只让封面材质自发光，不在封面周围叠加光晕。 */}
      <meshPhysicalMaterial map={texture} emissiveMap={mode === 'night' ? texture : null}
        emissive={mode === 'night' ? '#dce9ff' : '#000000'} emissiveIntensity={mode === 'night' ? 0.42 : 0}
        color={[0.78, 0.78, 0.78]} roughness={0.9} metalness={0} specularIntensity={0.1} toneMapped={false} />
    </mesh>, object)
}

export default function MusicScene({ root, mode }: { root: THREE.Object3D; mode: 'day' | 'night' }) {
  const m = useMusic()
  const { focus } = useCameraView()
  const playerBounds = useMemo(() => {
    const player = root.getObjectByName('CD_Player')
    if (!player) return null
    player.updateWorldMatrix(true, true)
    return new THREE.Box3().setFromObject(player)
  }, [root])
  useEffect(() => {
    if (m.transition && playerBounds) focus(playerBounds.clone(), 'player')
    // 每次发起换片时重新对准唱片机，包括从柜子近景选片。
  }, [m.transition, playerBounds])
  // Match the album cabinet's invisible click target so the tutorial highlight
  // and the actual cabinet interaction always refer to the same area.
  const cabinetBounds = useMemo(() => new THREE.Box3(
    new THREE.Vector3(-0.53, 0.24, -0.15),
    new THREE.Vector3(0.15, 0.68, 0.24),
  ), [])
  useEffect(() => {
    ;(window as any).__openAlbumCabinet = () => focus(cabinetBounds.clone(), 'cabinet')
    return () => { delete (window as any).__openAlbumCabinet }
  }, [focus, cabinetBounds])
  const { camera, gl } = useThree()
  const guideTick = useRef(0)
  useFrame(() => {
    if (m.shelf.slots.some(Boolean)) return
    if (++guideTick.current % 8 !== 0) return
    const rect = gl.domElement.getBoundingClientRect()
    const corners = [
      new THREE.Vector3(cabinetBounds.min.x, cabinetBounds.min.y, cabinetBounds.min.z), new THREE.Vector3(cabinetBounds.min.x, cabinetBounds.min.y, cabinetBounds.max.z),
      new THREE.Vector3(cabinetBounds.min.x, cabinetBounds.max.y, cabinetBounds.min.z), new THREE.Vector3(cabinetBounds.min.x, cabinetBounds.max.y, cabinetBounds.max.z),
      new THREE.Vector3(cabinetBounds.max.x, cabinetBounds.min.y, cabinetBounds.min.z), new THREE.Vector3(cabinetBounds.max.x, cabinetBounds.min.y, cabinetBounds.max.z),
      new THREE.Vector3(cabinetBounds.max.x, cabinetBounds.max.y, cabinetBounds.min.z), new THREE.Vector3(cabinetBounds.max.x, cabinetBounds.max.y, cabinetBounds.max.z),
    ].map(point => point.project(camera))
    const xs = corners.map(point => rect.left + (point.x + 1) * rect.width / 2)
    const ys = corners.map(point => rect.top + (1 - point.y) * rect.height / 2)
    window.dispatchEvent(new CustomEvent('shelf-guide-position', { detail: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) } }))
  })
  const slots = useMemo(() => {
    const result: { playlist: Playlist; object: THREE.Mesh }[] = []
    for (const side of ['Left', 'Right']) {
      for (let i = 1; i <= 5; i++) {
        const object = root.getObjectByName(side + 'AlbumCard_0' + i) as THREE.Mesh | undefined
        // 槽位映射：左4层→0-3，右4层→4-7，左右第5层（下面那排）→8、9，保持旧8槽数据不错位
        const slotIndex = side === 'Left' ? (i === 5 ? 8 : i - 1) : (i === 5 ? 9 : 4 + i - 1)
        const playlist = playlists.find(p => p.id === m.shelf.slots[slotIndex])
        if (object?.isMesh && playlist) result.push({ playlist, object })
      }
    }
    return result
  }, [root, m.shelf.slots])
  useEffect(() => {
    const changes: { object: THREE.Object3D; visible: boolean; y: number }[] = []
    for (const side of ['Left', 'Right']) {
      for (let i = 1; i <= 5; i++) {
        for (const prefix of [side + 'AlbumCard_', side + 'RecordRack_SlotBase_', side + 'RecordRack_SlotLip_']) {
          const object = root.getObjectByName(prefix + '0' + i)
          if (!object) continue
          changes.push({ object, visible: object.visible, y: object.position.y })
          // 五层唱片架：有上架的唱片则显示封面，空槽仅隐藏唱片，架子（槽底/槽沿）始终保留。
          if (prefix.includes('AlbumCard')) {
            const slotIndex = side === 'Left' ? (i === 5 ? 8 : i - 1) : (i === 5 ? 9 : 4 + i - 1)
            object.visible = !!m.shelf.slots[slotIndex]
          }
        }
      }
    }
    return () => changes.forEach(({ object, visible, y }) => { object.visible = visible; object.position.y = y })
  }, [root, m.shelf.slots])
  const record = useMemo(() => root.getObjectByName('CD_Record'), [root])
  const base = useMemo(() => record ? { position: record.position.clone(), rotation: record.rotation.clone(), scale: record.scale.clone(), visible: record.visible } : null, [record])
  const speed = useRef(0)
  const label = useRef<THREE.MeshPhysicalMaterial>(null)
  const [incomingTexture, outgoingTexture] = useTexture([(m.current || playlists[0]).coverUrl, (m.outgoing || m.current || playlists[0]).coverUrl])
  incomingTexture.colorSpace = outgoingTexture.colorSpace = THREE.SRGBColorSpace
  useEffect(() => () => {
    if (record && base) { record.position.copy(base.position); record.rotation.copy(base.rotation); record.scale.copy(base.scale); record.visible = base.visible }
  }, [record, base])
  useFrame((_, dt) => {
    if (!record || !base) return
    record.position.copy(base.position); record.scale.copy(base.scale)
    if (m.switching) {
      const phase = recordPhase(m.swapStartedAt)
      record.visible = (phase.newRecord || !!m.outgoing) && !(phase.seconds >= 2.05 && phase.seconds < 2.15)
      // Keep the vinyl at its original size: lift it off the spindle, slide it
      // clearly out to the left, then bring the next disc in from the right.
      // Reduced-motion mode shortens the travel without removing the swap.
      const motionScale = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.65 : 1
      record.position.y += (phase.newRecord ? 0.24 * (1 - phase.lowerNew) : 0.24 * phase.liftOld) * motionScale
      record.position.x += (phase.newRecord ? 1.05 * (1 - phase.insertNew) : -1.05 * phase.removeOld) * motionScale
      record.rotation.z = base.rotation.z + (phase.newRecord ? -0.18 * (1 - phase.insertNew) : 0.18 * phase.removeOld) * motionScale
      if (label.current) {
        const texture = phase.newRecord ? incomingTexture : outgoingTexture
        if (label.current.map !== texture) { label.current.map = texture; label.current.needsUpdate = true }
      }
      const targetSpeed = phase.newRecord ? m.rpm * Math.PI / 30 * phase.spinUp : 0
      speed.current = THREE.MathUtils.damp(speed.current, targetSpeed, 7, dt)
      record.rotation.y += speed.current * dt
    } else {
      record.visible = base.visible; record.rotation.z = base.rotation.z
      if (label.current && label.current.map !== incomingTexture) { label.current.map = incomingTexture; label.current.needsUpdate = true }
      speed.current = THREE.MathUtils.damp(speed.current, m.playing && !m.switching ? m.rpm * Math.PI / 30 : 0, 5, dt)
      record.rotation.y += speed.current * dt
    }
  })
  return <>
    <PlayerControls root={root} />
    <CabinetAlbums root={root} />
    {slots.map(slot => <Cover key={slot.object.uuid} {...slot} mode={mode} />)}
    {m.current && record && createPortal(<mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.075, 48]} /><meshPhysicalMaterial ref={label} map={incomingTexture} color={[0.78, 0.78, 0.78]} roughness={0.9} metalness={0} specularIntensity={0.1} toneMapped={false} /></mesh>, record)}
  </>
}

