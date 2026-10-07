import { useMemo, useRef, useEffect, useState } from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import MusicScene from './MusicScene'
import { fitPlayerView, useCameraView } from './CameraView'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'

RectAreaLightUniformsLib.init()
import { useThree, useFrame } from '@react-three/fiber'

// 可编辑对象 -> 涉及的材质名
// wall: 后墙 BackWall_Main + 右墙 LeftWall（百叶窗用 Mat_Blinds，不受影响）
// cabinet: 柜体主体(深蓝拉丝金属) + 抽屉门(抽屉面板蓝)
const SKIN_KEY = 'soundroom-skin'

// 读取浏览器本地的装扮颜色
function readSkin(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SKIN_KEY) || '{}')
  } catch {
    return {}
  }
}

// 柜子颜色数据（支持单色/双色/多色模式）
interface CabinetData {
  mode: 'single' | 'dual' | 'triple'
  body: string      // 柜体（深蓝拉丝金属.001）
  drawer: string    // 抽屉（抽屉面板蓝）
  accent: string    // 抽屉把手（镀铬银.001）
}
function parseCabinet(val: string | undefined): CabinetData {
  if (!val) return { mode: 'single', body: '#1a2a4a', drawer: '#1a2a4a', accent: '#1a2a4a' }
  if (val.startsWith('{')) {
    try {
      const p = JSON.parse(val) as CabinetData
      return { mode: p.mode || 'single', body: p.body || '#1a2a4a', drawer: p.drawer || p.body || '#1a2a4a', accent: p.accent || p.body || '#1a2a4a' }
    } catch { /* fall through */ }
  }
  return { mode: 'single', body: val, drawer: val, accent: val }
}

// 判断抽屉面板材质归属：左/右抽屉 -> 抽屉组；柜体主体/中间大门 -> 柜体组
function isDrawerMesh(name: string): boolean {
  return name.startsWith('左抽屉') || name.startsWith('右抽屉')
}

// 给墙面材质应用纯色（墙面只支持纯色）
function applyWallColor(mm: THREE.MeshStandardMaterial, value: string) {
  if (value && value.startsWith('texture:')) value = '#aeb6bc' // 兜底残留的旧墙纸值
  if (mm.map) mm.map = null
  mm.color.set(value && value.startsWith('#') ? value : '#aeb6bc')
  mm.needsUpdate = true
}

// 给地板材质应用一种"装扮值"：texture:xxx 贴图（平铺）或纯色
function applyFloorMat(mm: THREE.MeshStandardMaterial, value: string, floorTexes?: Record<string, THREE.Texture>) {
  if (value && value.startsWith('texture:')) {
    const name = value.slice('texture:'.length)
    const t = floorTexes && floorTexes[name]
    if (t) {
      mm.map = t
      mm.color.set('#ffffff')
      mm.needsUpdate = true
      return
    }
  }
  if (mm.map) mm.map = null
  mm.color.set(value && value.startsWith('#') ? value : '#aeb6bc')
  mm.needsUpdate = true
}

// 渲染场景里找出可编辑材质并应用装扮（颜色）
function applySkinToScene(
  root: THREE.Object3D,
  colors: Record<string, string>,
  floorTexes?: Record<string, THREE.Texture>,
) {
  root.traverse((object) => {
    const o = object as THREE.Mesh
    if (!o.isMesh || !o.material) return
    // 按稳定的模型节点识别唱片，避免替换材质后丢失名称而无法再次切换。
    if (o.name === 'CD_Record' || o.name === 'VinylRecord') {
      const value = colors.vinyl === 'flow' ? 'texture:vinyl_flow' : colors.vinyl
      if (value === 'texture:vinyl_black' || (value && !value.startsWith('texture:'))) {
        restoreVinylPlain(o)
        const material = o.material as THREE.MeshStandardMaterial
        material.color.set(value === 'texture:vinyl_black' ? '#1a1a1a' : value)
        material.needsUpdate = true
      } else if (value) {
        applyVinylFlow(o, value)
      }
    }
    const ms = Array.isArray(o.material) ? o.material : [o.material]
    ms.forEach((m) => {
      const mm = m as THREE.MeshStandardMaterial
      if (!mm.name) return
      // 主墙与右墙应用墙面纯色
      if (colors.wall && mm.name === 'Mat_Wall_Concrete') {
        applyWallColor(mm, colors.wall)
      }
      // 应用柜子颜色（支持单色/双色/多色模式）
      if (colors.cabinet) {
        const cab = parseCabinet(colors.cabinet)
        if (mm.name === '深蓝拉丝金属.001' || mm.name === '镀铬银') {
          mm.color.set(cab.body)
        } else if (mm.name === '抽屉面板蓝') {
          mm.color.set(isDrawerMesh(o.name) ? cab.drawer : cab.body)
        } else if (mm.name === '镀铬银.001') {
          mm.color.set(cab.accent)
        }
      }
      if (colors.floor && mm.name === 'Mat_Floor_Concrete') applyFloorMat(mm, colors.floor, floorTexes)
    })
  })
}

// 存储黑胶唱片材质的直接引用（避免每帧遍历查找）
const vinylMatRef = { current: null as THREE.MeshStandardMaterial | null }

// 存储海报纹理引用（用户上传的运行时纹理，需要手动管理生命周期）
const posterTexRef = { left: null as THREE.Texture | null, right: null as THREE.Texture | null }

