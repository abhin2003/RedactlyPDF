import React, { createContext, useContext, useState } from 'react';

const PdfContext = createContext();

export const usePdfContext = () => useContext(PdfContext);

export const PdfProvider = ({ children }) => {
  const [documents, setDocuments] = useState([]);
  const [activeDocId, setActiveDocId] = useState(null);

  const addDocument = (name, buffer) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    setDocuments(prev => [...prev, { id, name, buffer }]);
    setActiveDocId(id);
    return id;
  };

  const removeDocument = (id) => {
    setDocuments(prev => {
      const next = prev.filter(d => d.id !== id);
      if (activeDocId === id) {
         setActiveDocId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  };

  const updateDocumentBuffer = (id, newBuffer) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, buffer: newBuffer } : d));
  };

  const activeDocument = documents.find(d => d.id === activeDocId);

  return (
    <PdfContext.Provider
      value={{
        documents,
        setDocuments,
        activeDocId,
        setActiveDocId,
        activeDocument,
        addDocument,
        removeDocument,
        updateDocumentBuffer
      }}
    >
      {children}
    </PdfContext.Provider>
  );
};
