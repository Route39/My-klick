import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;
export const TOKEN_KEY = "myklick_token";

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use((r) => r, (err) => {
  const url = err?.config?.url || "";
  if (err?.response?.status === 401 && !url.includes("/auth/login")) {
    localStorage.removeItem(TOKEN_KEY);
    if (!window.location.pathname.startsWith("/login")) window.location.assign("/login");
  }
  return Promise.reject(err);
});

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default api;
