const MAX_AVATAR_DATA_URL_LENGTH = 60000;

export async function compressAvatarImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (PNG, JPG, WebP, or GIF).');
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Image file is too large (max 15 MB).');
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not read the selected image.'));
      image.src = objectUrl;
    });

    const minDim = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    if (!minDim) {
      throw new Error('Selected image has invalid dimensions.');
    }

    const sx = Math.max(0, Math.floor(((img.naturalWidth || img.width) - minDim) / 2));
    const sy = Math.max(0, Math.floor(((img.naturalHeight || img.height) - minDim) / 2));

    const attempts: Array<{ size: number; quality: number }> = [
      { size: 192, quality: 0.85 },
      { size: 160, quality: 0.78 },
      { size: 128, quality: 0.7 },
      { size: 96, quality: 0.6 },
    ];

    for (const attempt of attempts) {
      const canvas = document.createElement('canvas');
      canvas.width = attempt.size;
      canvas.height = attempt.size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Browser canvas is unavailable for image processing.');
      }

      // Fill white background so transparent PNGs render cleanly in circular avatars
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, attempt.size, attempt.size);
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, attempt.size, attempt.size);

      const dataUrl = canvas.toDataURL('image/jpeg', attempt.quality);
      if (dataUrl.length <= MAX_AVATAR_DATA_URL_LENGTH) {
        return dataUrl;
      }
    }

    throw new Error('Profile image could not be compressed small enough. Try another image.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
