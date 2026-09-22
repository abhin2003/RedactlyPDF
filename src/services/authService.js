// TODO: Replace frontend demo authentication with secure backend authentication before production.
// This is intentionally a prototype/demo authentication system.

const AUTH_KEY = 'redactly_auth';

export const authService = {
  login: async (email, password) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (email === 'abhin@gmail.com' && password === 'abhin12345') {
      const user = {
        id: 'demo-user-1',
        email: 'abhin@gmail.com',
        name: 'Abhin'
      };
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
      return { success: true, user };
    }
    
    return { success: false, error: 'Invalid email or password.' };
  },

  logout: () => {
    sessionStorage.removeItem(AUTH_KEY);
  },

  isAuthenticated: () => {
    return !!sessionStorage.getItem(AUTH_KEY);
  },

  getUser: () => {
    const data = sessionStorage.getItem(AUTH_KEY);
    return data ? JSON.parse(data) : null;
  }
};
