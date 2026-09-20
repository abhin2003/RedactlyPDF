import React, { useEffect, useRef } from 'react';

const PageThumbnail = ({ pdfDocument, pageNumber, isActive, onClick }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return;
    let renderTask = null;

    const renderThumb = async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 0.3 }); // Small scale for thumbnail
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
          console.error(`Error rendering thumbnail page ${pageNumber}`, error);
        }
      }
    };

    renderThumb();

    return () => {
      if (renderTask) renderTask.cancel();
    };
  }, [pdfDocument, pageNumber]);

  return (
    <div className={`page-thumbnail ${isActive ? 'active' : ''}`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="page-thumb-header">
        <span className={`page-num ${isActive ? 'font-bold' : ''}`}>PAGE {pageNumber} {isActive ? '(CURRENT)' : ''}</span>
      </div>
      <div className={`page-preview ${isActive ? 'outline-green' : ''}`} style={{ padding: 0, overflow: 'hidden' }}>
        <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />
      </div>
    </div>
  );
};

export default PageThumbnail;
