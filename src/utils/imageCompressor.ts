/**
 * Compresses an image file client-side to a maximum width (800px for costume photos, 1200px for party/tasks)
 * and returns both a Blob for direct Supabase Storage upload and a DataURL for instant preview.
 */
export interface CompressedImageResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

export async function compressImage(
  file: File | Blob,
  maxWidth = 800,
  quality = 0.85
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      // Fallback to FileReader if createObjectURL fails
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => processImage(img, '', resolve, reject, maxWidth, quality);
        img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    img.onload = () => {
      processImage(img, objectUrl, resolve, reject, maxWidth, quality);
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Bild konnte nicht geladen werden'));
    };
    img.src = objectUrl;
  });
}

function processImage(
  img: HTMLImageElement,
  objectUrl: string,
  resolve: (res: CompressedImageResult) => void,
  reject: (err: Error) => void,
  maxWidth: number,
  quality: number
) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);

  let width = img.width;
  let height = img.height;

  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    reject(new Error('Canvas 2D Context nicht verfügbar'));
    return;
  }

  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);

  canvas.toBlob(
    (blob) => {
      if (!blob) {
        reject(new Error('Konnte Bild nicht in Blob konvertieren'));
        return;
      }
      resolve({ blob, dataUrl, width, height });
    },
    'image/jpeg',
    quality
  );
}

/**
 * Backward-compatible helper for costume photo registration (max 800px width).
 */
export async function compressImageToMax800px(file: File): Promise<string> {
  const result = await compressImage(file, 800, 0.85);
  return result.dataUrl;
}

/**
 * Helper for party / task photos (max 1200px width).
 */
export async function compressImageToMax1200px(file: File | Blob): Promise<CompressedImageResult> {
  return compressImage(file, 1200, 0.85);
}
