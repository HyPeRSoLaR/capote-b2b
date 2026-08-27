'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Navbar from '../../components/Navbar';
import CartModal from '../../components/CartModal';
import { fbEvent } from '@/lib/fbpixel';

export default function ProductConfiguratorPage() {
  const router = useRouter();
  const { id } = useParams();

  const [user, setUser] = useState(null);
  const [discountPercent, setDiscountPercent] = useState(50);
  const [loading, setLoading] = useState(true);
  const [productLoading, setProductLoading] = useState(true);
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');

  const [cart, setCart] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [createdOrders, setCreatedOrders] = useState([]);

  const [selectedOptions, setSelectedOptions] = useState({});
  const [activeVariant, setActiveVariant] = useState(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState('barcelona');
  const [quantity, setQuantity] = useState(1);
  const [toastMessage, setToastMessage] = useState('');

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

  const visibleWarehouses = isAdmin ? ['barcelona', 'japan', 'canada'] : [userWarehouse];

  useEffect(() => {
    if (userWarehouse) {
      setSelectedWarehouse(userWarehouse);
    }
  }, [userWarehouse]);

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!res.ok || !data.authenticated) {
          router.push('/auth/login');
        } else {
          setUser(data.user);
          setDiscountPercent(data.discountPercent);
          fetchProductDetails();
        }
      } catch {
        router.push('/auth/login');
      } finally {
        setLoading(false);
      }
    }

    const savedCart = localStorage.getItem('capote_b2b_cart');
    if (savedCart) {
      try { setCart(JSON.parse(savedCart)); } catch {}
    }
    checkSession();
  }, [id, router]);

  async function fetchProductDetails() {
    try {
      setProductLoading(true);
      const rawId = decodeURIComponent(id || '');
      const cleanId = rawId.includes('/') ? rawId.split('/').pop() : rawId;
      const res = await fetch(`/api/products/${cleanId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load product details.');
      } else {
        const prod = data.product;
        setProduct(prod);
        if (prod.variants && prod.variants.length > 0) {
          const firstVariant = prod.variants[0];
          setSelectedOptions(firstVariant.options || {});
          setActiveVariant(firstVariant);
          setSelectedWarehouse(userWarehouse || 'barcelona');
        }
        fbEvent("ViewContent", {
          content_category: "B2B_wholesale",
          content_ids: [prod.variants?.[0]?.sku || prod.id],
          content_name: prod.title || prod.name,
        });
      }
    } catch {
      setError('Connection error.');
    } finally {
      setProductLoading(false);
    }
  }

  // Resolve active variant when selected options change
  useEffect(() => {
    if (!product || !product.variants) return;
    const match = product.variants.find(v =>
      v.options && Object.entries(selectedOptions).every(([name, val]) => v.options[name] === val)
    );
    setActiveVariant(match || null);
  }, [selectedOptions, product]);

  // Helper to determine if an option value yields a real variant with current selections
  const isOptionValueAvailable = (optName, optVal, optIndex = 0) => {
    if (!product || !product.variants || product.variants.length === 0) return false;

    // For the primary (first) option dimension, any value existing in the variant list is available
    if (optIndex === 0) {
      return product.variants.some(v => v.options && v.options[optName] === optVal);
    }

    // For subsequent options, check if a variant exists matching this value AND the preceding selected options
    const optionNames = Object.keys(optionsMap);
    const precedingOptions = optionNames.slice(0, optIndex);

    return product.variants.some(v => {
      if (!v.options || v.options[optName] !== optVal) return false;
      return precedingOptions.every(prevOptName => v.options[prevOptName] === selectedOptions[prevOptName]);
    });
  };

  const handleOptionSelect = (optName, optVal) => {
    setSelectedOptions(prev => {
      const next = { ...prev, [optName]: optVal };
      // If exact combination exists, keep it
      const match = product?.variants?.find(v =>
        v.options && Object.entries(next).every(([k, val]) => v.options[k] === val)
      );
      if (match) return next;

      // When switching causes an impossible pair, auto-select the first available variant for this option
      const fallback = product?.variants?.find(v => v.options && v.options[optName] === optVal);
      return fallback?.options ? { ...fallback.options } : next;
    });
  };

  const handleQtyChange = (val) => {
    const next = quantity + val;
    if (next >= 1) setQuantity(next);
  };

  const handleAddToCart = () => {
    if (!activeVariant) return;
    // Store the RAW variant price (same convention as the products list page).
    // The wholesale discount is applied ONCE downstream: by CartModal for display
    // and by the draft-order API when the order is created. Storing an already
    // discounted price here caused a double discount (price shown at 50% of correct).
    const baseFramePrice = activeVariant.price;

    const cartKey = `${activeVariant.id}-${selectedWarehouse}`;
    const newCart = { ...cart };

    newCart[cartKey] = {
      variantId: activeVariant.id,
      quantity: (newCart[cartKey]?.quantity || 0) + quantity,
      price: baseFramePrice,
      title: activeVariant.title || 'Default',
      productTitle: product.title,
      warehouse: selectedWarehouse,
      properties: []
    };

    setCart(newCart);
    localStorage.setItem('capote_b2b_cart', JSON.stringify(newCart));

    fbEvent("AddToCart", {
      content_category: "B2B_wholesale",
      content_ids: [activeVariant.sku || activeVariant.id],
      value: parseFloat((baseFramePrice * (1 - discountPercent / 100)).toFixed(2)),
      currency: "EUR",
    });

    setToastMessage(`Added ${quantity} units of ${product.title} to cart.`);
    setTimeout(() => setToastMessage(''), 3000);
  };

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

  const [cartModalOpen, setCartModalOpen] = useState(false);

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

  const handleClearCart = () => {
    setCart({});
    localStorage.removeItem('capote_b2b_cart');
  };

  const handleConfirmOrder = async () => {
    const items = Object.values(cart);
    if (!items.length) return;
    setSubmitting(true);
    const itemsByWarehouse = items.reduce((acc, item) => {
      if (!acc[item.warehouse]) acc[item.warehouse] = [];
      const itemPayload = {
        variantId: item.variantId,
        quantity: item.quantity,
        properties: item.properties
      };
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
          body: JSON.stringify({ warehouse, items: warehouseItems, currency: selectedCurrency })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Failed for ${warehouse}.`);
        ordersResult.push({ warehouse, name: data.name, total: data.total, currency: data.currency, invoiceUrl: data.invoiceUrl });
      }
      setCreatedOrders(ordersResult);

      const totalOrderWholesale = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      fbEvent("Purchase", {
        value: parseFloat(totalOrderWholesale.toFixed(2)),
        currency: "EUR",
        content_category: "B2B_wholesale",
        content_ids: items.map(i => i.sku || i.variantId),
        num_items: items.length,
      });
      handleClearCart();
      setSuccessModalOpen(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Pricing calculations
  const cartItems = Object.values(cart);
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const warehouseTotals = cartItems.reduce((acc, item) => {
    const w = item.warehouse;
    if (!acc[w]) acc[w] = { quantity: 0, wholesale: 0, currencySymbol: w === 'japan' ? '¥' : w === 'canada' ? 'CA$' : '€', currencyCode: w === 'japan' ? 'JPY' : w === 'canada' ? 'CAD' : 'EUR' };
    acc[w].quantity += item.quantity;
    // item.price is the RAW variant price; apply the B2B discount once for display
    // (same convention as CartModal), unless the item carries a custom price.
    const unit = item.isCustomPrice ? item.price : item.price * (1 - discountPercent / 100);
    acc[w].wholesale += unit * item.quantity;
    return acc;
  }, {});

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#e8e3da' }}>
        <div style={{ fontSize: '14px', color: '#6b6b6b' }}>Verifying session…</div>
      </div>
    );
  }

  if (productLoading || !product) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#e8e3da' }}>
        <div style={{ fontSize: '14px', color: '#6b6b6b' }}>Loading product details…</div>
      </div>
    );
  }

  // Populate options maps
  const optionsMap = {};
  product.variants?.forEach(v => {
    Object.entries(v.options || {}).forEach(([name, val]) => {
      if (!optionsMap[name]) optionsMap[name] = new Set();
      optionsMap[name].add(val);
    });
  });

  const basePrice = activeVariant ? activeVariant.price : 0;
  const currentB2BPrice = basePrice * (1 - discountPercent / 100);
  const isAvailable = Boolean(activeVariant && activeVariant.stock && Object.values(activeVariant.stock).some(s => s > 0));

  return (
    <div style={{ paddingBottom: totalItems > 0 ? '100px' : '40px' }}>
      <Navbar user={user} activeTab="products" cartCount={totalItems} onCartClick={() => setCartModalOpen(true)} />

      {toastMessage && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: '#1a1a1a', color: '#fff', padding: '12px 24px', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 999 }}>
          {toastMessage}
        </div>
      )}

      <main className="app-container" style={{ paddingTop: 30 }}>
        {/* Back Link */}
        <div style={{ marginBottom: 24 }}>
          <button className="btn-outline" onClick={() => router.push('/products')}>
            ← Back to Products
          </button>
        </div>

        {error && <div style={{ color: '#c62828', background: '#fce8e6', padding: 12, borderRadius: 6, marginBottom: 20 }}>{error}</div>}

        <div className="configurator-grid">
          {/* LEFT: Frame Image */}
          <div className="configurator-gallery-container">
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: '#f5f3ef', minHeight: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={activeVariant?.image || product.image}
                alt={product.title}
                style={{ width: '100%', maxHeight: '500px', objectFit: 'contain', padding: '20px' }}
              />
            </div>
          </div>

          {/* RIGHT: Option selectors */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h1 style={{ fontSize: '36px', fontWeight: 700, marginBottom: 4 }}>{product.title}</h1>
              {activeVariant ? (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 12 }}>
                  SKU: {activeVariant.sku}
                </div>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: 12 }}>
                  SKU: —
                </div>
              )}
              {activeVariant ? (
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {getCurrencySymbol(userCurrency)}{convertPrice(currentB2BPrice, userCurrency).toLocaleString(undefined, { minimumFractionDigits: userCurrency === 'JPY' ? 0 : 2 })}
                </div>
              ) : (
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-muted)' }}>
                  —
                </div>
              )}
              <div style={{ fontSize: '13px', color: !activeVariant ? '#c62828' : isAvailable ? '#1e7e34' : '#c62828', fontWeight: 600, marginTop: 6 }}>
                {!activeVariant ? 'Combination unavailable' : isAvailable ? 'Available' : 'Out of stock'}
              </div>
            </div>

            {/* Dynamic Options Picker */}
            {Object.entries(optionsMap).map(([optName, optSet], optIndex) => (
              <div key={optName}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  {optName}
                </label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {Array.from(optSet).map(optVal => {
                    const isActive = selectedOptions[optName] === optVal;
                    const isOptAvailable = isOptionValueAvailable(optName, optVal, optIndex);
                    return (
                      <button
                        key={optVal}
                        type="button"
                        disabled={!isOptAvailable}
                        onClick={() => {
                          if (!isOptAvailable) return;
                          handleOptionSelect(optName, optVal);
                        }}
                        style={{
                          padding: '8px 16px',
                          border: isActive ? '2px solid #1a1a1a' : '1px solid var(--border)',
                          borderRadius: '6px',
                          background: '#fff',
                          fontWeight: isActive ? 600 : 400,
                          color: isOptAvailable ? 'var(--text-primary)' : 'var(--text-muted)',
                          cursor: isOptAvailable ? 'pointer' : 'not-allowed',
                          opacity: isOptAvailable ? 1 : 0.35,
                          textDecoration: isOptAvailable ? 'none' : 'line-through',
                          textTransform: 'uppercase',
                          fontSize: '12.5px'
                        }}
                      >
                        {optVal}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Sourcing Warehouse Picker */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Warehouse Sourcing
              </label>
              {!activeVariant ? (
                <div style={{ fontSize: '13.5px', fontWeight: 500, color: '#c62828', background: '#fff', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '6px', display: 'inline-block' }}>
                  ⚠️ This combination is not available
                </div>
              ) : visibleWarehouses.length > 1 ? (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {visibleWarehouses.map(w => {
                    const isActive = selectedWarehouse === w;
                    const stock = activeVariant?.stock?.[w] || 0;
                    return (
                      <button
                        key={w}
                        onClick={() => setSelectedWarehouse(w)}
                        style={{
                          padding: '10px 16px',
                          border: isActive ? '2px solid #1a1a1a' : '1px solid var(--border)',
                          borderRadius: '6px',
                          background: '#fff',
                          fontWeight: isActive ? 600 : 400,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 2
                        }}
                      >
                        <span style={{ fontSize: '13.5px', textTransform: 'capitalize' }}>{w}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {stock > 0 ? `${stock} units` : 'Out of stock'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--text-primary)', background: '#fff', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '6px', display: 'inline-block' }}>
                  📦 Sourced from <strong style={{ textTransform: 'capitalize' }}>{selectedWarehouse}</strong> ({activeVariant?.stock?.[selectedWarehouse] || 0} units available)
                </div>
              )}
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

            {/* Quantity and Actions */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', background: '#fff', opacity: !activeVariant ? 0.5 : 1 }}>
                <button
                  style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: !activeVariant ? 'not-allowed' : 'pointer', fontSize: 16 }}
                  onClick={() => handleQtyChange(-1)}
                  disabled={!activeVariant}
                >-</button>
                <span style={{ padding: '10px 14px', minWidth: 40, textAlign: 'center', fontWeight: 600 }}>{quantity}</span>
                <button
                  style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: !activeVariant ? 'not-allowed' : 'pointer', fontSize: 16 }}
                  onClick={() => handleQtyChange(1)}
                  disabled={!activeVariant}
                >+</button>
              </div>

              <button
                className="btn-primary"
                style={{
                  flex: 1,
                  padding: '12px',
                  opacity: (!activeVariant || (activeVariant.stock?.[selectedWarehouse] || 0) <= 0) ? 0.5 : 1,
                  cursor: (!activeVariant || (activeVariant.stock?.[selectedWarehouse] || 0) <= 0) ? 'not-allowed' : 'pointer'
                }}
                onClick={handleAddToCart}
                disabled={!activeVariant || (activeVariant.stock?.[selectedWarehouse] || 0) <= 0}
              >
                {!activeVariant
                  ? 'Combination unavailable'
                  : (activeVariant.stock?.[selectedWarehouse] || 0) <= 0
                    ? 'Out of stock'
                    : 'Add to Cart'
                }
              </button>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

            {/* Product Details Section */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Product Details
              </label>
              <ul style={{ paddingLeft: 16, fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>Product Type: {product.type || 'Eyewear'}</li>
                <li>Vendor: CAPOTE</li>
                <li>HS Code: 90041000</li>
                <li>Country of Origin: JP</li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* STICKY BOTTOM CART BAR */}
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
                    {t.currencySymbol}{t.wholesale.toLocaleString(undefined, { minimumFractionDigits: t.currencyCode === 'JPY' ? 0 : 2 })}
                  </div>
                </div>
              ))}
            </div>
            <div className="cart-bar__actions">
              <button className="btn-primary" onClick={handleConfirmOrder} disabled={submitting}>
                {submitting ? 'Placing Order…' : '🛒 Place Draft Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CART MODAL (VIEW & EDIT CART) */}
      <CartModal
        isOpen={cartModalOpen}
        onClose={() => setCartModalOpen(false)}
        cart={cart}
        onUpdateQty={handleUpdateCartQty}
        onUpdatePrice={handleUpdateCartPrice}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
        onConfirmOrder={() => {
          setCartModalOpen(false);
          handleConfirmOrder();
        }}
        submitting={submitting}
        discountPercent={discountPercent}
      />

      {/* SUCCESS CONFIRMATION MODAL */}
      {successModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: 8 }}>🎉 Orders Confirmed!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Your B2B draft orders have been submitted to Shopify.</p>
            <div className="created-orders-list">
              {createdOrders.map(o => (
                <div key={o.name} className="created-order-item">
                  <div>
                    <strong>{o.name}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {o.warehouse.toUpperCase()} — {o.currency} {o.total?.toLocaleString()}
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
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-outline" onClick={() => router.push('/orders')}>View My Orders</button>
              <button className="btn-primary" onClick={() => setSuccessModalOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
