import { create } from 'zustand';
import {
  serverListShops,
  serverAuthorizeShop,
  serverSetLastShop,
  serverDisconnectShop,
  type AuthorizedShop,
} from '@shared/api/serverApi';
import { toast } from './useToastStore';

interface ShopState {
  shops: AuthorizedShop[];
  lastSelectedId: string | null;
  currentShopId: string | null;
  loading: boolean;
  error: string | null;
  loadShops: () => Promise<void>;
  authorize: (domain: string, token: string) => Promise<void>;
  setCurrentShop: (shopId: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
}

export const useShopStore = create<ShopState>((set, get) => ({
  shops: [],
  lastSelectedId: null,
  currentShopId: null,
  loading: false,
  error: null,

  loadShops: async () => {
    set({ loading: true, error: null });
    try {
      const { shops, lastSelectedId } = await serverListShops();
      const current =
        lastSelectedId && shops.some((s) => s.id === lastSelectedId)
          ? lastSelectedId
          : shops[0]?.id ?? null;
      set({ shops, lastSelectedId, currentShopId: current, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载店铺列表失败';
      set({ error: message, loading: false });
    }
  },

  authorize: async (domain: string, token: string) => {
    try {
      await serverAuthorizeShop(domain.trim(), token.trim());
      toast('授权成功', 'success');
      await get().loadShops();
    } catch (err) {
      const message = err instanceof Error ? err.message : '授权失败';
      toast(message, 'error');
      throw err;
    }
  },

  setCurrentShop: async (shopId: string) => {
    const { shops } = get();
    if (!shops.some((s) => s.id === shopId)) return;
    set({ currentShopId: shopId, lastSelectedId: shopId });
    try {
      await serverSetLastShop(shopId);
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存选择失败';
      toast(message, 'error');
    }
  },

  disconnect: async (id: string) => {
    try {
      await serverDisconnectShop(id);
      toast('已解除店铺授权', 'success');
      const { shops, currentShopId } = get();
      const remaining = shops.filter((s) => s.id !== id);
      const newCurrent =
        currentShopId === id
          ? remaining[0]?.id ?? null
          : currentShopId;
      set({ shops: remaining, currentShopId: newCurrent, lastSelectedId: newCurrent ?? get().lastSelectedId });
      if (newCurrent != null && newCurrent !== currentShopId) {
        try {
          await serverSetLastShop(newCurrent);
        } catch {
          /* 更新上次選中失敗不影響 UI */
        }
      }
      await get().loadShops();
    } catch (err) {
      const message = err instanceof Error ? err.message : '解除授权失败';
      toast(message, 'error');
    }
  },
}));
