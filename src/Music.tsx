import { createContext, useContext, useEffect, useRef, useState, ReactNode, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import catalog from '../public/music/catalog.json'
import './music.css'
import { useShelf } from './useShelf'
import { CAMERA_SETTLE_MS, RECORD_SWAP_MS } from './recordTransition'
import { PlaylistOverview, ShelfReplacementDialog } from './PlaylistOverview'
import { useCameraView } from './CameraView'
import { PlayerFeedback } from './playerFeedback'

export const playlists = catalog.playlists
export type Playlist = typeof playlists[number]
const tracks = new Map(catalog.tracks.map(t => [t.id, t]))
export function playlistTracks(p: Playlist) { return p.trackIds.map(id => tracks.get(id)!) }
function usePlayer() {
  const shelf = useShelf(playlists.map(p => p.id))
  const audio = useRef<HTMLAudioElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const generation = useRef(0)
  const equalizer = useRef<{ context: AudioContext; filter: BiquadFilterNode; playbackGain: GainNode } | null>(null)
  const feedback = useRef<PlayerFeedback | null>(null)
  const volumeStep = useRef(14)
  const toneStep = useRef(12)
  const [rpm, setRpm] = useState<33 | 45>(33)
  const [tone, setTone] = useState(0)
  function unlockAudio() {
    if (!audio.current) return
    if (!equalizer.current) {
      const context = new AudioContext()
      const filter = context.createBiquadFilter(); filter.type = 'highshelf'; filter.frequency.value = 2400
      const playbackGain = context.createGain()
      context.createMediaElementSource(audio.current).connect(filter); filter.connect(playbackGain); playbackGain.connect(context.destination)
      equalizer.current = { context, filter, playbackGain }
      feedback.current = new PlayerFeedback(context)
    }
    void equalizer.current.context.resume()
  }
  const [selected, select] = useState<Playlist | null>(null)
  const [cabinetIndex, setCabinetIndex] = useState(0)
  const [current, setCurrent] = useState<Playlist | null>(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [transition, setTransition] = useState(0)
  const [swapStartedAt, setSwapStartedAt] = useState(0)
  const [outgoing, setOutgoing] = useState<Playlist | null>(null)
  const [error, setError] = useState('')
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.7)
  useEffect(() => {
    const a = new Audio(); a.preload = 'metadata'; a.volume = 0.7; audio.current = a
    a.onplaying = () => setPlaying(!a.muted)
    a.onpause = () => setPlaying(false)
    a.onwaiting = () => setPlaying(false)
    a.ontimeupdate = () => { if (!a.muted) setTime(a.currentTime) }
    a.onloadedmetadata = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0)
    a.onerror = () => { feedback.current?.stopAmbience(); setError('音频加载失败，请重试或切换歌曲'); setPlaying(false) }
    return () => { generation.current++; clearTimeout(timer.current); feedback.current?.cancel(); feedback.current = null; a.pause(); a.removeAttribute('src'); a.load(); audio.current = null; void equalizer.current?.context.close(); equalizer.current = null }
  }, [])
  function start(p: Playlist, next = 0, animate = true) {
    const a = audio.current; if (!a) return
    const swapRecord = animate && current?.id !== p.id
    unlockAudio()
    const playbackGain = equalizer.current?.playbackGain
    if (playbackGain && equalizer.current) {
      const now = equalizer.current.context.currentTime
      playbackGain.gain.cancelScheduledValues(now)
      playbackGain.gain.setValueAtTime(swapRecord ? 0 : 1, now)
    }
    feedback.current?.cancel()
    const token = ++generation.current
    const startedAt = performance.now()
    if (!swapRecord) feedback.current?.startAmbience()
    clearTimeout(timer.current); a.pause(); setPlaying(false); setError(''); setTime(0); setDuration(0)
    if (swapRecord) setOutgoing(current)
    if (swapRecord) setSwapStartedAt(startedAt + CAMERA_SETTLE_MS)
    setCurrent(p); setIndex(next); select(null)
    setSwitching(swapRecord); if (swapRecord) setTransition(v => v + 1)
    a.muted = swapRecord; a.src = playlistTracks(p)[next].audioUrl; a.playbackRate = rpm / 33
    // 在点击调用栈中请求播放，避免动画结束后丢失移动端播放授权。
    void a.play().catch(() => { if (token === generation.current) {
      feedback.current?.cancel(); a.muted = false
      if (playbackGain && equalizer.current) playbackGain.gain.setValueAtTime(1, equalizer.current.context.currentTime)
      setSwitching(false); setError('未能播放，请点击重试'); setPlaying(false)
    } })
    const finishSwap = () => {
      if (token !== generation.current) return
      const replay = a.ended
      a.currentTime = 0; a.muted = false
      if (playbackGain && equalizer.current) {
        const now = equalizer.current.context.currentTime
        playbackGain.gain.cancelScheduledValues(now)
        playbackGain.gain.setValueAtTime(0, now)
        playbackGain.gain.linearRampToValueAtTime(1, now + 0.08)
      }
      setSwitching(false); setPlaying(!a.paused)
      // 短音频可能在静音换片期间已结束；落针后重新开始。
      if (replay) void a.play().catch(() => { if (token === generation.current) setError('未能播放，请点击重试') })
    }
    if (swapRecord) {
      feedback.current?.playTonearmMove(CAMERA_SETTLE_MS)
      feedback.current?.playTonearmMove(CAMERA_SETTLE_MS + 3750)
    }
    if (swapRecord) feedback.current?.playRecordDrop(CAMERA_SETTLE_MS + 3300, () => {
      if (token !== generation.current) return
      const animationLeft = Math.max(0, startedAt + CAMERA_SETTLE_MS + RECORD_SWAP_MS - performance.now())
      timer.current = setTimeout(finishSwap, animationLeft)
    })
  }
  function next() { if (current && !switching) start(current, (index + 1) % current.trackIds.length, false) }
  function previous() { if (current && !switching) start(current, (index - 1 + current.trackIds.length) % current.trackIds.length, false) }
  function buttonClick() { unlockAudio(); feedback.current?.playButtonClick() }
  function tonearmMove() { unlockAudio(); feedback.current?.playTonearmMove() }
  useEffect(() => { if (audio.current) audio.current.onended = next }, [current, index, switching, rpm])
  function toggle(fromArm = false) {
    const a = audio.current; if (!a || switching) return
    if (!current) { start(playlists[0]); return }
    unlockAudio()
    if (!fromArm) feedback.current?.playTonearmMove()
    if (!a.paused) { a.pause(); feedback.current?.stopAmbience() }
    else { setError(''); if (a.error) a.load(); feedback.current?.cue('motor'); feedback.current?.startAmbience(220); void a.play().catch(() => { feedback.current?.stopAmbience(); setError('未能播放，请重试') }) }
  }
  function seek(value: number) { if (audio.current && duration) { audio.current.currentTime = value; setTime(value) } }
  function changeVolume(value: number) { if (!feedback.current) unlockAudio(); const step = Math.round(value * 20); if (step !== volumeStep.current) { feedback.current?.cue('volume'); volumeStep.current = step } if (audio.current) audio.current.volume = value; setVolume(value) }
  function changeRpm(value: 33 | 45) { if (value !== rpm) { if (!feedback.current) unlockAudio(); feedback.current?.playSpeedSwitch() } if (audio.current) audio.current.playbackRate = value / 33; setRpm(value) }
  function changeTone(value: number) { unlockAudio(); const step = Math.round(value + 12); if (step !== toneStep.current) { feedback.current?.cue('tone'); toneStep.current = step } if (equalizer.current) equalizer.current.filter.gain.value = value; setTone(value) }
  return { shelf, selected, select, cabinetIndex, setCabinetIndex, current, index, playing, switching, transition, swapStartedAt, outgoing, error, time, duration, volume, rpm, tone, start, next, previous, toggle, buttonClick, tonearmMove, seek, changeVolume, changeRpm, changeTone }
}
const MusicContext = createContext<ReturnType<typeof usePlayer> | null>(null)
export function MusicProvider({ children }: { children: ReactNode }) {
  const player = usePlayer()
  return <MusicContext.Provider value={player}>{children}</MusicContext.Provider>
}
export function useMusic() { return useContext(MusicContext)! }
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
export function MusicUI({ shelfGuideActive = false, onDismissShelfGuide = () => {} }: { shelfGuideActive?: boolean; onDismissShelfGuide?: () => void }) {
  const m = useMusic()
  const view = useCameraView()
  const cabinetItems = playlists.filter(p => !m.shelf.slots.includes(p.id))
  const cabinetIndex = Math.min(m.cabinetIndex, Math.max(0, cabinetItems.length - 1))
  const cabinetActive = !!view.bounds && view.mode === 'cabinet'
  const [library, setLibrary] = useState(false)
  const [guideRect, setGuideRect] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const cabinetSwipe = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const suppressSwipeClick = useRef(false)
  const onCabinetPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if ((event.target as HTMLElement).closest('button, a, input')) return
    cabinetSwipe.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onCabinetPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = cabinetSwipe.current
    if (!start || start.pointerId !== event.pointerId) return
    cabinetSwipe.current = null
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) < 42 || Math.abs(dx) <= Math.abs(dy) * 1.2) return
    suppressSwipeClick.current = true
    window.setTimeout(() => { suppressSwipeClick.current = false }, 0)
    const last = Math.max(0, cabinetItems.length - 1)
    m.setCabinetIndex(value => Math.max(0, Math.min(last, value + (dx < 0 ? 1 : -1))))
  }
  const onCabinetPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (cabinetSwipe.current?.pointerId === event.pointerId) cabinetSwipe.current = null
  }
  const onCabinetClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressSwipeClick.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressSwipeClick.current = false
  }
  useEffect(() => {
    const update = (event: Event) => setGuideRect((event as CustomEvent<typeof guideRect>).detail)
    window.addEventListener('shelf-guide-position', update)
    return () => window.removeEventListener('shelf-guide-position', update)
  }, [])
  useEffect(() => {
    if (!m.selected && !library && !m.shelf.replacement) return
    const previous = document.activeElement as HTMLElement | null
    const dialog = document.querySelector<HTMLElement>(m.shelf.replacement ? '.shelf-replace-shade' : m.selected ? '.playlist-overview-shade' : '.music-dialog')
    dialog?.querySelector<HTMLButtonElement>('.replace-close, .cp-close')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (m.shelf.replacement) m.shelf.setReplacement(null); else { m.select(null); setLibrary(false) } }
      if (e.key === 'Tab') {
        const buttons = Array.from(dialog?.querySelectorAll<HTMLElement>('button, input') || [])
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [m.selected, library, m.shelf.replacement])
  const track = m.current && playlistTracks(m.current)[m.index]
  return <>
    {m.shelf.notice && <div className="shelf-notice" role="status">{m.shelf.notice}{m.shelf.previous && <button onClick={m.shelf.undo}>撤销</button>}<button aria-label="关闭提示" onClick={() => m.shelf.setNotice('')}>×</button></div>}
    {shelfGuideActive && m.shelf.slots.every(id => !id) && !cabinetActive && guideRect.width > 0 && createPortal(<div className="shelf-onboarding" role="button" tabIndex={0} aria-label="唱片柜指引，点击任意位置关闭" onClick={onDismissShelfGuide}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') { event.preventDefault(); onDismissShelfGuide() } }}>
      <div className="shelf-onboarding-callout" style={{ left: guideRect.x + guideRect.width / 2, top: Math.max(16, guideRect.y - 112) }}>
        <strong>把喜欢的歌单摆放上墙</strong>
        <small>在这里挑选歌单并摆上唱片架</small>
        <small>点击任意位置关闭提示</small>
        <span className="shelf-onboarding-pointer" aria-hidden="true">↓</span>
      </div>
      <div className="shelf-onboarding-target" style={{ left: guideRect.x, top: guideRect.y, width: guideRect.width, height: guideRect.height }} />
    </div>, document.body)}
    {cabinetActive && <div className="cabinet-floating-panel" onPointerDown={onCabinetPointerDown} onPointerUp={onCabinetPointerUp} onPointerCancel={onCabinetPointerCancel} onClickCapture={onCabinetClickCapture}>
      <div className="cabinet-floating-nav">
        <button aria-label="上一张唱片" disabled={cabinetIndex === 0} onClick={() => m.setCabinetIndex(cabinetIndex - 1)}>‹</button>
        <span>{cabinetItems.length ? `${cabinetIndex + 1} / ${cabinetItems.length}` : '柜子空了'}</span>
        <button aria-label="下一张唱片" disabled={cabinetIndex >= cabinetItems.length - 1} onClick={() => m.setCabinetIndex(cabinetIndex + 1)}>›</button>
      </div>
      {cabinetItems[cabinetIndex] && <PlaylistOverview playlist={cabinetItems[cabinetIndex]} onClose={() => {}} floating />}
    </div>}
    {m.selected && <div className="playlist-overview-shade" onClick={() => m.select(null)}>
      <PlaylistOverview playlist={m.selected} onClose={() => m.select(null)} />
    </div>}
    <ShelfReplacementDialog />
    {false && <button className="music-library" onClick={() => setLibrary(true)}><span aria-hidden="true">♫</span><span>我的歌单</span></button>}
    <section className={`music-player${m.current && track ? '' : ' is-empty'}`} aria-label="音乐播放器">
      <div className={`mp-cover${m.current && track ? '' : ' mp-cover-empty'}`}>
        {m.current && track && <img src={m.current.coverUrl} alt="" onClick={() => m.select(m.current)} />}
      </div>
      <div className="mp-pill">
        {m.current && track ? <div className="mp-info">
          <strong>{track.title}</strong>
          <small>{m.switching ? "正在换片…" : `${track.artist} · ${m.current.title}`}</small>
        </div> : <div className="mp-info mp-empty-track"><strong>暂无歌曲</strong></div>}
        <div className={`mp-controls${m.current && track ? '' : ' mp-controls-empty'}`}>
          <button disabled={!m.current || m.switching} onClick={() => { m.previous(); m.buttonClick() }} aria-label="上一首"><svg width="22" height="22" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M34 12L22 24L34 36" stroke="#131630" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 12V36" stroke="#131630" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button disabled={!m.current || m.switching} onClick={() => { m.toggle(); m.buttonClick() }} aria-label={m.playing ? "暂停" : "播放"} className="mp-play">{m.playing ? <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 12V36" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 12V36" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg> : <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 24V11.8756L25.5 17.9378L36 24L25.5 30.0622L15 36.1244V24Z" fill="currentColor"/></svg>}</button>
          <button disabled={!m.current || m.switching} onClick={() => { m.next(); m.buttonClick() }} aria-label="下一首"><svg width="22" height="22" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 12L26 24L14 36" stroke="#131630" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 12V36" stroke="#131630" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>
      {m.error && <div className="music-error" role="alert">{m.error} <button onClick={() => m.start(m.current!, m.index, false)}>重试</button></div>}
    </section>
  </>
}
