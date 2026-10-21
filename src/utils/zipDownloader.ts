import JSZip from 'jszip';

export interface PhotoDownloadItem {
  id: string;
  photoUrl: string;
  photographerName?: string;
  taskTitle?: string;
  caption?: string;
  createdAt?: string;
}

/**
 * Downloads a single photo directly to the device.
 */
export async function downloadSinglePhoto(photoUrl: string, filename = 'Halloween_Foto.jpg'): Promise<void> {
  try {
    const res = await fetch(photoUrl, { mode: 'cors' });
    if (!res.ok) throw new Error('Fetch failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // Fallback: open image in new tab if CORS prevents direct download
    const a = document.createElement('a');
    a.href = photoUrl;
    a.target = '_blank';
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/**
 * Downloads multiple photos packed as a ZIP archive.
 */
export async function downloadPhotosAsZip(
  photos: PhotoDownloadItem[],
  zipFilename: string = 'Halloween_Party_Fotos.zip',
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (photos.length === 0) return;

  const zip = new JSZip();
  const folder = zip.folder('halloween_fotos') || zip;

  let loaded = 0;
  for (let i = 0; i < photos.length; i++) {
    const ph = photos[i];
    try {
      const res = await fetch(ph.photoUrl, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        const safePhotographer = (ph.photographerName || 'Gast').replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_');
        const safeTask = (ph.taskTitle || ph.caption || 'Foto').substring(0, 35).replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_');
        const timeStr = ph.createdAt ? new Date(ph.createdAt).toISOString().replace(/[:.]/g, '-') : `${i}`;
        const ext = blob.type.includes('png') ? 'png' : 'jpg';
        const fileName = `${(i + 1).toString().padStart(3, '0')}_${safePhotographer}_${safeTask}_${timeStr}.${ext}`;

        folder.file(fileName, blob);
      }
    } catch (err) {
      console.warn(`Konnte Foto ${ph.id} nicht in ZIP laden:`, err);
    }
    loaded++;
    if (onProgress) onProgress(loaded, photos.length);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
