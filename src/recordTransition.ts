// 同一时间轴驱动唱针、唱片和音频，先留出镜头靠近的时间。
export const CAMERA_SETTLE_MS = 900
// 唱针接触盘面后留出 300ms，让落针的咔哒声完整结束再放出歌曲。
export const RECORD_SWAP_MS = 4500
export const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}
export function recordPhase(startedAt: number) {
  const seconds = (performance.now() - startedAt) / 1000
  return {
    seconds,
    liftArm: smooth(seconds / 0.35) * (1 - smooth((seconds - 3.75) / 0.45)),
    parkArm: smooth((seconds - 0.3) / 0.5),
    cueArm: smooth((seconds - 3.15) / 0.6),
    liftOld: smooth((seconds - 0.85) / 0.55),
    removeOld: smooth((seconds - 1.4) / 0.65),
    insertNew: smooth((seconds - 2.15) / 0.65),
    lowerNew: smooth((seconds - 2.8) / 0.55),
    newRecord: seconds >= 2.1,
    spinUp: smooth((seconds - 3.35) / 0.85),
  }
}
