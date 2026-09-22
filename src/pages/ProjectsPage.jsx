import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { projectService } from '../services/projectService';
import { Folder, Plus, Search, FileText, Settings, LogOut, Clock, Shield, User, Edit2, Trash2 } from 'lucide-react';
import './ProjectsPage.css';

const ProjectsPage = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeDropdown, setActiveDropdown] = useState(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadProjects();
    
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const loadProjects = async () => {
    const data = await projectService.getProjects();
    setProjects(data);
    setLoading(false);
  };

  const handleCreateProject = async () => {
    const name = prompt("Enter new project name:");
    if (name?.trim()) {
      const newProj = await projectService.createProject(name.trim());
      setProjects([newProj, ...projects]);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleRename = async (project) => {
    setActiveDropdown(null);
    const newName = prompt("Enter new project name:", project.name);
    if (newName && newName.trim() !== project.name) {
      await projectService.renameProject(project.id, newName.trim());
      loadProjects();
    }
  };

  const handleDelete = async (project) => {
    setActiveDropdown(null);
    if (window.confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`)) {
      await projectService.deleteProject(project.id);
      loadProjects();
    }
  };

  const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return date.toLocaleDateString();
  };

  return (
    <div className="projects-page">
      <nav className="projects-nav">
        <div className="nav-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none' }}>
          <div style={{ width: '40px', height: '40px', overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
            <img src="/logo-dark.png" alt="Redactly Icon" style={{ width: '130%', height: 'auto', marginTop: '-5%' }} />
          </div>
          <span style={{ color: 'var(--green-primary)', fontWeight: '900', fontSize: '1.75rem', letterSpacing: '-0.5px' }}>REDACTLY</span>
        </div>
        <div className="nav-user">
          <div className="user-profile">
            <div className="user-avatar">
              <User size={18} />
            </div>
            <span className="user-email">{user?.email}</span>
          </div>
          <button className="btn btn-outline-dark btn-sm logout-btn" onClick={handleLogout}>
            <LogOut size={16} /> LOG OUT
          </button>
        </div>
      </nav>

      <main className="projects-main container">
        <div className="projects-header">
          <h1 className="page-title">Projects Workspace</h1>
          <div className="header-actions">
            <div className="search-box">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder="Search projects..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" onClick={handleCreateProject} style={{ padding: '0.75rem 1.5rem', fontWeight: 'bold' }}>
              <Plus size={18} className="mr-2" /> NEW PROJECT
            </button>
          </div>
        </div>

        {loading ? (
          <div className="projects-loading">Loading workspace...</div>
        ) : (
          <div className="projects-grid">
            {filteredProjects.map(project => (
              <div 
                key={project.id} 
                className="project-card"
                onClick={() => navigate(`/project/${project.id}`)}
              >
                <div className="project-card-header" style={{ position: 'relative' }}>
                  <Folder size={24} className="folder-icon" />
                  <button 
                    className="icon-btn-subtle" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveDropdown(activeDropdown === project.id ? null : project.id);
                    }}
                  >
                    <Settings size={16}/>
                  </button>
                  {activeDropdown === project.id && (
                    <div className="settings-dropdown" onClick={(e) => e.stopPropagation()}>
                      <button className="dropdown-item" onClick={() => handleRename(project)}>
                        <Edit2 size={14} className="mr-2" /> Rename
                      </button>
                      <button className="dropdown-item text-danger" onClick={() => handleDelete(project)}>
                        <Trash2 size={14} className="mr-2" /> Delete
                      </button>
                    </div>
                  )}
                </div>
                <h3 className="project-name">{project.name}</h3>
                <div className="project-stats">
                  <span className="stat"><FileText size={14}/> {project.filesCount} files</span>
                  <span className="stat"><Shield size={14}/> {project.rulesCount} masking rules</span>
                </div>
                <div className="project-footer">
                  <Clock size={12} className="mr-1"/> Last modified: {formatDate(project.lastModified)}
                </div>
              </div>
            ))}
            
            {filteredProjects.length === 0 && (
              <div className="empty-state">
                <Folder size={48} className="empty-icon" />
                <h3>No projects found</h3>
                <p>Create a new project to start redacting documents.</p>
                <button className="btn btn-primary mt-4" onClick={handleCreateProject}>
                  <Plus size={18} className="mr-2" /> CREATE FIRST PROJECT
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ProjectsPage;
