// Rules format: { id, projectId, query, action }

const getRulesKey = (projectId) => `redactly_rules_${projectId}`;
const delay = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));

export const ruleService = {
  getRules: async (projectId) => {
    await delay();
    const data = localStorage.getItem(getRulesKey(projectId));
    return data ? JSON.parse(data) : [];
  },

  addRule: async (projectId, rule) => {
    await delay();
    const rules = JSON.parse(localStorage.getItem(getRulesKey(projectId)) || '[]');
    const newRule = {
      id: `rule-${Date.now()}`,
      projectId,
      ...rule, // expects { query: string, action: string }
      createdAt: new Date().toISOString()
    };
    rules.push(newRule);
    localStorage.setItem(getRulesKey(projectId), JSON.stringify(rules));
    return newRule;
  },

  deleteRule: async (projectId, ruleId) => {
    await delay();
    const rules = JSON.parse(localStorage.getItem(getRulesKey(projectId)) || '[]');
    const updated = rules.filter(r => r.id !== ruleId);
    localStorage.setItem(getRulesKey(projectId), JSON.stringify(updated));
    return true;
  },

  updateRule: async (projectId, ruleId, updates) => {
    await delay();
    const rules = JSON.parse(localStorage.getItem(getRulesKey(projectId)) || '[]');
    const updated = rules.map(r => r.id === ruleId ? { ...r, ...updates } : r);
    localStorage.setItem(getRulesKey(projectId), JSON.stringify(updated));
    return true;
  }
};
