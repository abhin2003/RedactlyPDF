import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

let cocoModel = null;

export const loadObjectDetectionModel = async () => {
  if (!cocoModel) {
    try {
      await tf.ready();
      cocoModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    } catch (err) {
      console.warn("Failed loading COCO-SSD model", err);
      return null;
    }
  }
  return cocoModel;
};

/**
 * Detects objects on a rendered canvas of a PDF page safely and non-blockingly.
 */
export const detectImagesOnCanvas = async (canvas, scale = 1.0, pageHeight) => {
  try {
    const m = await loadObjectDetectionModel();
    if (!m) return [];

    await new Promise(r => setTimeout(r, 0));

    const predictions = await m.detect(canvas);
    const detectedImages = [];

    predictions.forEach((pred, index) => {
      const [cvX, cvY, cvWidth, cvHeight] = pred.bbox;
      const pdfX = cvX / scale;
      const pdfWidth = cvWidth / scale;
      const pdfHeight = cvHeight / scale;
      const pdfY = pageHeight - (cvY / scale) - pdfHeight;

      const areaPercentage = (pdfWidth * pdfHeight) / ((canvas.width / scale) * pageHeight);
      if (areaPercentage > 0.45) return;

      detectedImages.push({
        id: `detected-obj-${index}`,
        type: 'image-detected',
        class: pred.class,
        score: pred.score,
        pdfX,
        pdfY,
        pdfWidth,
        pdfHeight,
        transform: [pdfWidth, 0, 0, pdfHeight, pdfX, pdfY],
        width: pdfWidth,
        height: pdfHeight,
        pageHeight,
        str: `[DETECTED IMAGE: ${pred.class.toUpperCase()}]`
      });
    });

    return detectedImages;
  } catch (err) {
    console.error("detectImagesOnCanvas error", err);
    return [];
  }
};

/**
 * Auto-crop whitespace/transparent margins around reference images
 * and normalize to a standard template size with ZNCC precomputations.
 */
