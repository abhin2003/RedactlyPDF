const PROJECTS_KEY = 'redactly_projects';

// Helper to simulate network latency
const delay = (ms = 200) => new Promise(resolve => setTimeout(resolve, ms));

export const projectService = {
  getProjects: async () => {
    await delay();
    const data = localStorage.getItem(PROJECTS_KEY);
    if (!data) {
      // Seed initial demo data
      const initialProjects = [
        {
          id: 'proj-1',
          name: 'Apex Legal Documents',
          filesCount: 12,
          rulesCount: 8,
          lastModified: new Date().toISOString()
        },
        {
          id: 'proj-2',
          name: 'Financial Documents',
          filesCount: 24,
          rulesCount: 5,
          lastModified: new Date(Date.now() - 86400000).toISOString()
        }
      ];
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(initialProjects));
      return initialProjects;
    }
    return JSON.parse(data);
  },

  getProject: async (id) => {
    await delay();
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    return projects.find(p => p.id === id) || null;
  },

  createProject: async (name) => {
    await delay();
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    const newProject = {
      id: `proj-${Date.now()}`,
      name,
      filesCount: 0,
      rulesCount: 0,
      lastModified: new Date().toISOString()
    };
    projects.unshift(newProject);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    return newProject;
  },

  updateProjectStats: async (id, stats) => {
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    const updated = projects.map(p => {
      if (p.id === id) {
        return {
          ...p,
          ...stats,
          lastModified: new Date().toISOString()
        };
      }
      return p;
    });
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(updated));
  },

  deleteProject: async (id) => {
    await delay();
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    const filtered = projects.filter(p => p.id !== id);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(filtered));
    return true;
  },

  renameProject: async (id, newName) => {
    await delay();
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    const updated = projects.map(p => p.id === id ? { ...p, name: newName, lastModified: new Date().toISOString() } : p);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(updated));
    return true;
  }
};
