/**
 * 調用 Shoplazza Get Shop API 驗證店鋪域名與 Token。
 * 文檔: https://www.shoplazza.dev/reference/shopapi_getshop-2
 */

export interface ShoplazzaShopInfo {
  shopId: string;
  shopName: string;
  shopUrl: string;
}

export interface ShoplazzaProductSummary {
  id: string;
  title: string;
  handle: string;
  imageUrl: string;
  price: string;
  compareAtPrice: string;
  url: string;
}

export interface FetchShoplazzaProductsResult {
  products: ShoplazzaProductSummary[];
  cursor: string | null;
  preCursor: string | null;
}

const SHOPLAZZA_API_TIMEOUT_MS = Number(process.env.SHOPLAZZA_API_TIMEOUT_MS ?? 12000);

function normalizeDomain(domain: string): string {
  let d = domain.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return d;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = SHOPLAZZA_API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`请求 Shoplazza 超时（>${timeoutMs}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 請求 GET https://{domain}/openapi/2025-06/shop
 * Header: access-token（Shoplazza 使用 access-token，非 Authorization: Bearer）
 * 返回店鋪信息或拋出錯誤。
 */
export async function fetchShoplazzaShop(domain: string, token: string): Promise<ShoplazzaShopInfo> {
  const normalized = normalizeDomain(domain);
  if (!normalized) throw new Error('店鋪域名不能為空');

  const url = `https://${normalized}/openapi/2025-06/shop`;
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'access-token': token,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `授權失敗（${res.status}）`;
    try {
      const json = JSON.parse(text) as { error?: string; errors?: string[] };
      if (typeof json.error === 'string') msg = json.error;
      else if (Array.isArray(json.errors) && json.errors[0]) msg = json.errors[0];
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }

  const body = (await res.json()) as unknown;
  // 兼容多種返回結構：data.shop / data（即 data 即店鋪對象）/ shop / 根級 id,name,domain
  const data = (body as { data?: unknown }).data;
  const shop =
    (typeof data === 'object' && data !== null && (data as Record<string, unknown>).shop != null)
      ? (data as Record<string, unknown>).shop
      : (typeof data === 'object' && data !== null && ((data as Record<string, unknown>).id != null || (data as Record<string, unknown>).name != null))
        ? data
        : (body as { shop?: unknown }).shop ?? body;
  const obj = typeof shop === 'object' && shop !== null ? (shop as Record<string, unknown>) : {};

  const shopId = String(obj.id ?? obj.shop_id ?? '');
  const shopName = String(obj.name ?? obj.shop_name ?? obj.title ?? normalized);
  const shopUrl = String(obj.domain ?? obj.shop_url ?? obj.url ?? obj.root_url ?? normalized);

  if (!shopId) throw new Error('授權失敗：無法獲取店鋪信息');

  return {
    shopId,
    shopName,
    shopUrl: shopUrl || normalized,
  };
}

export async function fetchShoplazzaProducts(
  domain: string,
  token: string,
  options?: { search?: string; cursor?: string; limit?: number }
): Promise<FetchShoplazzaProductsResult> {
  const normalized = normalizeDomain(domain);
  if (!normalized) throw new Error('店铺域名不能为空');

  const params = new URLSearchParams();
  const limit = Math.max(1, Math.min(50, options?.limit ?? 20));
  params.set('per_page', String(limit));
  if (options?.search?.trim()) params.set('title', options.search.trim());
  if (options?.cursor?.trim()) params.set('cursor', options.cursor.trim());

  const url = `https://${normalized}/openapi/2025-06/products?${params.toString()}`;
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'access-token': token,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `获取商品失败（${res.status}）`);
  }

  const body = (await res.json()) as {
    data?: {
      products?: Array<Record<string, unknown>>;
      cursor?: string | null;
      pre_cursor?: string | null;
    };
  };
  const rawProducts = body.data?.products ?? [];

  const products: ShoplazzaProductSummary[] = rawProducts.map((p) => {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const firstVariant = (variants[0] ?? {}) as Record<string, unknown>;
    const primaryImage =
      typeof p.primary_image === 'object' && p.primary_image != null
        ? (p.primary_image as Record<string, unknown>)
        : null;
    const imageUrl =
      (typeof primaryImage?.src === 'string' && primaryImage.src) ||
      (Array.isArray(p.images) &&
      p.images[0] &&
      typeof (p.images[0] as Record<string, unknown>).src === 'string'
        ? String((p.images[0] as Record<string, unknown>).src)
        : '');
    const price =
      firstVariant.price != null
        ? String(firstVariant.price)
        : p.price_min != null
          ? String(p.price_min)
          : '';
    const compareAtPrice =
      firstVariant.compare_at_price != null
        ? String(firstVariant.compare_at_price)
        : p.compare_at_price_min != null
          ? String(p.compare_at_price_min)
          : '';

    return {
      id: String(p.id ?? ''),
      title: String(p.title ?? ''),
      handle: String(p.handle ?? ''),
      imageUrl,
      price,
      compareAtPrice,
      url: String(p.url ?? (p.handle ? `/products/${String(p.handle)}` : '')),
    };
  }).filter((p) => p.id);

  return {
    products,
    cursor: body.data?.cursor ?? null,
    preCursor: body.data?.pre_cursor ?? null,
  };
}