// 从 base64 dataURL 创建 THREE.Texture（幂等缓存，高清配置）
function createPosterTexture(dataUrl: string): THREE.Texture {
  const img = new Image()
  img.src = dataUrl
  const tex = new THREE.Texture(img)
  
  // 高清纹理配置：各向异性过滤 + 三线性滤波 + mipmap
  tex.colorSpace = THREE.SRGBColorSpace
  tex.flipY = false
  tex.minFilter = THREE.LinearMipmapLinearFilter  // 三线性过滤（最平滑）
  tex.magFilter = THREE.LinearFilter              // 双线性放大（不像素化）
  tex.generateMipmaps = true                       // 生成多级渐远纹理
  // 各向异性过滤（斜角观看时保持清晰），最大值由 GPU 决定
  const renderer = (window as any).__gl as THREE.WebGLRenderer | undefined
  if (renderer) {
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
  } else {
    tex.anisotropy = 8  // 兜底值，大多数 GPU 支持 16
  }
  
  const applySettings = () => {
    tex.needsUpdate = true
  }
  
  if (img.complete) {
    applySettings()
  } else {
    img.onload = applySettings
  }
  return tex
}

// 应用海报贴图到场景中的目标 mesh
// 有自定义图片 → 替换；无自定义 → 恢复模型原始默认海报（"IN MUSIC WE TRUST"）
function applyPosterToScene(
  root: THREE.Object3D,
  posterData: string | undefined,
) {
  if (!posterData) return
  let pd: { left?: string; right?: string }
  try { pd = JSON.parse(posterData) } catch { return }
  
  let matchedLeft = false, matchedRight = false
  
  root.traverse((object) => {
    const o = object as THREE.Mesh
    if (!o.isMesh || !o.material) return
    const mm = o.material as THREE.MeshStandardMaterial
    const ud = (o as any).userData as Record<string, any>
    
    // 左墙海报：匹配 mesh 名或材质名含 64
    if ((o.name === 'Image_64' || o.name === 'Image 64' || o.name === 'image.64' || mm.name?.includes('64'))) {
      matchedLeft = true
      // 首次接触时保存原始贴图引用（用于恢复默认海报）
      if (!ud._origPosterMap && mm.map) ud._origPosterMap = mm.map
      
      if (pd.left) {
        // 有自定义上传 → 应用自定义纹理
        if (!posterTexRef.left || posterTexRef.left.image?.src !== pd.left) {
          if (posterTexRef.left) posterTexRef.left.dispose()
          posterTexRef.left = createPosterTexture(pd.left)
        }
        mm.map = posterTexRef.left
        mm.color.set('#ffffff')
      } else {
        // 无自定义 → 恢复模型原始默认海报
        mm.map = ud._origPosterMap || null
      }
      mm.needsUpdate = true
    }
    
    // 右墙海报：匹配 mesh 名或材质名含 65
    if ((o.name === 'Image_65' || o.name === 'Image 65' || o.name === 'image.65' || mm.name?.includes('65'))) {
      matchedRight = true
      // 首次接触时保存原始贴图引用
      if (!ud._origPosterMap && mm.map) ud._origPosterMap = mm.map
      
      if (pd.right) {
        if (!posterTexRef.right || posterTexRef.right.image?.src !== pd.right) {
          if (posterTexRef.right) posterTexRef.right.dispose()
          posterTexRef.right = createPosterTexture(pd.right)
        }
        mm.map = posterTexRef.right
        mm.color.set('#ffffff')
      } else {
        // 恢复模型原始默认海报
        mm.map = ud._origPosterMap || null
      }
      mm.needsUpdate = true
    }
  })
}

// === 唱片盘面贴图（用户上传）===
// 图片作为唱片盘面图案，固定跟随盘面旋转（后续做唱盘旋转时自然跟着转）
// 唱片盘面贴图：值 → 贴图路径（用户上传，后续可追加）
const VINYL_TEX_MAP: Record<string, string> = {
  'texture:vinyl_flow': '/textures/vinyl/img.png',
  'texture:vinyl_1': '/textures/vinyl/vinyl_1.png',
  'texture:vinyl_2': '/textures/vinyl/vinyl_2.png',
  'texture:vinyl_3': '/textures/vinyl/vinyl_3.png',
  'texture:vinyl_4': '/textures/vinyl/vinyl_4.png',
  'texture:vinyl_5': '/textures/vinyl/vinyl_5.png',
  'texture:vinyl_6': '/textures/vinyl/vinyl_6.png',
  'texture:vinyl_7': '/textures/vinyl/vinyl_7.png',
  'texture:vinyl_8': '/textures/vinyl/vinyl_8.png',
  'texture:vinyl_9': '/textures/vinyl/vinyl_9.png',
  'texture:vinyl_10': '/textures/vinyl/vinyl_10.png',
}
const vinylTexCache: Record<string, THREE.Texture> = {}

// 从素材中央取最大正方形，保持横纵方向相同的像素比例。
function cropVinylTexture(texture: THREE.Texture) {
  const { width, height } = texture.image
  const side = Math.min(width, height)
  texture.repeat.set(side / width, side / height)
  texture.offset.set((1 - texture.repeat.x) / 2, (1 - texture.repeat.y) / 2)
  texture.updateMatrix()
}

// 两个唱片的盘面均位于局部 XZ 平面；独立 UV 保留原材质的 UV。
function prepareVinylUV(mesh: THREE.Mesh) {
  if (mesh.userData.vinylPlanarUV) return
  const geometry = mesh.geometry.clone()
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox!
  const center = bounds.getCenter(new THREE.Vector3())
  const diameter = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z)
  const positions = geometry.getAttribute('position')
  const uv = new Float32Array(positions.count * 2)
  for (let i = 0; i < positions.count; i++) {
    uv[i * 2] = (positions.getX(i) - center.x) / diameter + 0.5
    uv[i * 2 + 1] = (center.z - positions.getZ(i)) / diameter + 0.5
  }
  geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2))
  mesh.geometry = geometry
  mesh.userData.vinylPlanarUV = true
}

