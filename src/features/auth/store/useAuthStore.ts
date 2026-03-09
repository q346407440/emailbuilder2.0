import { create } from 'zustand';
import { setAuthToken, setOnUnauthorized } from '@shared/api/authToken';
import {
  serverLogin,
  serverRegister,
  serverGetMe,
  serverUpdateProfile,
  serverChangePassword,
  type AuthUser,
} from '@shared/api/serverApi';
import { toast } from '@shared/store/useToastStore';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  /** 仅用于同步后端返回的用户信息（如更新 defaultTemplateId 后） */
  setUser: (user: AuthUser | null) => void;
  updateProfile: (data: { displayName?: string | null; avatarUrl?: string | null }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const STORAGE_KEY = 'email_editor_token';

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getApiBaseUrl(): string {
  const url = (import.meta.env as Record<string, string>).VITE_API_BASE_URL;
  if (url) return url.replace(/\/$/, '');
  if (import.meta.env.DEV) return 'http://localhost:3001';
  return '';
}

/** 嘗試用 httpOnly cookie 中的 refresh token 換取新 access token */
async function tryRefreshToken(): Promise<string | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    return data?.token ?? null;
  } catch {
    return null;
  }
}

let isHandlingUnauthorized = false;

export const useAuthStore = create<AuthState>((set, get) => {
  setOnUnauthorized(async () => {
    // Prevent re-entrant calls
    if (isHandlingUnauthorized) return;
    isHandlingUnauthorized = true;

    try {
      // Try silent refresh first
      const newToken = await tryRefreshToken();
      if (newToken) {
        setAuthToken(newToken);
        set({ token: newToken });
        try { localStorage.setItem(STORAGE_KEY, newToken); } catch { /* noop */ }
        return; // Refresh succeeded — keep user logged in
      }
    } finally {
      isHandlingUnauthorized = false;
    }

    // Refresh failed — do full logout
    set({ user: null, token: null });
    setAuthToken(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    toast('请重新登录', 'info');
  });

  return {
    user: null,
    token: readStoredToken(),
    isLoading: true,

    login: async (email, password) => {
      const { token, user } = await serverLogin(email, password);
      setAuthToken(token);
      set({ user, token });
      try { localStorage.setItem(STORAGE_KEY, token); } catch { /* noop */ }
      toast('登录成功', 'success');
    },

    register: async (email, password, displayName) => {
      const { token, user } = await serverRegister(email, password, displayName);
      setAuthToken(token);
      set({ user, token });
      try { localStorage.setItem(STORAGE_KEY, token); } catch { /* noop */ }
      toast('注册成功', 'success');
    },

    logout: () => {
      // Call backend to revoke refresh token (fire-and-forget)
      const currentToken = get().token;
      if (currentToken) {
        fetch(`${getApiBaseUrl()}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include',
          headers: { Authorization: `Bearer ${currentToken}` },
        }).catch(() => { /* noop — logout best-effort */ });
      }

      set({ user: null, token: null });
      setAuthToken(null);
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
      toast('已退出登录', 'info');
    },

    loadUser: async () => {
      const token = get().token ?? readStoredToken();
      if (!token) {
        set({ isLoading: false });
        return;
      }
      setAuthToken(token);
      try {
        const user = await serverGetMe();
        set({ user, token: user ? token : null, isLoading: false });
        if (!user) {
          setAuthToken(null);
          try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
        }
      } catch {
        // Try to refresh before giving up
        const newToken = await tryRefreshToken();
        if (newToken) {
          setAuthToken(newToken);
          set({ token: newToken });
          try { localStorage.setItem(STORAGE_KEY, newToken); } catch { /* noop */ }
          try {
            const user = await serverGetMe();
            set({ user, isLoading: false });
            return;
          } catch { /* noop */ }
        }
        set({ user: null, token: null, isLoading: false });
        setAuthToken(null);
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
      }
    },

    setUser: (user) => set({ user }),

    updateProfile: async (data) => {
      const user = await serverUpdateProfile(data);
      set({ user });
      toast('保存成功', 'success');
    },

    changePassword: async (currentPassword, newPassword) => {
      await serverChangePassword(currentPassword, newPassword);
      toast('密码已修改', 'success');
    },
  };
});