export { normalizeDomain };

// ─── Customers (for contact sync) ────────────────────────────────────────────

export interface ShoplazzaCustomer {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  accepts_marketing: boolean;
  created_at: string;
}

export interface FetchShoplazzaCustomersResult {
  customers: ShoplazzaCustomer[];
  nextPage: number | null;
  total: number;
}

/**
 * 獲取 Shoplazza 聯繫人（分頁）
 * GET https://{domain}/openapi/2025-06/customers?page={page}&per_page=250
 */
export async function fetchShoplazzaCustomers(
  domain: string,
  token: string,
  page = 1,
  perPage = 250
): Promise<FetchShoplazzaCustomersResult> {
  const normalized = normalizeDomain(domain);
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(Math.min(perPage, 250)),
  });
  const url = `https://${normalized}/openapi/2025-06/customers?${params.toString()}`;

  const res = await fetchWithTimeout(url, {
    headers: { accept: 'application/json', 'access-token': token },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch customers (${res.status}): ${text.slice(0, 200)}`);
  }

  const body = (await res.json()) as {
    data?: {
      customers?: unknown[];
      total?: number;
      page?: number;
      per_page?: number;
    };
  };

  const rawCustomers = body.data?.customers ?? [];
  const total = body.data?.total ?? rawCustomers.length;

  const customers: ShoplazzaCustomer[] = rawCustomers.map((c) => {
    const obj = typeof c === 'object' && c !== null ? (c as Record<string, unknown>) : {};
    return {
      id: String(obj.id ?? ''),
      email: String(obj.email ?? ''),
      first_name: obj.first_name != null ? String(obj.first_name) : null,
      last_name: obj.last_name != null ? String(obj.last_name) : null,
      phone: obj.phone != null ? String(obj.phone) : null,
      accepts_marketing: Boolean(obj.accepts_marketing ?? true),
      created_at: String(obj.created_at ?? ''),
    };
  }).filter((c) => c.id && c.email);

  const hasMore = rawCustomers.length >= perPage;
  return {
    customers,
    nextPage: hasMore ? page + 1 : null,
    total,
  };
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export interface ShoplazzaWebhook {
  id: string;
  topic: string;
  address: string;
  created_at: string;
}

/**
 * 在 Shoplazza 店鋪訂閱一個 Webhook
 * POST https://{domain}/openapi/2025-06/webhooks
 */
export async function subscribeShoplazzaWebhook(
  domain: string,
  token: string,
  topic: string,
  address: string
): Promise<ShoplazzaWebhook> {
  const normalized = normalizeDomain(domain);
  const url = `https://${normalized}/openapi/2025-06/webhooks`;

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'access-token': token,
    },
    body: JSON.stringify({ webhook: { topic, address } }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to subscribe webhook ${topic} (${res.status}): ${text.slice(0, 200)}`);
  }

  const body = (await res.json()) as { data?: { webhook?: Record<string, unknown> } };
  const webhook = body.data?.webhook ?? body as unknown as Record<string, unknown>;
  const obj = typeof webhook === 'object' && webhook !== null ? (webhook as Record<string, unknown>) : {};

  return {
    id: String(obj.id ?? ''),
    topic: String(obj.topic ?? topic),
    address: String(obj.address ?? address),
    created_at: String(obj.created_at ?? ''),
  };
}

/**
 * 列出 Shoplazza 店鋪已訂閱的 Webhooks
 * GET https://{domain}/openapi/2025-06/webhooks
 */
export async function listShoplazzaWebhooks(domain: string, token: string): Promise<ShoplazzaWebhook[]> {
  const normalized = normalizeDomain(domain);
  const url = `https://${normalized}/openapi/2025-06/webhooks`;

  const res = await fetchWithTimeout(url, {
    headers: { accept: 'application/json', 'access-token': token },
  });
  if (!res.ok) return [];

  const body = (await res.json()) as { data?: { webhooks?: unknown[] } };
  const rawList = body.data?.webhooks ?? [];

  return rawList.map((w) => {
    const obj = typeof w === 'object' && w !== null ? (w as Record<string, unknown>) : {};
    return {
      id: String(obj.id ?? ''),
      topic: String(obj.topic ?? ''),
      address: String(obj.address ?? ''),
      created_at: String(obj.created_at ?? ''),
    };
  }).filter((w) => w.id);
}

/**
 * 刪除 Shoplazza 店鋪已訂閱的 Webhook
 * DELETE https://{domain}/openapi/2025-06/webhooks/{id}
 */
export async function deleteShoplazzaWebhook(domain: string, token: string, webhookId: string): Promise<void> {
  const normalized = normalizeDomain(domain);
  const url = `https://${normalized}/openapi/2025-06/webhooks/${webhookId}`;
  await fetchWithTimeout(url, {
    method: 'DELETE',
    headers: { 'access-token': token },
  });
}