// 给转盘主黑胶换上虹彩流光材质（幂等，保留原材质用于切回）
function applyVinylFlow(mesh: THREE.Mesh, val: string) {
  const cur = mesh.material as THREE.MeshStandardMaterial
  if ((cur as any).userData?.isFlow && (cur as any).userData?.vinylVal === val) return
  const url = VINYL_TEX_MAP[val]
  if (!url) return
  prepareVinylUV(mesh)
  if (!cur.userData.isFlow) mesh.userData.origVinylMat = cur
  let tex = vinylTexCache[url]
  if (!tex) {
    tex = new THREE.TextureLoader().load(url, cropVinylTexture)
    tex.channel = 1
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    vinylTexCache[url] = tex
  }
  const phys = new THREE.MeshPhysicalMaterial({
    map: tex,
    // 印花盘面以图案为主，降低镜面反射，避免虹彩改变原图色相。
    color: new THREE.Color().setScalar(0.78),
    metalness: 0,
    roughness: 0.65,
    specularIntensity: 0.18,
    iridescence: 0,
    toneMapped: false,
    emissive: (window as any).__sceneMode === 'night' ? new THREE.Color('#d9e6ff') : new THREE.Color('#000000'),
    emissiveMap: (window as any).__sceneMode === 'night' ? tex : null,
    emissiveIntensity: (window as any).__sceneMode === 'night' ? 0.38 : 0,
  })
  ;(phys as any).userData = { isFlow: true, vinylVal: val }
  mesh.material = phys
  if (cur.userData.isFlow) cur.dispose()
}

// 从流光切回纯色：恢复原材质
function restoreVinylPlain(mesh: THREE.Mesh) {
  const cur = mesh.material as THREE.MeshStandardMaterial
  if ((cur as any).userData?.isFlow) {
    const orig = (mesh as any).userData.origVinylMat
    if (orig) {
      mesh.material = orig
      delete mesh.userData.origVinylMat
      cur.dispose()
    }
  }
}

