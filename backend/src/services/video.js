// Transcode an uploaded video to a web-optimized MP4 (H.264/AAC, 720p max, with
// the moov atom moved to the front via +faststart) so it streams and starts
// playing instantly on every device. Falls back to the original on any error.
import { spawn } from 'child_process';
import { writeFile, readFile, rm, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

function run(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args);
    let err = '';
    ff.stderr.on('data', (d) => { err += d.toString(); });
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code + ': ' + err.slice(-400)))));
  });
}

// Returns { buffer, contentType, ext }. On failure returns the original.
export async function optimizeVideo(inputBuffer, originalType = 'video/mp4') {
  let dir;
  try {
    dir = await mkdtemp(join(tmpdir(), 'fh-vid-'));
    const inPath = join(dir, 'in');
    const outPath = join(dir, 'out.mp4');
    await writeFile(inPath, inputBuffer);
    await run([
      '-y', '-i', inPath,
      '-vf', 'scale=w=720:h=1280:force_original_aspect_ratio=decrease',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      outPath,
    ]);
    const buffer = await readFile(outPath);
    return { buffer, contentType: 'video/mp4', ext: 'mp4' };
  } catch (e) {
    console.log('[video] transcode failed, keeping original —', e.message);
    return { buffer: inputBuffer, contentType: originalType, ext: originalType === 'video/quicktime' ? 'mov' : 'mp4' };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
