import { useEffect, useRef, useState } from 'react'
import { playlists } from '../Music'
import './ProfilePage.css'

// 统一箭头图标：默认左箭头（返回方向），dir="right" 时右转（进入/更多方向）
function ArrowIcon({ size = 20, dir = 'left', color = '#333' }: { size?: number; dir?: 'left' | 'right'; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ verticalAlign: 'middle', flexShrink: 0, transform: dir === 'right' ? 'rotate(180deg)' : undefined }}
    >
      <path d="M31 36L19 24L31 12" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// QQ音乐个人主页（改版）——作为 3D 音乐空间的首页入口
// 点击「进入3D空间 / 我的3D音乐空间」通过 onEnter3D 切换到 3D 房间
export default function ProfilePage({ onEnter3D }: { onEnter3D: () => void }) {
  const [page, setPage] = useState<'home' | 'vinyl'>(() => {
    try { return (localStorage.getItem('profile-page') as 'home' | 'vinyl') === 'vinyl' ? 'vinyl' : 'home' } catch { return 'home' }
  })
  const userCardRef = useRef<HTMLDivElement>(null)
  const [userCardRect, setUserCardRect] = useState({ x: 0, y: 0, width: 0, height: 0 })
  useEffect(() => {
    if (page !== 'home') return
    const update = () => {
      const rect = userCardRef.current?.getBoundingClientRect()
      if (rect) setUserCardRect({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [page])
  // 记忆当前页：从 3D 空间返回时恢复进入前的页面（唱片架页），确保能看到实时预览图
  useEffect(() => { try { localStorage.setItem('profile-page', page) } catch {} }, [page])
  // 3D 空间预览图：返回唱片架时由 3D 场景截图并写入 window.__roomPreview，实时同步当前场景
  const [roomPreview] = useState<string>(() => (window as any).__roomPreview || '')
  const shelfIds = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem('soundroom-shelf-v1') || 'null')
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : playlists.slice(0, 8).map(p => p.id)
    } catch {
      return playlists.slice(0, 8).map(p => p.id)
    }
  })()
  const shelfOrder = new Map(shelfIds.map((id, index) => [id, index]))
  const orderedPlaylists = [...playlists].sort((a, b) => {
    const aIndex = shelfOrder.get(a.id)
    const bIndex = shelfOrder.get(b.id)
    if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex
    if (aIndex !== undefined) return -1
    if (bIndex !== undefined) return 1
    return 0
  })

  return (
    <div
      className={`profile-shell ${page === 'vinyl' ? 'profile-shell-vinyl' : ''}`}
      style={{
        fontFamily: 'var(--font-family)',
        background: 'var(--color-bg)',
        color: 'var(--color-text-primary)',
        fontSize: 14,
        lineHeight: 1.5,
        paddingBottom: 140,
        maxWidth: 480,
        margin: '0 auto',
        minHeight: '100vh',
        height: '100vh',
        overflowY: 'auto',
        position: 'relative',
      }}
    >
      {/* ================= 主页 ================= */}
      {page === 'home' && (
        <div id="home-page" className="page active">

          <div className="search-bar">
            <div className="search-input-wrapper">
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="M21 21l-4.35-4.35"></path>
              </svg>
              <input type="text" placeholder="AI帮唱「Lemonade」解..." readOnly />
            </div>
            <div className="header-actions">
              <div className="vip-icon"><svg viewBox="0 0 1024 1024" width="28" height="28" xmlns="http://www.w3.org/2000/svg"><path d="M63.3 496.3a448 448 0 1 0 896 0 448 448 0 1 0-896 0z" fill="#FFD96B"/><path d="M828.2 179.7L194.7 813.3c175 174.8 458.5 174.8 633.4-0.1 174.9-175 175-458.5 0.1-633.5z" fill="#FDC223"/><path d="M185.6 496.3a325.7 325.7 0 1 0 651.4 0 325.7 325.7 0 1 0-651.4 0z" fill="#F9AB10"/><path d="M734.6 259.7C607 139.2 406 141.1 281 266c-124.9 125-126.8 326-6.3 453.6l459.9-459.9z" fill="#F9B721"/><path d="M483.3 588.4h-80.2v-47.8h80.2v-25.9h-80.2v-47.8h56.4l-67.2-136.4h66.6l43.2 92.1c5.5 11.5 9.4 21.7 11.7 30.5 2.7-9.5 6.6-19.7 11.7-30.5l44.1-92.1h66.6l-68.1 136.4h57.3v47.8h-81.3v25.9h81.3v47.8h-81.3v101.2h-60.7V588.4z" fill="#D3830D"/><path d="M572 459L442.6 588.4h40.7v101.2h60.8V588.4h81.3v-47.8h-81.3v-25.9h81.3v-47.8h-57.3z" fill="#BF790A"/></svg></div>
              <div className="icon-btn">
                <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 39H44V24V9H24H4V24V39Z" fill="none" stroke="#333" strokeWidth="3" strokeLinejoin="round"/><path d="M4 9L24 24L44 9" stroke="#333" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M24 9H4V24" stroke="#333" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M44 24V9H24" stroke="#333" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span className="badge">4</span>
              </div>
              <div className="icon-btn">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
              </div>
            </div>
          </div>

          <div className="profile-membership-card">
          <div ref={userCardRef} className="user-card" onClick={() => setPage('vinyl')}>
            <div className="user-info-main">
              <div className="avatar-wrapper">
                <img src="/avatar.png" alt="头像" className="avatar" />
                <span className="avatar-badge">LV.9</span>
              </div>
              <div className="user-details">
                <div className="user-name-row">
                  <span className="user-name">元元远远圆</span>
                  <svg className="verified-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                  </svg>
                </div>
                <div className="user-badges">
                  <span className="vip-badge">⚡ 豪华VIP.5</span>
                  <span className="medal-badge">💖 26勋章</span>
                </div>
              </div>
            </div>
          </div>

          <div className="member-section">
            <div className="member-copy">
            <div className="member-header">
              <span className="member-title">
                会员中心
                <ArrowIcon size={18} dir="right" color="#C69B4D" />
              </span>
            </div>
            <div className="member-offer-row">
              <p className="member-desc">续费会员享2...</p>
              <button className="renew-btn">去续费</button>
            </div>
            </div>
            <div className="member-actions">
              <div className="member-action-item" onClick={onEnter3D}>
                <div className="member-action-icon dress">
                  <svg viewBox="0 0 1024 1024" width="25" height="25" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                    <path d="M328.874667 485.333333S345.301333 316.202667 381.44 273.066667c80.853333-96.298667 292.778667-88.32 368.298667 13.269333 29.610667 39.808 32.896 271.658667 32.896 271.957333.128 5.888 69.973333 29.44 76.458666 32.554667 34.048 16.426667 69.376 35.413333 100.266667 57.173333 24.661333 17.493333 51.797333 43.52 61.226667 73.386667 11.690667 37.034667-18.602667 68.138667-45.226667 88.832-51.456 39.936-93.44-41.386667-118.613333-76.202667-125.013333-172.8-286.72-26.794667-436.053334 25.258667-110.378667 38.485333-218.88-7.125333-303.488-79.701333C103.168 667.562667 5.802667 544 0 545.024l328.874667-59.690667z" fill="#F28C28" />
                    <path d="M328.874667 485.376c-3.413333 5.461333 24.96 9.130667 33.536 10.922667 25.941333 5.376 54.613333 16.554667 81.664 24.149333 54.357333 15.189333 114.218667 17.365333 170.112 24.021333 46.848 5.546667 93.866667 11.861333 141.056 13.653334 1.408 0 27.477333 1.536 27.392-1.962667a2205.44 2205.44 0 0 0-1.066667-38.954667l-5.034667.170667c-140.8 3.413333-265.088-41.088-398.677333-76.672-1.92-.554667-41.898667-11.008-42.197333-9.173333-3.328 21.376-9.728 33.28-6.784 53.845333z" fill="#FFFFFF" />
                  </svg>
                </div>
                <span className="member-action-label">装扮</span>
              </div>
              <div className="member-action-item">
                <div className="member-action-icon sign">
                  <svg viewBox="0 0 1024 1024" width="18" height="18" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                    <path d="M921.6 81.92h-226.304V40.96c0-11.264-4.608-21.504-11.776-29.184C675.84 4.608 665.6 0 654.336 0c-22.528 0-40.96 18.432-40.96 40.96v40.96h-204.8V40.96c0-11.264-4.608-21.504-11.776-29.184C389.12 4.608 378.88 0 367.616 0c-22.528 0-40.96 18.432-40.96 40.96v40.96H102.4C46.08 81.92 0 128 0 184.32v737.28c0 56.32 46.08 102.4 102.4 102.4h819.2c56.32 0 102.4-46.08 102.4-102.4V184.32c0-56.832-46.08-102.4-102.4-102.4z m-196.608 473.088l-254.464 256-1.536 1.536c-2.048 2.048-4.096 3.584-6.144 5.12-2.048 1.536-4.608 2.56-7.168 3.584-3.584 1.536-7.68 2.56-11.264 2.56H440.32c-10.24 0-20.48-4.096-28.672-11.776l-1.024-1.024-112.64-113.664c-15.872-15.872-15.872-41.472 0-56.832 8.192-8.192 18.432-11.776 28.16-11.776 10.24 0 20.48 4.096 28.672 11.776L440.32 726.528l227.84-228.864c15.872-15.872 41.472-15.872 56.832 0 9.216 7.168 12.288 17.92 12.288 28.16s-4.096 20.992-12.288 29.184zM942.08 286.72H81.92V184.32c0-11.264 9.216-20.48 20.48-20.48h224.256v40.96c0 22.528 18.432 40.96 40.96 40.96s40.96-18.432 40.96-40.96v-40.96h204.8v40.96c0 22.528 18.432 40.96 40.96 40.96s40.96-18.432 40.96-40.96v-40.96H921.6c11.264 0 20.48 9.216 20.48 20.48v102.4z" fill="#E85D8E" />
                  </svg>
                </div>
                <span className="member-action-label">日签</span>
              </div>
              <div className="member-action-item">
                <div className="member-action-icon follow">
                  <svg viewBox="0 0 1024 1024" width="25" height="25" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                    <path d="M640 513.1c10.3-6 18.6-23.2 1.2-31.4-5.9-2.7-12-5.2-18.1-7.6C666.5 435.2 694 378.9 694 316c0-117.2-95.1-212.3-212.3-212.3S269.4 198.8 269.4 316c0 62.9 27.5 119.2 70.9 158.1-128.6 50.5-223.5 167.9-242 309.4-.2 1.7-.3 3.4-.3 5.1 0 26.7 21.6 48.4 48.4 48.4H549c-18.5-34.2-29.1-73.4-29.1-115 .1-89.2 48.4-167 120.1-208.9z" />
                    <path d="M761.7 523.4c-109.4 0-198.5 89-198.5 198.5 0 109.4 89 198.5 198.5 198.5s198.5-89 198.5-198.5c0-109.4-89-198.5-198.5-198.5z m124.7 188.7l-42.8 43.4c-1.8 1.8-3.1 4.9-2.4 7.3l10.4 62.4c1.8 8.6-1.8 16.5-8.6 21.4-3.7 2.4-7.9 3.7-12.2 3.7-3.1 0-6.7-.6-9.8-2.4l-53.2-29.3c-1.8-1.2-4.3-1.2-6.1 0l-53.2 29.3c-7.3 3.7-15.3 3.1-22-1.2-7.3-4.9-10.4-12.8-9.2-21.4l10.4-61.7c.6-3.1 0-5.5-1.8-7.3l-43.4-44c-5.5-6.1-7.3-14.7-4.9-22.6 2.4-7.3 8.6-12.8 16.5-14.1l59.3-9.2c2.4 0 4.3-1.8 5.5-4.3l26.3-56.2c3.7-7.9 11-12.2 18.9-12.2s15.3 4.9 18.9 12.2l26.9 56.2c1.2 2.4 3.1 3.7 5.5 4.3l59.3 9.2c7.3.6 14.1 6.1 16.5 14.1 3.1 7.7.7 16.3-4.8 22.4z" />
                  </svg>
                </div>
                <span className="member-action-label">关注</span>
              </div>
            </div>
          </div>
          </div>

          <div className="function-grid">
            <div className="function-item">
              <div className="function-icon favorites"><svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 8C8.92487 8 4 12.9249 4 19C4 30 17 40 24 42.3262C31 40 44 30 44 19C44 12.9249 39.0751 8 33 8C29.2797 8 25.9907 9.8469 24 12.6738C22.0093 9.8469 18.7203 8 15 8Z" fill="#131630" stroke="#131630" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <span className="function-label">收藏</span>
              <span className="function-count">200</span>
            </div>
            <div className="function-item">
              <div className="function-icon local"><svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M41.4004 11.551L36.3332 5H11.6666L6.58398 11.551" stroke="#131630" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 13C6 11.8954 6.89543 11 8 11H40C41.1046 11 42 11.8954 42 13V40C42 41.6569 40.6569 43 39 43H9C7.34315 43 6 41.6569 6 40V13Z" fill="#131630" stroke="#131630" strokeWidth="3" strokeLinejoin="round"/><path d="M32 27L24 35L16 27" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M23.9917 19V35" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <span className="function-label">本地</span>
              <span className="function-count">历史29</span>
            </div>
            <div className="function-item">
              <div className="function-icon audio"><svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="17" y="4" width="14" height="27" rx="7" fill="#131630" stroke="#131630" strokeWidth="3" strokeLinejoin="round"/><path d="M9 23C9 31.2843 15.7157 38 24 38C32.2843 38 39 31.2843 39 23" stroke="#131630" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M24 38V44" stroke="#131630" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <span className="function-label">有声</span>
              <span className="function-count">27</span>
            </div>
            <div className="function-item">
              <div className="function-icon purchased"><svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 12.6001V41.0001C6 42.1047 6.89543 43.0001 8 43.0001H40C41.1046 43.0001 42 42.1047 42 41.0001V12.6001H6Z" fill="#131630" stroke="#131630" strokeWidth="3" strokeLinejoin="round"/><path d="M42 12.6L36.3333 5H11.6667L6 12.6V12.6" stroke="#131630" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M31.5554 19.2002C31.5554 23.3976 28.1727 26.8002 23.9999 26.8002C19.8271 26.8002 16.4443 23.3976 16.4443 19.2002" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <span className="function-label">已购</span>
              <span className="function-count">1</span>
            </div>
          </div>

          <div className="section-header">
            <h2 className="section-title">最近播放</h2>
            <span className="section-more"><ArrowIcon size={18} dir="right" /></span>
          </div>
          <div className="recent-list">
            <div className="recent-item">
              <img src={playlists[0].coverUrl} alt={`${playlists[0].title}封面`} className="recent-cover" />
              <div className="recent-info">
                <div className="recent-name">已播歌曲</div>
                <div className="recent-sub">2500首</div>
              </div>
              <span className="recent-arrow"><ArrowIcon size={18} dir="right" /></span>
            </div>
            <div className="recent-item">
              <img src={playlists[1].coverUrl} alt={`${playlists[1].title}封面`} className="recent-cover" />
              <div className="recent-info">
                <div className="recent-name">已播视频</div>
                <div className="recent-sub">190个</div>
              </div>
              <span className="recent-arrow"><ArrowIcon size={18} dir="right" /></span>
            </div>
            <div className="recent-item">
              <img src={playlists[2].coverUrl} alt={`${playlists[2].title}封面`} className="recent-cover" />
              <div className="recent-info">
                <div className="recent-name">新建歌单9</div>
                <div className="recent-sub">歌曲 · 4首</div>
              </div>
              <span className="recent-arrow"><ArrowIcon size={18} dir="right" /></span>
            </div>
          </div>
        </div>
      )}

      {/* ================= 唱片架页面 ================= */}
      {page === 'vinyl' && (
        <div id="vinyl-page" className="page vinyl-page active">
          <button className="vinyl-back-btn" onClick={() => setPage('home')} aria-label="返回主页">
            <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M31 36L19 24L31 12" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <section className="vinyl-entrance">
            <div className="vinyl-shelf-container" onClick={onEnter3D} style={roomPreview ? { backgroundImage: `url(${roomPreview})` } : undefined}>
              <div className="vinyl-scene-shade" />
              <div className="vinyl-shelf-placeholder">
                <div className="hint">我的3D音乐空间</div>
              </div>
            </div>
            <div className="vinyl-entrance-glass">
              <div className="vinyl-user-card">
            <img src="/avatar.png" alt="头像" className="vinyl-avatar" />
            <div className="vinyl-user-info">
              <div className="vinyl-user-name-row">
                <span className="vinyl-user-name">元元远远圆</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#31C27C">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                </svg>
              </div>
              <div className="vinyl-user-desc">女 狮子座 湖南 INTP</div>
              <div className="vinyl-user-tags">
                <span className="vip-badge" style={{ fontSize: 10, padding: '2px 6px' }}>⚡ 豪华VIP.5</span>
                <span className="medal-badge" style={{ fontSize: 10, padding: '2px 6px' }}>💖 11枚勋章</span>
                <span style={{ fontSize: 10, color: '#FFB340' }}>🪙 510</span>
              </div>
            </div>
            <button className="vinyl-edit-btn">编辑资料</button>
              </div>

              <div className="stats-row">
            <div className="stat-item"><div className="stat-number">关注 8</div></div>
            <div className="stat-item"><div className="stat-number">粉丝 1</div></div>
            <div className="stat-item"><div className="stat-number">访客 19</div></div>
            <div className="stat-item"><div className="stat-number">搭子 0</div></div>
              </div>
              <button className="enter-3d-btn" onClick={onEnter3D}>
                进入3D空间
              </button>
            </div>
          </section>

          <div className="medals-section">
            <div className="medals-header">
              <span className="medals-title">获勋章</span>
              <span className="medals-count">26</span>
              <span className="medals-more">更多</span>
            </div>
            <div className="medals-grid">
              <div className="medal-item">
                <div className="medal-icon" style={{ background: 'linear-gradient(135deg,#E8F5E9,#C8E6C9)' }}>🎸</div>
                <span className="medal-name">R&B发烧友</span>
                <span className="medal-date">2024-07-26</span>
              </div>
              <div className="medal-item">
                <div className="medal-icon" style={{ background: 'linear-gradient(135deg,#E3F2FD,#90CAF9)' }}>🌉</div>
                <span className="medal-name">英文歌鉴赏...</span>
                <span className="medal-date">2023-11-02</span>
              </div>
              <div className="medal-item">
                <div className="medal-icon" style={{ background: 'linear-gradient(135deg,#F3E5F5,#CE93D8)' }}>🎵</div>
                <span className="medal-name">韩语歌鉴赏...</span>
                <span className="medal-date">2024-01-14</span>
              </div>
              <div className="medal-item">
                <div className="medal-icon" style={{ background: 'linear-gradient(135deg,#E0F2F1,#80CBC4)' }}>🎧</div>
                <span className="medal-name">EDM发烧友</span>
                <span className="medal-date">2025-08-01</span>
              </div>
              <div className="medal-item">
                <div className="medal-icon" style={{ background: 'linear-gradient(135deg,#FFF3E0,#FFCC80)' }}>🏆</div>
                <span className="medal-name">超级听友</span>
                <span className="medal-date">2023-11-14</span>
              </div>
              <div className="medal-item">
                <div className="medal-icon" style={{ background: 'linear-gradient(135deg,#E8EAF6,#9FA8DA)' }}>🎹</div>
                <span className="medal-name">电子音乐发...</span>
                <span className="medal-date">2026-03-08</span>
              </div>
            </div>
          </div>

          <div className="two-col-section">
            <div className="col-card">
              <div className="col-card-title">歌手榜</div>
              <div className="artist-rank">
                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23E91E63'/%3E%3Ctext x='50' y='58' text-anchor='middle' fill='white' font-size='24'%3ETWICE%3C/text%3E%3C/svg%3E" alt="" className="artist-avatar" />
                <div className="artist-info">
                  <div className="artist-rank-num">NO.1</div>
                  <div className="artist-rank-label">TWICE</div>
                </div>
              </div>
            </div>
            <div className="col-card">
              <div className="col-card-title">已购</div>
              <div className="purchased-album">
                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='10' fill='%23222'/%3E%3Ccircle cx='50' cy='50' r='25' fill='%23444'/%3E%3Ccircle cx='50' cy='50' r='8' fill='%23222'/%3E%3C/svg%3E" alt="" className="album-cover" />
                <div className="album-info">
                  <div className="album-count">1</div>
                  <div className="album-label">张数字专辑</div>
                </div>
              </div>
            </div>
          </div>

          <div className="collection-section">
            <div className="collection-header">
              <span className="collection-title">我的收藏</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="collection-stats">
                <div className="collection-stat">
                  <div className="collection-stat-num">200</div>
                  <div className="collection-stat-label">首歌曲</div>
                </div>
                <div className="collection-stat">
                  <div className="collection-stat-num">0</div>
                  <div className="collection-stat-label">张专辑</div>
                </div>
                <div className="collection-stat">
                  <div className="collection-stat-num">7</div>
                  <div className="collection-stat-label">张单曲</div>
                </div>
                <div className="collection-stat">
                  <div className="collection-stat-num">?</div>
                  <div className="collection-stat-label">张歌单</div>
                </div>
              </div>
              <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='10' fill='%234FC3F7'/%3E%3Ctext x='50' y='40' text-anchor='middle' fill='white' font-size='14' font-weight='bold'%3E音乐%3C/text%3E%3Ctext x='50' y='60' text-anchor='middle' fill='white' font-size='14' font-weight='bold'%3E空间%3C/text%3E%3Ctext x='50' y='78' text-anchor='middle' fill='white' font-size='10'%3EVINYL%3C/text%3E%3C/svg%3E" alt="" className="collection-preview" />
            </div>
          </div>

          <div className="playlist-section">
            <div className="playlist-header">
              <span className="playlist-title">我的歌单</span>
              <span className="playlist-more">更多</span>
            </div>
            {orderedPlaylists.map(playlist => (
              <div className="playlist-item" key={playlist.id}>
                <img src={playlist.coverUrl} alt={`${playlist.title}封面`} className="playlist-cover" />
                <div className="playlist-info">
                  <div className="playlist-name">{playlist.title}</div>
                  <div className="playlist-meta">{playlist.trackIds.length} 首歌曲{ shelfOrder.has(playlist.id) ? ' · 唱片架' : ' · 收藏柜' }</div>
                </div>
                <span className="playlist-arrow"><ArrowIcon size={16} dir="right" /></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= 底部播放器（共用） ================= */}
      {page === 'home' && <div className="mini-player">
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='8' fill='%23F8BBD0'/%3E%3Ctext x='50' y='55' text-anchor='middle' fill='%23E91E63' font-size='12'%3EPretty%3C/text%3E%3C/svg%3E" alt="" className="player-cover" />
        <div className="player-info">
          <div className="player-song">Pretty Girl - RESCEN<span className="vip-tag">VIP</span></div>
        </div>
        <div className="player-actions">
          <div className="player-btn"><svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 8C8.92487 8 4 12.9249 4 19C4 30 17 40 24 42.3262C31 40 44 30 44 19C44 12.9249 39.0751 8 33 8C29.2797 8 25.9907 9.8469 24 12.6738C22.0093 9.8469 18.7203 8 15 8Z" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
          <div className="player-btn play"><svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 24V11.8756L25.5 17.9378L36 24L25.5 30.0622L15 36.1244V24Z" fill="#131630" stroke="#131630" strokeWidth="3" strokeLinejoin="round"/></svg></div>
          <div className="player-btn"><svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.94971 11.9497H39.9497" stroke="#333" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M7.94971 23.9497H39.9497" stroke="#333" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M7.94971 35.9497H39.9497" stroke="#333" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
        </div>
      </div>}

      {/* ================= 底部导航（共用） ================= */}
      {page === 'home' && <nav className="bottom-nav">
        <div className={`nav-item ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>
          <span className="nav-icon"><svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 18V42H39V18L24 6L9 18Z" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 29V42H29V29H19Z" fill="none" stroke="#333" strokeWidth="3" strokeLinejoin="round"/><path d="M9 42H39" stroke="#333" strokeWidth="3" strokeLinecap="round"/></svg></span>
          <span className="nav-label">首页</span>
        </div>
        <div className="nav-item">
          <span className="nav-icon"><svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="36" height="36" rx="3" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 24V16.2058L25.25 20.1029L32 24L25.25 27.8971L18.5 31.7942V24Z" fill="none" stroke="#333" strokeWidth="3" strokeLinejoin="round"/></svg></span>
          <span className="nav-label">视频</span>
        </div>
        <div className="nav-item">
          <span className="nav-icon"><svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 28.6292C26.5104 28.6292 28.5455 26.6004 28.5455 24.0979C28.5455 21.5954 26.5104 19.5667 24 19.5667C21.4897 19.5667 19.4546 21.5954 19.4546 24.0979C19.4546 26.6004 21.4897 28.6292 24 28.6292Z" fill="none" stroke="#333" strokeWidth="3" strokeLinejoin="round"/><path d="M16 15C10.6667 19.9706 10.6667 28.0294 16 33" stroke="#333" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M32 33C37.3333 28.0294 37.3333 19.9706 32 15" stroke="#333" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.85786 10C2.04738 17.7861 2.04738 30.4098 9.85786 38.1959" stroke="#333" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M38.1421 38.1959C45.9526 30.4098 45.9526 17.7861 38.1421 10" stroke="#333" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
          <span className="nav-label">刷歌</span>
        </div>
        <div className="nav-item">
          <span className="nav-icon"><svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M23.9986 5L17.8856 17.4776L4 19.4911L14.0589 29.3251L11.6544 43L23.9986 36.4192L36.3454 43L33.9586 29.3251L44 19.4911L30.1913 17.4776L23.9986 5Z" fill="none" stroke="#333" strokeWidth="3" strokeLinejoin="round"/></svg></span>
          <span className="nav-label">星光</span>
        </div>
        <div className="nav-item" onClick={() => setPage('vinyl')}>
          <span className="nav-icon"><svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 20C27.866 20 31 16.866 31 13C31 9.13401 27.866 6 24 6C20.134 6 17 9.13401 17 13C17 16.866 20.134 20 24 20Z" fill="#131630" stroke="#131630" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 40.8V42H42V40.8C42 36.3196 42 34.0794 41.1281 32.3681C40.3611 30.8628 39.1372 29.6389 37.6319 28.8719C35.9206 28 33.6804 28 29.2 28H18.8C14.3196 28 12.0794 28 10.3681 28.8719C8.86278 29.6389 7.63893 30.8628 6.87195 32.3681C6 34.0794 6 36.3196 6 40.8Z" fill="#131630" stroke="#131630" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
          <span className="nav-label">我的</span>
        </div>
      </nav>}
      {page === 'home' && <div className="profile-onboarding" role="status" aria-label="新手引导：点击个人卡片进入下一步">
        <div className="profile-onboarding-callout" style={{ left: Math.max(160, Math.min(window.innerWidth - 160, userCardRect.x + userCardRect.width / 2)), top: userCardRect.y + userCardRect.height + 14 }}>
          <strong>从这里开始探索</strong>
          <small>点击个人卡片，进入唱片架页面</small>
          <span aria-hidden="true">↑</span>
        </div>
        <button type="button" className="profile-onboarding-target" aria-label="点击个人卡片，进入唱片架页面" onClick={() => setPage('vinyl')} style={{ left: userCardRect.x, top: userCardRect.y, width: userCardRect.width, height: userCardRect.height, opacity: userCardRect.width ? 1 : 0 }} />
      </div>}
    </div>
  )
}
