/**
 * Shrinks a poster video in the owner's browser before it is uploaded (lát E9, Tài 2026-09-26).
 *
 * A clip straight off a phone is Full HD or 4K at 16-45 Mbps: fifteen seconds of it is already thirty megabytes, and
 * every guest who opens the page pays for it on 4G. Tài: a poster is an advert, "720p cũng đẹp rồi, dài cũng được" --
 * so the clip is redrawn at 720p (the short side) and re-recorded at about 1.5 Mbps, which puts a minute near eleven
 * megabytes. No length limit: a long clip is fine, it simply takes as long to shrink as it takes to play.
 *
 * The same three rules as shrink-image.ts:
 *   - anything the browser cannot do -- no MP4 recorder (Firefox), a clip it cannot decode -- uploads the original;
 *   - a result that is not smaller is dropped for the original;
 *   - a clip already at or under 720p and under the target rate is left alone.
 *
 * It plays the clip muted into a canvas and records the canvas, so it runs in real time and needs the tab in front:
 * a hidden tab stops drawing. The sound is dropped on purpose -- a poster plays muted.
 */
export type VideoTarget = { shortEdge: number; bitsPerSecond: number };
export const POSTER_VIDEO: VideoTarget = { shortEdge: 720, bitsPerSecond: 1_500_000 };
export type ShrunkVideo = { blob: Blob; type: 'video/mp4'; from: number; to: number };

/** MP4 only: it is the one video type the upload accepts and every phone plays. The recorder's own answer decides. */
export function mp4Recorder(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return ['video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type)) ?? null;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export async function shrinkVideo(file: Blob, target: VideoTarget = POSTER_VIDEO,
  onProgress?: (share: number) => void): Promise<ShrunkVideo | null> {
  const type = mp4Recorder();
  if (!type) return null;
  const source = URL.createObjectURL(file), video = document.createElement('video');
  let stream: MediaStream | undefined;
  try {
    video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = source;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve(); video.onerror = () => reject(); setTimeout(reject, 15000);
    });
    const { videoWidth: width, videoHeight: height, duration } = video;
    if (!width || !height || !Number.isFinite(duration) || duration <= 0) return null;
    const scale = Math.min(1, target.shortEdge / Math.min(width, height));
    // Already small and already light: redrawing would only lose a little more of it.
    if (scale === 1 && file.size * 8 / duration <= target.bitsPerSecond * 1.2) return null;
    const canvas = document.createElement('canvas');
    canvas.width = even(width * scale); canvas.height = even(height * scale);
    const context = canvas.getContext('2d');
    if (!context) return null;
    stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: target.bitsPerSecond });
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
    const draw = () => { context.drawImage(video, 0, 0, canvas.width, canvas.height); onProgress?.(Math.min(1, video.currentTime / duration)); };
    // Each decoded frame where the browser offers it; a timer otherwise. Both stop when the clip ends.
    const frames = 'requestVideoFrameCallback' in video;
    let timer = 0;
    const next = () => { if (video.ended) return; draw(); if (frames) video.requestVideoFrameCallback(next); };
    const ended = new Promise<void>((resolve, reject) => { video.onended = () => resolve(); video.onerror = () => reject(); });
    draw(); recorder.start(1000);
    await video.play();
    if (frames) video.requestVideoFrameCallback(next); else timer = window.setInterval(draw, 1000 / 30);
    await ended;
    window.clearInterval(timer); draw(); recorder.stop(); await stopped;
    const blob = new Blob(chunks, { type: 'video/mp4' });
    return blob.size > 0 && blob.size < file.size ? { blob, type: 'video/mp4', from: file.size, to: blob.size } : null;
  } catch { return null; } finally {
    stream?.getTracks().forEach(track => track.stop());
    video.removeAttribute('src'); video.load(); URL.revokeObjectURL(source);
  }
}
