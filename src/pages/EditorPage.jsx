import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import { usePdfContext } from '../context/PdfContext';
import PageThumbnail from '../components/PageThumbnail';
import { projectService } from '../services/projectService';
import { ruleService } from '../services/ruleService';
import { 
  Shield, Search, EyeOff, Lock, Replace, Trash2, ChevronLeft, ChevronRight, 
  ZoomIn, ZoomOut, Redo, Undo, Menu, Upload, Plus, Download, X, ArrowLeft, Save, Edit2, RefreshCw, Image as ImageIcon
} from 'lucide-react';
import { getEmbeddingFromImageData, getEmbeddingFromImageElement, cosineSimilarity } from '../services/mlImageUtils';
import { detectImagesOnCanvas, findTemplateMatch } from '../services/imageDetectionUtils';
import './EditorPage.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const EditorWorkspace = ({ document: doc, projectId, projectRules, reloadRules }) => {
  const { documents, updateDocumentBuffer } = usePdfContext();
  const [pdfFile, setPdfFile] = useState(doc ? doc.buffer : null);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [editingRuleQuery, setEditingRuleQuery] = useState('');
  const [savedRuleIds, setSavedRuleIds] = useState(new Set());
  const [availableOtherRules, setAvailableOtherRules] = useState([]);

  useEffect(() => {
    setPdfFile(doc ? doc.buffer : null);
    setDocumentTextItems([]);
    setSearchResults([]);
    setSelectedMatchIds(new Set());
    setActivePage(1);
    setHistory(doc ? [doc.buffer] : []);
    setHistoryIndex(doc ? 0 : -1);
  }, [doc]);
  
  const [pdfDocument, setPdfDocument] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const canvasRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('redact');
  
  const [referenceImages, setReferenceImages] = useState([]);
  const [selectedRefImageId, setSelectedRefImageId] = useState(null);
  const referenceImagesRef = useRef(referenceImages);
  const isApplyingRedactionRef = useRef(false);
  const scannedDocIdRef = useRef(null);

  useEffect(() => {
    referenceImagesRef.current = referenceImages;
  }, [referenceImages]);

  useEffect(() => {
    if (!projectRules || projectRules.length === 0) return;
    const imageRules = projectRules.filter(r => r.type === 'image' && r.preview);
    if (imageRules.length === 0) return;

    setReferenceImages(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const existingNames = new Set(prev.map(p => p.name));
      const toAdd = [];
      for (const r of imageRules) {
        if (!existingIds.has(r.refImageId) && !existingNames.has(r.query)) {
          const img = new Image();
          img.src = r.preview;
          toAdd.push({
            id: r.refImageId || `ref-${r.id}`,
            name: r.query,
            preview: r.preview,
            hash: r.hash || null,
            ruleId: r.id,
            element: img
          });
        }
      }
      if (toAdd.length === 0) return prev;
      const updated = [...prev, ...toAdd];
      referenceImagesRef.current = updated;
      if (!selectedRefImageId) {
        setSelectedRefImageId(updated[0].id);
      }
      return updated;
    });
  }, [projectRules]);

  const refImageInputRef = useRef(null);

  const [documentTextItems, setDocumentTextItems] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMatchIds, setSelectedMatchIds] = useState(new Set());
  const [zoomScale, setZoomScale] = useState(1.0);
  const [isExporting, setIsExporting] = useState(false);
  const [isExtractingML, setIsExtractingML] = useState(false);

  const refImageMatchesCounts = useMemo(() => {
    const counts = {};
    const pdfImages = documentTextItems.filter(item => item.type === 'image' && item.hash);
    const templateMatches = documentTextItems.filter(item => item.type === 'image-match');

    referenceImages.forEach(refImg => {
      let count = templateMatches.filter(item => item.refImageId === refImg.id || (refImg.name && item.refImageName === refImg.name)).length;
      if (refImg.hash) {
        count += pdfImages.filter(item => cosineSimilarity(item.hash, refImg.hash) > 0.80).length;
      }
      counts[refImg.id] = count;
    });
    return counts;
  }, [documentTextItems, referenceImages]);

  useEffect(() => {
    if (projectRules.length === 0) {
      ruleService.getAllRules().then(rules => {
        setAvailableOtherRules(rules);
      });
    } else {
      setAvailableOtherRules([]);
    }
  }, [projectRules]);

  const handleImportOtherRules = async () => {
    for (const r of availableOtherRules) {
      await ruleService.addRule(projectId, {
        query: r.query,
        action: r.action,
        type: r.type,
        refImageId: r.refImageId,
        preview: r.preview,
        hash: r.hash
      });
    }
    await reloadRules();
  };

  const scanDocumentForReferenceImages = async (pdfDoc, refImagesToScan) => {
    if (!pdfDoc || !refImagesToScan || refImagesToScan.length === 0) return [];
    setIsExtractingML(true);
    const newMatches = [];
    try {
      for (const refImg of refImagesToScan) {
        let imgElem = refImg.element;
        if (!imgElem || !imgElem.complete || (imgElem.naturalWidth || 0) === 0) {
          const src = (imgElem && imgElem.src) || refImg.preview;
          if (src) {
            try {
              imgElem = await new Promise((resolve, reject) => {
                const im = new Image();
                im.onload = () => resolve(im);
                im.onerror = reject;
                im.src = src;
              });
              refImg.element = imgElem;
            } catch (e) {
              console.warn("Failed loading preview image element", e);
              continue;
            }
          }
        }
        if (!imgElem || (imgElem.naturalWidth || 0) === 0) continue;

        for (let i = 1; i <= pdfDoc.numPages; i++) {
          await new Promise(r => setTimeout(r, 0));
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 1.0 });
          const offscreenCanvas = document.createElement('canvas');
          offscreenCanvas.width = viewport.width;
          offscreenCanvas.height = viewport.height;
          const ctx = offscreenCanvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;

          const matches = await findTemplateMatch(offscreenCanvas, imgElem, 1.0, viewport.height, {
            refImageId: refImg.id,
            refImageName: refImg.name
          });

          newMatches.push(...matches.map(m => ({
            ...m,
            refImageId: refImg.id,
            refImageName: refImg.name,
            ruleId: refImg.ruleId || null,
            pageNumber: i,
            id: `p${i}-${refImg.id}-${m.id}`
          })));
        }
      }

      if (newMatches.length > 0) {
        setDocumentTextItems(prev => {
          const scannedRefIds = new Set(refImagesToScan.map(r => r.id));
          const filtered = prev.filter(item => !(item.type === 'image-match' && scannedRefIds.has(item.refImageId)));
          return filtered.concat(newMatches);
        });
      }
    } catch (err) {
      console.error("Error scanning document for reference images", err);
    } finally {
      setIsExtractingML(false);
    }
    return newMatches;
  };

  const handleReferenceImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsExtractingML(true);
    // Yield to let browser render the spinner before computational tasks
    await new Promise(r => setTimeout(r, 60));

    try {
      const newImagesList = [];

      for (const file of files) {
        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = new Image();
            img.onload = async () => {
              try {
                let hash = null;
                try {
                  hash = await getEmbeddingFromImageElement(img);
                } catch (e) {
                  console.warn("Could not extract embedding for reference image", e);
                }
                const refId = `ref-img-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                const newRefImage = {
                  id: refId,
                  name: file.name.replace(/\.[^/.]+$/, "") || `Image ${referenceImages.length + newImagesList.length + 1}`,
                  preview: event.target.result,
                  hash,
                  element: img
                };
                newImagesList.push(newRefImage);
              } catch (err) {
                console.error("Failed ML extraction for reference image", err);
              } finally {
                resolve();
              }
            };
            img.src = event.target.result;
          };
          reader.readAsDataURL(file);
        });
      }

      if (newImagesList.length > 0) {
        setReferenceImages(prev => {
          const updated = [...prev, ...newImagesList];
          referenceImagesRef.current = updated;
          return updated;
        });
        // Select the newly added image so the user can immediately act on it
        setSelectedRefImageId(newImagesList[newImagesList.length - 1].id);

        // Run template matching across all pages of the current PDF
        if (pdfDocument) {
          await scanDocumentForReferenceImages(pdfDocument, newImagesList);
        }

        // Auto-save uploaded reference images into projectRules so they immediately appear in SAVED RULES
        for (const refImg of newImagesList) {
          const ruleExists = projectRules.some(r => r.type === 'image' && (r.refImageId === refImg.id || r.query === refImg.name));
          if (!ruleExists) {
            let preview = refImg.preview;
            if (refImg.element) {
              try {
                preview = createThumbnailDataUrl(refImg.element, 120);
              } catch {
                preview = refImg.preview;
              }
            }
            await ruleService.addRule(projectId, {
              query: refImg.name,
              action: activeTab,
              type: 'image',
              refImageId: refImg.id,
              preview,
              hash: refImg.hash
            });
          }
        }
        await reloadRules();
      }
    } catch (err) {
      console.error("Failed processing reference image", err);
    } finally {
      setIsExtractingML(false);
      if (refImageInputRef.current) refImageInputRef.current.value = '';
    }
  };

  const handleRemoveReferenceImage = (refId, e) => {
    if (e) e.stopPropagation();
    setReferenceImages(prev => {
      const updated = prev.filter(img => img.id !== refId);
      referenceImagesRef.current = updated;
      return updated;
    });
    setDocumentTextItems(prev => prev.filter(item => item.refImageId !== refId));
    setSelectedRefImageId(prev => {
      if (prev === refId) {
        const remaining = referenceImages.filter(img => img.id !== refId);
        return remaining.length > 0 ? remaining[0].id : null;
      }
      return prev;
    });
  };

  const clearAllReferenceImages = () => {
    setReferenceImages([]);
    referenceImagesRef.current = [];
    setSelectedRefImageId(null);
    setDocumentTextItems(prev => prev.filter(item => !item.refImageId && item.type !== 'image-match'));
    if (refImageInputRef.current) refImageInputRef.current.value = '';
  };



  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    if (pdfFile && history.length === 0) {
      setHistory([pdfFile]);
      setHistoryIndex(0);
    }
  }, [pdfFile, history.length]);

  const handleUndo = () => {
    if (historyIndex > 0 && doc) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setPdfFile(history[newIndex]);
      updateDocumentBuffer(doc.id, history[newIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1 && doc) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setPdfFile(history[newIndex]);
      updateDocumentBuffer(doc.id, history[newIndex]);
    }
  };

  const handleApplyRedactions = async (matchesToProtect, targetBuffer = pdfFile, targetDocId = doc?.id) => {
    if (!targetBuffer || matchesToProtect.length === 0) return;
    
    setIsExporting(true);
    try {
      const pdfDoc = await PDFDocument.load(targetBuffer);
      const pages = pdfDoc.getPages();

      for (const match of matchesToProtect) {
        const pageIdx = match.pageNumber - 1;
        const page = pages[pageIdx];
        const action = match.rule ? match.rule.action : activeTab;
        
        const baseHeight = match.height || match.transform[3] || 12;
        
        const queryText = (match.rule ? match.rule.query : searchQuery) || '';
        const queryLower = queryText.toLowerCase();
        const strLower = (match.str || '').toLowerCase();
        const idx = queryLower ? strLower.indexOf(queryLower) : -1;
        
        let relativeStart = 0;
        let relativeWidth = 1;
        
        if (idx !== -1 && queryLower.length > 0) {
           const canvas = document.createElement('canvas');
           const ctx = canvas.getContext('2d');
           ctx.font = '16px sans-serif'; 
           
           const prefix = match.str.substring(0, idx);
           const word = match.str.substring(idx, idx + queryLower.length);
           
           const prefixWidth = ctx.measureText(prefix).width;
           const wordWidth = ctx.measureText(word).width;
           const totalWidth = ctx.measureText(match.str).width;
           
           if (totalWidth > 0) {
             relativeStart = prefixWidth / totalWidth;
             relativeWidth = wordWidth / totalWidth;
           }
        }

        let x, y, width, height;
        if (match.type === 'image' || match.type === 'image-detected' || match.type === 'image-match') {
          x = match.transform[4];
          y = match.transform[5];
          width = match.width;
          height = match.height;
        } else {
          const paddingX = baseHeight * 0.05;
          const estimatedX = match.transform[4] + (relativeStart * match.width);
          const estimatedWidth = relativeWidth * match.width;
          
          x = estimatedX - paddingX;
          y = match.transform[5] - (baseHeight * 0.25);
          width = estimatedWidth + (paddingX * 2);
          height = baseHeight * 1.4;
        }

        if (action === 'redact') {
          page.drawRectangle({ x, y, width, height, color: rgb(0, 0, 0) });
        } else if (action === 'mask') {
          page.drawRectangle({ x, y, width, height, color: rgb(0.5, 0.9, 0.5), opacity: 0.8 });
        } else if (action === 'replace') {
          page.drawRectangle({ x, y, width, height, color: rgb(1, 1, 1) });
          const isImg = match.type === 'image' || match.type === 'image-detected' || match.type === 'image-match';
          const textSize = isImg ? Math.min(10, Math.max(7, height * 0.22)) : Math.min(baseHeight * 0.8, 14);
          const textY = isImg ? y + (height * 0.38) : y + (height * 0.2);
          page.drawText("[SYNTHETIC]", { x: x + 2, y: textY, size: textSize, color: rgb(0, 0, 0) });
        } else if (action === 'remove') {
          page.drawRectangle({ x, y, width, height, color: rgb(1, 1, 1) });
        }
      }

      const pdfBytes = await pdfDoc.save();
      
      if (targetDocId === doc.id) {
        isApplyingRedactionRef.current = true;
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(pdfBytes);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setPdfFile(pdfBytes);
        setSelectedMatchIds(new Set());
        // Remove redacted items from in-memory state so they are no longer highlighted or matched
        const appliedIds = new Set();
        matchesToProtect.forEach(m => {
          if (m.id) appliedIds.add(m.id);
          if (m.matchId) appliedIds.add(m.matchId);
        });
        setDocumentTextItems(prev => prev.filter(item => !appliedIds.has(item.id) && !appliedIds.has(item.matchId)));
      }
      
      updateDocumentBuffer(targetDocId, pdfBytes);
      
    } catch (error) {
      console.error("Apply failed", error);
      alert("Failed to apply modifications to PDF.");
    } finally {
      if (targetDocId === doc.id) setIsExporting(false);
    }
  };

  const createThumbnailDataUrl = (imgElement, maxDim = 120) => {
    if (!imgElement) return null;
    const canvas = document.createElement('canvas');
    const w = imgElement.naturalWidth || imgElement.width || 1;
    const h = imgElement.naturalHeight || imgElement.height || 1;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const handleApplySavedRules = async () => {
    if (projectRules.length === 0 || !pdfDocument) return;
    setIsExporting(true);
    try {
      let savedMatches = [];
      
      // 1. Text rules
      const textRules = projectRules.filter(r => r.type !== 'image');
      textRules.forEach(rule => {
        const query = rule.query.toLowerCase();
        const ruleMatches = documentTextItems
          .filter(item => item.str && item.type !== 'image' && item.type !== 'image-match' && item.str.toLowerCase().includes(query))
          .map(m => ({ ...m, rule, matchId: `rule-${rule.id}-${m.id}` }));
        savedMatches = savedMatches.concat(ruleMatches);
      });

      // 2. Image rules
      const imageRules = projectRules.filter(r => r.type === 'image');
      for (const rule of imageRules) {
        let imgMatches = documentTextItems
          .filter(item => 
            (item.type === 'image-match' && (item.refImageId === rule.refImageId || item.refImageName === rule.query || item.ruleId === rule.id)) ||
            (item.type === 'image' && item.hash && rule.hash && cosineSimilarity(item.hash, rule.hash) > 0.80)
          )
          .map(m => ({ ...m, rule, matchId: `rule-img-${rule.id}-${m.id}` }));

        // If no matches found in memory yet, scan on the fly!
        if (imgMatches.length === 0 && (rule.preview || rule.element)) {
          const ruleRef = {
            id: rule.refImageId || `rule-ref-${rule.id}`,
            name: rule.query,
            preview: rule.preview,
            element: rule.element,
            ruleId: rule.id
          };
          const freshMatches = await scanDocumentForReferenceImages(pdfDocument, [ruleRef]);
          imgMatches = freshMatches.map(m => ({ ...m, rule, matchId: `rule-img-${rule.id}-${m.id}` }));
        }

        savedMatches = savedMatches.concat(imgMatches);
      }

      // Deduplicate matches
      const uniqueMatches = [];
      const seen = new Set();
      for (const m of savedMatches) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          uniqueMatches.push(m);
        }
      }

      if (uniqueMatches.length > 0) {
        await handleApplyRedactions(uniqueMatches);
      } else {
        alert("No matches found for the saved rules in this document.");
      }
    } catch (e) {
      console.error("Error applying saved rules", e);
      alert("Failed to apply saved rules: " + (e.message || "Unknown error"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    const deletedRule = projectRules.find(r => r.id === ruleId);
    await ruleService.deleteRule(projectId, ruleId);
    await reloadRules();
    if (deletedRule && deletedRule.type === 'image') {
      const targetRefId = deletedRule.refImageId || `ref-${deletedRule.id}`;
      setReferenceImages(prev => {
        const updated = prev.filter(img => img.id !== targetRefId && img.ruleId !== ruleId && img.name !== deletedRule.query);
        referenceImagesRef.current = updated;
        return updated;
      });
      setDocumentTextItems(prev => prev.filter(item => item.refImageId !== targetRefId && item.ruleId !== ruleId));
    }
  };

  const handleSaveRuleEdit = async (ruleId, newQuery) => {
    if (newQuery && newQuery.trim()) {
      await ruleService.updateRule(projectId, ruleId, { query: newQuery.trim() });
      await reloadRules();
      setSavedRuleIds(prev => {
        const next = new Set(prev);
        next.add(ruleId);
        return next;
      });
    }
  };

  const handleSaveImageAsRule = async (refImg, e) => {
    if (e) e.stopPropagation();
    const ruleExists = projectRules.some(r => 
      (r.type === 'image' && (r.refImageId === refImg.id || r.query === refImg.name))
    );
    if (!ruleExists) {
      let preview = refImg.preview;
      if (refImg.element) {
        try {
          preview = createThumbnailDataUrl(refImg.element, 120);
        } catch {
          preview = refImg.preview;
        }
      }
      await ruleService.addRule(projectId, {
        query: refImg.name,
        action: activeTab,
        type: 'image',
        refImageId: refImg.id,
        preview,
        hash: refImg.hash
      });
      await reloadRules();
    }
  };

  const saveCurrentRulesIfNotExists = async () => {
    let ruleAdded = false;

    // 1. Save text query rule if present
    if (searchQuery.trim()) {
      const queryLower = searchQuery.trim().toLowerCase();
      const ruleExists = projectRules.some(r => r.type !== 'image' && r.query && r.query.toLowerCase() === queryLower);
      if (!ruleExists) {
        await ruleService.addRule(projectId, { 
          query: searchQuery.trim(), 
          action: activeTab,
          type: 'text'
        });
        ruleAdded = true;
      }
    }

    // 2. Save active or matched reference image(s) as rules
    const activeRefImages = (selectedRefImageId && selectedRefImageId !== 'all')
      ? referenceImages.filter(img => img.id === selectedRefImageId)
      : referenceImages;

    for (const refImg of activeRefImages) {
      const ruleExists = projectRules.some(r => 
        (r.type === 'image' && (r.refImageId === refImg.id || r.query === refImg.name))
      );
      if (!ruleExists) {
        let preview = refImg.preview;
        if (refImg.element) {
          try {
            preview = createThumbnailDataUrl(refImg.element, 120);
          } catch {
            preview = refImg.preview;
          }
        }
        await ruleService.addRule(projectId, {
          query: refImg.name,
          action: activeTab,
          type: 'image',
          refImageId: refImg.id,
          preview,
          hash: refImg.hash
        });
        ruleAdded = true;
      }
    }

    if (ruleAdded) {
      await reloadRules();
    }
  };

  const handleApplyToAllPdfs = async () => {
    if (projectRules.length === 0 && !searchQuery.trim() && referenceImages.length === 0) return;
    
    // Save current search query or active image as rule
    await saveCurrentRulesIfNotExists();
    
    setIsExporting(true);
    
    try {
      // Collect all image references from referenceImages and projectRules
      const allImageRefsToScan = [...referenceImages];
      const imageRules = projectRules.filter(r => r.type === 'image');
      for (const ir of imageRules) {
        if (!allImageRefsToScan.some(ref => ref.id === ir.refImageId || ref.name === ir.query || ref.ruleId === ir.id)) {
          allImageRefsToScan.push({
            id: ir.refImageId || `rule-ref-${ir.id}`,
            name: ir.query,
            preview: ir.preview,
            element: ir.element,
            hash: ir.hash,
            ruleId: ir.id
          });
        }
      }

      // Ensure current document has been scanned for all image rules
      let currentItems = [...documentTextItems];
      if (allImageRefsToScan.length > 0 && pdfDocument) {
        const existingScannedIds = new Set(currentItems.filter(i => i.type === 'image-match').map(i => i.refImageId || i.ruleId || i.refImageName));
        const unscannedRefs = allImageRefsToScan.filter(ref => !existingScannedIds.has(ref.id) && !existingScannedIds.has(ref.ruleId) && !existingScannedIds.has(ref.name));
        if (unscannedRefs.length > 0) {
          const freshMatches = await scanDocumentForReferenceImages(pdfDocument, unscannedRefs);
          currentItems = currentItems.concat(freshMatches);
        }
      }

      const getMatchesForItems = (items) => {
        let matches = [];
        
        // Match text rules
        projectRules.filter(r => r.type !== 'image').forEach(rule => {
          const query = rule.query.toLowerCase();
          const ruleMatches = items
            .filter(item => item.str && item.type !== 'image' && item.type !== 'image-match' && item.str.toLowerCase().includes(query))
            .map(m => ({ ...m, rule, matchId: `rule-${rule.id}-${m.id}` }));
          matches = matches.concat(ruleMatches);
        });

        // Match image rules
        projectRules.filter(r => r.type === 'image').forEach(rule => {
          const ruleMatches = items
            .filter(item => 
              (item.type === 'image-match' && (item.refImageId === rule.refImageId || item.refImageName === rule.query || item.ruleId === rule.id)) ||
              (item.type === 'image' && item.hash && rule.hash && cosineSimilarity(item.hash, rule.hash) > 0.80)
            )
            .map(m => ({ ...m, rule, matchId: `rule-img-${rule.id}-${m.id}` }));
          matches = matches.concat(ruleMatches);
        });
        
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          const searchMatches = items
            .filter(item => item.str && item.type !== 'image' && item.type !== 'image-match' && item.str.toLowerCase().includes(query))
            .map(m => ({ ...m, matchId: `search-${m.id}` }));
          matches = matches.concat(searchMatches);
        }

        // Match active reference images
        const activeRefImages = (selectedRefImageId && selectedRefImageId !== 'all')
          ? referenceImages.filter(img => img.id === selectedRefImageId)
          : referenceImages;
        activeRefImages.forEach(refImg => {
          const refMatches = items
            .filter(item => item.type === 'image-match' && item.refImageId === refImg.id && !matches.some(m => m.id === item.id))
            .map(m => ({ ...m, matchId: `ref-match-${refImg.id}-${m.id}` }));
          matches = matches.concat(refMatches);
        });

        // Deduplicate
        const unique = [];
        const seen = new Set();
        for (const m of matches) {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            unique.push(m);
          }
        }
        return unique;
      };

      let totalApplied = 0;
      for (const currentDoc of documents) {
        if (currentDoc.id === doc?.id) {
          const matches = getMatchesForItems(currentItems);
          if (matches.length > 0) {
            await handleApplyRedactions(matches, currentDoc.buffer, currentDoc.id);
            totalApplied += matches.length;
          }
          continue;
        }

        // Process background PDFs
        const loadingTask = pdfjsLib.getDocument({ data: currentDoc.buffer.slice(0) });
        const pdf = await loadingTask.promise;
        
        let allItems = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageItems = textContent.items.map((item, index) => ({ 
            ...item, 
            pageNumber: i,
            id: `p${i}-${index}`
          }));
          allItems = allItems.concat(pageItems);

          if (allImageRefsToScan.length > 0) {
            const viewport = page.getViewport({ scale: 1.0 });
            const offCanvas = document.createElement('canvas');
            offCanvas.width = viewport.width;
            offCanvas.height = viewport.height;
            const ctx = offCanvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;

            for (const refImg of allImageRefsToScan) {
              let imgElem = refImg.element;
              if (!imgElem || !imgElem.complete || (imgElem.naturalWidth || 0) === 0) {
                const src = (imgElem && imgElem.src) || refImg.preview;
                if (src) {
                  imgElem = await new Promise((resolve) => {
                    const im = new Image();
                    im.onload = () => resolve(im);
                    im.onerror = () => resolve(null);
                    im.src = src;
                  });
                }
              }
              if (imgElem) {
                const tMatches = await findTemplateMatch(offCanvas, imgElem, 1.0, viewport.height, {
                  refImageId: refImg.id,
                  refImageName: refImg.name
                });
                allItems = allItems.concat(tMatches.map(m => ({
                  ...m,
                  pageNumber: i,
                  refImageId: refImg.id,
                  refImageName: refImg.name
                })));
              }
            }
          }
        }
        
        const matches = getMatchesForItems(allItems);
        if (matches.length > 0) {
          await handleApplyRedactions(matches, currentDoc.buffer, currentDoc.id);
          totalApplied += matches.length;
        }
      }

      if (totalApplied === 0) {
        alert("No matches found for the active rules in this document.");
      }
    } catch (error) {
      console.error("Failed to apply to all PDFs", error);
      alert("An error occurred while processing: " + (error.message || "Unknown error"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = () => {
    if (!pdfFile || !doc) return;
    const blob = new Blob([pdfFile], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `protected_${doc.name || 'document.pdf'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!pdfFile) return;
    const loadPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfFile.slice(0) });
        const pdf = await loadingTask.promise;
        setPdfDocument(pdf);
        setTotalPages(pdf.numPages);

        // If we just applied a redaction, do NOT re-extract or re-scan previously uploaded images!
        if (isApplyingRedactionRef.current) {
          isApplyingRedactionRef.current = false;
          return;
        }

        let allTextItems = [];
        let allImageItems = [];
        
        const matrixMultiply = (m1, m2) => {
          return [
            m1[0] * m2[0] + m1[2] * m2[1],
            m1[1] * m2[0] + m1[3] * m2[1],
            m1[0] * m2[2] + m1[2] * m2[3],
            m1[1] * m2[2] + m1[3] * m2[3],
            m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
            m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
          ];
        };

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageItems = textContent.items.map((item, index) => ({ 
            ...item, 
            pageNumber: i,
            id: `p${i}-${index}`
          }));
          allTextItems = allTextItems.concat(pageItems);

          try {
            const opList = await page.getOperatorList();
            let currentTransform = [1, 0, 0, 1, 0, 0];
            let transformStack = [];
            
            for (let j = 0; j < opList.fnArray.length; j++) {
              const fn = opList.fnArray[j];
              const args = opList.argsArray[j];
              
              if (fn === pdfjsLib.OPS.save) {
                transformStack.push([...currentTransform]);
              } else if (fn === pdfjsLib.OPS.restore) {
                if (transformStack.length > 0) {
                  currentTransform = transformStack.pop();
                }
              } else if (fn === pdfjsLib.OPS.transform) {
                currentTransform = matrixMultiply(currentTransform, args);
              } else if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegXObject || fn === pdfjsLib.OPS.paintInlineImageXObject) {
                let imgHash = null;
                try {
                  if (fn === pdfjsLib.OPS.paintInlineImageXObject) {
                    if (args[0] && args[0].data) {
                      imgHash = await getEmbeddingFromImageData(args[0].data, args[0].width, args[0].height);
                    }
                  } else {
                    const imgObj = page.objs.get(args[0]);
                    if (imgObj) {
                       if (imgObj instanceof HTMLImageElement || imgObj instanceof HTMLCanvasElement || imgObj instanceof ImageBitmap) {
                          imgHash = await getEmbeddingFromImageElement(imgObj);
                       } else if (imgObj.data) {
                          imgHash = await getEmbeddingFromImageData(imgObj.data, imgObj.width, imgObj.height);
                       }
                    }
                  }
                } catch(e) {
                   console.log("Error extracting ML features", e);
                }

                allImageItems.push({
                  type: 'image',
                  pageNumber: i,
                  id: `p${i}-img${j}`,
                  str: '[IMAGE]',
                  transform: [...currentTransform],
                  width: Math.abs(currentTransform[0]),
                  height: Math.abs(currentTransform[3]),
                  hash: imgHash
                });
              }
            }
          } catch (e) {
            console.error("Error parsing images on page", i, e);
          }

        }
        
        // Preserve active reference image matches and update document items immediately without blocking
        setDocumentTextItems(prev => {
          const activeRefIds = new Set((referenceImagesRef.current || []).map(r => r.id));
          const existingRefMatches = prev.filter(item => 
            item.type === 'image-match' && (!item.refImageId || activeRefIds.has(item.refImageId))
          );
          return allTextItems.concat(allImageItems).concat(existingRefMatches);
        });

        // Only scan reference images when a brand new document is loaded (doc.id changed)
        if (scannedDocIdRef.current !== doc?.id) {
          scannedDocIdRef.current = doc?.id;
          const refsToScan = [...(referenceImagesRef.current || [])];
          const imageRules = (projectRules || []).filter(r => r.type === 'image' && r.preview);
          for (const ir of imageRules) {
            if (!refsToScan.some(ref => ref.id === ir.refImageId || ref.name === ir.query || ref.ruleId === ir.id)) {
              refsToScan.push({
                id: ir.refImageId || `rule-ref-${ir.id}`,
                name: ir.query,
                preview: ir.preview,
                ruleId: ir.id
              });
            }
          }
          if (refsToScan.length > 0) {
            scanDocumentForReferenceImages(pdf, refsToScan);
          }
        }

      } catch (error) {
        console.error("Error loading PDF", error);
      } finally {
        isApplyingRedactionRef.current = false;
      }
    };
    loadPdf();
  }, [pdfFile]);

  useEffect(() => {
    let results = [];
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      results = documentTextItems
        .filter(item => item.str.toLowerCase().includes(query) && item.type !== 'image' && item.type !== 'image-detected' && item.type !== 'image-match')
        .map(m => ({ ...m, matchId: `search-${m.id}` }));
    }
    
    const activeRefImages = (selectedRefImageId && selectedRefImageId !== 'all')
      ? referenceImages.filter(img => img.id === selectedRefImageId)
      : referenceImages;

    activeRefImages.forEach(refImg => {
      if (refImg.hash) {
        const imageMatches = documentTextItems
          .filter(item => item.type === 'image' && item.hash)
          .filter(item => cosineSimilarity(item.hash, refImg.hash) > 0.80)
          .map(m => ({ 
            ...m, 
            refImageId: refImg.id,
            refImageName: refImg.name,
            matchId: `img-match-${refImg.id}-${m.id}`, 
            str: `[IMAGE MATCH: ${refImg.name}]` 
          }));
        results = results.concat(imageMatches);
      }
    });

    const targetRefIds = new Set(activeRefImages.map(img => img.id));
    const imageRuleRefIds = new Set((projectRules || []).filter(r => r.type === 'image').map(r => r.refImageId || `rule-ref-${r.id}`));
    const imageRuleNames = new Set((projectRules || []).filter(r => r.type === 'image').map(r => r.query));

    const templateMatches = documentTextItems
      .filter(item => item.type === 'image-match' && (
        !item.refImageId || 
        targetRefIds.has(item.refImageId) || 
        imageRuleRefIds.has(item.refImageId) ||
        (item.ruleId && (projectRules || []).some(r => r.id === item.ruleId)) ||
        (item.refImageName && imageRuleNames.has(item.refImageName))
      ))
      .map(m => ({ 
        ...m, 
        matchId: `tpl-img-${m.id}` 
      }));
    results = results.concat(templateMatches);
    
    if (!selectedRefImageId && referenceImages.length === 0) {
      const cvImageMatches = documentTextItems
        .filter(item => item.type === 'image-detected')
        .map(m => ({ ...m, matchId: `cv-img-${m.id}` }));
      results = results.concat(cvImageMatches);
    }
    
    const uniqueResults = [];
    const seenMatchIds = new Set();
    for (const r of results) {
      if (!seenMatchIds.has(r.matchId)) {
        seenMatchIds.add(r.matchId);
        uniqueResults.push(r);
      }
    }

    // Spatial deduplication for image matches to prevent duplicate badges/redactions on the same logo
    const finalResults = [];
    const keptImages = [];
    for (const r of uniqueResults) {
      if (r.type === 'image' || r.type === 'image-match' || r.type === 'image-detected') {
        const rX = r.pdfX !== undefined ? r.pdfX : (r.transform ? r.transform[4] : 0);
        const rY = r.pdfY !== undefined ? r.pdfY : (r.transform ? r.transform[5] : 0);
        const rW = r.pdfWidth || r.width || 1;
        const rH = r.pdfHeight || r.height || 1;

        const overlaps = keptImages.some(existing => {
          if (existing.pageNumber !== r.pageNumber) return false;
          const eX = existing.pdfX !== undefined ? existing.pdfX : (existing.transform ? existing.transform[4] : 0);
          const eY = existing.pdfY !== undefined ? existing.pdfY : (existing.transform ? existing.transform[5] : 0);
          const eW = existing.pdfWidth || existing.width || 1;
          const eH = existing.pdfHeight || existing.height || 1;

          const xOverlap = Math.max(0, Math.min(rX + rW, eX + eW) - Math.max(rX, eX));
          const yOverlap = Math.max(0, Math.min(rY + rH, eY + eH) - Math.max(rY, eY));
          return (xOverlap * yOverlap) > (Math.min(rW * rH, eW * eH) * 0.4);
        });

        if (!overlaps) {
          keptImages.push(r);
          finalResults.push(r);
        }
      } else {
        finalResults.push(r);
      }
    }

    setSearchResults(finalResults);
    setSelectedMatchIds(new Set(finalResults.map(r => r.matchId)));
  }, [documentTextItems, searchQuery, referenceImages, selectedRefImageId, projectRules]);

  const renderHighlightedText = (text, query, isSelected) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() 
        ? <span key={i} className={isSelected ? 'highlight-active' : 'highlight-inactive'}>{part}</span>
        : part
    );
  };

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return;
    let renderTask = null;
    
    const renderPage = async () => {
      try {
        const page = await pdfDocument.getPage(activePage);
        const viewport = page.getViewport({ scale: zoomScale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (error) {
        if (error.name !== 'RenderingCancelledException') {
          console.error("Render error", error);
        }
      }
    };
    renderPage();
    return () => {
      if (renderTask) renderTask.cancel();
    }
  }, [pdfDocument, activePage, zoomScale]);

  const handleFitWidth = () => {
    if (!pdfDocument) return;
    const container = document.querySelector('.pdf-container');
    if (!container) return;
    pdfDocument.getPage(activePage).then(page => {
      const viewport = page.getViewport({ scale: 1.0 });
      const availableWidth = container.clientWidth - 48;
      if (availableWidth > 0 && viewport.width > 0) {
        const fitScale = Math.min(2.5, Math.max(0.5, availableWidth / viewport.width));
        setZoomScale(parseFloat(fitScale.toFixed(2)));
      }
    });
  };

  return (
    <div className="editor-workspace-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, overflow: 'hidden' }}>
      {/* Top Toolbar */}
      <header className="editor-toolbar">
        <div className="toolbar-left">
          <Link to="/projects" className="brand" title="Back to Projects" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <ArrowLeft size={18} className="mr-2" style={{ color: 'var(--neutral-dark)' }} />
          </Link>
          <div className="doc-info">
            <span className="doc-icon">📄</span>
            <div className="doc-meta">
              <div className="doc-title-bar">{doc ? doc.name : 'No document loaded'}</div>
              <div className="doc-stats">{totalPages || 0} Pages • Client-side WASM Memory</div>
            </div>
            <div className="badge-isolated">
              <span className="dot-green"></span> ISOLATED
            </div>
          </div>
          <button className="btn btn-primary-dark ml-4" disabled={!doc} onClick={handleDownload} style={{ padding: '0.4rem 1rem', fontSize: '0.75rem', fontWeight: 'bold' }}>EXPORT REDACTED PDF</button>
        </div>

        <div className="toolbar-center">
          <button className="icon-btn" onClick={() => setActivePage(p => Math.max(1, p - 1))} disabled={activePage <= 1 || !doc}><ChevronLeft size={16}/></button>
          <span className="page-indicator" style={{ minWidth: '40px', textAlign: 'center' }}>{doc ? `${activePage} / ${totalPages}` : '-'}</span>
          <button className="icon-btn" onClick={() => setActivePage(p => Math.min(totalPages, p + 1))} disabled={activePage >= totalPages || !doc}><ChevronRight size={16}/></button>
          
          <div className="divider"></div>
          
          <button className="icon-btn" disabled={!doc} onClick={() => setZoomScale(s => Math.max(0.5, parseFloat((s - 0.1).toFixed(2))))}><ZoomOut size={16}/></button>
          <span className="zoom-level" style={{ minWidth: '40px', textAlign: 'center' }}>{Math.round(zoomScale * 100)}%</span>
          <button className="icon-btn" disabled={!doc} onClick={() => setZoomScale(s => Math.min(3, parseFloat((s + 0.1).toFixed(2))))}><ZoomIn size={16}/></button>
          <button className="text-btn" disabled={!doc} onClick={handleFitWidth}>Fit Width</button>
          
          <div className="divider"></div>
          
          <button className="icon-btn" disabled={historyIndex <= 0 || !doc} onClick={handleUndo} title="Undo"><Undo size={16}/></button>
          <button className="icon-btn" disabled={historyIndex >= history.length - 1 || !doc} onClick={handleRedo} title="Redo"><Redo size={16}/></button>
        </div>

        <div className="toolbar-right">
          <div className="pipeline-status-badge">
            <Shield size={14}/> ZERO-LEAK PIPELINE
          </div>
        </div>
      </header>

      <div className="editor-workspace">
        {/* Left Sidebar - Pages */}
        <aside className="sidebar-left" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="sidebar-header">
            <span className="sidebar-title">DOCUMENT PAGES</span>
            <span className="sidebar-count">{totalPages || 0} PAGES</span>
          </div>
          
          <div className="pages-list" style={{ overflowY: 'auto', flex: 1, maxHeight: '50%' }}>
            {pdfDocument && Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
              <PageThumbnail 
                key={pageNum}
                pdfDocument={pdfDocument}
                pageNumber={pageNum}
                isActive={activePage === pageNum}
                onClick={() => setActivePage(pageNum)}
              />
            ))}
          </div>

          <div className="sidebar-header" style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
            <span className="sidebar-title"><Shield size={12} className="inline mr-1" /> SAVED RULES</span>
            <span className="sidebar-count">{projectRules.length} RULES</span>
          </div>
          
            <div className="rules-list" style={{ flex: 1, overflowY: 'auto', padding: '1rem', background: '#fafafa' }}>
              {projectRules.map(rule => (
                <div 
                  key={rule.id} 
                  onClick={(e) => {
                    if (e.target.tagName !== 'INPUT' && !e.target.closest('button')) {
                      if (rule.type === 'image') {
                        let targetRef = referenceImages.find(r => r.id === rule.refImageId || r.name === rule.query);
                        if (!targetRef && rule.preview) {
                          const img = new Image();
                          img.src = rule.preview;
                          targetRef = {
                            id: rule.refImageId || `ref-${rule.id}`,
                            name: rule.query,
                            preview: rule.preview,
                            hash: rule.hash || null,
                            element: img
                          };
                          setReferenceImages(prev => {
                            const updated = [...prev, targetRef];
                            referenceImagesRef.current = updated;
                            return updated;
                          });
                        }
                        if (targetRef) {
                          setSelectedRefImageId(targetRef.id);
                          if (pdfDocument) {
                            scanDocumentForReferenceImages(pdfDocument, [targetRef]);
                          }
                        }
                        setSearchQuery('');
                      } else {
                        setSearchQuery(rule.query);
                      }
                      setActiveTab(rule.action);
                    }
                  }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', padding: '0.5rem', background: savedRuleIds.has(rule.id) ? 'rgba(15, 157, 88, 0.1)' : 'white', borderRadius: '4px', border: savedRuleIds.has(rule.id) ? '1px solid var(--green-primary)' : '1px solid rgba(0,0,0,0.1)', transition: 'all 0.3s ease', cursor: 'pointer' }}
                >
                  <div style={{ flex: 1, marginRight: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {rule.type === 'image' && rule.preview ? (
                      <div style={{ width: '28px', height: '28px', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <img src={rule.preview} alt={rule.query} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      </div>
                    ) : (
                      rule.type === 'image' ? <ImageIcon size={16} style={{ color: 'var(--green-primary)', flexShrink: 0 }} /> : null
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input 
                        type="text" 
                        defaultValue={rule.query}
                        onBlur={(e) => handleSaveRuleEdit(rule.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRuleEdit(rule.id, e.target.value); }}
                        onChange={() => {
                          if (savedRuleIds.has(rule.id)) {
                            setSavedRuleIds(prev => {
                              const next = new Set(prev);
                              next.delete(rule.id);
                              return next;
                            });
                          }
                        }}
                        style={{ fontSize: '0.85rem', width: '100%', border: 'none', background: 'transparent', outline: 'none', fontWeight: 'bold', padding: 0 }}
                      />
                      <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {rule.type === 'image' && <span style={{ fontSize: '0.62rem', background: '#e8f5e9', color: '#2e7d32', padding: '1px 4px', borderRadius: '3px', fontWeight: 700 }}>IMAGE</span>}
                        <span>{rule.action}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button 
                      className="icon-btn-subtle" 
                      onClick={(e) => {
                        const input = e.currentTarget.parentElement.previousElementSibling?.querySelector('input');
                        if (input) handleSaveRuleEdit(rule.id, input.value);
                      }} 
                      style={{ color: savedRuleIds.has(rule.id) ? 'var(--green-primary)' : '#666', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', transition: 'color 0.3s ease' }} 
                      title={savedRuleIds.has(rule.id) ? "Saved!" : "Save Changes"}
                    >
                      <Save size={14} fill={savedRuleIds.has(rule.id) ? 'white' : 'none'} />
                    </button>
                    <button className="icon-btn-subtle" onClick={() => handleDeleteRule(rule.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }} title="Delete Rule"><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
            
            {projectRules.length === 0 && (
              <div style={{ fontSize: '0.75rem', color: '#888', textAlign: 'center', margin: '1rem 0' }}>
                <div>No rules saved yet in this project.</div>
                {availableOtherRules.length > 0 && (
                  <button
                    className="btn btn-outline-dark btn-xs"
                    style={{ marginTop: '0.5rem', fontSize: '0.68rem', padding: '4px 8px', borderColor: 'var(--green-primary)', color: 'var(--green-deep)' }}
                    onClick={handleImportOtherRules}
                  >
                    + Import {availableOtherRules.length} rules from library
                  </button>
                )}
              </div>
            )}
            
          </div>

          <div className="sidebar-footer" style={{ padding: '0.75rem' }}>
            <button 
              className="btn btn-primary-bright" 
              style={{ width: '100%', backgroundColor: 'var(--green-deep)', fontWeight: 'bold', fontSize: '0.9rem', padding: '0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              disabled={(projectRules.length === 0 && !searchQuery.trim() && referenceImages.length === 0) || isExporting}
              onClick={handleApplyToAllPdfs}
            >
              <Shield size={16} />
              {isExporting ? "Processing..." : "APPLY RULES"}
            </button>
          </div>
        </aside>

        {/* Center Workspace */}
        <main className="workspace-center">

          <div className="pdf-container">
            {doc ? (
              <div className="pdf-page-wrapper" style={{ position: 'relative', transformOrigin: 'top center' }}>
                <canvas ref={canvasRef} className="pdf-canvas shadow-lg"></canvas>
                {/* Visual overlays for detected images */}
                {searchResults.filter(r => r.pageNumber === activePage && (r.type === 'image-detected' || r.type === 'image-match')).map(match => {
                  const isSelected = selectedMatchIds.has(match.matchId);
                  
                  return (
                    <div
                      key={match.matchId}
                      onClick={() => {
                        setSelectedMatchIds(prev => {
                          const next = new Set(prev);
                          if (next.has(match.matchId)) next.delete(match.matchId);
                          else next.add(match.matchId);
                          return next;
                        });
                      }}
                      style={{
                        position: 'absolute',
                        left: `${match.pdfX * zoomScale}px`,
                        top: `${(match.pageHeight - match.pdfY - match.pdfHeight) * zoomScale}px`,
                        width: `${match.pdfWidth * zoomScale}px`,
                        height: `${match.pdfHeight * zoomScale}px`,
                        border: isSelected ? '2px solid var(--green-primary)' : '2px dashed rgba(255, 0, 0, 0.7)',
                        backgroundColor: isSelected ? 'rgba(15, 157, 88, 0.2)' : 'rgba(255, 0, 0, 0.1)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'flex-start',
                        zIndex: 10
                      }}
                    >
                       <span style={{ 
                         background: isSelected ? 'var(--green-primary)' : 'rgba(255,0,0,0.7)', 
                         color: 'white', 
                         fontSize: `${10 * zoomScale}px`, 
                         padding: '2px 4px', 
                         fontWeight: 'bold' 
                       }}>
                         {isSelected ? 'SELECTED' : (match.type === 'image-match' ? (match.refImageName ? `REF: ${match.refImageName}` : 'REFERENCE MATCH') : 'IMAGE DETECTED')}
                       </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
                <p style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>No document selected</p>
                <button 
                  className="btn btn-primary" 
                  onClick={() => document.querySelector('.tab-add-btn')?.click()}
                  style={{ padding: '0.75rem 1.5rem' }}
                >
                  <Upload size={18} className="inline mr-2" /> UPLOAD OR SELECT PDF
                </button>
              </div>
            )}
          </div>
        </main>

        {/* Right Sidebar - Find Sensitive Data */}
        <aside className="sidebar-right" style={{ borderRight: '1px solid rgba(0,0,0,0.05)' }}>
          <div className="sidebar-header">
            <span className="sidebar-title"><span className="dot-green"></span> FIND SENSITIVE DATA</span>
          </div>

          <div className="protect-section">
            <div className="section-label">SEARCH SENSITIVE ENTITY / REGEX</div>
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input 
                type="text" 
                className="search-input" 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                placeholder="Search text..." 
              />
              <button className="clear-btn" onClick={() => setSearchQuery('')}>⊗</button>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', minHeight: '22px' }}>
              <span style={{ fontSize: '0.7rem', color: '#666' }}>
                {searchQuery.trim() ? `${searchResults.length} match${searchResults.length === 1 ? '' : 'es'} found` : ''}
              </span>
              {searchQuery.trim() && (
                <button
                  className="btn btn-outline-dark btn-xs"
                  style={{ fontSize: '0.65rem', padding: '2px 8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={async () => {
                    await saveCurrentRulesIfNotExists();
                  }}
                  disabled={projectRules.some(r => r.type !== 'image' && r.query && r.query.toLowerCase() === searchQuery.trim().toLowerCase())}
                >
                  <Shield size={10} />
                  {projectRules.some(r => r.type !== 'image' && r.query && r.query.toLowerCase() === searchQuery.trim().toLowerCase())
                    ? "✓ SAVED IN RULES"
                    : "+ SAVE AS RULE"}
                </button>
              )}
            </div>
            
            <div className="section-label" style={{ marginTop: '0.75rem' }}>IMAGE MATCH & PROTECT</div>
            <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
              <input 
                type="file" 
                accept="image/*" 
                ref={refImageInputRef}
                style={{ display: 'none' }}
                onChange={handleReferenceImageUpload}
                multiple
              />
              <button 
                className="btn btn-secondary-light" 
                style={{ 
                  width: '100%', 
                  fontSize: '0.75rem', 
                  minHeight: '38px', 
                  padding: '0 12px',
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  border: '1px solid var(--green-primary)', 
                  gap: '6px',
                  fontWeight: 600
                }}
                onClick={() => refImageInputRef.current?.click()}
                disabled={isExtractingML}
                title={referenceImages.length > 0 ? "Add another reference image" : "Upload reference image"}
              >
                {isExtractingML ? (
                  <>
                    <RefreshCw size={14} className="spin mr-1" />
                    EXTRACTING ML FEATURES...
                  </>
                ) : (
                  <>
                    {referenceImages.length > 0 ? <Plus size={14} /> : <ImageIcon size={14} />}
                    {referenceImages.length > 0 ? "ADD ANOTHER REFERENCE IMAGE" : "UPLOAD REFERENCE IMAGE"}
                  </>
                )}
              </button>
            </div>

            {referenceImages.length > 0 && (
              <div style={{ marginTop: '0.5rem', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--neutral-gray)', letterSpacing: '0.02em' }}>
                    REFERENCE IMAGES ({referenceImages.length})
                  </span>
                  {referenceImages.length > 1 && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => setSelectedRefImageId(selectedRefImageId === 'all' ? referenceImages[0].id : 'all')}
                        style={{
                          background: selectedRefImageId === 'all' ? 'var(--green-deep)' : '#f0f0f0',
                          color: selectedRefImageId === 'all' ? '#fff' : '#666',
                          border: 'none',
                          borderRadius: '10px',
                          padding: '2px 8px',
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {selectedRefImageId === 'all' ? '✓ ALL ACTIVE' : 'SELECT ALL'}
                      </button>
                      <button
                        onClick={clearAllReferenceImages}
                        style={{
                          background: 'none',
                          color: '#e53935',
                          border: 'none',
                          fontSize: '0.62rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '2px 4px'
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: referenceImages.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: '0.5rem' }}>
                  {referenceImages.map((refImg) => {
                    const isSelected = selectedRefImageId === refImg.id || selectedRefImageId === 'all';
                    const matchesCount = refImageMatchesCounts[refImg.id] || 0;

                    return (
                      <div
                        key={refImg.id}
                        onClick={() => {
                          setSelectedRefImageId(refImg.id);
                          if ((refImageMatchesCounts[refImg.id] || 0) === 0 && pdfDocument) {
                            scanDocumentForReferenceImages(pdfDocument, [refImg]);
                          }
                        }}
                        style={{
                          position: 'relative',
                          border: isSelected ? '2px solid var(--green-primary)' : '1px solid rgba(0,0,0,0.12)',
                          backgroundColor: isSelected ? 'rgba(15, 157, 88, 0.08)' : '#fafafa',
                          borderRadius: '6px',
                          padding: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? '0 2px 4px rgba(15, 157, 88, 0.15)' : 'none'
                        }}
                        title="Click to select this reference image to match & protect"
                      >
                        {isSelected && (
                          <div style={{
                            position: 'absolute',
                            top: '-6px',
                            left: '-6px',
                            backgroundColor: 'var(--green-primary)',
                            color: '#fff',
                            borderRadius: '50%',
                            width: '16px',
                            height: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            zIndex: 3
                          }}>
                            ✓
                          </div>
                        )}
                        <button
                          onClick={(e) => handleSaveImageAsRule(refImg, e)}
                          style={{
                            position: 'absolute',
                            top: '4px',
                            left: isSelected ? '18px' : '4px',
                            background: projectRules.some(r => r.type === 'image' && (r.refImageId === refImg.id || r.query === refImg.name)) ? 'var(--green-deep)' : 'rgba(0,0,0,0.5)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '1px 5px',
                            fontSize: '9px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            cursor: 'pointer',
                            zIndex: 2,
                            fontWeight: 'bold'
                          }}
                          title={projectRules.some(r => r.type === 'image' && (r.refImageId === refImg.id || r.query === refImg.name)) ? "Saved to Rules!" : "Save image as a rule"}
                        >
                          <Shield size={9} />
                          {projectRules.some(r => r.type === 'image' && (r.refImageId === refImg.id || r.query === refImg.name)) ? "RULE" : "+ RULE"}
                        </button>
                        <div style={{ width: '100%', height: referenceImages.length === 1 ? '70px' : '52px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#fff', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)' }}>
                          <img src={refImg.preview} alt={refImg.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                        </div>
                        <div style={{ marginTop: '4px', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--neutral-dark)', maxWidth: '65px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {refImg.name}
                          </span>
                          <span style={{
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '10px',
                            backgroundColor: matchesCount > 0 ? 'var(--green-soft)' : '#e8e8e8',
                            color: matchesCount > 0 ? 'var(--green-deep)' : '#777'
                          }}>
                            {matchesCount} {matchesCount === 1 ? 'match' : 'matches'}
                          </span>
                        </div>
                        <button
                          onClick={(e) => handleRemoveReferenceImage(refImg.id, e)}
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            background: 'rgba(0,0,0,0.5)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '18px',
                            height: '18px',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            cursor: 'pointer',
                            zIndex: 2
                          }}
                          title="Remove reference image"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="matches-summary">
            <Menu size={16}/> {searchResults.length} MATCHES FOUND 
            {searchResults.length > 0 && <span className="badge-green-solid">P{activePage}: {searchResults.filter(r => r.pageNumber === activePage).length} Matches</span>}
          </div>

          <div className="protect-section flex-1" style={{ overflowY: 'auto' }}>
            {searchResults.length > 0 && (
              <div className="section-header">
                <span className="section-label">DETECTION CONTEXT</span>
                <span className="section-label-right">TARGET 1 OF {searchResults.length} ACTIVE</span>
              </div>
            )}
            
            {searchResults.map((result, idx) => {
              const isSelected = selectedMatchIds.has(result.matchId);
              return (
                <div 
                  key={result.matchId} 
                  className={`match-card ${isSelected ? 'active' : ''}`} 
                  onClick={() => {
                    setActivePage(result.pageNumber);
                    setSelectedMatchIds(prev => {
                      const next = new Set(prev);
                      if (next.has(result.matchId)) next.delete(result.matchId);
                      else next.add(result.matchId);
                      return next;
                    });
                  }} 
                  style={{ cursor: 'pointer' }}
                >
                  <div className="match-card-header">
                    <span>📄 PAGE {result.pageNumber}</span>
                    <span className="badge-dark">{result.rule ? result.rule.action.toUpperCase() : activeTab.toUpperCase()}</span>
                  </div>
                  <div className="match-card-content">
                    {renderHighlightedText(result.str, result.rule ? result.rule.query : searchQuery, isSelected)}
                  </div>
                </div>
              );
            })}

            {searchResults.length === 0 && searchQuery && referenceImages.length === 0 && (
              <div style={{ padding: '1rem', color: '#888', textAlign: 'center' }}>
                No matches found for "{searchQuery}".
              </div>
            )}
            {searchResults.length === 0 && referenceImages.length > 0 && !searchQuery && (
              <div style={{ padding: '1rem', color: '#888', textAlign: 'center' }}>
                No matches found for selected reference image{selectedRefImageId === 'all' ? 's' : ''}.
                <div style={{ marginTop: '0.5rem', fontSize: '0.65rem' }}>
                  Select another reference image or click "ADD ANOTHER REFERENCE IMAGE" to test with another version/crop.
                </div>
                {pdfDocument && (
                  <button
                    onClick={() => {
                      const targetRefs = (selectedRefImageId && selectedRefImageId !== 'all')
                        ? referenceImages.filter(img => img.id === selectedRefImageId)
                        : referenceImages;
                      scanDocumentForReferenceImages(pdfDocument, targetRefs);
                    }}
                    disabled={isExtractingML}
                    style={{
                      marginTop: '0.75rem',
                      background: '#f0fdf4',
                      color: 'var(--green-deep)',
                      border: '1px solid var(--green-primary)',
                      borderRadius: '4px',
                      padding: '4px 12px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Search size={12} /> {isExtractingML ? 'Scanning...' : 'Re-scan Document for Matches'}
                  </button>
                )}
              </div>
            )}
            {!searchQuery && referenceImages.length === 0 && searchResults.length === 0 && (
              <div style={{ padding: '1rem', color: '#888', textAlign: 'center' }}>
                Enter text or upload image to search for sensitive entities.
                <div style={{ marginTop: '0.5rem', fontSize: '0.65rem' }}>
                  Diagnostics: {documentTextItems.filter(i => i.type === 'image').length} images found in PDF. 
                  ({documentTextItems.filter(i => i.type === 'image' && i.hash).length} successfully hashed)
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Right Sidebar 2 - Architecture Selection */}
        <aside className="sidebar-right">
          <div className="sidebar-header">
            <span className="sidebar-title"><Shield size={12} className="inline mr-1" /> PROTECT SETTINGS</span>
            <button className="icon-btn"><Menu size={16}/></button>
          </div>

          <div className="protect-section flex-1">
            <div className="section-label">SELECT REDACTION ARCHITECTURE</div>
            
            <div className={`action-card ${activeTab === 'redact' ? 'active-redact' : ''}`} onClick={() => setActiveTab('redact')}>
              <div className="action-icon icon-dark"><Lock size={20}/></div>
              <div className="action-content">
                <div className="action-title">
                  PERMANENT REDACT 
                  {activeTab === 'redact' && <span className="badge-dark">DEFAULT</span>}
                </div>
                <div className="action-desc">Cryptographically purges text & vector metadata from PDF stream. Non-recoverable.</div>
              </div>
            </div>

            <div className={`action-card ${activeTab === 'mask' ? 'active-mask' : ''}`} onClick={() => setActiveTab('mask')}>
              <div className="action-icon icon-light-green"><EyeOff size={20}/></div>
              <div className="action-content">
                <div className="action-title">
                  VISUAL MASK 
                  {activeTab === 'mask' && <span className="badge-light">REVERSIBLE</span>}
                </div>
                <div className="action-desc">Applies visual concealment overlay; text layer remains intact for authorized unmasking.</div>
              </div>
            </div>

            <div className={`action-card ${activeTab === 'replace' ? 'active-replace' : ''}`} onClick={() => setActiveTab('replace')}>
              <div className="action-icon icon-medium-green"><Replace size={20}/></div>
              <div className="action-content">
                <div className="action-title">REPLACE SYNTHETIC</div>
                <div className="action-desc">Replaces sensitive entities with synthetic anonymized placeholders.</div>
              </div>
            </div>

            <div className={`action-card ${activeTab === 'remove' ? 'active-remove' : ''}`} onClick={() => setActiveTab('remove')}>
              <div className="action-icon icon-neutral"><Trash2 size={20}/></div>
              <div className="action-content">
                <div className="action-title">REMOVE ELEMENT</div>
                <div className="action-desc">Erases text box & underlying paths without retaining spacing footprint.</div>
              </div>
            </div>
          </div>

          <div className="protect-footer" style={{ flexShrink: 0 }}>
            <div className="protect-actions">
              <button 
                className="btn btn-secondary-light footer-btn" 
                disabled={selectedMatchIds.size === 0 || isExporting}
                onClick={async () => {
                  await saveCurrentRulesIfNotExists();
                  handleApplyRedactions(searchResults.filter(r => selectedMatchIds.has(r.matchId)));
                }}
              >
                {isExporting ? "Applying..." : <>Apply to Selected<br/>({selectedMatchIds.size})</>}
              </button>
              <button 
                className="btn btn-primary footer-btn" 
                disabled={searchResults.length === 0 || isExporting}
                onClick={async () => {
                  await saveCurrentRulesIfNotExists();
                  handleApplyRedactions(searchResults);
                }}
              >
                {isExporting ? "Applying..." : <>Protect All {searchResults.length}<br/>Matches</>}
              </button>
            </div>
            
            <button 
              className="btn btn-primary-bright footer-btn" 
              style={{ width: '100%', marginTop: '0.5rem', backgroundColor: 'var(--green-deep)' }}
              disabled={(projectRules.length === 0 && !searchQuery.trim() && referenceImages.length === 0) || isExporting}
              onClick={handleApplyToAllPdfs}
            >
              {isExporting ? "Processing..." : "Apply to all PDFs"}
            </button>
            <div className="footer-status">
              <Lock size={12}/> 100% Client-side. No bytes sent to cloud.
            </div>
          </div>
        </aside>
      </div>

      <footer className="editor-bottom-bar">
        <div className="bottom-left">
          <strong>REDACTLY</strong> | © 2026 REDACTLY Sovereign Technologies Inc. Client-side WASM cryptographic pipeline.
        </div>
        <div className="bottom-right">
          <span className="status-item"><Shield size={12}/> SOC2 Type II Certified</span>
          <span className="status-item"><Shield size={12}/> HIPAA Compliant</span>
          <span className="status-item">Zero Data Retention</span>
          <span className="status-item">WASM Cryptographic Spec</span>
          <span className="status-item">Privacy Shield Policy</span>
        </div>
      </footer>
    </div>
  );
};

const EditorPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [projectRules, setProjectRules] = useState([]);

  const { documents, activeDocId, setActiveDocId, activeDocument, addDocument, removeDocument, setDocuments } = usePdfContext();
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    const proj = await projectService.getProject(projectId);
    if (!proj) {
      navigate('/projects');
      return;
    }
    setProject(proj);
    await loadRules();
  };

  const loadRules = async () => {
    const rules = await ruleService.getRules(projectId);
    setProjectRules(rules);
  };

  // Sync project stats when files or rules change
  useEffect(() => {
    if (project) {
      projectService.updateProjectStats(projectId, {
        filesCount: documents.length,
        rulesCount: projectRules.length
      });
    }
  }, [documents.length, projectRules.length, projectId, project]);

  const handleAddFileChange = async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (file && file.type === 'application/pdf') {
        const buffer = await file.arrayBuffer();
        addDocument(file.name, buffer);
      }
    }
  };

  const handleDownloadAll = () => {
    documents.forEach((doc, idx) => {
      setTimeout(() => {
        const blob = new Blob([doc.buffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `protected_${doc.name || 'document.pdf'}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, idx * 300); // Stagger downloads to prevent browser blocking
    });
  };

  const handleRemoveAll = () => {
    if (window.confirm("Are you sure you want to remove all open PDFs from this project?")) {
      setDocuments([]);
      setActiveDocId(null);
    }
  };

  if (!project) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading project...</div>;

  return (
    <div className="editor-page" style={{ height: '125vh', width: '125vw', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--neutral-offwhite-alt)', overflow: 'hidden', zoom: 0.8 }}>
      
      {/* Project Header */}
      <div style={{ width: '100%', textAlign: 'center', padding: '0.4rem', backgroundColor: 'white', borderBottom: '1px solid rgba(0,0,0,0.05)', fontWeight: 'bold', color: 'var(--gray-800)', fontSize: '0.95rem' }}>
        {project.name}
      </div>

      {/* Tabs Bar */}
      <div className="editor-tabs-bar">
        <div className="tabs-container">
          <Link to="/projects" className="project-title-tab" style={{ padding: '0 1rem', borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
            <div style={{ width: '18px', height: '18px', overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
              <img src="/logo-white.png" alt="Redactly Icon" style={{ width: '130%', height: 'auto', marginTop: '-5%' }} />
            </div>
            <span style={{ color: 'var(--green-primary)', fontWeight: '900', letterSpacing: '-0.5px' }}>REDACTLY</span>
          </Link>
          {documents.map(doc => (
            <div 
              key={doc.id} 
              className={`tab-item ${activeDocId === doc.id ? 'active' : ''}`}
              onClick={() => setActiveDocId(doc.id)}
            >
              <span className="tab-title">{doc.name}</span>
              <button 
                className="tab-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  removeDocument(doc.id);
                }}
              >
                <X size={14}/>
              </button>
            </div>
          ))}
          
          <button 
            className="tab-add-btn" 
            onClick={() => fileInputRef.current?.click()}
            title="Add another PDF"
          >
            <Plus size={16}/>
          </button>
          <input 
            type="file" 
            accept=".pdf" 
            multiple
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleAddFileChange} 
          />
        </div>

        <div className="tabs-actions" style={{ display: 'flex', gap: '0.5rem', marginRight: '1rem' }}>
          <button 
            className="btn btn-outline-dark btn-sm" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.5)' }}
            onClick={handleRemoveAll}
            disabled={documents.length === 0}
          >
            <Trash2 size={14}/> REMOVE ALL
          </button>
          <button 
            className="btn btn-primary btn-sm" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--green-primary)', color: 'white', border: 'none' }}
            onClick={handleDownloadAll}
            disabled={documents.length === 0}
          >
            <Download size={14}/> DOWNLOAD ALL
          </button>
        </div>
      </div>

      <EditorWorkspace 
        document={activeDocument || null} 
        projectId={projectId}
        projectRules={projectRules}
        reloadRules={loadRules}
      />
    </div>
  );
};

export default EditorPage;
