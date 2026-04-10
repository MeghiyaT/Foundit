import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

let tokenProvider: (() => Promise<string | null>) | null = null;

/**
 * Register a dynamic token provider to fetch the latest token before every request.
 * Called from components that have access to useAuth() (like AuthGuard).
 */
export function setTokenProvider(provider: () => Promise<string | null>) {
  tokenProvider = provider;
}

// Intercept requests to dynamically inject the fresh token
api.interceptors.request.use(async (config) => {
  if (tokenProvider) {
    const token = await tokenProvider();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/sign-in';
    }
    return Promise.reject(error);
  }
);

export default api;