function RoomModel({ mode }: { mode: 'day' | 'night' }) {
  const { focus } = useCameraView()
  const { scene } = useGLTF(mode === 'night' ? '/room-night.glb' : '/room.glb')

  // 预加载地毯贴图（白色毛绒，平铺）
  const rugTex = useTexture('/textures/rug/fur.png')
  rugTex.wrapS = THREE.RepeatWrapping
  rugTex.wrapT = THREE.RepeatWrapping
  rugTex.repeat.set(2, 2)
  rugTex.colorSpace = THREE.SRGBColorSpace
  rugTex.anisotropy = 8

  // 预加载地板贴图并配置平铺（供「地板」Tab 切换）
  const fWood = useTexture('/textures/floor/wood_floor.png')
  const fParquet = useTexture('/textures/floor/parquet.png')
  const fMarble = useTexture('/textures/floor/marble.png')
  const fDiamond = useTexture('/textures/floor/diamond.png')
  const fHerringbone = useTexture('/textures/floor/herringbone.png')
  const fMarbleWhite = useTexture('/textures/floor/marble_white.png')
  const fChecker = useTexture('/textures/floor/checker.png')
  const fCheckerPink = useTexture('/textures/floor/checker_pink.png')
  ;[fWood, fParquet, fMarble, fDiamond, fHerringbone, fMarbleWhite, fChecker, fCheckerPink].forEach((t) => {
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    t.repeat.set(6, 4)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
  })
  const floorTexes = {
    wood_floor: fWood, parquet: fParquet, marble: fMarble,
    diamond: fDiamond, herringbone: fHerringbone,
    marble_white: fMarbleWhite, checker: fChecker, checker_pink: fCheckerPink,
  }

  // 克隆模型，设置基础材质（百叶窗白、玻璃半透明、阴影过滤）+ 应用当前装扮
  const cloned = useMemo(() => {
    const skin = (window as any).__skinColors || {}
    const c = scene.clone(true)
    c.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.receiveShadow = true
      if (m.geometry) {
        m.geometry.computeBoundingSphere()
        const r = m.geometry.boundingSphere ? m.geometry.boundingSphere.radius : 0
        m.castShadow = r > 0.12
      } else {
        m.castShadow = false
      }
      let mat = (m.material as THREE.MeshStandardMaterial).clone()
      m.material = mat
      if (mat) {
        // 夜间灯带与设备发光统一为冷白，降低白光强度以保留暗部。
        if (mode === 'night' && ['Night_LED_Cobalt', 'Detail_Blue_LED', 'Mat_Blue_Accent', 'CD_BlueStatus'].includes(mat.name)) {
          mat.emissive.set('#e1ebff')
          mat.emissiveIntensity = 1.3
        }
        if (mode === 'night' && m.name === 'CD_Record') {
          mat.emissive.set('#8298c8')
          mat.emissiveIntensity = 0.12
        }
        if (mode === 'night' && ['Button_Previous', 'Button_Next'].includes(m.name)) {
          mat.emissive.set('#dce9ff')
          mat.emissiveIntensity = 0.48
        }
        if (mode === 'night' && m.name === 'Button_Play') {
          mat.emissive.set('#92b8ff')
          mat.emissiveIntensity = 0.7
        }
        if (mode === 'night' && m.name === 'Speed_Switch') {
          mat.emissive.set('#7caeff')
          mat.emissiveIntensity = 0.72
        }
        if (mode === 'night' && m.name.startsWith('Speed_Grip_')) {
          mat.emissive.set('#8cb7ff')
          mat.emissiveIntensity = 0.55
        }
        if (mode === 'night' && /^(Volume_Knob|EQ_Knob)/.test(m.name) && !m.name.endsWith('_Mount')) {
          mat.emissive.set(m.name.includes('_Pointer') ? '#f4f7ff' : '#d5e2ff')
          mat.emissiveIntensity = m.name.includes('_Pointer') ? 0.7 : m.name.includes('_Tick_') ? 0.38 : 0.3
        }
        if (mode === 'night' && /^(Speed_(Title_CN|33|45|Units)|Volume_(Title_CN|Direction_CN)|EQ_(Title_CN|Soft_CN|Bright_CN|Standard_CN))$/.test(m.name)) {
          mat.emissive.set('#e1eaff')
          mat.emissiveIntensity = 0.26
        }
        // 柜底灯带使用独立暖白材质，与向下照明的线形面光源一致。
        if (mode === 'night' && m.name === 'Detail_Cabinet_Underglow') {
          mat.emissive.set('#ffd6aa')
          mat.emissiveIntensity = 3
        }
        // 拆分共享的墙面材质，使主墙/右墙各自独立，避免条纹串扰
        if (mat.name === 'Mat_Wall_Concrete') {
          mat = mat.clone()
          m.material = mat
        }
        if ('envMapIntensity' in mat) mat.envMapIntensity = 0.6
        // 百叶窗叶片：日夜模式不同表现
        if (mat.name === 'Mat_Blinds') {
          const isNight = (window as any).__sceneMode === 'night'
          if (isNight) {
            // 夜间：百叶窗变暗灰色，降低自发光，融入夜色
            mat.color.set('#888899')
            mat.emissive.set('#334455')
            mat.emissiveIntensity = 0.15
          } else {
            // 白天：亮白+自发光，背光也不发灰
            mat.color.set('#ffffff')
            mat.emissive.set('#ffffff')
            mat.emissiveIntensity = 0.5
          }
        }
        // 窗户玻璃改成半透明，透出窗外风景
        if (mat.name === 'Mat_Window_Glass') {
          mat.transparent = true
          mat.opacity = 0.18
          mat.color.set('#cfe3f5')
        }
        // 主墙(BackWall_Main_OpeningMesh.001)与右墙(LeftWall_Mesh)分别贴图
        if (mat.name === 'Mat_Wall_Concrete') {
          applyWallColor(mat, skin.wall || '#aeb6bc')
        }
        // 应用柜子颜色（支持单色/双色/多色模式）
        if (skin.cabinet) {
          const cab = parseCabinet(skin.cabinet)
          // 抽屉面板蓝 被柜体主体与抽屉共享，需按 mesh 拆分独立材质
          if (mat.name === '抽屉面板蓝') {
            mat = mat.clone()
            m.material = mat
            mat.color.set(isDrawerMesh(m.name) ? cab.drawer : cab.body)
            mat.needsUpdate = true
          } else if (mat.name === '深蓝拉丝金属.001' || mat.name === '镀铬银') {
            // 开放格/包边 随柜体
            mat.color.set(cab.body)
            mat.needsUpdate = true
          } else if (mat.name === '镀铬银.001') {
            // 旋钮把手：金属材质颜色不敏感，clone 成低金属度哑光漆面让颜色更明显
            mat = mat.clone()
            m.material = mat
            mat.metalness = 0.12
            mat.roughness = 0.55
            mat.color.set(cab.accent)
            mat.needsUpdate = true
          }
        }

        // 黑胶唱片颜色：CD_Record=转盘主黑胶(Vinyl_Traditional_Black)，VinylRecord=展示黑胶(Mat_Black_Gloss)
        // 无条件 clone 并保存引用：若初始未设置颜色也必须有引用，否则点击唱片色板永不生效
        if (mat.name === 'Mat_Black_Gloss' && m.name === 'VinylRecord') {
          mat = mat.clone()
          m.material = mat
          mat.color.set(skin.vinyl && !skin.vinyl.startsWith('texture:') ? skin.vinyl : '#1a1a1a')
          mat.needsUpdate = true
        }
        if (mat.name === 'Vinyl_Traditional_Black' && m.name === 'CD_Record') {
          mat = mat.clone()
          m.material = mat
          mat.color.set(skin.vinyl && !skin.vinyl.startsWith('texture:') ? skin.vinyl : '#1a1a1a')
          mat.needsUpdate = true
          vinylMatRef.current = mat  // 存储转盘主黑胶引用
        }

        // 地毯贴图：仅应用到地毯本体（材质名"程序化地毯"，mesh名含"柱体"）
        if (mat.name === '程序化地毯' || m.name.startsWith('柱体')) {
          mat.map = rugTex
          mat.color.set('#ffffff')
          mat.needsUpdate = true
        }

        // 木地板贴图：按当前地板装扮值应用（贴图平铺或纯色）
        if (mat.name === 'Mat_Floor_Concrete') {
          applyFloorMat(mat, skin.floor || 'texture:wood_floor', floorTexes)
        }
      }
    })

    // === 右墙几何修正：调整长度和位置 ===
    c.traverse((o) => {
      if (o.name === 'LeftWall' || o.name === 'LeftWall_Mesh') {
        // 延长右墙长度（Z轴从 2.42 增加到 3.5）
        o.scale.set(1, 0.85, 3.5)
        // 调整位置：配合延长后移，让墙保持合理位置
        o.position.set(2.14, 1.25, -1.8)
      }
    })

    // [DEBUG] 打印所有含 image/Image/poster/64/65 的节点名（用于确认海报 mesh 名）
    const debugNames: string[] = []
    c.traverse((o) => {
      const n = o.name.toLowerCase()
      if (n.includes('image') || n.includes('poster') || n.includes('64') || n.includes('65')) {
        const mat = (o as THREE.Mesh).material
        const matName = Array.isArray(mat) ? mat.map(m => m.name).join('|') : (mat?.name || '')
        debugNames.push(`mesh="${o.name}" mat="${matName}" isMesh=${(o as THREE.Mesh).isMesh}`)
      }
    })
    if (debugNames.length > 0) console.log('[POSTER-DEBUG] 海报候选节点:', debugNames)

    // 保留封套几何供带封面唱片复用，原柜内灰模从场景树移除。
    const cabinetPlaceholders: THREE.Object3D[] = []
    c.traverse(o => {
      if (/^LeftAlbumCard_05[.]?\d{3}$/.test(o.name) || o.name === 'LeftAlbumCard_06') {
        if (!c.userData.cabinetAlbumGeometry && (o as THREE.Mesh).isMesh) {
          c.userData.cabinetAlbumGeometry = (o as THREE.Mesh).geometry
        }
        cabinetPlaceholders.push(o)
      }
    })
    cabinetPlaceholders.forEach(o => o.removeFromParent())
    return c
  }, [scene, rugTex, fWood, fParquet, fMarble, fDiamond, fHerringbone, fMarbleWhite, fChecker, fCheckerPink, mode])

  return <><primitive object={cloned} onClick={(e: import('@react-three/fiber').ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return
    let object: THREE.Object3D | null = e.object
    while (object && object.name !== 'CD_Player') object = object.parent
    if (!object) return
    e.stopPropagation()
    object.updateWorldMatrix(true, true)
    const playerBounds = new THREE.Box3().setFromObject(object)
    focus(playerBounds)
}} /><MusicScene root={cloned} mode={mode} /></>
}

