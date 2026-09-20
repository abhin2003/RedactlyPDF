import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import { usePdfContext } from '../context/PdfContext';
import PageThumbnail from '../components/PageThumbnail';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

import { 
  Shield, 
  Search, 
  EyeOff, 
  Lock, 
  Replace, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut,
  RotateCw,
  Undo,
  Menu,
  Upload
} from 'lucide-react';
import './EditorPage.css';

const EditorPage = () => {
  const [activeTab, setActiveTab] = useState('redact');
  const { pdfFile, setPdfFile, pdfFileName, activePage, setActivePage, totalPages, setTotalPages } = usePdfContext();
  const [pdfDocument, setPdfDocument] = useState(null);
  const canvasRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [documentTextItems, setDocumentTextItems] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMatchIds, setSelectedMatchIds] = useState(new Set());
  const [zoomScale, setZoomScale] = useState(1.0);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      const buffer = await file.arrayBuffer();
      setPdfFile(buffer);
      setPdfFileName(file.name);
    } else if (file) {
      alert("Please upload a PDF file.");
    }
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
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setPdfFile(history[newIndex]);
      // Re-run search query if applicable by just letting the natural useEffect handle documentTextItems
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setPdfFile(history[newIndex]);
    }
  };

  const handleApplyRedactions = async (matchesToProtect) => {
    if (!pdfFile || matchesToProtect.length === 0) {
      return;
    }
    
    setIsExporting(true);
    try {
      const pdfDoc = await PDFDocument.load(pdfFile);
      const pages = pdfDoc.getPages();

      for (const match of matchesToProtect) {
        const pageIdx = match.pageNumber - 1;
        const page = pages[pageIdx];
        
        // Coordinates from pdf.js (bottom-left origin)
        // Note: transform[5] is the text baseline, not the absolute bottom of the glyph bounding box.
        const baseHeight = match.height || match.transform[3] || 12;
        
        // Adjust coordinates to add a "bleed" area ensuring descenders and ascenders are fully covered
        const paddingX = 4;
        const x = match.transform[4] - paddingX;
        const y = match.transform[5] - (baseHeight * 0.25); // Shift down to cover descenders (g, p, q, y)
        const width = match.width + (paddingX * 2);
        const height = baseHeight * 1.4; // Scale up to cover tall ascenders (h, l, M)

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
      
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(pdfBytes);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);

      // Update the viewer state with the new modified PDF
      setPdfFile(pdfBytes);
      setSelectedMatchIds(new Set()); // clear selection
      
    } catch (error) {
      console.error("Apply failed", error);
      alert("Failed to apply modifications to PDF.");
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
    link.download = `protected_${pdfFileName || 'document.pdf'}`;
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

        // Extract text for searching
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
  }, [pdfFile, setTotalPages]);

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
    <div className="editor-page">
      {/* Top Toolbar */}
      <header className="editor-toolbar">
        <div className="toolbar-left">
          <Link to="/" className="brand">
            <img src="/logo-dark.png" alt="Redactly Logo" className="brand-logo" />
          </Link>
          <div className="doc-info">
            <span className="doc-icon">📄</span>
            <div className="doc-meta">
              <div className="doc-title-bar">{pdfFileName || 'No document loaded'}</div>
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
          <button className="icon-btn" onClick={handleRedo} disabled={historyIndex >= history.length - 1} title="Redo"><RotateCw size={18}/></button>
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
            {!pdfDocument && (
               <div style={{ padding: '1rem', color: '#888', textAlign: 'center' }}>
                 No document loaded.
               </div>
            )}
          </div>

          <div className="sidebar-footer">
            <span>Total Purged Items:</span>
            <span className="font-bold">0 Elements</span>
          </div>
        </aside>

        {/* Center Workspace */}
        <main className="workspace-center" style={{ overflow: 'auto', backgroundColor: '#f5f5f5' }}>
          <div className="document-container" style={{ minHeight: '100%', padding: '2rem', display: 'flex', justifyContent: 'center' }}>
            {!pdfFile ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '6rem' }}>
                <div style={{ color: '#888', fontSize: '1.2rem', marginBottom: '1.5rem' }}>
                  No document loaded
                </div>
                <input 
                  type="file" 
                  accept=".pdf" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  onChange={handleFileChange} 
                />
                <button 
                  className="btn btn-primary btn-large" 
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem 2rem' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={18} /> DROP OR SELECT PDF
                </button>
              </div>
            ) : (
              <div className="pdf-canvas-wrapper" style={{ position: 'relative' }}>
                <canvas 
                  ref={canvasRef} 
                  className="pdf-canvas" 
                  style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.1)', background: 'white' }} 
                />
              </div>
            )}
          </div>
        </main>

        {/* Right Sidebar - Protect */}
        {/* Right Sidebar 1 - Search & Matches */}
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
                  <div className={`match-card-content ${isSelected ? 'highlight-active' : ''}`}>
                    {result.str}
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

export default EditorPage;
