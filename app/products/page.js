'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import Pagination from '../components/Pagination';
import CartModal from '../components/CartModal';
import { fbEvent } from '@/lib/fbpixel';

const PAGE_SIZE = 15;

export default function CatalogPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [discountPercent, setDiscountPercent] = useState(50);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);

  // Sourcing and currency helpers
  const userCurrency = user?.currency || 'EUR';
  const userWarehouse = user?.warehouse?.toLowerCase() || 'barcelona';
  const isAdmin = user?.tags?.some(t => ['b2b-admin', 'admin'].includes(t.toLowerCase())) && !user?.impersonatedBy;

  const convertPrice = (eurAmount, curr) => {
    const amt = parseFloat(eurAmount || 0);
    if (curr === 'JPY') return Math.round(amt * 170);
    if (curr === 'CAD') return parseFloat((amt * 1.5).toFixed(2));
    if (curr === 'USD') return parseFloat((amt * 1.1).toFixed(2));
    return parseFloat(amt.toFixed(2));
  };

  const getCurrencySymbol = (curr) => {
    if (curr === 'JPY') return '¥';
    if (curr === 'CAD') return 'CA$';
    if (curr === 'USD') return '$';
    return '€';
  };

  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [page, setPage] = useState(1);

  const [cart, setCart] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [createdOrders, setCreatedOrders] = useState([]);
  const [error, setError] = useState('');
  const [orderNote, setOrderNote] = useState('');

  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkWarehouse, setBulkWarehouse] = useState('barcelona');
  const [bulkError, setBulkError] = useState('');
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('EUR');

  useEffect(() => {
    const saved = localStorage.getItem('capote_b2b_currency');
    if (saved) setSelectedCurrency(saved);
    const handleCurrChange = () => {
      const updated = localStorage.getItem('capote_b2b_currency');
      if (updated) setSelectedCurrency(updated);
    };
    window.addEventListener('capote_currency_changed', handleCurrChange);
    return () => window.removeEventListener('capote_currency_changed', handleCurrChange);
  }, []);

  const effectiveCurrency = selectedCurrency || userCurrency;

  const handleUpdateCartQty = (cartKey, newQty) => {
    const updated = { ...cart };
    if (newQty <= 0) {
      delete updated[cartKey];
    } else if (updated[cartKey]) {
      updated[cartKey] = { ...updated[cartKey], quantity: newQty };
    }
    setCart(updated);
    localStorage.setItem('capote_b2b_cart', JSON.stringify(updated));
  };

  const handleUpdateCartPrice = (cartKey, newPrice) => {
    const updated = { ...cart };
    if (updated[cartKey]) {
      updated[cartKey] = { ...updated[cartKey], price: newPrice, isCustomPrice: true };
    }
    setCart(updated);
    localStorage.setItem('capote_b2b_cart', JSON.stringify(updated));
  };

  const handleRemoveCartItem = (cartKey) => {
    const updated = { ...cart };
    delete updated[cartKey];
    setCart(updated);
    localStorage.setItem('capote_b2b_cart', JSON.stringify(updated));
  };

  // Auth + cart load
  useEffect(() => {
    fbEvent("ViewContent", { content_category: "B2B_wholesale" });
    const savedCart = localStorage.getItem('capote_b2b_cart');
    if (savedCart) {
      try { setCart(JSON.parse(savedCart)); } catch (e) {}
    }
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!res.ok || !data.authenticated) {
          router.push('/auth/login');
        } else {
          setUser(data.user);
          setDiscountPercent(data.discountPercent);
          fetchCatalog();
        }
      } catch (err) {
        router.push('/auth/login');
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, [router]);

  useEffect(() => {
    if (userWarehouse) {
      setBulkWarehouse(userWarehouse);
    }
  }, [userWarehouse]);

  async function fetchCatalog(retryCount = 0) {
    const MAX_RETRIES = 2;
    try {
      setCatalogLoading(true);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      const res = await fetch('/api/products', { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      if (res.ok) {
        setProducts(data.products || []);
        setFilteredProducts(data.products || []);
        setError(null);
      } else if (retryCount < MAX_RETRIES && (res.status === 429 || res.status >= 500)) {
        console.warn(`Catalog fetch failed (${res.status}), retrying... (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, 1500 * (retryCount + 1)));
        return fetchCatalog(retryCount + 1);
      } else {
        setError(data.error || 'Failed to load catalog.');
      }
    } catch (err) {
      if (retryCount < MAX_RETRIES) {
        console.warn(`Catalog fetch error, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, 1500 * (retryCount + 1)));
        return fetchCatalog(retryCount + 1);
      }
      setError('Connection error. Please reload the page.');
    } finally {
      setCatalogLoading(false);
    }
  }


  // Filter + search
  useEffect(() => {
    let result = Array.isArray(products) ? products : [];
    if (filterType !== 'all') {
      result = result.filter(p => p && p.type?.toLowerCase() === filterType.toLowerCase());
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(p =>
        p && (
          (p.title && p.title.toLowerCase().includes(q)) ||
          (p.variants && Array.isArray(p.variants) && p.variants.some(v => v && (v.sku?.toLowerCase().includes(q) || v.title?.toLowerCase().includes(q))))
        )
      );
    }
    setFilteredProducts(result);
    setPage(1);
  }, [products, filterType, searchQuery]);

  const productTypes = ['all', ...Array.from(new Set((Array.isArray(products) ? products : []).map(p => p?.type).filter(Boolean)))];
  const safeFilteredProducts = Array.isArray(filteredProducts) ? filteredProducts : [];
  const pagedProducts = safeFilteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Cart helpers
  const cartItems = Object.values(cart || {}).filter(item => item && item.quantity > 0);
  const totalItems = cartItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

  const handleClearCart = () => {
    setCart({});
    localStorage.removeItem('capote_b2b_cart');
  };

  // Bulk import
  const handleBulkImport = () => {
    setBulkError('');
    setBulkSuccessMsg('');
    if (!bulkText.trim()) { setBulkError('Please enter at least one SKU.'); return; }
    const skuMap = {};
    products.forEach(p => p.variants.forEach(v => {
      if (v.sku) skuMap[v.sku.trim().toLowerCase()] = { variantId: v.id, price: v.price, title: v.title, productTitle: p.title, stock: v.stock };
    }));
    const lines = bulkText.split('\n');
    const newCartItems = { ...cart };
    const unrecognized = [], outOfStock = [];
    let countAdded = 0;
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let sku = '', qty = 1;
      if (trimmed.includes(',')) {
        const parts = trimmed.split(',');
        sku = parts[0].trim(); qty = parseInt(parts[1].trim()) || 1;
      } else {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2 && !isNaN(parts[parts.length - 1])) {
          qty = parseInt(parts[parts.length - 1]) || 1;
          sku = parts.slice(0, -1).join(' ').trim();
        } else { sku = trimmed; qty = 1; }
      }
      const match = skuMap[sku.toLowerCase()];
      if (!match) { unrecognized.push(sku); return; }
      const avail = match.stock?.[bulkWarehouse] || 0;
      if (avail <= 0) { outOfStock.push(sku); return; }
      const finalQty = Math.min(qty, avail);
      const cartKey = `${match.variantId}-${bulkWarehouse}`;
      newCartItems[cartKey] = { variantId: match.variantId, quantity: (newCartItems[cartKey]?.quantity || 0) + finalQty, price: match.price, title: match.title, productTitle: match.productTitle, warehouse: bulkWarehouse };
      countAdded += finalQty;
    });
    setCart(newCartItems);
    localStorage.setItem('capote_b2b_cart', JSON.stringify(newCartItems));
    if (countAdded > 0) {
      Object.values(newCartItems).forEach(item => {
        fbEvent("AddToCart", {
          content_category: "B2B_wholesale",
          content_ids: [item.sku || item.variantId],
          value: parseFloat((item.price * (1 - discountPercent / 100)).toFixed(2)),
          currency: "EUR",
        });
      });
      setBulkSuccessMsg(`✅ Added ${countAdded} items to cart.${unrecognized.length ? ` Unrecognized: ${unrecognized.join(', ')}.` : ''}${outOfStock.length ? ` OOS: ${outOfStock.join(', ')}.` : ''}`);
      setBulkText('');
      setTimeout(() => { setBulkModalOpen(false); setBulkSuccessMsg(''); }, 2500);
    } else {
      setBulkError(`❌ No items added. ${unrecognized.length ? 'Unrecognized: ' + unrecognized.join(', ') : ''}`);
    }
  };

  // Checkout
  const handleConfirmOrder = async () => {
    const items = Object.values(cart);
    if (!items.length) return;
    setSubmitting(true);
    setError('');

    const editingDraftId = typeof window !== 'undefined' ? localStorage.getItem('capote_b2b_editing_draft_id') : null;

    if (editingDraftId) {
      try {
        const payloadItems = items.map(i => ({
          variantId: i.variantId || '',
          title: i.title || i.productTitle || '',
          variantTitle: i.variantTitle || '',
          sku: i.sku || '',
          quantity: i.quantity,
          price: i.price,
          warehouse: i.warehouse || 'barcelona'
        }));

        const response = await fetch(`/api/orders/${encodeURIComponent(editingDraftId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: payloadItems, note: orderNote, currency: selectedCurrency })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to update draft order.');

        localStorage.removeItem('capote_b2b_editing_draft_id');
        localStorage.removeItem('capote_b2b_editing_draft_name');
        handleClearCart();
        setOrderNote('');
        setCartModalOpen(false);
        router.push(`/orders/${encodeURIComponent(editingDraftId)}`);
        return;
      } catch (err) {
        setError(err.message);
        setSubmitting(false);
        return;
      }
    }

    const itemsByWarehouse = items.reduce((acc, item) => {
      if (!acc[item.warehouse]) acc[item.warehouse] = [];
      const itemPayload = { variantId: item.variantId, quantity: item.quantity };
      if (item.isCustomPrice || item.price !== undefined) {
        itemPayload.price = item.price;
      }
      acc[item.warehouse].push(itemPayload);
      return acc;
    }, {});
    try {
      const ordersResult = [];
      for (const [warehouse, warehouseItems] of Object.entries(itemsByWarehouse)) {
        const response = await fetch('/api/orders/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ warehouse, items: warehouseItems, note: orderNote, currency: selectedCurrency })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Failed for ${warehouse}.`);
        ordersResult.push({ warehouse, name: data.name, total: data.total, currency: data.currency, invoiceUrl: data.invoiceUrl });
      }
      setCreatedOrders(ordersResult);

      // Fire Meta Pixel Purchase event with real wholesale total
      const totalOrderWholesale = items.reduce((sum, item) => {
        const itemUnitPrice = item.price * (1 - discountPercent / 100);
        return sum + (itemUnitPrice * item.quantity);
      }, 0);

      fbEvent("Purchase", {
        value: parseFloat(totalOrderWholesale.toFixed(2)),
        currency: "EUR",
        content_category: "B2B_wholesale",
        content_ids: items.map(i => i.sku || i.variantId),
        num_items: items.length,
      });

      handleClearCart();
      setOrderNote('');
      setSuccessModalOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Pricing
  const warehouseTotals = cartItems.reduce((acc, item) => {
    if (!item) return acc;
    const w = (item.warehouse || 'barcelona').toLowerCase();
    if (!acc[w]) acc[w] = { quantity: 0, wholesale: 0, symbol: w === 'japan' ? '¥' : w === 'canada' ? 'CA$' : '€' };
    const b2bPrice = (item.price || 0) * (1 - (discountPercent || 50) / 100);
    let unitAmount = w === 'japan' ? Math.round(b2bPrice * 170) : w === 'canada' ? parseFloat((b2bPrice * 1.5).toFixed(2)) : w === 'us' || w === 'usa' ? parseFloat((b2bPrice * 1.1).toFixed(2)) : parseFloat(b2bPrice.toFixed(2));
    const qty = item.quantity || 0;
    acc[w].quantity += qty;
    acc[w].wholesale += unitAmount * qty;
    return acc;
  }, {});

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#e8e3da' }}>
        <div style={{ fontSize: '14px', color: '#6b6b6b' }}>Verifying session…</div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: totalItems > 0 ? '100px' : '40px' }}>
      <Navbar user={user} activeTab="products" cartCount={totalItems} onCartClick={() => setCartModalOpen(true)} />

      <main className="app-container">
        {/* Page Header */}
        <div className="page-header">
          <div className="page-label">CATALOG</div>
          <div className="page-title-row">
            <h1 className="page-title">Products</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="page-count">⚙️ <strong>{filteredProducts.length}</strong> products</span>
              <button className="btn-outline" onClick={() => setBulkModalOpen(true)}>
                ≡ Bulk Order
              </button>
            </div>
          </div>
        </div>

        {/* Search + filter */}
        <div className="search-bar">
          <span className="search-bar__icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, type, or SKU..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="toolbar-row">
          <select
            className="toolbar-select"
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
          >
            {productTypes.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All Products' : t}</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: '#fce8e6', color: '#c62828', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {/* Products Table */}
        <div className="data-table-wrap">
          {catalogLoading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9e9e9e', fontSize: '14px' }}>
              Loading catalog…
            </div>
          ) : pagedProducts.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9e9e9e', fontSize: '14px' }}>
              No products found.
            </div>
          ) : (
            <>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Image</th>
                    <th>Product</th>
                    <th>SKU</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'center' }}>Variants</th>
                    <th>Availability</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedProducts.map(product => {
                    const variants = product.variants || [];
                    const firstVariant = variants.length > 0 ? variants[0] : null;
                    const b2bPriceRaw = firstVariant ? firstVariant.price * (1 - discountPercent / 100) : null;
                    const b2bPrice = b2bPriceRaw ? convertPrice(b2bPriceRaw, userCurrency).toLocaleString(undefined, { minimumFractionDigits: userCurrency === 'JPY' ? 0 : 2 }) : null;
                    const totalStock = variants.reduce((sum, v) => {
                      if (isAdmin) {
                        return sum + (v.stock?.barcelona || 0) + (v.stock?.japan || 0) + (v.stock?.canada || 0);
                      } else {
                        return sum + (v.stock?.[userWarehouse] || 0);
                      }
                    }, 0);
                    const isAvailable = totalStock > 0;
                    const skuDisplay = firstVariant?.sku || '—';
                    const extraVariants = Math.max(0, variants.length - 1);

                    const cleanProductId = (product.id || '').split('/').pop();

                    return (
                      <tr
                        key={product.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => router.push(`/products/${cleanProductId}`)}
                      >
                        <td>
                          {product.image ? (
                            <img src={product.image} alt={product.title || 'Product'} className="product-thumb" />
                          ) : (
                            <div className="product-thumb-placeholder">👓</div>
                          )}
                        </td>
                        <td>
                          <div className="product-name">{product.title || 'Untitled Product'}</div>
                          {product.type && <div className="product-type">{product.type}</div>}
                        </td>
                        <td>
                          <span className="sku-text">
                            {skuDisplay}{extraVariants > 0 && <span style={{ color: '#9e9e9e' }}> +{extraVariants}</span>}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {b2bPrice ? (
                            <span style={{ fontWeight: 600 }}>{getCurrencySymbol(userCurrency)}{b2bPrice}</span>
                          ) : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="variant-badge">{variants.length}</span>
                        </td>
                        <td>
                          <span className={`avail-pill ${isAvailable ? 'available' : 'unavailable'}`}>
                            {isAvailable ? '✓ Available' : '✕ Unavailable'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="row-action-btn">›</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={filteredProducts.length}
                onPage={setPage}
              />
            </>
          )}
        </div>
      </main>

      {/* ── CART BAR ── */}
      {totalItems > 0 && (
        <div className={`cart-bar${totalItems > 0 ? ' visible' : ''}`}>
          <div className="cart-bar__inner">
            <div className="cart-bar__stats">
              <strong>{totalItems}</strong> item{totalItems !== 1 ? 's' : ''} in cart
              <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '12px', margin: '0 6px' }} onClick={() => setCartModalOpen(true)}>
                ✏️ View & Edit Cart
              </button>
              <button className="clear-cart-btn" onClick={handleClearCart}>Clear</button>
            </div>
            <div className="cart-bar__totals">
              {Object.entries(warehouseTotals).map(([w, t]) => (
                <div key={w} className="warehouse-total-block">
                  <span className="total-warehouse-name">{w.charAt(0).toUpperCase() + w.slice(1)}</span>
                  <div className="cart-bar__price-b2b">
                    {t.symbol}{t.wholesale.toLocaleString(undefined, { minimumFractionDigits: w === 'japan' ? 0 : 2 })}
                  </div>
                </div>
              ))}
            </div>
            <div className="cart-bar__actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="text"
                placeholder="Special instructions / notes..."
                value={orderNote}
                onChange={e => setOrderNote(e.target.value)}
                style={{
                  width: '240px',
                  background: '#ffffff',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  fontSize: '12.5px',
                  color: 'var(--text-primary)',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
                  margin: 0
                }}
              />
              <button className="btn-primary" onClick={handleConfirmOrder} disabled={submitting}>
                {submitting ? 'Placing Order…' : '🛒 Place Draft Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BULK ORDER MODAL ── */}
      {bulkModalOpen && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setBulkModalOpen(false); }}>
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h2>≡ Bulk Order</h2>
                <p>Import multiple SKUs at once</p>
              </div>
              <button className="modal-close" onClick={() => setBulkModalOpen(false)}>✕</button>
            </div>

            <div className="modal-info-box">
              ℹ Enter one SKU per line
              <ol style={{ marginTop: 8 }}>
                <li><code>226AC/BLK/BLK, 5</code> SKU + comma + quantity</li>
                <li><code>ACX0989/AGD 2</code> SKU + space + quantity</li>
                <li><code>TITANIUM29</code> SKU only (qty defaults to 1)</li>
              </ol>
            </div>

            {bulkError && <div className="login-error">{bulkError}</div>}
            {bulkSuccessMsg && <div className="login-success">{bulkSuccessMsg}</div>}

            <textarea
              className="modal-textarea"
              placeholder="Paste or type your SKUs here..."
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              rows={6}
            />

            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <label className="form-label">Warehouse</label>
              <select className="toolbar-select" value={bulkWarehouse} onChange={e => setBulkWarehouse(e.target.value)}>
                <option value="barcelona">Barcelona (EUR)</option>
                <option value="japan">Japan (JPY)</option>
                <option value="canada">Canada (CAD)</option>
              </select>
            </div>

            <div className="modal-footer">
              <span className="modal-footer-note">Supports CSV paste from spreadsheets</span>
              <div className="modal-footer-actions">
                <button className="btn-secondary" onClick={() => setBulkModalOpen(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleBulkImport}>
                  🛒 Add to Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CART MODAL (VIEW & EDIT CART) ── */}
      <CartModal
        isOpen={cartModalOpen}
        onClose={() => setCartModalOpen(false)}
        cart={cart}
        onUpdateQty={handleUpdateCartQty}
        onUpdatePrice={handleUpdateCartPrice}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
        onConfirmOrder={(note) => {
          if (note) setOrderNote(note);
          setCartModalOpen(false);
          handleConfirmOrder();
        }}
        submitting={submitting}
        discountPercent={discountPercent}
        countryCode={user?.countryCode || 'ES'}
      />

      {/* ── SUCCESS MODAL ── */}
      {successModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h2>✅ Orders Created</h2>
                <p>Your B2B draft orders have been submitted to Shopify.</p>
              </div>
              <button className="modal-close" onClick={() => setSuccessModalOpen(false)}>✕</button>
            </div>
            <div className="created-orders-list">
              {createdOrders.map((o, i) => (
                <div key={i} className="created-order-item">
                  <div>
                    <strong>{o.name}</strong>
                    <div style={{ fontSize: 12, color: '#6b6b6b', marginTop: 2 }}>
                      {o.warehouse.charAt(0).toUpperCase() + o.warehouse.slice(1)} — {o.currency} {o.total?.toLocaleString()}
                    </div>
                  </div>
                  {o.invoiceUrl && (
                    <a href={o.invoiceUrl} target="_blank" rel="noopener noreferrer" className="btn-invoice">
                      View Invoice
                    </a>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <a href="/orders" className="btn-outline">View All Orders</a>
              <button className="btn-primary" onClick={() => setSuccessModalOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
