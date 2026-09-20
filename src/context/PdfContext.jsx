import React, { createContext, useContext, useState } from 'react';

const PdfContext = createContext();

export const usePdfContext = () => useContext(PdfContext);

export const PdfProvider = ({ children }) => {
  const [pdfFile, setPdfFile] = useState(null); // Will hold the ArrayBuffer or File
  const [pdfFileName, setPdfFileName] = useState('');
  const [activePage, setActivePage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [redactionAnnotations, setRedactionAnnotations] = useState([]); // { page, x, y, width, height, type }
  const [zoomLevel, setZoomLevel] = useState(1);

  const addRedaction = (redaction) => {
    setRedactionAnnotations(prev => [...prev, redaction]);
  };

  const removeRedaction = (index) => {
    setRedactionAnnotations(prev => prev.filter((_, i) => i !== index));
  };

  const clearRedactions = () => {
    setRedactionAnnotations([]);
  };

  return (
    <PdfContext.Provider
      value={{
        pdfFile,
        setPdfFile,
        pdfFileName,
        setPdfFileName,
        activePage,
        setActivePage,
        totalPages,
        setTotalPages,
        redactionAnnotations,
        addRedaction,
        removeRedaction,
        clearRedactions,
        zoomLevel,
        setZoomLevel
      }}
    >
      {children}
    </PdfContext.Provider>
  );
};
