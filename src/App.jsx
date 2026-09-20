import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import EditorPage from './pages/EditorPage';
import FaqPage from './pages/FaqPage';
import { PdfProvider } from './context/PdfContext';

function App() {
  return (
    <PdfProvider>
      <Router>
        <div className="app-container">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/faq" element={<FaqPage />} />
          </Routes>
        </div>
      </Router>
    </PdfProvider>
  );
}

export default App;
