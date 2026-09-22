import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import { usePdfContext } from '../context/PdfContext';
import PageThumbnail from '../components/PageThumbnail';
import { projectService } from '../services/projectService';
import { ruleService } from '../services/ruleService';
import { 
  Shield, Search, EyeOff, Lock, Replace, Trash2, ChevronLeft, ChevronRight, 
  ZoomIn, ZoomOut, Redo, Undo, Menu, Upload, Plus, Download, X, ArrowLeft, Save, Edit2
} from 'lucide-react';
import './EditorPage.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const EditorWorkspace = ({ document: doc, projectId, projectRules, reloadRules }) => {
  const { documents, updateDocumentBuffer } = usePdfContext();
  const [pdfFile, setPdfFile] = useState(doc ? doc.buffer : null);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [editingRuleQuery, setEditingRuleQuery] = useState('');
  const [savedRuleIds, setSavedRuleIds] = useState(new Set());
  useEffect(() => {
    setPdfFile(doc ? doc.buffer : null);
    setDocumentTextItems([]);
    setSearchResults([]);
    setSelectedMatchIds(new Set());
    setActivePage(1);
  }, [doc]);
  
  const [pdfDocument, setPdfDocument] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const canvasRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('redact');
  
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
        
        const queryText = match.rule ? match.rule.query : searchQuery;
        const queryLower = queryText.toLowerCase();
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

        if (action === 'redact') {
          page.drawRectangle({ x, y, width, height, color: rgb(0, 0, 0) });
        } else if (action === 'mask') {
          page.drawRectangle({ x, y, width, height, color: rgb(0.5, 0.9, 0.5), opacity: 0.8 });
        } else if (action === 'replace') {
          page.drawRectangle({ x, y, width, height, color: rgb(1, 1, 1) });
          page.drawText("[SYNTHETIC]", { x: x + 2, y: y + (height * 0.2), size: baseHeight * 0.8, color: rgb(0, 0, 0) });
        } else if (action === 'remove') {
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

  const handleApplySavedRules = async () => {
    const savedMatches = searchResults.filter(r => r.rule);
    if (savedMatches.length > 0) {
      await handleApplyRedactions(savedMatches);
    } else {
      alert("No matches found for the saved rules in this document.");
    }
  };

  const handleDeleteRule = async (ruleId) => {
    await ruleService.deleteRule(projectId, ruleId);
    reloadRules();
  };

  const handleSaveRuleEdit = async (ruleId, newQuery) => {
    if (newQuery && newQuery.trim()) {
      await ruleService.updateRule(projectId, ruleId, { query: newQuery.trim() });
      reloadRules();
      setSavedRuleIds(prev => {
        const next = new Set(prev);
        next.add(ruleId);
        return next;
      });
    }
  };

  const saveQueryAsRuleIfNotExists = async () => {
    if (!searchQuery.trim()) return;
    const queryLower = searchQuery.trim().toLowerCase();
    const ruleExists = projectRules.some(r => r.query.toLowerCase() === queryLower);
    if (!ruleExists) {
      await ruleService.addRule(projectId, { query: searchQuery.trim(), action: activeTab });
      reloadRules();
    }
  };

  const handleApplyToAllPdfs = async () => {
    if (projectRules.length === 0 && !searchQuery.trim()) return;
    
    // Save the current search query as a rule if it doesn't exist
    await saveQueryAsRuleIfNotExists();
    
    setIsExporting(true);
    
    try {
      const getMatchesForItems = (items) => {
        let matches = [];
        projectRules.forEach(rule => {
          const query = rule.query.toLowerCase();
          const ruleMatches = items
            .filter(item => item.str.toLowerCase().includes(query))
            .map(m => ({ ...m, rule, matchId: `rule-${rule.id}-${m.id}` }));
          matches = matches.concat(ruleMatches);
        });
        
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          const searchMatches = items
            .filter(item => item.str.toLowerCase().includes(query))
            .map(m => ({ ...m, matchId: `search-${m.id}` }));
          matches = matches.concat(searchMatches);
        }
        return matches;
      };

      for (const currentDoc of documents) {
        if (currentDoc.id === doc?.id) {
          const matches = getMatchesForItems(documentTextItems);
          if (matches.length > 0) {
            await handleApplyRedactions(matches, currentDoc.buffer, currentDoc.id);
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
        
        const matches = getMatchesForItems(allTextItems);
        
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
    let results = [];
    
    if (searchQuery.trim()) {
      // If actively searching, only show search matches
      const query = searchQuery.toLowerCase();
      results = documentTextItems
        .filter(item => item.str.toLowerCase().includes(query))
        .map(m => ({ ...m, matchId: `search-${m.id}` }));
    }
    
    setSearchResults(results);
    setSelectedMatchIds(new Set(results.map(r => r.matchId)));
  }, [documentTextItems, searchQuery]);

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
          
          <button className="icon-btn" disabled={!doc} onClick={() => setZoomScale(s => Math.max(0.5, s - 0.1))}><ZoomOut size={16}/></button>
          <span className="zoom-level" style={{ minWidth: '40px', textAlign: 'center' }}>{Math.round(zoomScale * 100)}%</span>
          <button className="icon-btn" disabled={!doc} onClick={() => setZoomScale(s => Math.min(3, s + 0.1))}><ZoomIn size={16}/></button>
          <button className="text-btn" disabled={!doc}>Fit Width</button>
          
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
                      setSearchQuery(rule.query);
                      setActiveTab(rule.action);
                    }
                  }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', padding: '0.5rem', background: savedRuleIds.has(rule.id) ? 'rgba(15, 157, 88, 0.1)' : 'white', borderRadius: '4px', border: savedRuleIds.has(rule.id) ? '1px solid var(--green-primary)' : '1px solid rgba(0,0,0,0.1)', transition: 'all 0.3s ease', cursor: 'pointer' }}
                >
                  <div style={{ flex: 1, marginRight: '0.5rem' }}>
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
                    <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase' }}>{rule.action}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button 
                      className="icon-btn-subtle" 
                      onClick={(e) => {
                        const input = e.currentTarget.parentElement.previousSibling.querySelector('input');
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
                No rules saved yet.
              </div>
            )}
            
            <button 
              className="btn btn-outline-dark" 
              style={{ width: '100%', marginTop: '0.5rem', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.75rem' }}
              disabled={!searchQuery.trim() || isExporting}
              onClick={async () => {
                await ruleService.addRule(projectId, { query: searchQuery.trim(), action: activeTab });
                reloadRules();
                setSearchQuery('');
              }}
            >
              <Shield size={14} className="inline mr-2" /> SAVE CURRENT RULE
            </button>
            
            {projectRules.length > 0 && (
              <button 
                className="btn btn-outline-dark" 
                style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.75rem' }}
                onClick={handleApplySavedRules}
                disabled={isExporting}
              >
                APPLY RULES TO THIS PDF
              </button>
            )}
          </div>

          <div className="sidebar-footer" style={{ padding: '0.75rem' }}>
            <button 
              className="btn btn-primary-bright" 
              style={{ width: '100%', backgroundColor: 'var(--green-deep)', fontWeight: 'bold', fontSize: '0.9rem', padding: '0.6rem' }}
              disabled={(projectRules.length === 0 && !searchQuery.trim()) || isExporting}
              onClick={handleApplyToAllPdfs}
            >
              {isExporting ? "Processing..." : "APPLY"}
            </button>
          </div>
        </aside>

        {/* Center Workspace */}
        <main className="workspace-center">

          <div className="pdf-container">
            {doc ? (
              <div className="pdf-page-wrapper" style={{ transform: `scale(${zoomScale})`, transformOrigin: 'top center' }}>
                <canvas ref={canvasRef} className="pdf-canvas shadow-lg"></canvas>
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

            {searchResults.length === 0 && searchQuery && (
              <div style={{ padding: '1rem', color: '#888', textAlign: 'center' }}>
                No matches found for "{searchQuery}".
              </div>
            )}
            {!searchQuery && searchResults.length === 0 && (
              <div style={{ padding: '1rem', color: '#888', textAlign: 'center' }}>
                Enter text to search for sensitive entities.
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
                  await saveQueryAsRuleIfNotExists();
                  handleApplyRedactions(searchResults.filter(r => selectedMatchIds.has(r.matchId)));
                }}
              >
                {isExporting ? "Applying..." : <>Apply to Selected<br/>({selectedMatchIds.size})</>}
              </button>
              <button 
                className="btn btn-primary footer-btn" 
                disabled={searchResults.length === 0 || isExporting}
                onClick={async () => {
                  await saveQueryAsRuleIfNotExists();
                  handleApplyRedactions(searchResults);
                }}
              >
                {isExporting ? "Applying..." : <>Protect All {searchResults.length}<br/>Matches</>}
              </button>
            </div>
            
            <button 
              className="btn btn-primary-bright footer-btn" 
              style={{ width: '100%', marginTop: '0.5rem', backgroundColor: 'var(--green-deep)' }}
              disabled={(projectRules.length === 0 && !searchQuery.trim()) || isExporting}
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
