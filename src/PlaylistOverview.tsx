import { playlists, playlistTracks, Playlist, useMusic } from './Music'

export function PlaylistOverview({ playlist, onClose, floating = false }: { playlist: Playlist; onClose: () => void; floating?: boolean }) {
  const m = useMusic()
  const tracks = playlistTracks(playlist)
  const displayed = m.shelf.slots.includes(playlist.id)

  const movePlaylist = () => {
    if (displayed) m.shelf.store(playlist.id)
    else m.shelf.display(playlist.id)
    onClose()
  }

  return <section className={`cabinet-preview${floating ? ' cabinet-preview-floating' : ''}`} role={floating ? 'region' : 'dialog'} aria-modal={floating ? undefined : true} aria-label={`${playlist.title}歌单概览`} onClick={e => e.stopPropagation()}>
    <div className="cp-head">
      <img src={playlist.coverUrl} alt="" />
      <div className="cp-title">
        <strong>{playlist.title}</strong>
        <small>{tracks.length} 首 · {tracks[0]?.artist || '歌单'}</small>
      </div>
      {!floating && <button className="cp-close" aria-label="关闭歌单概览" onClick={onClose}><svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 8L40 40" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 40L40 8" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>}
    </div>
    <ol className="cp-tracks">
      {tracks.map((track, index) => <li key={track.id}>
        <span className="cp-no">{index + 1}</span>
        <span className="cp-name">{track.title}</span>
        {track.artist && <small>{track.artist}</small>}
      </li>)}
    </ol>
    <div className="cp-actions">
      <button className="cp-store" onClick={movePlaylist}>{displayed ? '下架' : '陈列'}</button>
      <button className="cp-play" onClick={() => { m.start(playlist); onClose() }}>▶ 播放</button>
    </div>
  </section>
}

export function ShelfReplacementDialog() {
  const m = useMusic()
  const incomingId = m.shelf.replacement
  if (!incomingId) return null
  const incoming = playlists.find(playlist => playlist.id === incomingId)

  return <div className="shelf-replace-shade" onClick={() => m.shelf.setReplacement(null)}>
    <section className="shelf-replace-dialog" role="dialog" aria-modal="true" aria-label="选择要替换的唱片" onClick={e => e.stopPropagation()}>
      <div className="shelf-replace-head">
        <div><h2>唱片架已摆满</h2><p>选择一张唱片，替换为「{incoming?.title || '新歌单'}」</p></div>
        <button className="replace-close" aria-label="取消替换" onClick={() => m.shelf.setReplacement(null)}>×</button>
      </div>
      <div className="shelf-replace-grid">
        {m.shelf.slots.map((id, index) => {
          const playlist = playlists.find(item => item.id === id)
          return playlist && <button key={index} onClick={() => m.shelf.replace(index)} aria-label={`替换${playlist.title}`}>
            <img src={playlist.coverUrl} alt="" />
            <span>{playlist.title}</span>
          </button>
        })}
      </div>
    </section>
  </div>
}
