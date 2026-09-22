import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import { usePdfContext } from '../context/PdfContext';
import PageThumbnail from '../components/PageThumbnail';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

import { 
  Shield, Search, EyeOff, Lock, Replace, Trash2, ChevronLeft, ChevronRight, 
  ZoomIn, ZoomOut, Redo, Undo, Menu, Upload, Plus, Download, X
} from 'lucide-react';
import './EditorPage.css';

const EditorWorkspace = ({ document: doc }) => {
  const { documents, updateDocumentBuffer } = usePdfContext();
  const [activeTab, setActiveTab] = useState('redact');
  const [pdfFile, setPdfFile] = useState(doc.buffer);
  
  const [pdfDocument, setPdfDocument] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const canvasRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [documentTextItems, setDocumentTextItems] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMatchIds, setSelectedMatchIds] = useState(new Set());
  const [zoomScale, setZoomScale] = useState(1.0);
  const [isExporting, setIsExporting] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    if (pdfFile && history.length === 0) {
      setHistory([pdfFile]);
      setHistoryIndex(0);
    }
  }, [pdfFile, history.length]);

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setPdfFile(history[newIndex]);
      updateDocumentBuffer(doc.id, history[newIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setPdfFile(history[newIndex]);
      updateDocumentBuffer(doc.id, history[newIndex]);
    }
  };

  const handleApplyRedactions = async (matchesToProtect, targetBuffer = pdfFile, targetDocId = doc.id) => {
    if (!targetBuffer || matchesToProtect.length === 0) return;
    
    setIsExporting(true);
    try {
      const pdfDoc = await PDFDocument.load(targetBuffer);
      const pages = pdfDoc.getPages();

      for (const match of matchesToProtect) {
        const pageIdx = match.pageNumber - 1;
        const page = pages[pageIdx];
        
        const baseHeight = match.height || match.transform[3] || 12;
        
        const queryLower = searchQuery.toLowerCase();
        const strLower = match.str.toLowerCase();
        const idx = strLower.indexOf(queryLower);
        
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

        const paddingX = baseHeight * 0.05;
        const estimatedX = match.transform[4] + (relativeStart * match.width);
        const estimatedWidth = relativeWidth * match.width;
        
        const x = estimatedX - paddingX;
        const y = match.transform[5] - (baseHeight * 0.25);
        const width = estimatedWidth + (paddingX * 2);
        const height = baseHeight * 1.4;

        if (activeTab === 'redact') {
          page.drawRectangle({ x, y, width, height, color: rgb(0, 0, 0) });
        } else if (activeTab === 'mask') {
          page.drawRectangle({ x, y, width, height, color: rgb(0.5, 0.9, 0.5), opacity: 0.8 });
        } else if (activeTab === 'replace') {
          page.drawRectangle({ x, y, width, height, color: rgb(1, 1, 1) });
          page.drawText("[SYNTHETIC]", { x: x + 2, y: y + (height * 0.2), size: baseHeight * 0.8, color: rgb(0, 0, 0) });
        } else if (activeTab === 'remove') {
          page.drawRectangle({ x, y, width, height, color: rgb(1, 1, 1) });
        }
      }

      const pdfBytes = await pdfDoc.save();
      
      if (targetDocId === doc.id) {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(pdfBytes);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setPdfFile(pdfBytes);
        setSelectedMatchIds(new Set());
      }
      
      updateDocumentBuffer(targetDocId, pdfBytes);
      
    } catch (error) {
      console.error("Apply failed", error);
      alert("Failed to apply modifications to PDF.");
    } finally {
      if (targetDocId === doc.id) setIsExporting(false);
    }
  };

  const handleApplyToAllPdfs = async () => {
    if (!searchQuery.trim()) return;
    setIsExporting(true);
    
    try {
      for (const currentDoc of documents) {
        if (currentDoc.id === doc.id) {
          if (searchResults.length > 0) {
            await handleApplyRedactions(searchResults, currentDoc.buffer, currentDoc.id);
          }
          continue;
        }

        const loadingTask = pdfjsLib.getDocument({ data: currentDoc.buffer.slice(0) });
        const pdf = await loadingTask.promise;
        
        let allTextItems = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageItems = textContent.items.map((item, index) => ({ 
            ...item, 
            pageNumber: i,
            id: `p${i}-${index}`
          }));
          allTextItems = allTextItems.concat(pageItems);
        }
        
        const query = searchQuery.toLowerCase();
        const matches = allTextItems.filter(item => item.str.toLowerCase().includes(query));
        
        if (matches.length > 0) {
          await handleApplyRedactions(matches, currentDoc.buffer, currentDoc.id);
        }
      }
    } catch (error) {
      console.error("Failed to apply to all PDFs", error);
      alert("An error occurred while processing background PDFs.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = () => {
    if (!pdfFile) return;
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

        let allTextItems = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageItems = textContent.items.map((item, index) => ({ 
            ...item, 
            pageNumber: i,
            id: `p${i}-${index}`
          }));
          allTextItems = allTextItems.concat(pageItems);
        }
        setDocumentTextItems(allTextItems);

      } catch (error) {
        console.error("Error loading PDF", error);
      }
    };
    loadPdf();
  }, [pdfFile]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSelectedMatchIds(new Set());
      return;
    }
    const query = searchQuery.toLowerCase();
    const results = documentTextItems.filter(item => item.str.toLowerCase().includes(query));
    setSearchResults(results);
    setSelectedMatchIds(new Set(results.map(r => r.id)));
  }, [searchQuery, documentTextItems]);

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

  return (
    <div className="editor-workspace-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, overflow: 'hidden' }}>
      {/* Top Toolbar */}
      <header className="editor-toolbar">
        <div className="toolbar-left">
          <Link to="/" className="brand">
            <img src="/logo-dark.png" alt="Redactly Logo" className="brand-logo" />
          </Link>
          <div className="doc-info">
            <span className="doc-icon">📄</span>
            <div className="doc-meta">
              <div className="doc-title-bar">{doc.name || 'No document loaded'}</div>
              <div className="doc-stats">{totalPages || 0} Pages • Client-side WASM Memory</div>
            </div>
            <div className="badge-isolated">
              <span className="dot-green"></span> ISOLATED
            </div>
          </div>
        </div>

        <div className="toolbar-center">
          <button className="icon-btn" onClick={() => setActivePage(p => Math.max(1, p - 1))} disabled={activePage <= 1}><ChevronLeft size={18}/></button>
          <span className="page-indicator">{activePage} / {totalPages || 1}</span>
          <button className="icon-btn" onClick={() => setActivePage(p => Math.min(totalPages, p + 1))} disabled={activePage >= totalPages || !totalPages}><ChevronRight size={18}/></button>
          <div className="divider"></div>
          <button className="icon-btn" onClick={() => setZoomScale(z => Math.max(0.5, z - 0.25))} title="Zoom Out"><ZoomOut size={18}/></button>
          <span className="zoom-level" style={{ minWidth: '40px', textAlign: 'center' }}>{Math.round(zoomScale * 100)}%</span>
          <button className="icon-btn" onClick={() => setZoomScale(z => Math.min(3.0, z + 0.25))} title="Zoom In"><ZoomIn size={18}/></button>
          <button className="text-btn" onClick={() => setZoomScale(1.0)}>Fit Width</button>
          <div className="divider"></div>
          <button className="icon-btn" onClick={handleUndo} disabled={historyIndex <= 0} title="Undo"><Undo size={18}/></button>
          <button className="icon-btn" onClick={handleRedo} disabled={historyIndex >= history.length - 1} title="Redo"><Redo size={18}/></button>
        </div>

        <div className="toolbar-right">
          <div className="pipeline-status-badge">
            <Shield size={14}/> ZERO-LEAK PIPELINE
          </div>
          <button 
            className="btn btn-primary btn-export" 
            onClick={handleDownload}
            disabled={!pdfFile}
          >
            EXPORT REDACTED PDF
          </button>
        </div>
      </header>

      <div className="editor-workspace">
        {/* Left Sidebar - Pages */}
        <aside className="sidebar-left" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="sidebar-header">
            <span className="sidebar-title">DOCUMENT PAGES</span>
            <span className="sidebar-count">{totalPages || 0} PAGES</span>
          </div>
          
          <div className="pages-list" style={{ overflowY: 'auto', flex: 1 }}>
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
          <div className="sidebar-footer">
            <span>Total Purged Items:</span>
            <span className="font-bold">0 Elements</span>
          </div>
        </aside>

        {/* Center Workspace */}
        <main className="workspace-center" style={{ overflow: 'auto', backgroundColor: '#f5f5f5' }}>
          <div className="document-container" style={{ minHeight: '100%', padding: '2rem', display: 'flex', justifyContent: 'center' }}>
            <div className="pdf-canvas-wrapper" style={{ position: 'relative' }}>
              <canvas 
                ref={canvasRef} 
                className="pdf-canvas" 
                style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.1)', background: 'white' }} 
              />
            </div>
          </div>
        </main>

        {/* Right Sidebar - Protect */}
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
          </div>

          <div className="matches-summary">
            <Menu size={16}/> {searchResults.length} MATCHES FOUND 
            {searchResults.length > 0 && <span className="badge-green-solid">P{activePage}: {searchResults.filter(r => r.pageNumber === activePage).length} Matches</span>}
          </div>

          <div className="protect-section flex-1">
            {searchResults.length > 0 && (
              <div className="section-header">
                <span className="section-label">DETECTION CONTEXT</span>
                <span className="section-label-right">TARGET 1 OF {searchResults.length} ACTIVE</span>
              </div>
            )}
            
            {searchResults.map((result, idx) => {
              const isSelected = selectedMatchIds.has(result.id);
              return (
                <div 
                  key={result.id} 
                  className={`match-card ${isSelected ? 'active' : ''}`} 
                  onClick={() => {
                    setActivePage(result.pageNumber);
                    setSelectedMatchIds(prev => {
                      const next = new Set(prev);
                      if (next.has(result.id)) next.delete(result.id);
                      else next.add(result.id);
                      return next;
                    });
                  }} 
                  style={{ cursor: 'pointer' }}
                >
                  <div className="match-card-header">
                    <span>📄 PAGE {result.pageNumber}</span>
                    {isSelected ? <span className="badge-green-solid">SELECTED</span> : <span className="match-id">MATCH #{idx+1}</span>}
                  </div>
                  <div className="match-card-content">
                    {renderHighlightedText(result.str, searchQuery, isSelected)}
                  </div>
                </div>
              );
            })}

            {searchResults.length === 0 && searchQuery && (
              <div style={{ padding: '1rem', color: '#888', textAlign: 'center' }}>No matches found for "{searchQuery}".</div>
            )}
            {!searchQuery && (
              <div style={{ padding: '1rem', color: '#888', textAlign: 'center' }}>Enter text to search for sensitive entities.</div>
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
                onClick={() => handleApplyRedactions(searchResults.filter(r => selectedMatchIds.has(r.id)))}
              >
                {isExporting ? "Applying..." : <>Apply to Selected<br/>({selectedMatchIds.size})</>}
              </button>
              <button 
                className="btn btn-primary footer-btn" 
                disabled={searchResults.length === 0 || isExporting}
                onClick={() => handleApplyRedactions(searchResults)}
              >
                {isExporting ? "Applying..." : <>Protect All {searchResults.length}<br/>Matches</>}
              </button>
            </div>
            
            <button 
              className="btn btn-primary-bright footer-btn" 
              style={{ width: '100%', marginTop: '0.5rem', backgroundColor: 'var(--green-deep)' }}
              disabled={!searchQuery || isExporting}
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
  const { documents, activeDocId, setActiveDocId, activeDocument, addDocument, removeDocument } = usePdfContext();
  const fileInputRef = useRef(null);

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

  return (
    <div className="editor-page" style={{ height: '125vh', width: '125vw', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--neutral-offwhite-alt)', overflow: 'hidden', zoom: 0.8 }}>
      
      {/* Tabs Bar */}
      <div className="editor-tabs-bar">
        <div className="tabs-container">
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

        <div className="tabs-actions">
          <button 
            className="btn btn-outline-dark btn-sm" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' }}
            onClick={handleDownloadAll}
            disabled={documents.length === 0}
          >
            <Download size={14}/> DOWNLOAD ALL
          </button>
        </div>
      </div>

      {activeDocument ? (
        <EditorWorkspace key={activeDocument.id} document={activeDocument} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', flex: 1 }}>
          <div style={{ color: '#888', fontSize: '1.2rem', marginBottom: '1.5rem' }}>
            No documents loaded
          </div>
          <button 
            className="btn btn-primary btn-large" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem 2rem' }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={18} /> DROP OR SELECT PDF
          </button>
        </div>
      )}
    </div>
  );
};

export default EditorPage;