// 全景定点环视；点击唱片机后平滑切到自适应近景。
// 横屏（电脑）与竖屏（手机）分别标定 fov、基础朝向和角度范围
function LookAroundControls() {
  const { gl, camera, size } = useThree()
  const { bounds, mode, zoom, setZoom } = useCameraView()
  const focusRef = useRef(bounds)
  focusRef.current = bounds
  const modeRef = useRef(mode)
  modeRef.current = mode
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const closeView = useMemo(() => bounds ? fitPlayerView(bounds, size.width, size.height, mode) : null, [bounds, size.width, size.height, mode])
  const targetRotation = useMemo(() => new THREE.Quaternion(), [])
  const targetEuler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), [])
  const portrait = size.height > size.width

  // 数值依据 room.glb 实测几何标定：
  // 房间 x ∈ [-2.45(百叶窗墙), ~3.7]，地板 z ∈ [-2.34, 2.34]，相机固定在房间前方 (0, 2.0, 3.6)
  // 角度边界已考虑 FOV 视锥体宽度，防止视野边缘穿透到墙外
  const CFG = portrait
    ? {
        fov: 72,
        pos: new THREE.Vector3(0, 2.0, 3.6),
        // 竖屏：默认朝向回正，让百叶窗（左侧）和正面柜子都能进入视野
        baseYaw: 0.15,
        basePitch: -0.22,
        yawMin: -0.50, yawMax: 0.52,
        pitchMin: -0.33, pitchMax: 0.12,
      }
    : {
        fov: 55,
        pos: new THREE.Vector3(0, 2.0, 3.6),
        // 横屏：收紧左右转角，避免视锥体边缘穿透百叶窗墙(x=-2.45)或右墙外
        baseYaw: 0,
        basePitch: -0.205,
        yawMin: -0.38, yawMax: 0.32,
        pitchMin: -0.42, pitchMax: 0.08,
      }

  const st = useRef({
    pointerId: -1,
    pointers: new Map<number, { x: number; y: number }>(),
    pinch: null as { distance: number; zoom: number } | null,
    lastX: 0,
    lastY: 0,
    tYaw: CFG.baseYaw,
    tPitch: CFG.basePitch,
    yaw: CFG.baseYaw,
    pitch: CFG.basePitch,
    cfg: CFG,
  })

  // 横竖屏切换时更新 fov，并把当前角度夹进新的合法范围
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const s = st.current
    s.cfg = CFG
    s.tYaw = THREE.MathUtils.clamp(s.tYaw, CFG.yawMin, CFG.yawMax)
    s.tPitch = THREE.MathUtils.clamp(s.tPitch, CFG.pitchMin, CFG.pitchMax)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portrait])

  // 指针/触摸拖动 -> 目标角（grab 手感：内容跟随手指；越界直接被钳住）
  useEffect(() => {
    const el = gl.domElement
    const s = st.current
    el.style.touchAction = 'none'
    const onDown = (e: PointerEvent) => {
      if ((focusRef.current && modeRef.current !== 'cabinet') || s.pointers.size >= 2) return
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (s.pointers.size === 1) {
        s.pointerId = e.pointerId
        s.lastX = e.clientX
        s.lastY = e.clientY
      } else {
        const [a, b] = [...s.pointers.values()]
        s.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: zoomRef.current }
      }
      el.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if ((focusRef.current && modeRef.current !== 'cabinet') || !s.pointers.has(e.pointerId)) return
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (s.pointers.size === 2 && s.pinch) {
        const [a, b] = [...s.pointers.values()]
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        setZoom(THREE.MathUtils.clamp(s.pinch.zoom + (distance - s.pinch.distance) / 180, 0, 1))
        return
      }
      if (focusRef.current) return
      if (e.pointerId !== s.pointerId) return
      const cfg = s.cfg
      // 与 OrbitControls 相同的灵敏度公式（拖满一屏 ≈ 180° × rotateSpeed）
      const k = (2 * Math.PI / Math.max(el.clientHeight, 300)) * 0.5
      s.tYaw = THREE.MathUtils.clamp(s.tYaw + (e.clientX - s.lastX) * k, cfg.yawMin, cfg.yawMax)
      s.tPitch = THREE.MathUtils.clamp(s.tPitch + (e.clientY - s.lastY) * k, cfg.pitchMin, cfg.pitchMax)
      s.lastX = e.clientX
      s.lastY = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      if (!s.pointers.has(e.pointerId)) return
      s.pointers.delete(e.pointerId)
      s.pinch = null
      const next = s.pointers.entries().next().value as [number, { x: number; y: number }] | undefined
      s.pointerId = next?.[0] ?? -1
      if (next) { s.lastX = next[1].x; s.lastY = next[1].y }
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    const onWheel = (e: WheelEvent) => {
      if (focusRef.current && modeRef.current !== 'cabinet') return
      e.preventDefault()
      setZoom(value => THREE.MathUtils.clamp(value - e.deltaY / 600, 0, 1))
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl, setZoom])

  // 每帧平滑插值位置、朝向和视野；返回时恢复之前的环视角度。
  useFrame((_, dt) => {
    const s = st.current
    // 更紧的阻尼，减少过冲导致瞬间越界
    const damp = 1 - Math.exp(-8 * Math.min(dt, 0.05))
    s.yaw += (s.tYaw - s.yaw) * damp
    s.pitch += (s.tPitch - s.pitch) * damp
    camera.position.lerp(closeView?.position || s.cfg.pos, damp)
    targetEuler.set(closeView ? 0 : s.pitch, closeView ? 0 : s.yaw, 0)
    targetRotation.setFromEuler(targetEuler)
    camera.quaternion.slerp(targetRotation, damp)
    const cam = camera as THREE.PerspectiveCamera
    const panoramaFov = THREE.MathUtils.lerp(s.cfg.fov, portrait ? 38 : 32, zoom)
    const cabinetFov = closeView && mode === 'cabinet' ? THREE.MathUtils.lerp(closeView.fov, portrait ? 28 : 26, zoom) : null
    cam.fov = THREE.MathUtils.lerp(cam.fov, cabinetFov || closeView?.fov || panoramaFov, damp)
    cam.updateProjectionMatrix()
  })

  return null
}

