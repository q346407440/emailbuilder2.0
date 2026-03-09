import { useCallback, useEffect, useMemo, useState } from 'react';
import { serverListShopProducts, type ShopProductSummary } from '@shared/api/serverApi';
import { toast } from '@shared/store/useToastStore';
import ImageLightbox from '@shared/ui/ImageLightbox';
import styles from './ProductSelector.module.css';

interface Props {
  shopId: string | null;
  maxSelectable: number;
  selectedProducts: ShopProductSummary[];
  onChange: (products: ShopProductSummary[]) => void;
  variant?: 'panel' | 'modal';
}

export default function ProductSelector({
  shopId,
  maxSelectable,
  selectedProducts,
  onChange,
  variant = 'panel',
}: Props) {
  const [search, setSearch] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // pageCursors[n] 表示第 n+1 页请求时需要携带的 cursor；第一页固定为 null
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([null]);
  const [currentPage, setCurrentPage] = useState(1);
  const [products, setProducts] = useState<ShopProductSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);

  const selectedMap = useMemo(() => new Map(selectedProducts.map((p) => [p.id, p])), [selectedProducts]);

  const loadProducts = useCallback(
    async (requestCursor: string | null, keyword: string) => {
      if (!shopId) {
        setProducts([]);
        setNextCursor(null);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await serverListShopProducts(shopId, {
          search: keyword,
          cursor: requestCursor ?? undefined,
          limit: 20,
        });
        setProducts(res.products);
        setNextCursor(res.cursor);
      } catch (err) {
        const message = err instanceof Error ? err.message : '加载商品失败';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [shopId]
  );

  const submitSearch = useCallback(() => {
    const nextKeyword = search.trim();
    setCommittedSearch(nextKeyword);
    setPageCursors([null]);
    setCurrentPage(1);
    setNextCursor(null);
    void loadProducts(null, nextKeyword);
  }, [search, loadProducts]);

  useEffect(() => {
    setSearch('');
    setCommittedSearch('');
    setNextCursor(null);
    setPageCursors([null]);
    setCurrentPage(1);
    setProducts([]);
    void loadProducts(null, '');
  }, [shopId, loadProducts]);

  const toggleProduct = (product: ShopProductSummary) => {
    const existed = selectedMap.has(product.id);
    if (existed) {
      onChange(selectedProducts.filter((p) => p.id !== product.id));
      return;
    }
    if (selectedProducts.length >= maxSelectable) {
      toast(`最多可选择 ${maxSelectable} 个商品`, 'info');
      return;
    }
    onChange([...selectedProducts, product]);
  };

  const clearAll = () => onChange([]);

  return (
    <div className={`${styles.wrap} ${variant === 'modal' ? styles.wrapModal : ''}`}>
      <div className={styles.headerRow}>
        <span className={styles.title}>商品选择</span>
        <span className={styles.count}>已选 {selectedProducts.length} / {maxSelectable}</span>
      </div>
      <div className={styles.searchRow}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="搜索商品名称"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitSearch();
          }}
        />
        <button
          type="button"
          className={styles.searchBtn}
          onClick={submitSearch}
          disabled={loading}
        >
          搜索
        </button>
      </div>
      {!shopId && <div className={styles.empty}>请先在顶部选择已授权店铺</div>}
      {shopId && error && <div className={styles.error}>{error}</div>}
      {shopId && !error && (
        <div className={`${styles.list} ${variant === 'modal' ? styles.listModal : ''}`}>
          {loading ? (
            <div className={styles.empty}>加载商品中...</div>
          ) : products.length === 0 ? (
            <div className={styles.empty}>未找到商品</div>
          ) : (
            products.map((item) => {
              const checked = selectedMap.has(item.id);
              const disabled = !checked && selectedProducts.length >= maxSelectable;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.item} ${checked ? styles.itemChecked : ''}`}
                  onClick={() => toggleProduct(item)}
                  disabled={disabled}
                >
                  <span className={styles.itemLeading}>
                    <span className={styles.checkbox} aria-hidden>{checked ? '✓' : ''}</span>
                    {item.imageUrl ? (
                      <img
                        className={styles.thumb}
                        src={item.imageUrl}
                        alt={item.title || '商品图片'}
                        loading="lazy"
                        title="点击放大预览"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewImage({
                            src: item.imageUrl,
                            alt: item.title || '商品图片',
                          });
                        }}
                      />
                    ) : (
                      <span className={styles.thumbPlaceholder}>无图</span>
                    )}
                  </span>
                  <span className={styles.itemMain}>
                    <span className={styles.itemTitle}>{item.title || item.handle || item.id}</span>
                    <span className={styles.itemMeta}>
                      {item.price ? `¥${item.price}` : '无价格'}
                      {item.compareAtPrice ? `  / 划线价 ¥${item.compareAtPrice}` : ''}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
      <div className={styles.footerRow}>
        <button type="button" className={styles.ghostBtn} onClick={clearAll} disabled={selectedProducts.length === 0}>
          清空选择
        </button>
      </div>
      <div className={styles.pagerRow}>
        <button
          type="button"
          className={styles.pagerBtn}
          disabled={currentPage <= 1 || loading}
          onClick={() => {
            const prevPage = currentPage - 1;
            const prevCursor = pageCursors[prevPage - 1] ?? null;
            setCurrentPage(prevPage);
            void loadProducts(prevCursor, committedSearch);
          }}
        >
          上一页
        </button>
        <div className={styles.pageNumbers}>
          {pageCursors.map((_, idx) => {
            const page = idx + 1;
            const active = page === currentPage;
            return (
              <button
                key={page}
                type="button"
                className={`${styles.pageBtn} ${active ? styles.pageBtnActive : ''}`}
                onClick={() => {
                  if (page === currentPage) return;
                  const cursorForPage = pageCursors[page - 1] ?? null;
                  setCurrentPage(page);
                  void loadProducts(cursorForPage, committedSearch);
                }}
                disabled={loading}
              >
                {page}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className={styles.pagerBtn}
          disabled={!nextCursor || loading}
          onClick={() => {
            if (!nextCursor) return;
            const nextPage = currentPage + 1;
            setPageCursors((prev) => {
              if (prev[nextPage - 1] != null) return prev;
              return [...prev, nextCursor];
            });
            setCurrentPage(nextPage);
            void loadProducts(nextCursor, committedSearch);
          }}
        >
          下一页
        </button>
      </div>
      {previewImage && (
        <ImageLightbox
          src={previewImage.src}
          alt={previewImage.alt}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}

