import { useEffect, useRef, useState } from 'react'
const KEY = 'soundroom-shelf-v1'
export function useShelf(ids: string[]) {
  const [slots, setSlots] = useState<(string | null)[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
      if (Array.isArray(saved)) {
        const seen = new Set<string>()
        return Array.from({ length: 10 }, (_, i) => {
          const id = saved[i]
          if (!ids.includes(id) || seen.has(id)) return null
          seen.add(id); return id
        })
      }
    } catch {}
    return Array.from({ length: 10 }, () => null)
  })
  const [replacement, setReplacement] = useState<string | null>(null)
  const [notice, setNoticeState] = useState('')
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function setNotice(message: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = null
    setNoticeState(message)
    if (message) noticeTimer.current = setTimeout(() => { setNoticeState(''); noticeTimer.current = null }, 5000)
  }
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current) }, [])
  const [previous, setPrevious] = useState<(string | null)[] | null>(null)
  function commit(next: (string | null)[], message: string) {
    try { localStorage.setItem(KEY, JSON.stringify(next)) }
    catch { setNotice('保存失败，请释放浏览器存储空间后重试'); return }
    setPrevious(slots); setSlots(next); setNotice(message); setReplacement(null)
  }
  function store(id: string) { commit(slots.map(s => s === id ? null : s), '已收进柜子') }
  function display(id: string) {
    if (slots.includes(id)) return
    const empty = slots.indexOf(null)
    if (empty < 0) { setReplacement(id); return }
    commit(slots.map((s, i) => i === empty ? id : s), '已放上唱片架')
  }
  function replace(index: number) {
    if (replacement && index >= 0 && index < 10) commit(slots.map((s, i) => i === index ? replacement : s), '已替换，原歌单收进柜子')
  }
  function undo() {
    if (!previous) return
    try { localStorage.setItem(KEY, JSON.stringify(previous)) } catch { setNotice('撤销保存失败，请重试'); return }
    setSlots(previous); setPrevious(null); setNotice('已撤销')
  }
  return { slots, replacement, setReplacement, notice, setNotice, previous, store, display, replace, undo }
}