// 日夜氛围配置
const SCENE_PRESETS = {
  day: {
    background: '#1a1815',
    exposure: 1.06,
    fogColor: '#1a1815',
    fogNear: 8, fogFar: 16,
    // 主光：左侧百叶窗方向的暖阳光
    mainLight: { pos: [-3, 2.8, 1.5], intensity: 2.4, color: '#fff0d9', castShadow: true },
    // 前上方柔光：天花板漫反射
    fillLight: { pos: [0, 4, 3], intensity: 0.7, color: '#e8f0ff' },
    // 正面补光
    frontLight: { pos: [0, 1.5, 4], intensity: 0.35, color: '#fff5e8' },
    // 环境光
    hemisphere: ['#dceaff', '#504438', 0.5],
    ambient: 0.16,
    // 轨道灯
    trackIntensity: [0.12, 0.25, 0.12],
    windowTex: '/scene-day.jpg',
    // 夜晚额外光源（白天不使用）
    extraLights: [] as Array<{ type: string; pos: [number,number,number]; intensity: number; color: string; distance?: number; decay?: number }>,
  },
  night: {
    background: '#080d1b',
    exposure: 1.1,
    fogColor: '#080d1b',
    fogNear: 8, fogFar: 18,
    // 冷月光保留轮廓，主要照明来自模型中的灯带和暖白灯具。
    mainLight: { pos: [-3, 3, 1.5], intensity: 0.22, color: '#dce6f5', castShadow: false },
    fillLight: { pos: [0, 4, 3], intensity: 0.2, color: '#dce3ef' },
    frontLight: { pos: [0, 1.5, 4], intensity: 0.3, color: '#e3e9f2' },
    hemisphere: ['#bac5d8', '#24252b', 0.28],
    ambient: 0.1,
    trackIntensity: [2.2, 3.8, 1.8],
    windowTex: '/scene-night.jpg',
    // 与夜间 GLB 灯带位置对应；冷白补光降低强度，保留冷暖分区。
    extraLights: [
      { type: 'point', pos: [-1.3, 3.3, 0.05], intensity: 0.28, color: '#d6e3ff', distance: 3.8 },
      { type: 'point', pos: [1.3, 3.3, 0.05], intensity: 0.28, color: '#d6e3ff', distance: 3.8 },
      { type: 'point', pos: [-1.85, 3.3, 1.9], intensity: 0.18, color: '#d6e3ff', distance: 3.2 },
      { type: 'point', pos: [1.85, 3.3, 1.9], intensity: 0.18, color: '#d6e3ff', distance: 3.2 },
    ],
  },
} as const

// 挂入场景的目标节点使轨道灯准确朝向展示物。
function DisplaySpotlight({ position, target, intensity, angle, color = '#ffe4bf', castShadow = false }: {
  position: [number, number, number]
  target: [number, number, number]
  intensity: number
  angle: number
  color?: string
  castShadow?: boolean
}) {
  const [x, y, z] = target
  const aim = useMemo(() => {
    const object = new THREE.Object3D()
    object.position.set(x, y, z)
    return object
  }, [x, y, z])
  return (
    <>
      <primitive object={aim} />
      <spotLight position={position} target={aim} intensity={intensity}
        color={color} angle={angle} penumbra={0.85} distance={5} decay={2}
        castShadow={castShadow} shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-near={0.1} shadow-camera-far={5}
        shadow-bias={-0.0002} shadow-normalBias={0.015} shadow-radius={2} />
    </>
  )
}

