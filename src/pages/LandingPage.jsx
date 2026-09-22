import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Lock, Replace, Trash2, CheckCircle2, ChevronRight, Menu, Play, ArrowRight, Upload } from 'lucide-react';
import { usePdfContext } from '../context/PdfContext';
import './LandingPage.css';

const LandingPage = () => {
  const navigate = useNavigate();
  const { addDocument } = usePdfContext();
  const fileInputRef = React.useRef(null);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    let added = false;
    for (const file of files) {
      if (file && file.type === 'application/pdf') {
        const buffer = await file.arrayBuffer();
        addDocument(file.name, buffer);
        added = true;
      }
    }
    if (added) {
      navigate('/editor');
    } else {
      alert("Please upload at least one PDF file.");
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    let added = false;
    for (const file of files) {
      if (file && file.type === 'application/pdf') {
        const buffer = await file.arrayBuffer();
        addDocument(file.name, buffer);
        added = true;
      }
    }
    if (added) {
      navigate('/editor');
    } else {
      alert("Please drop at least one PDF file.");
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <div className="landing-page">
      <nav className="navbar container">
        <div className="brand">
          <img src="/logo-white.png" alt="Redactly Logo" className="brand-logo" />
        </div>
        <div className="nav-links">
          <a href="#product">Product</a>
          <a href="#security">Security Protocol</a>
          <Link to="/faq">FAQ</Link>
        </div>
        <div className="nav-actions">
          <Link to="/editor" className="btn btn-primary-nav">Try REDACTLY</Link>
        </div>
        <button className="mobile-menu-btn"><Menu /></button>
      </nav>

      <section className="hero" onDrop={handleDrop} onDragOver={handleDragOver}>
        <div className="hero-background"></div>
        <div className="hero-content container">
          <div className="hero-pill">
            <span className="pill-dot"></span>
            ZERO-LEAK PDF COMPLIANCE ENGINE
          </div>
          <h1 className="hero-title">PROTECT WHAT<br/>YOUR DOCUMENTS<br/>REVEAL.</h1>
          <p className="hero-subtitle">
            MASK, REDACT, REPLACE AND REMOVE SENSITIVE INFORMATION FROM YOUR PDFS WITH<br/>
            SOVEREIGN CLIENT-SIDE ZERO-TRUST WASM ENGINES.
          </p>
          <div className="hero-cta-group">
            <input 
              type="file" 
              accept=".pdf" 
              multiple
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileChange} 
            />
            <button 
              className="btn btn-dark-cta btn-large" 
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} className="mr-2" /> DROP OR SELECT PDF
            </button>
            <button 
              className="btn btn-outline-light btn-large"
              onClick={() => document.getElementById('product')?.scrollIntoView({ behavior: 'smooth' })}
            >
              SEE HOW IT WORKS
            </button>
          </div>
        </div>

        <div className="hero-product-preview container">
          <div className="preview-window">
            <div className="preview-header">
              <div className="window-controls">
                <span className="dot red"></span>
                <span className="dot yellow"></span>
                <span className="dot green"></span>
              </div>
              <div className="window-title-bar">
                <Shield size={12}/> REDACTLY SOVEREIGN CRYPTOGRAPHIC ENGINE 
                <span className="badge-green-dark">CLIENT ENCRYPTED</span>
              </div>
              <div className="window-actions">
                <span className="preview-doc-name">Term_Sheet.pdf</span>
                <button className="btn-export-sm">EXPORT REDACTED PDF</button>
              </div>
            </div>
            <div className="preview-body">
              <div className="preview-document">
                <div className="doc-content">
                  <div className="doc-badge-priv">STRICTLY PRIVILEGED & CONFIDENTIAL</div>
                  <div className="doc-title">CONFIDENTIAL SERIES B INVESTMENT TERM SHEET</div>
                  <p className="doc-text">
                    The Pre-Money <span className="highlight-green">Valuation & Liquidation</span> framework agreed upon by the Board...
                  </p>
                  
                  <div className="callout-box">
                    <div className="callout-title">SETTLEMENT ESCROW & BANKING ROUTING INSTRUCTIONS:</div>
                    <div className="callout-content mask-applied">
                      Escrow Bank: JPMorgan Chase NA (New York Division) • Account Routing: 021000021 • Account Ref: 984-23412384-US-WIRE
                      <div className="mask-overlay">
                        <Lock size={12}/> VISUAL MASK APPLIED (CLIENT-REVERSIBLE)
                      </div>
                    </div>
                  </div>

                  <p className="doc-text mt-4">
                    1.2 Pursuant to the Term Sheet, Apex Horizon Global Partners IX, L.P. shall commit to an investment representing <span className="redact-block">[PERMANENT REDACT - PURGED]</span> of the fully diluted capitalization...
                  </p>
                </div>
              </div>
              <div className="preview-sidebar">
                <div className="sidebar-section">
                  <div className="sidebar-title"><span className="dot-green"></span> FIND & PROTECT</div>
                  <div className="search-bar-fake">
                    <span>Valuation & Liquidation</span>
                    <span className="clear-icon">⊗</span>
                  </div>
                </div>
                
                <div className="sidebar-matches">
                  <Menu size={12}/> 5 MATCHES FOUND <span className="badge-matches">P3: 2 Matches</span>
                </div>

                <div className="match-list">
                  <div className="match-item active">
                    <div className="match-item-header">
                      <span>📄 PAGE 3 - PARAGRAPH 2</span>
                      <span className="badge-selected">SELECTED</span>
                    </div>
                    <div className="match-item-content highlight-active-sidebar">
                      Valuation & Liquidation framework shall be benchmarked...
                    </div>
                  </div>
                  <div className="match-item">
                    <div className="match-item-header">
                      <span>PAGE 3 - TABLE SECTION 3</span>
                      <span className="match-id">MATCH #2</span>
                    </div>
                    <div className="match-item-content">
                      "...terms governing secondary tranche priority and <span className="highlight-inactive">Valuation & Liquidation</span> payout caps..."
                    </div>
                  </div>
                </div>

                <div className="sidebar-bottom-actions">
                  <button className="btn-apply-selected">Apply to Selected</button>
                  <button className="btn-protect-all">Protect All 5</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="features-section" id="product">
        <div className="container">
          <div className="section-pill">FOUR WAYS TO SHIELD</div>
          <h2 className="section-title-dark">FOUR WAYS TO SHIELD</h2>
          <p className="section-subtitle-dark">
            Whether you need reversible visual concealment or irreversible cryptographic purging, we have a<br/>
            mathematically guaranteed protocol for you.
          </p>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon-wrapper light-green-bg"><Shield size={20} className="text-green-primary" /></div>
              <h3 className="feature-h3">VISUAL MASK</h3>
              <p className="feature-p">Applies visual concealment overlay. Text layer remains intact for authorized unmasking with cryptographic keys.</p>
              <div className="card-demo demo-mask">VISUAL MASK APPLIED</div>
            </div>
            
            <div className="feature-card dark-card">
              <div className="feature-icon-wrapper dark-bg"><Lock size={20} className="text-white" /></div>
              <h3 className="feature-h3 text-white">PERMANENT REDACT</h3>
              <p className="feature-p text-white-muted">Cryptographically purges text & vector metadata from PDF stream. Non-recoverable zero-trust sanitization.</p>
              <div className="card-demo demo-redact">
                <div className="redact-bar-black"></div>
                <span className="redact-label-small">PURGED</span>
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrapper outline-bg"><Replace size={20} className="text-green-primary" /></div>
              <h3 className="feature-h3">SYNTHETIC REPLACE</h3>
              <p className="feature-p">Replaces sensitive entities with AI-generated synthetic anonymized placeholders preserving document structure.</p>
              <div className="card-demo demo-replace">
                Marcus Vance <ArrowRight size={12} className="mx-2 inline"/> <span className="synth-label">John Smith</span>
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrapper gray-bg"><Trash2 size={20} className="text-gray" /></div>
              <h3 className="feature-h3">COMPLETE REMOVE</h3>
              <p className="feature-p">Erases text box & underlying paths entirely without retaining spacing footprint or hidden coordinates.</p>
              <div className="card-demo demo-remove">
                Account Details <span className="remove-label">REMOVED</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      <section className="pipeline-section" id="security">
        <div className="container">
          <div className="pipeline-header">
            <div className="section-pill-dark">ZERO-KNOWLEDGE ARCHITECTURE</div>
            <h2 className="section-title-white">THE SOVEREIGN PRIVACY PIPELINE</h2>
            <p className="section-subtitle-white">
              Our architecture ensures data never leaves your device. We use Client-Side WebAssembly (WASM) to execute<br/>
              heavy cryptography natively in the browser without network transmission.
            </p>
          </div>
          
          <div className="pipeline-grid">
            <div className="pipeline-step">
              <div className="step-number">01</div>
              <h4 className="step-title text-white">Client-Side WASM Assembly</h4>
              <p className="step-desc">Your document is loaded into a local Memory-Safe WASM instance. Data never touches our servers. The entire computation happens in your browser.</p>
              <div className="step-meta">In-Browser • Zero Byte Exfiltration</div>
            </div>
            <div className="pipeline-step">
              <div className="step-number">02</div>
              <h4 className="step-title text-white">In-Memory Sanitizing</h4>
              <p className="step-desc">When you redact, we modify the raw PDF byte stream in-memory. We don't just draw black boxes; we strip the underlying text streams.</p>
              <div className="step-meta">Memory-Safe • Rust WASM</div>
            </div>
            <div className="pipeline-step">
              <div className="step-number">03</div>
              <h4 className="step-title text-white">Zero-Leak Extraction</h4>
              <p className="step-desc">Save the new sanitized document directly to your filesystem. No temporary files are ever created. The original is completely preserved.</p>
              <div className="step-meta">Local Output • PDF Standard Compliant</div>
            </div>
          </div>

          <div className="pipeline-status-bar">
            <div className="status-left">
              <Lock size={16} />
              <div className="status-text">
                <div className="status-bold">System-Wide Sovereign WASM Memory Execution</div>
                <div className="status-light">Nothing touches a disk. Nothing leaves your browser. Cryptographically guaranteed.</div>
              </div>
            </div>
            <button className="btn-verify-protocol">Verify Protocol Standard</button>
          </div>
        </div>
      </section>

      <section className="forensic-section">
        <div className="container">
          <div className="forensic-header text-center">
            <div className="section-pill-light">CRYPTOGRAPHIC VERIFICATION</div>
            <h2 className="section-title-white">EXPERIENCE FORENSIC SANITIZATION</h2>
            <p className="section-subtitle-white">
              An inspector tool to show exactly what data remains in the PDF streams. Ordinary black boxes leak data.<br/>
              REDACTLY purges the underlying data layer.
            </p>
          </div>

          <div className="forensic-window">
            <div className="fw-header">
              <div className="fw-tabs">
                <div className="fw-tab active">Sanitized (Clean)</div>
                <div className="fw-tab">Raw Original</div>
                <div className="fw-tab"><Lock size={12} className="inline mr-1"/> Protocol Logs</div>
              </div>
              <div className="fw-dots">
                <span className="dot gray"></span><span className="dot gray"></span><span className="dot gray"></span>
              </div>
            </div>
            <div className="fw-body">
              <div className="fw-row">
                <div className="fw-label">SANITIZED: BLACK BOX WITH UNDERLYING TEXT PURGED</div>
                <div className="fw-badge-red">DATA DESTROYED</div>
              </div>
              
              <div className="fw-content-box">
                <div className="fw-code-red">
                  /Length 124 /Filter /FlateDecode<br/>
                  stream<br/>
                  ...
                </div>
                <div className="fw-overlay-message">
                  <Lock size={16} className="inline mr-2"/>
                  Target text removed from byte stream.
                </div>
              </div>

              <div className="fw-row mt-4">
                <div className="fw-label">INSPECT METADATA</div>
                <div className="fw-meta-info">Document Author: [REDACTED_BY_POLICY_v1] • Producer: REDACTLY WASM</div>
              </div>
            </div>
          </div>
        </div>
      </section>


      <section className="cta-section">
        <div className="container">
          <div className="cta-content">
            <div className="section-pill-dark mx-auto">SECURE YOUR ORGANIZATION TODAY</div>
            <h2 className="cta-title">TAKE SOVEREIGN CONTROL OF YOUR SENSITIVE DATA TODAY.</h2>
            <p className="cta-subtitle">
              Join leading legal, financial, and healthcare institutions relying on REDACTLY to safely sanitize<br/>
              millions of documents securely in their own browsers.
            </p>
            <div className="cta-actions">
              <Link to="/editor" className="btn btn-primary-bright btn-large"><Shield size={16}/> START A PDF</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer-new">
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <div className="footer-left">
            <div className="brand-dark">
              <img src="/logo-white.png" alt="Redactly Logo" style={{ height: '48px', marginRight: '8px' }} />
            </div>
            <p className="footer-desc" style={{ marginBottom: '1rem' }}>Client-Side Zero-Leak Cryptographic Protocol</p>
            <div className="footer-company-details" style={{ fontSize: '0.8rem', color: '#888', lineHeight: '1.5' }}>
              <p style={{ color: '#ccc', fontWeight: '500', marginBottom: '4px' }}>
                Stratcrest - Visit @ <a href="https://www.stratcrest.online" target="_blank" rel="noreferrer" style={{ color: '#fff', textDecoration: 'underline' }}>www.stratcrest.online</a>
              </p>
              <p>CITTIC, CUSAT, Kalamassery, Kerala, India - 682022</p>
              <p>Contact: <a href="mailto:stratcrest.agency@gmail.com" style={{ color: '#888', textDecoration: 'underline' }}>stratcrest.agency@gmail.com</a></p>
              <p>Phone: +91 6282938648</p>
            </div>
          </div>
          <div className="footer-right">
            <div className="footer-links">
              <a href="#">Product</a>
              <a href="#">Security</a>
              <a href="#">Terms of Service</a>
              <a href="#">Privacy Policy</a>
              <a href="#">Contact</a>
            </div>
            <div className="footer-status">
              <span className="dot-green-small"></span> All Systems Operational
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
