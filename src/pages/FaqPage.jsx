import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, ChevronDown, ChevronUp } from 'lucide-react';
import './LandingPage.css';

const faqs = [
  {
    question: "How does Redactly ensure my documents aren't leaked?",
    answer: "Redactly is built on a Zero-Trust, 100% Client-Side architecture. Your PDFs never leave your browser, and no data is ever uploaded to our servers or sent to any cloud API. The redaction happens locally using WebAssembly."
  },
  {
    question: "Can redacted text be uncovered or reversed?",
    answer: "No. If you use the 'Permanent Redact', 'Replace Synthetic', or 'Remove Element' options, the underlying text, vectors, and metadata are cryptographically purged from the PDF data stream. It is completely unrecoverable."
  },
  {
    question: "What is the 'Visual Mask' option?",
    answer: "Visual Mask applies a translucent color overlay to the text without removing the underlying characters. This is useful for internal team reviews where you want to highlight sensitive areas without permanently destroying the data."
  },
  {
    question: "Does Redactly process scanned documents or images?",
    answer: "Currently, Redactly processes native PDF text and vector data. It does not perform OCR on flattened images or scanned JPEGs embedded in PDFs, though you can still manually draw redaction boxes over them."
  },
  {
    question: "Do I need to install any software?",
    answer: "No installation is required. Redactly runs entirely inside modern web browsers (Chrome, Edge, Firefox, Safari) using advanced WebAssembly execution."
  },
  {
    question: "What compliance standards does Redactly help me meet?",
    answer: "Because we never touch or host your data, Redactly seamlessly integrates into strict SOC2, HIPAA, GDPR, CCPA, and FINRA environments by removing the sub-processor risk entirely."
  },
  {
    question: "Is there a limit on PDF file size?",
    answer: "Since processing happens on your own device, the file size limit depends entirely on your computer's available RAM. Modern browsers can comfortably handle PDFs up to 500MB+ locally."
  },
  {
    question: "Can I undo a redaction if I make a mistake?",
    answer: "Yes! Our robust time-travel undo/redo stack allows you to instantly revert changes while you are working in the editor. However, once you export and download the final PDF, the purged data is gone forever."
  },
  {
    question: "How does 'Replace Synthetic' work?",
    answer: "This architecture completely wipes the original sensitive entity (like a name or ID number) and replaces it with a generic [SYNTHETIC] placeholder, ensuring the document remains readable but sanitized."
  },
  {
    question: "Who is behind Redactly?",
    answer: "Redactly is developed by Stratcrest, an agency operating out of CITTIC, CUSAT in Kerala, India. We specialize in zero-trust secure data handling solutions for enterprises."
  }
];

const FaqPage = () => {
  const [openIndex, setOpenIndex] = useState(null);

  const toggleFaq = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="landing-page">
      <div className="faq-header" style={{ backgroundColor: '#0a0a0a', position: 'relative', height: '80px' }}>
        <nav className="navbar container">
          <Link to="/" className="brand" style={{ textDecoration: 'none' }}>
            <img src="/logo-white.png" alt="Redactly Logo" className="brand-logo" />
          </Link>
          <div className="nav-links">
            <Link to="/">Home</Link>
            <Link to="/editor">Editor</Link>
          </div>
          <div className="nav-actions">
            <Link to="/editor" className="btn btn-primary-nav">Try REDACTLY</Link>
          </div>
          <button className="mobile-menu-btn"><Menu /></button>
        </nav>
      </div>

      <section className="faq-section" style={{ padding: '8rem 0 4rem', backgroundColor: '#f9f9f9', minHeight: '80vh' }}>
        <div className="container" style={{ maxWidth: '800px' }}>
          <div className="text-center mb-12">
            <h1 className="section-title-dark">Frequently Asked Questions</h1>
            <p className="section-subtitle-dark mx-auto" style={{ marginTop: '1rem', color: '#666' }}>
              Everything you need to know about our sovereign redaction protocol.
            </p>
          </div>

          <div className="faq-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {faqs.map((faq, index) => (
              <div 
                key={index} 
                className="faq-item" 
                style={{ 
                  backgroundColor: 'white', 
                  borderRadius: '12px', 
                  border: '1px solid #eaeaea',
                  overflow: 'hidden'
                }}
              >
                <button 
                  className="faq-question" 
                  onClick={() => toggleFaq(index)}
                  style={{ 
                    width: '100%', 
                    padding: '1.5rem', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    background: 'none', 
                    border: 'none', 
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    color: '#333'
                  }}
                >
                  {faq.question}
                  {openIndex === index ? <ChevronUp size={20} color="var(--green-primary)" /> : <ChevronDown size={20} color="var(--green-primary)" />}
                </button>
                {openIndex === index && (
                  <div className="faq-answer" style={{ padding: '0 1.5rem 1.5rem', color: '#666', lineHeight: '1.6' }}>
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
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
              <Link to="/">Home</Link>
              <Link to="/editor">Editor</Link>
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

export default FaqPage;