// 全局日夜状态（UI 和 Scene 共享）
const SCENE_MODE_KEY = 'soundroom-scene-mode'
function getSceneMode(): 'day' | 'night' {
  try { return localStorage.getItem(SCENE_MODE_KEY) === 'night' ? 'night' : 'day' } catch { return 'day' }
}

// 窗外风景：根据日夜模式切换贴图
function WindowView({ mode }: { mode: 'day' | 'night' }) {
  const tex = useTexture(SCENE_PRESETS[mode].windowTex)
  return (
    <mesh position={[-2.45, 2.0, 0.95]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[7.5, 3.2]} />
      <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

export default function Scene() {
  const { gl } = useThree()
  const { scene: r3fScene, camera, raycaster } = useThree()
  
  // 暴露 renderer 引用供 createPosterTexture 使用（获取最大各向异性值）
  ;(window as any).__gl = gl

  // 返回页面时以横幅比例重新渲染当前场景，并按唱片机实际边界构图。
  useEffect(() => {
    ;(window as any).__captureRoomPreview = () => {
      const previewWidth = 900, previewHeight = 582 // 与入口卡片 750:485 完全同宽高比
      const originalSize = gl.getSize(new THREE.Vector2())
      const cam = camera as THREE.PerspectiveCamera
      const savedPos = cam.position.clone()
      const savedQuat = cam.quaternion.clone()
      const savedFov = cam.fov
      const savedAspect = cam.aspect
      try {
        const canvas = gl.domElement
        const colors = (window as any).__skinColors || {}
        applySkinToScene(r3fScene, colors, floorTexes)
        if (colors.poster) applyPosterToScene(r3fScene, colors.poster)
        gl.setSize(previewWidth, previewHeight, false)
        cam.aspect = previewWidth / previewHeight
        cam.fov = 38
        const player = r3fScene.getObjectByName('CD_Player')
        if (player) {
          player.updateWorldMatrix(true, true)
          const bounds = new THREE.Box3().setFromObject(player)
          const center = bounds.getCenter(new THREE.Vector3())
          const size = bounds.getSize(new THREE.Vector3())
          const tangent = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
          const distance = Math.max(
            size.x / (2 * tangent * cam.aspect * 0.78),
            size.y / (2 * tangent * 0.72),
          ) + size.z / 2
          cam.position.set(center.x, center.y + size.y * 0.15, center.z + distance)
          cam.lookAt(center.x, center.y - size.y * 0.02, center.z)
        } else {
          cam.position.set(0, 1.88, 2.55)
          cam.lookAt(0, 1.74, 0.1)
        }
        cam.updateProjectionMatrix()
        gl.render(r3fScene, camera)
        const url = canvas.toDataURL('image/png')
        ;(window as any).__roomPreview = url
        return url
      } catch {
        return null
      } finally {
        gl.setSize(originalSize.x, originalSize.y, false)
        cam.position.copy(savedPos)
        cam.quaternion.copy(savedQuat)
        cam.fov = savedFov
        cam.aspect = savedAspect
        cam.updateProjectionMatrix()
      }
    }
  }, [gl, r3fScene, camera])

  // 暴露 raycast 调试：输入归一化坐标，返回命中对象
  ;(window as any).__raycast = (nx: number, ny: number) => {
    raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, ny * -2 + 1), camera)
    const hits = raycaster.intersectObjects(r3fScene.children, true)
    return hits.slice(0, 8).map(h => ({ name: h.object.name || h.object.type, d: +h.distance.toFixed(2), point: h.point.toArray().map(v => +v.toFixed(2)) }))
  }
  // 暴露一个对象的世界包围盒投影到屏幕（归一化）
  ;(window as any).__bbox = (namePart: string) => {
    const found: THREE.Object3D[] = []
    r3fScene.traverse(o => { if (o.name && o.name.includes(namePart)) found.push(o) })
    const cam = camera as THREE.PerspectiveCamera
    return found.slice(0, 6).map(o => {
      const box = new THREE.Box3().setFromObject(o)
      const corners = [
        box.min.clone().project(cam),
        box.max.clone().project(cam),
        box.getCenter(new THREE.Vector3()).project(cam),
      ]
      return {
        name: o.name,
        min: [+(corners[0].x*0.5+0.5).toFixed(3), +(-corners[0].y*0.5+0.5).toFixed(3)],
        max: [+(corners[1].x*0.5+0.5).toFixed(3), +(-corners[1].y*0.5+0.5).toFixed(3)],
        center: [+(corners[2].x*0.5+0.5).toFixed(3), +(-corners[2].y*0.5+0.5).toFixed(3)],
      }
    })
  }
  
  const [mode, setMode] = useState<'day' | 'night'>(getSceneMode())
  
  // 暴露给 UI 的切换函数
  ;(window as any).__setSceneMode = (m: 'day' | 'night') => {
    setMode(m)
    try { localStorage.setItem(SCENE_MODE_KEY, m) } catch {}
    ;(window as any).__sceneMode = m
    window.dispatchEvent(new Event('scene-mode-change'))
  }
  // 初始化全局状态
  ;(window as any).__sceneMode = mode

  const p = SCENE_PRESETS[mode]

  // 地板贴图（与 RoomModel 同路径，three 缓存同一实例）
  const fWood = useTexture('/textures/floor/wood_floor.png')
  const fParquet = useTexture('/textures/floor/parquet.png')
  const fMarble = useTexture('/textures/floor/marble.png')
  const fDiamond = useTexture('/textures/floor/diamond.png')
  const fHerringbone = useTexture('/textures/floor/herringbone.png')
  const fMarbleWhite = useTexture('/textures/floor/marble_white.png')
  const fChecker = useTexture('/textures/floor/checker.png')
  const fCheckerPink = useTexture('/textures/floor/checker_pink.png')
  ;[fWood, fParquet, fMarble, fDiamond, fHerringbone, fMarbleWhite, fChecker, fCheckerPink].forEach((t) => {
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    t.repeat.set(6, 4)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
  })
  const floorTexes = {
    wood_floor: fWood, parquet: fParquet, marble: fMarble,
    diamond: fDiamond, herringbone: fHerringbone,
    marble_white: fMarbleWhite, checker: fChecker, checker_pink: fCheckerPink,
  }

  // 渲染循环里检测装扮颜色变化（颜色对象引用变化即应用，不依赖版本号，避免点击时序）
  const lastColors = useRef<any>(null)
  useEffect(() => { lastColors.current = null }, [mode])
  useFrame(() => {
    // 唱片盘面贴图固定跟随盘面，不做纹理滑动（旋转时随盘一起转）
    // 从 window 全局读取装扮（R3F 渲染循环访问不到 localStorage）
    const colors = (window as any).__skinColors || {}
    if (colors === lastColors.current) return
    lastColors.current = colors
    applySkinToScene(r3fScene, colors, floorTexes)
    // 海报贴图（独立处理，因为涉及运行时纹理创建）
    if (colors.poster) applyPosterToScene(r3fScene, colors.poster)
  })

  // ACES 色调映射 + 日夜曝光
  useMemo(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = p.exposure
    gl.shadowMap.enabled = true
    gl.shadowMap.type = THREE.PCFShadowMap
  }, [gl, mode])

  return (
    <>
      {/* 背景色 */}
      <color attach="background" args={[p.background]} />

      <RoomModel mode={mode} />
      <WindowView mode={mode} />

      {/* 主光 */}
      <directionalLight
        position={p.mainLight.pos as [number, number, number]}
        intensity={p.mainLight.intensity}
        color={p.mainLight.color}
        castShadow={p.mainLight.castShadow}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-2}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
        shadow-bias={-0.0003}
        shadow-normalBias={0.015}
        shadow-radius={2}
      />

      {/* 前上方柔光 */}
      <directionalLight
        position={p.fillLight.pos as [number, number, number]}
        intensity={p.fillLight.intensity}
        color={p.fillLight.color}
      />

      {/* 正面补光 */}
      <directionalLight
        position={p.frontLight.pos as [number, number, number]}
        intensity={p.frontLight.intensity}
        color={p.frontLight.color}
      />

      {/* 环境补光 */}
      <hemisphereLight args={p.hemisphere as [string, string, number]} />
      <ambientLight intensity={p.ambient} />

      {/* 对应模型三盏轨道灯：左海报、唱片机、右侧展示区。 */}
      <DisplaySpotlight position={[-1.342, 3.3, 0.02]} target={[-1.236, 2.226, -0.247]}
        intensity={p.trackIntensity[0]} angle={0.48} />
      <DisplaySpotlight position={[0.038, 3.3, 0.02]} target={[-0.025, 1.85, 0.18]}
        intensity={p.trackIntensity[1]} angle={0.58} castShadow={mode === 'night'} />
      <DisplaySpotlight position={[1.358, 3.3, 0.02]} target={[1.493, 1.171, -0.216]}
        intensity={p.trackIntensity[2]} angle={0.4} />

      {/* 夜间正面柔光照亮竖直面板与左右封面，保留顶部轨道灯的明暗层次。 */}
      {mode === 'night' && <>
        <DisplaySpotlight position={[0, 2.45, 1.8]} target={[0, 1.78, 0.1]}
          intensity={3.2} angle={0.58} color="#fff0df" />
        <DisplaySpotlight position={[-0.9, 2.35, 1.65]} target={[-0.6, 1.85, 0.1]}
          intensity={2.25} angle={0.38} color="#e5eeff" />
        <DisplaySpotlight position={[0.9, 2.35, 1.65]} target={[0.6, 1.85, 0.1]}
          intensity={2.25} angle={0.38} color="#e5eeff" />
      </>}

      {/* 夜晚额外氛围光源 */}
      {p.extraLights.map((light, i) => (
        <pointLight
          key={i}
          position={light.pos}
          intensity={light.intensity}
          color={light.color}
          distance={light.distance ?? 5}
          decay={2}
        />
      ))}

      {/* 正面柔光：靠近中央陈列区，低强度大面积照亮唱片机与柜面。 */}
      {mode === 'day' && (
        <rectAreaLight
          position={[0, 2.25, 2.1]}
          rotation={[-0.2, 0, 0]}
          width={2.2}
          height={1.8}
          intensity={3.0}
          color="#fff5e8"
        />
      )}
      {mode === 'night' && (
        <rectAreaLight
          position={[0, 1.85, 1.65]}
          rotation={[0, Math.PI, 0]}
          width={1.8}
          height={1.6}
          intensity={3.0}
          color="#ffe5c9"
        />
      )}

      {/* 柜底灯带：按 GLB 的 1.46m 灯带宽度铺光，消除中心点光斑。 */}
      {mode === 'night' && (
        <rectAreaLight
          position={[0, 0.242, 0.195]}
          rotation={[-Math.PI / 2, 0, 0]}
          width={1.46}
          height={0.04}
          intensity={8}
          color="#ffd6aa"
        />
      )}

      {/* 雾气 */}
      <fog attach="fog" args={[p.fogColor, p.fogNear, p.fogFar]} />

      {/* 定点环视：位置固定，只转视角 */}
      <LookAroundControls />
    </>
  )
}
