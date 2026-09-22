import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield } from 'lucide-react';
import './LoginPage.css';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    // TODO: Replace frontend demo authentication with secure backend authentication before production.
    const result = await login(email, password);
    
    setIsSubmitting(false);
    
    if (result.success) {
      navigate('/projects');
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <img src="/logo-dark.png" alt="Redactly Logo" className="login-logo" />
          <p className="login-subtitle">Client-Side PDF Redaction & Sanitization</p>
        </div>
        
        <form className="login-form" onSubmit={handleLogin}>
          {error && <div className="login-error">{error}</div>}
          
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input 
              type="email" 
              id="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="abhin@gmail.com"
              required 
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input 
              type="password" 
              id="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="••••••••"
              required 
            />
          </div>
          
          <button type="submit" className="btn btn-primary login-btn" disabled={isSubmitting}>
            {isSubmitting ? 'SIGNING IN...' : 'SIGN IN'}
          </button>
        </form>
        
        <div className="login-footer">
          <Shield size={14} className="inline mr-1" />
          <span>Prototype Authentication System</span>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
