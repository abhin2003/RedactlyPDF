import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';

let model = null;

export const loadModel = async () => {
  if (!model) {
    // Setting up WASM backend for better performance if possible, but default WebGL is fine
    await tf.ready();
    model = await mobilenet.load({ version: 2, alpha: 1.0 });
  }
  return model;
};

// Compute cosine similarity between two 1D arrays
export const cosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const getEmbeddingFromImageElement = async (imgElement) => {
  if (!imgElement) return null;
  // MobileNet natively operates on 224x224. Resizing here prevents massive GPU allocations
  // from full-resolution photos or WhatsApp screenshots.
  const canvas = document.createElement('canvas');
  canvas.width = 224;
  canvas.height = 224;
  const ctx = canvas.getContext('2d');
  
  // Fill white background for transparency handling to match PDF extraction
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 224, 224);
  ctx.drawImage(imgElement, 0, 0, 224, 224);

  const m = await loadModel();
  // Wrap in tf.tidy to avoid WebGL tensor leaks in activation layers
  const embeddingTensor = tf.tidy(() => m.infer(canvas, true));
  const embeddingArray = await embeddingTensor.data();
  embeddingTensor.dispose();
  return Array.from(embeddingArray);
};

export const getEmbeddingFromImageData = async (imageData, width, height) => {
  if (!imageData || width <= 0 || height <= 0) return null;
  
  // Create intermediate canvas for the raw image data
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d');
  
  let idata;
  if (imageData instanceof Uint8ClampedArray && imageData.length === width * height * 4) {
    idata = new ImageData(imageData, width, height);
  } else {
    idata = tempCtx.createImageData(width, height);
    const isRGBA = imageData.length === width * height * 4;
    const isRGB = imageData.length === width * height * 3;
    const out = idata.data;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const outIdx = (y * width + x) * 4;
        let r = 0, g = 0, b = 0, a = 255;
        if (isRGBA) {
          const idx = (y * width + x) * 4;
          r = imageData[idx];
          g = imageData[idx+1];
          b = imageData[idx+2];
          a = imageData[idx+3];
        } else if (isRGB) {
          const idx = (y * width + x) * 3;
          r = imageData[idx];
          g = imageData[idx+1];
          b = imageData[idx+2];
        } else {
          const idx = y * width + x;
          r = g = b = imageData[idx];
        }
        
        const alpha = a / 255;
        out[outIdx] = r * alpha + 255 * (1 - alpha);
        out[outIdx+1] = g * alpha + 255 * (1 - alpha);
        out[outIdx+2] = b * alpha + 255 * (1 - alpha);
        out[outIdx+3] = 255;
      }
    }
  }
  tempCtx.putImageData(idata, 0, 0);

  // Resize down to 224x224 for MobileNet
  const canvas = document.createElement('canvas');
  canvas.width = 224;
  canvas.height = 224;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 224, 224);
  ctx.drawImage(tempCanvas, 0, 0, 224, 224);

  const m = await loadModel();
  const embeddingTensor = tf.tidy(() => m.infer(canvas, true));
  const embeddingArray = await embeddingTensor.data();
  embeddingTensor.dispose();
  return Array.from(embeddingArray);
};
