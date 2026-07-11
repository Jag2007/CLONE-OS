import JSZip from 'jszip';
import { downloadSceneSketchBlob } from '../services/project.service';

function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Download a remote image URL as a file. Falls back to opening in a new tab if CORS blocks fetch.
 */
export async function downloadImageFromUrl(url, filename) {
  if (!url) return;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    triggerBlobDownload(blob, filename);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function extFromBlobType(type) {
  if (type?.includes('png')) return 'png';
  if (type?.includes('jpeg') || type?.includes('jpg')) return 'jpg';
  if (type?.includes('webp')) return 'webp';
  return 'png';
}

/**
 * Download the active sketch for a scene via the API (no new tab; works with S3 URLs).
 */
export async function downloadSketchFile(sceneId, filename) {
  if (!sceneId) return;
  const blob = await downloadSceneSketchBlob(sceneId);
  triggerBlobDownload(blob, filename);
}

/**
 * Zip all sketches from ordered frames (scene order), using authenticated API downloads.
 */
export async function downloadSketchesZip(frames, zipName = 'storyboard-sketches.zip') {
  const zip = new JSZip();
  const list = (frames || []).filter((f) => f.sketchUrl && f.id);
  for (const frame of list) {
    try {
      const blob = await downloadSceneSketchBlob(frame.id);
      const ext = extFromBlobType(blob.type);
      zip.file(`scene-${frame.sequenceOrder}-sketch.${ext}`, blob);
    } catch {
      /* skip scene if request fails */
    }
  }
  if (Object.keys(zip.files).length === 0) {
    throw new Error('Could not download sketches.');
  }
  const out = await zip.generateAsync({ type: 'blob' });
  triggerBlobDownload(out, zipName);
}
