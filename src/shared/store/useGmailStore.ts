import { create } from 'zustand';
import {
  serverListGmailAccounts,
  serverDisconnectGmailAccount,
  serverSetLastGmailAccount,
  serverGetGmailOAuthPending,
  getGmailConnectUrl,
  type GmailAccount,
} from '@shared/api/serverApi';
import { toast } from './useToastStore';

const GMAIL_ERROR_MESSAGES: Record<string, string> = {
  missing_params: '授权参数缺失',
  invalid_state: '授权状态无效，请重试',
  token_exchange_failed: '授权码交换失败',
  no_refresh_token: '未获得刷新令牌，请重试',
  profile_fetch_failed: '获取 Gmail 信息失败',
  access_denied: '您已取消授权',
};

let pollTimerId: ReturnType<typeof setInterval> | null = null;
let popupRef: Window | null = null;

interface GmailState {
  accounts: GmailAccount[];
  lastSelectedId: string | null;
  currentGmailId: string | null;
  loading: boolean;
  connecting: boolean;
  loadAccounts: () => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  setCurrentGmail: (id: string) => Promise<void>;
  startConnect: () => void;
  stopConnect: () => void;
}

export const useGmailStore = create<GmailState>((set, get) => ({
  accounts: [],
  lastSelectedId: null,
  currentGmailId: null,
  loading: false,
  connecting: false,

  loadAccounts: async () => {
    set({ loading: true });
    try {
      const { accounts, lastSelectedGmailId } = await serverListGmailAccounts();
      const lastInList = lastSelectedGmailId && accounts.some((a) => a.id === lastSelectedGmailId);
      const current = lastInList ? lastSelectedGmailId : (accounts[0]?.id ?? null);
      set({ accounts, lastSelectedId: lastSelectedGmailId, currentGmailId: current, loading: false });
      // 默認選中：無上次選擇或上次不在列表中時選中第一個，並寫回後端（與店鋪授權一致）
      if (current && !lastInList) {
        try {
          await serverSetLastGmailAccount(current);
          set({ lastSelectedId: current });
        } catch {
          /* 寫回失敗不影響 UI */
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载 Gmail 账号列表失败';
      toast(message, 'error');
      set({ loading: false });
    }
  },

  disconnect: async (id: string) => {
    try {
      await serverDisconnectGmailAccount(id);
      toast('已解除 Gmail 授权', 'success');
      await get().loadAccounts();
    } catch (err) {
      const message = err instanceof Error ? err.message : '解除授权失败';
      toast(message, 'error');
    }
  },

  setCurrentGmail: async (id: string) => {
    const { accounts } = get();
    if (!accounts.some((a) => a.id === id)) return;
    set({ currentGmailId: id, lastSelectedId: id });
    try {
      await serverSetLastGmailAccount(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存选择失败';
      toast(message, 'error');
    }
  },

  startConnect: () => {
    if (get().connecting) return;
    const url = getGmailConnectUrl();
    const popup = window.open(url, 'gmail_oauth', 'width=600,height=700,scrollbars=yes');
    if (!popup) {
      toast('请允许弹窗后重试', 'error');
      return;
    }
    popupRef = popup;
    set({ connecting: true });
    if (pollTimerId) clearInterval(pollTimerId);
    pollTimerId = setInterval(async () => {
      if (popupRef?.closed) {
        if (pollTimerId) clearInterval(pollTimerId);
        pollTimerId = null;
        popupRef = null;
        set({ connecting: false });
        toast('已取消', 'info');
        return;
      }
      try {
        const result = await serverGetGmailOAuthPending();
        if (result.status === 'pending') return;
        if (pollTimerId) clearInterval(pollTimerId);
        pollTimerId = null;
        const win = popupRef;
        popupRef = null;
        set({ connecting: false });
        try {
          win?.close();
        } catch {
          /* ignore */
        }
        await get().loadAccounts();
        if (result.status === 'completed') {
          toast(result.email ? `Gmail 授权成功：${result.email}` : 'Gmail 授权成功', 'success');
        } else {
          const msg = result.errorCode ? GMAIL_ERROR_MESSAGES[result.errorCode] ?? result.errorCode : '授权失败';
          toast(msg, 'error');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('请重新登录') || msg.includes('401')) {
          if (pollTimerId) clearInterval(pollTimerId);
          pollTimerId = null;
          popupRef = null;
          set({ connecting: false });
        }
      }
    }, 1000);
  },

  stopConnect: () => {
    if (pollTimerId) clearInterval(pollTimerId);
    pollTimerId = null;
    popupRef = null;
    set({ connecting: false });
  },
}));
