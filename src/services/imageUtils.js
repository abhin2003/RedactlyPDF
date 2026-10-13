export const computeDHashFromImageData = (imageData, width, height) => {
  // Scale to 9x8 using nearest-neighbor
  const resizeWidth = 9;
  const resizeHeight = 8;
  const resized = new Uint8Array(resizeWidth * resizeHeight);

  // imageData could be RGBA, RGB, or Grayscale
  const isRGBA = imageData.length === width * height * 4;
  const isRGB = imageData.length === width * height * 3;
  
  for (let y = 0; y < resizeHeight; y++) {
    for (let x = 0; x < resizeWidth; x++) {
      const origX = Math.floor((x / resizeWidth) * width);
      const origY = Math.floor((y / resizeHeight) * height);
      
      let r = 0, g = 0, b = 0;
      if (isRGBA) {
        const idx = (origY * width + origX) * 4;
        r = imageData[idx];
        g = imageData[idx+1];
        b = imageData[idx+2];
      } else if (isRGB) {
        const idx = (origY * width + origX) * 3;
        r = imageData[idx];
        g = imageData[idx+1];
        b = imageData[idx+2];
      } else {
        const idx = origY * width + origX;
        r = g = b = imageData[idx];
      }
      
      const gray = Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
      resized[y * resizeWidth + x] = gray;
    }
  }

  let hash = '';
  for (let y = 0; y < resizeHeight; y++) {
    for (let x = 0; x < resizeWidth - 1; x++) {
      const left = resized[y * resizeWidth + x];
      const right = resized[y * resizeWidth + x + 1];
      hash += (left > right ? '1' : '0');
    }
  }
  return hash; // 64 bit string of 1s and 0s
};

export const computeHashFromImageElement = (img) => {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, img.width, img.height);
  ctx.drawImage(img, 0, 0, img.width, img.height);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  return computeDHashFromImageData(imageData.data, img.width, img.height);
};

export const hammingDistance = (hash1, hash2) => {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 100;
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) dist++;
  }
  return dist;
};