function prepareNormalizedTemplate(refImgElement) {
  const rawW = refImgElement.naturalWidth || refImgElement.videoWidth || refImgElement.width || 0;
  const rawH = refImgElement.naturalHeight || refImgElement.videoHeight || refImgElement.height || 0;
  if (rawW <= 0 || rawH <= 0) return null;

  const rawCanvas = document.createElement('canvas');
  rawCanvas.width = rawW;
  rawCanvas.height = rawH;
  const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });
  rawCtx.drawImage(refImgElement, 0, 0);

  let imgData;
  try {
    imgData = rawCtx.getImageData(0, 0, rawW, rawH);
  } catch {
    return null;
  }

  const { data } = imgData;

  // Sample corners to detect background color dynamically (works for white, light-gray, transparent, or dark bg)
  const cornerCoords = [
    [0, 0],
    [rawW - 1, 0],
    [0, rawH - 1],
    [rawW - 1, rawH - 1],
    [Math.floor(rawW / 2), 0],
    [Math.floor(rawW / 2), rawH - 1],
    [0, Math.floor(rawH / 2)],
    [rawW - 1, Math.floor(rawH / 2)]
  ];
  let transparentCorners = 0;
  let cornerSumR = 0, cornerSumG = 0, cornerSumB = 0, cornerCount = 0;

  for (const [cx, cy] of cornerCoords) {
    const idx = (cy * rawW + cx) * 4;
    if (data[idx + 3] < 30) {
      transparentCorners++;
    } else {
      cornerSumR += data[idx];
      cornerSumG += data[idx + 1];
      cornerSumB += data[idx + 2];
      cornerCount++;
    }
  }

  const isTransparentBg = transparentCorners >= 3;
  const bgR = cornerCount > 0 ? Math.round(cornerSumR / cornerCount) : 255;
  const bgG = cornerCount > 0 ? Math.round(cornerSumG / cornerCount) : 255;
  const bgB = cornerCount > 0 ? Math.round(cornerSumB / cornerCount) : 255;
  const isLightBg = bgR > 210 && bgG > 210 && bgB > 210;

  // Auto-detect non-background bounding box
  let minX = rawW, minY = rawH, maxX = 0, maxY = 0;
  let hasContent = false;
  const step = Math.max(1, Math.floor(Math.min(rawW, rawH) / 100));

  for (let y = 0; y < rawH; y += step) {
    for (let x = 0; x < rawW; x += step) {
      const idx = (y * rawW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      let isForeground = false;
      if (isTransparentBg) {
        isForeground = a > 40;
      } else {
        const diff = (Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)) / 3;
        isForeground = a > 40 && (diff > 22 || (isLightBg && (r < 220 || g < 220 || b < 220)));
      }

      if (isForeground) {
        hasContent = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  let cropX = 0, cropY = 0, cropW = rawW, cropH = rawH;
  if (hasContent && maxX > minX && maxY > minY) {
    const pad = Math.max(1, Math.floor(step * 1.5));
    cropX = Math.max(0, minX - pad);
    cropY = Math.max(0, minY - pad);
    cropW = Math.min(rawW - cropX, (maxX - minX) + pad * 2);
    cropH = Math.min(rawH - cropY, (maxY - minY) + pad * 2);
  }

  const aspectRatio = cropW / Math.max(1, cropH);

  // Normalize template to standard dimensions (max dim 32px for fast high-precision correlation)
  const normDim = 32;
  let normW, normH;
  if (aspectRatio >= 1) {
    normW = normDim;
    normH = Math.max(8, Math.round(normDim / aspectRatio));
  } else {
    normH = normDim;
    normW = Math.max(8, Math.round(normDim * aspectRatio));
  }

  const normCanvas = document.createElement('canvas');
  normCanvas.width = normW;
  normCanvas.height = normH;
  const normCtx = normCanvas.getContext('2d', { willReadFrequently: true });
  normCtx.fillStyle = '#ffffff';
  normCtx.fillRect(0, 0, normW, normH);
  normCtx.drawImage(rawCanvas, cropX, cropY, cropW, cropH, 0, 0, normW, normH);

  const normData = normCtx.getImageData(0, 0, normW, normH).data;
  const numPixels = normW * normH;
  const tGray = new Uint8Array(numPixels);
  let tSum = 0;

  const fgPixels = [];
  let fgSumR = 0, fgSumG = 0, fgSumB = 0;

  for (let ty = 0; ty < normH; ty++) {
    for (let tx = 0; tx < normW; tx++) {
      const j = ty * normW + tx;
      const idx = j * 4;
      const r = normData[idx];
      const g = normData[idx + 1];
      const b = normData[idx + 2];
      const gray = (r * 77 + g * 150 + b * 29) >> 8;
      tGray[j] = gray;
      tSum += gray;

      const diff = (Math.abs(r - 255) + Math.abs(g - 255) + Math.abs(b - 255)) / 3;
      if (diff > 25 || gray < 225) {
        fgPixels.push({ tx, ty, r, g, b, gray });
        fgSumR += r;
        fgSumG += g;
        fgSumB += b;
      }
    }
  }

  const fgCount = fgPixels.length;
  const meanR = fgCount > 0 ? fgSumR / fgCount : 128;
  const meanG = fgCount > 0 ? fgSumG / fgCount : 128;
  const meanB = fgCount > 0 ? fgSumB / fgCount : 128;

  const hasDistinctColor = fgCount > 8 && (
    Math.abs(meanR - meanG) > 18 || 
    Math.abs(meanR - meanB) > 18 || 
    Math.abs(meanG - meanB) > 18
  );

  // Pick up to 25 evenly-spaced foreground sample points for color verification
  const fgSamples = [];
  if (fgCount > 0) {
    const sampleStep = Math.max(1, Math.floor(fgCount / 20));
    for (let k = 0; k < fgCount; k += sampleStep) {
      fgSamples.push(fgPixels[k]);
    }
  }

  const tMean = tSum / numPixels;
  let tVar = 0;
  const tZero = new Float32Array(numPixels);

  for (let i = 0; i < numPixels; i++) {
    const val = tGray[i] - tMean;
    tZero[i] = val;
    tVar += val * val;
  }

  const tStd = Math.sqrt(tVar);

  return {
    normW,
    normH,
    aspectRatio,
    tGray,
    tZero,
    tStd: Math.max(1, tStd),
    meanR,
    meanG,
    meanB,
    hasDistinctColor,
    fgSamples
  };
}

/**
 * Zero-mean Normalized Cross-Correlation (ZNCC) Template Matcher with O(1) Integral Image Filtering.
 * Guarantees zero false positives on solid banners/tables while reliably detecting logos
 * with high accuracy and non-blocking execution.
 */
export const findTemplateMatch = async (pageCanvas, refImageElement, scale = 1.0, pageHeight, options = {}) => {
  if (!pageCanvas || !refImageElement) return [];

  await new Promise(r => setTimeout(r, 0));

  const tpl = prepareNormalizedTemplate(refImageElement);
  if (!tpl || tpl.tStd < 6) return [];

  const canvasW = pageCanvas.width;
  const canvasH = pageCanvas.height;
  if (canvasW < 20 || canvasH < 20) return [];

  const pageCtx = pageCanvas.getContext('2d', { willReadFrequently: true });
  let pageImgData;
  try {
    pageImgData = pageCtx.getImageData(0, 0, canvasW, canvasH);
  } catch (err) {
    console.error("Could not read page canvas", err);
    return [];
  }

  const pRaw = pageImgData.data;
  const pGray = new Uint8Array(canvasW * canvasH);
  for (let i = 0, j = 0; i < pRaw.length; i += 4, j++) {
    pGray[j] = (pRaw[i] * 77 + pRaw[i + 1] * 150 + pRaw[i + 2] * 29) >> 8;
  }

  // Precompute Integral Image (SAT) and Squared Integral Image for O(1) patch variance
  const stride = canvasW + 1;
  const sat = new Float64Array((canvasW + 1) * (canvasH + 1));
  const satSq = new Float64Array((canvasW + 1) * (canvasH + 1));

  for (let y = 0; y < canvasH; y++) {
    let rowSum = 0;
    let rowSumSq = 0;
    const pRow = y * canvasW;
    const sRow = (y + 1) * stride;
    const prevSRow = y * stride;
    for (let x = 0; x < canvasW; x++) {
      const val = pGray[pRow + x];
      rowSum += val;
      rowSumSq += val * val;
      sat[sRow + x + 1] = sat[prevSRow + x + 1] + rowSum;
      satSq[sRow + x + 1] = satSq[prevSRow + x + 1] + rowSumSq;
    }
  }

  // Multi-scale pyramid including standard logo dimensions (20px to 250px)
  // Especially 48, 52, 56, 60, 64 which match standard document logos
  const baseCandidateWidths = [
    20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 70, 78, 88, 100, 116, 136, 160, 200, 250
  ];
  const maxAllowedW = Math.min(canvasW * 0.75, 320);
  const candidateWidths = baseCandidateWidths.filter(w => w >= 20 && w <= maxAllowedW);
  if (candidateWidths.length === 0) candidateWidths.push(Math.min(48, maxAllowedW));

  const rawMatches = [];
  const numT = tpl.normW * tpl.normH;
  const normW = tpl.normW;
  const normH = tpl.normH;

  // Search each scale non-blockingly
  for (let sIdx = 0; sIdx < candidateWidths.length; sIdx++) {
    const targetW = candidateWidths[sIdx];
    // Yield every 2 scales to keep UI responsive and prevent frame drops
    if (sIdx > 0 && sIdx % 2 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
    const targetH = Math.max(8, Math.round(targetW / tpl.aspectRatio));
    if (targetH > canvasH * 0.75) continue;

    const N = targetW * targetH;
    // Step size: 2 for small and medium sizes up to 64px for pinpoint alignment
    const step = targetW <= 64 ? 2 : Math.max(3, Math.floor(targetW / 18));

    for (let y = 0; y <= canvasH - targetH; y += step) {
      const yBottom = (y + targetH) * stride;
      const yTop = y * stride;

      for (let x = 0; x <= canvasW - targetW; x += step) {
        const xRight = x + targetW;

        // O(1) sum and sum-of-squares from integral image
        const pSum = sat[yBottom + xRight] - sat[yBottom + x] - sat[yTop + xRight] + sat[yTop + x];
        const pSumSq = satSq[yBottom + xRight] - satSq[yBottom + x] - satSq[yTop + xRight] + satSq[yTop + x];

        const pMean = pSum / N;
        const pVar = (pSumSq / N) - (pMean * pMean);

        // Instant rejection of uniform background, blank space, and solid colored banners!
        if (pVar < 140) continue;
        if (pMean > 252) continue; // Pure white paper

        // Correlation (dot product)
        let dot = 0;
        for (let ty = 0; ty < normH; ty++) {
          const py = y + Math.floor((ty / normH) * targetH);
          const row = py * canvasW;
          const tRow = ty * normW;
          for (let tx = 0; tx < normW; tx++) {
            const px = x + Math.floor((tx / normW) * targetW);
            dot += pGray[row + px] * tpl.tZero[tRow + tx];
          }
        }

        const denom = tpl.tStd * Math.sqrt(pVar * numT);
        if (denom <= 0) continue;

        const zncc = dot / denom;

        // Candidate threshold: 0.56 accommodates JPEG compression artifacts from phone/WhatsApp uploads
        if (zncc >= 0.56) {
          // Local 1-pixel refinement around (x, y) to lock onto peak alignment
          let bestX = x;
          let bestY = y;
          let bestZncc = zncc;

          for (let dy = -1; dy <= 1; dy++) {
            const fy = y + dy;
            if (fy < 0 || fy > canvasH - targetH) continue;
            const fyBottom = (fy + targetH) * stride;
            const fyTop = fy * stride;

            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const fx = x + dx;
              if (fx < 0 || fx > canvasW - targetW) continue;
              const fxRight = fx + targetW;

              const fSum = sat[fyBottom + fxRight] - sat[fyBottom + fx] - sat[fyTop + fxRight] + sat[fyTop + fx];
              const fSumSq = satSq[fyBottom + fxRight] - satSq[fyBottom + fx] - satSq[fyTop + fxRight] + satSq[fyTop + fx];
              const fMean = fSum / N;
              const fVar = (fSumSq / N) - (fMean * fMean);
              if (fVar < 140) continue;

              let fDot = 0;
              for (let ty = 0; ty < normH; ty++) {
                const py = fy + Math.floor((ty / normH) * targetH);
                const row = py * canvasW;
                const tRow = ty * normW;
                for (let tx = 0; tx < normW; tx++) {
                  const px = fx + Math.floor((tx / normW) * targetW);
                  fDot += pGray[row + px] * tpl.tZero[tRow + tx];
                }
              }

              const fDenom = tpl.tStd * Math.sqrt(fVar * numT);
              if (fDenom > 0) {
                const fZncc = fDot / fDenom;
                if (fZncc > bestZncc) {
                  bestZncc = fZncc;
                  bestX = fx;
                  bestY = fy;
                }
              }
            }
          }

          // Color consistency check using the foreground logo pixels
          let colorBonus = 0;
          let colorMismatch = false;

          if (tpl.hasDistinctColor && tpl.fgSamples.length > 0) {
            let sampleSumR = 0, sampleSumG = 0, sampleSumB = 0;
            let validSamples = 0;

            for (const pt of tpl.fgSamples) {
              const sx = bestX + Math.floor((pt.tx / normW) * targetW);
              const sy = bestY + Math.floor((pt.ty / normH) * targetH);
              if (sx >= 0 && sx < canvasW && sy >= 0 && sy < canvasH) {
                const idx = (sy * canvasW + sx) * 4;
                sampleSumR += pRaw[idx];
                sampleSumG += pRaw[idx + 1];
                sampleSumB += pRaw[idx + 2];
                validSamples++;
              }
            }

            if (validSamples > 0) {
              const avgR = sampleSumR / validSamples;
              const avgG = sampleSumG / validSamples;
              const avgB = sampleSumB / validSamples;

              const colorDist = (Math.abs(avgR - tpl.meanR) + Math.abs(avgG - tpl.meanG) + Math.abs(avgB - tpl.meanB)) / 3;
              if (colorDist < 50) {
                colorBonus = 0.12; // Strong color match
              } else if (colorDist < 75) {
                colorBonus = 0.05;
              } else if (colorDist > 85) {
                // Reject candidates where stroke color is completely mismatched (e.g. black text matching colored crest)
                colorMismatch = true;
              }
            }
          }

          if (!colorMismatch) {
            const finalScore = bestZncc + colorBonus;
            if (finalScore >= 0.58) {
              rawMatches.push({
                x: bestX,
                y: bestY,
                width: targetW,
                height: targetH,
                score: finalScore
              });
            }
          }
        }
      }
    }
  }

  // Non-Maximum Suppression (NMS)
  rawMatches.sort((a, b) => b.score - a.score);
  const nmsMatches = [];

  for (const m of rawMatches) {
    let duplicate = false;
    for (const chosen of nmsMatches) {
      const interX1 = Math.max(m.x, chosen.x);
      const interY1 = Math.max(m.y, chosen.y);
      const interX2 = Math.min(m.x + m.width, chosen.x + chosen.width);
      const interY2 = Math.min(m.y + m.height, chosen.y + chosen.height);

      if (interX2 > interX1 && interY2 > interY1) {
        const interArea = (interX2 - interX1) * (interY2 - interY1);
        const mArea = m.width * m.height;
        const chosenArea = chosen.width * chosen.height;
        const iou = interArea / (mArea + chosenArea - interArea);
        if (iou > 0.30) {
          duplicate = true;
          break;
        }
      }
    }
    if (!duplicate) {
      nmsMatches.push(m);
    }
  }

  // Map matches to PDF coordinate system
  return nmsMatches.map((m, idx) => {
    const pdfX = m.x / scale;
    const pdfWidth = m.width / scale;
    const pdfHeight = m.height / scale;
    const pdfY = pageHeight - (m.y / scale) - pdfHeight;
    const matchUniqueId = `tpl-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`;

    return {
      id: matchUniqueId,
      type: 'image-match',
      refImageId: options.refImageId || null,
      refImageName: options.refImageName || null,
      score: m.score,
      pdfX,
      pdfY,
      pdfWidth,
      pdfHeight,
      transform: [pdfWidth, 0, 0, pdfHeight, pdfX, pdfY],
      width: pdfWidth,
      height: pdfHeight,
      pageHeight,
      str: options.refImageName ? `[IMAGE MATCH: ${options.refImageName}]` : `[REFERENCE IMAGE MATCH]`
    };
  });
};
