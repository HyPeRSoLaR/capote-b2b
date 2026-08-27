'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Navbar from '../../components/Navbar';

export default function OrderDetailPage() {
  const router = useRouter();
  const { id } = useParams();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [orderLoading, setOrderLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [isCustomsPrint, setIsCustomsPrint] = useState(false);

  // Currency & Edit Mode State
  const [displayCurrency, setDisplayCurrency] = useState('EUR');
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [editableItems, setEditableItems] = useState([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  
  // Total Order Level Discount State (% or Fixed Amount)
  const [discountType, setDiscountType] = useState('PERCENTAGE'); // 'PERCENTAGE' or 'FIXED_AMOUNT'
  const [discountValue, setDiscountValue] = useState('');

  const handlePrint = (customs) => {
    setIsCustomsPrint(customs);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!res.ok || !data.authenticated) {
          router.push('/auth/login');
        } else {
          setUser(data.user);
          fetchOrderDetail();
        }
      } catch {
        router.push('/auth/login');
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, [router, id]);

  useEffect(() => {
    const saved = localStorage.getItem('capote_b2b_currency');
    if (saved) {
      setDisplayCurrency(saved);
    } else if (order?.currency) {
      setDisplayCurrency(order.currency);
    }

    const handleCurrChange = () => {
      const updated = localStorage.getItem('capote_b2b_currency');
      if (updated) setDisplayCurrency(updated);
    };
    window.addEventListener('capote_currency_changed', handleCurrChange);
    return () => window.removeEventListener('capote_currency_changed', handleCurrChange);
  }, [order]);

  async function fetchOrderDetail() {
    try {
      setOrderLoading(true);
      const res = await fetch(`/api/orders/${id}`);
      const data = await res.json();
      if (res.ok) {
        setOrder(data.order);
        if (data.order?.items) {
          setEditableItems(data.order.items.map(item => ({ ...item })));
        }
        if (data.order?.appliedDiscount) {
          setDiscountType(data.order.appliedDiscount.valueType === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED_AMOUNT');
          setDiscountValue(String(data.order.appliedDiscount.value || ''));
        }
      } else {
        setError(data.error || 'Failed to load order details.');
      }
    } catch {
      setError('Connection error.');
    } finally {
      setOrderLoading(false);
    }
  }

  const getCurrencySymbol = (code) => {
    if (code === 'JPY') return '¥';
    if (code === 'CAD') return 'CA$';
    if (code === 'USD') return '$';
    return '€';
  };

  const formatDate = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ', ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatStatus = (status) => {
    if (!status) return null;
    const map = {
      invoice_sent: 'Invoice_sent', INVOICE_SENT: 'Invoice_sent',
      open: 'Open', OPEN: 'Open',
      completed: 'Completed', COMPLETED: 'Completed',
      pending: 'Pending', PENDING: 'Pending',
      paid: 'Paid', PAID: 'Paid',
    };
    return map[status] || (status.charAt(0).toUpperCase() + status.slice(1).toLowerCase());
  };

  const statusClass = (status) => {
    if (!status) return '';
    const s = status.toLowerCase().replace(/_/g, '-');
    if (s === 'paid') return 'paid';
    if (s === 'pending') return 'pending';
    if (s === 'open') return 'open';
    if (s.includes('invoice')) return 'invoice-sent';
    if (s === 'completed') return 'completed';
    return '';
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete/cancel this order?')) return;
    setDeleting(true);
    try {
      alert('Order cancellation request sent to admin.');
      router.push('/orders');
    } catch {
      alert('Failed to delete order.');
    } finally {
      setDeleting(false);
    }
  };

  const handleLoadToCart = () => {
    if (!order || !order.items) return;
    const existingCartRaw = localStorage.getItem('capote_b2b_cart');
    let cartObj = {};
    try {
      if (existingCartRaw) cartObj = JSON.parse(existingCartRaw);
    } catch {}

    const itemsToLoad = isEditingDraft ? editableItems : order.items;

    itemsToLoad.forEach(item => {
      const key = `${item.title}-${item.variantTitle || 'default'}-${item.warehouse || 'barcelona'}`;
      cartObj[key] = {
        title: item.title,
        sku: item.sku,
        variantTitle: item.variantTitle,
        variantId: item.variantId || '',
        price: item.price,
        isCustomPrice: true,
        quantity: item.quantity,
        warehouse: item.warehouse || 'barcelona',
        image: item.image || ''
      };
    });

    localStorage.setItem('capote_b2b_cart', JSON.stringify(cartObj));
    localStorage.setItem('capote_b2b_editing_draft_id', id);
    localStorage.setItem('capote_b2b_editing_draft_name', order.name || '');
    window.dispatchEvent(new Event('capote_cart_updated'));

    alert(`✅ Loaded items from ${order.name} into cart! You can now browse the catalog and add products (like Incubus). Click the Cart icon to update this draft order when ready.`);
    router.push('/products');
  };

  // Draft Order Line Item Price & Quantity Handlers
  const handleItemPriceChange = (index, newDisplayPrice) => {
    const updated = [...editableItems];
    const numVal = parseFloat(newDisplayPrice);

    let priceInEur = isNaN(numVal) ? 0 : numVal;
    if (!isNaN(numVal)) {
      if (displayCurrency === 'JPY') priceInEur = numVal / 170;
      else if (displayCurrency === 'CAD') priceInEur = numVal / 1.5;
      else if (displayCurrency === 'USD') priceInEur = numVal / 1.1;
    }

    updated[index] = {
      ...updated[index],
      price: parseFloat(priceInEur.toFixed(4)),
      customDisplayPrice: newDisplayPrice
    };
    setEditableItems(updated);
  };

  const handleItemQtyChange = (index, newQty) => {
    const updated = [...editableItems];
    const qty = parseInt(newQty) || 1;
    updated[index] = { ...updated[index], quantity: Math.max(1, qty) };
    setEditableItems(updated);
  };

  const handleSaveDraftChanges = async () => {
    setSavingDraft(true);
    setSaveSuccessMsg('');
    setError('');

    try {
      const numDiscountVal = parseFloat(discountValue) || 0;
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: editableItems,
          currency: displayCurrency,
          appliedDiscount: numDiscountVal > 0 ? {
            value: numDiscountVal,
            valueType: discountType,
            title: discountType === 'PERCENTAGE' ? `Order Discount (${numDiscountVal}%)` : `Order Discount`
          } : { value: 0, valueType: 'FIXED_AMOUNT' }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update order.');
      }

      setSaveSuccessMsg(data.message || '✅ Order prices, quantities & total discount updated!');
      setIsEditingDraft(false);
      fetchOrderDetail();
    } catch (err) {
      setError(err.message || 'Error updating order.');
    } finally {
      setSavingDraft(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#e8e3da' }}>
        <div style={{ fontSize: '14px', color: '#6b6b6b' }}>Verifying session…</div>
      </div>
    );
  }

  if (orderLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#e8e3da' }}>
        <div style={{ fontSize: '14px', color: '#6b6b6b' }}>Loading order details…</div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div>
        <Navbar user={user} activeTab="orders" currency={displayCurrency} onCurrencyChange={setDisplayCurrency} />
        <main className="app-container" style={{ padding: '40px 0' }}>
          <div style={{ background: '#fce8e6', color: '#c62828', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            {error || 'Order not found.'}
          </div>
          <button className="btn-outline" onClick={() => router.push('/orders')}>← Back to Orders</button>
        </main>
      </div>
    );
  }

  // Currency Conversion Calculations for Display & PDF
  const activeItems = isEditingDraft ? editableItems : (order?.items || []);
  const nativeCurrency = order?.currency || 'EUR';
  
  // Rate conversion helper relative to native order currency
  const getConvertedPrice = (priceInOrderCurrency) => {
    const val = parseFloat(priceInOrderCurrency || 0);
    if (displayCurrency === nativeCurrency) return val;

    // Convert from native to EUR first if needed
    let inEur = val;
    if (nativeCurrency === 'USD') inEur = val / 1.1;
    else if (nativeCurrency === 'CAD') inEur = val / 1.5;
    else if (nativeCurrency === 'JPY') inEur = val / 170;

    // Convert EUR to target displayCurrency
    if (displayCurrency === 'JPY') return Math.round(inEur * 170);
    if (displayCurrency === 'CAD') return parseFloat((inEur * 1.5).toFixed(2));
    if (displayCurrency === 'USD') return parseFloat((inEur * 1.1).toFixed(2));
    return parseFloat(inEur.toFixed(2));
  };

  const sym = getCurrencySymbol(displayCurrency);
  
  const currentSubtotal = activeItems.reduce((sum, item) => sum + (getConvertedPrice(item.price) * item.quantity), 0);
  
  let calculatedDiscountAmount = 0;
  const numDiscountVal = parseFloat(discountValue) || 0;
  if (numDiscountVal > 0) {
    if (discountType === 'PERCENTAGE') {
      calculatedDiscountAmount = currentSubtotal * (numDiscountVal / 100);
    } else {
      calculatedDiscountAmount = getConvertedPrice(numDiscountVal);
    }
  }

  const currentSubtotalAfterDiscount = Math.max(0, currentSubtotal - calculatedDiscountAmount);
  const currentTax = order?.tax ? getConvertedPrice(order.tax) : 0;
  const currentTotal = currentSubtotalAfterDiscount + currentTax;
  const totalQty = activeItems.reduce((sum, item) => sum + item.quantity, 0);

  const isDraftOrder = order.type === 'Draft' || (order.id || '').includes('DraftOrder');

  return (
    <div>
      <Navbar user={user} activeTab="orders" currency={displayCurrency} onCurrencyChange={setDisplayCurrency} />

      <main className="app-container" style={{ paddingBottom: 60 }}>
        {/* Back Link */}
        <div style={{ paddingTop: 24, paddingBottom: 16 }}>
          <a
            href="/orders"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13.5px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            ← Orders
          </a>
        </div>

        {saveSuccessMsg && (
          <div style={{ background: '#e6f4ea', color: '#1e7e34', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13.5px', fontWeight: 600 }}>
            {saveSuccessMsg}
          </div>
        )}

        {error && (
          <div style={{ background: '#fce8e6', color: '#c62828', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13.5px' }}>
            {error}
          </div>
        )}

        {/* Order Details Header Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              ORDER
            </div>
            <h1 style={{ fontSize: '32px', fontWeight: 700, lineHeight: 1.1, marginBottom: 6 }}>
              {order.name}
            </h1>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {formatDate(order.createdAt)}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className={`status-badge ${statusClass(order.status)}`} style={{ fontSize: '13px', padding: '4px 12px' }}>
              {formatStatus(order.status)}
            </span>
            <span className={`order-type-tag ${order.type === 'Order' ? 'regular' : ''}`} style={{ fontSize: '12px', padding: '4px 10px', marginTop: 0 }}>
              {isDraftOrder ? 'Draft Order' : 'Order'}
            </span>

            {/* Display Currency Toggle in Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#faf9f6', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>PDF / DISPLAY:</span>
              <select
                value={displayCurrency}
                onChange={e => {
                  setDisplayCurrency(e.target.value);
                  localStorage.setItem('capote_b2b_currency', e.target.value);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="EUR">EUR (€)</option>
                <option value="USD">USD ($)</option>
                <option value="CAD">CAD (CA$)</option>
                <option value="JPY">JPY (¥)</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 8 }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {sym}{currentTotal?.toLocaleString(undefined, { minimumFractionDigits: displayCurrency === 'JPY' ? 0 : 2 })}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                Currency: {displayCurrency}
              </div>
            </div>
          </div>
        </div>

        {/* 4 Summary Tiles Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: 24
        }}>
          {[
            { label: 'ITEMS', val: totalQty, suffix: '' },
            { label: 'SUBTOTAL', val: `${sym}${currentSubtotal?.toLocaleString(undefined, { minimumFractionDigits: displayCurrency === 'JPY' ? 0 : 2 })}`, suffix: '' },
            { label: 'TAX', val: `${sym}${currentTax?.toLocaleString(undefined, { minimumFractionDigits: displayCurrency === 'JPY' ? 0 : 2 })}`, suffix: '' },
            {
              label: 'CUSTOMER',
              val: order.customer?.name || '—',
              sub: order.customer?.email || ''
            }
          ].map((tile, i) => (
            <div
              key={i}
              style={{
                background: '#f5f3ef',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}
            >
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                {tile.label}
              </span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                {tile.val}
              </span>
              {tile.sub && (
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 2, wordBreak: 'break-all' }}>
                  {tile.sub}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Action Buttons Row */}
        <div style={{
          background: '#f5f3ef',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="btn-outline"
              style={{ padding: '8px 16px', fontSize: '13px' }}
              onClick={() => alert('Invoice emailed to customer.')}
            >
              ✉ Send Invoice
            </button>
            <button
              className="btn-outline"
              style={{ padding: '8px 16px', fontSize: '13px' }}
              onClick={() => handlePrint(false)}
            >
              📄 Save as PDF ({displayCurrency})
            </button>
            <button
              className="btn-outline"
              style={{ padding: '8px 16px', fontSize: '13px' }}
              onClick={() => handlePrint(true)}
            >
              🖨 Invoice Customs ({displayCurrency})
            </button>
            <button
              className="btn-outline"
              style={{ padding: '8px 16px', fontSize: '13px' }}
              onClick={handleLoadToCart}
              title="Add items from this order to cart to modify or add more items"
            >
              🛒 Add Items to Cart
            </button>

            {/* PRICE & QTY EDIT BUTTON (FOR ALL ORDERS) */}
            <button
              className={isEditingDraft ? 'btn-secondary' : 'btn-primary'}
              style={{ padding: '8px 16px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setIsEditingDraft(!isEditingDraft)}
            >
              ✏️ {isEditingDraft ? 'Cancel Editing' : 'Edit Order Prices / Qty'}
            </button>

            <a
              href={`https://admin.shopify.com/store/capote-eyewear/${isDraftOrder ? 'draft_orders' : 'orders'}/${(order.id || '').split('/').pop()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline"
              style={{ padding: '8px 16px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: 'var(--text-primary)' }}
              title="Open and edit this order directly in Shopify Admin"
            >
              ↗ Shopify Admin
            </a>
          </div>

          <button
            className="btn-outline"
            style={{
              borderColor: '#c62828',
              color: '#c62828',
              padding: '8px 16px',
              fontSize: '13px'
            }}
            onClick={handleDelete}
            disabled={deleting}
          >
            🗑 Delete
          </button>
        </div>

        {/* Line Items Table Card */}
        <div className="card">
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                LINE ITEMS {isEditingDraft ? '(EDIT MODE)' : ''}
              </h2>
              {isEditingDraft && (
                <p style={{ fontSize: '12px', color: '#2e7d32', margin: '2px 0 0 0' }}>
                  You can modify unit prices and quantities below, then click Save Draft Changes to sync to Shopify.
                </p>
              )}
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {isEditingDraft && (
                <button
                  className="btn-primary"
                  onClick={handleSaveDraftChanges}
                  disabled={savingDraft}
                  style={{ padding: '6px 14px', fontSize: '13px' }}
                >
                  {savingDraft ? 'Saving to Shopify…' : '💾 Save Draft Changes'}
                </button>
              )}
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {activeItems.length} items
              </span>
            </div>
          </div>

          {/* TOTAL ORDER DISCOUNT CONTROL SECTION */}
          {isEditingDraft && (
            <div style={{ padding: '16px 20px', background: '#f4fbf6', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '13.5px', fontWeight: 700, margin: 0, color: '#1b5e20', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🏷 TOTAL ORDER DISCOUNT
                </h3>
                <p style={{ fontSize: '12px', color: '#555', margin: '2px 0 0 0' }}>
                  Apply an overall discount to the total order subtotal via percentage (%) or fixed amount ({sym})
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {/* Mode Selector */}
                <div style={{ display: 'inline-flex', borderRadius: '6px', border: '1px solid #a8d5b5', overflow: 'hidden', background: '#fff' }}>
                  <button
                    type="button"
                    onClick={() => setDiscountType('PERCENTAGE')}
                    style={{
                      padding: '5px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      border: 'none',
                      background: discountType === 'PERCENTAGE' ? '#1b5e20' : '#f5f3ef',
                      color: discountType === 'PERCENTAGE' ? '#fff' : 'var(--text-primary)',
                      cursor: 'pointer'
                    }}
                  >
                    Percentage (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('FIXED_AMOUNT')}
                    style={{
                      padding: '5px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      border: 'none',
                      borderLeft: '1px solid #a8d5b5',
                      background: discountType === 'FIXED_AMOUNT' ? '#1b5e20' : '#f5f3ef',
                      color: discountType === 'FIXED_AMOUNT' ? '#fff' : 'var(--text-primary)',
                      cursor: 'pointer'
                    }}
                  >
                    Fixed Amount ({sym})
                  </button>
                </div>

                {/* Value Input */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#1b5e20' }}>
                    {discountType === 'PERCENTAGE' ? '%' : sym}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={discountType === 'PERCENTAGE' ? 'e.g. 10' : 'e.g. 50'}
                    value={discountValue}
                    onChange={e => setDiscountValue(e.target.value)}
                    style={{
                      width: '100px',
                      padding: '4px 8px',
                      fontSize: '13px',
                      fontWeight: 700,
                      border: '1px solid #a8d5b5',
                      borderRadius: '4px',
                      background: '#fff',
                      color: '#1b5e20',
                      textAlign: 'right'
                    }}
                  />
                </div>

                {calculatedDiscountAmount > 0 && (
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#1b5e20', background: '#e8f5e9', padding: '4px 10px', borderRadius: '4px' }}>
                    Discount: -{sym}{calculatedDiscountAmount.toLocaleString(undefined, { minimumFractionDigits: displayCurrency === 'JPY' ? 0 : 2 })}
                  </span>
                )}
              </div>
            </div>
          )}

          <table className="order-items-table" style={{ width: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--bg-table-th)' }}>
                <th style={{ padding: '12px 20px' }}>PRODUCT</th>
                <th style={{ padding: '12px 20px' }}>SKU</th>
                <th style={{ padding: '12px 20px' }}>VARIANT</th>
                <th style={{ padding: '12px 20px', textAlign: 'center' }}>QTY</th>
                <th style={{ padding: '12px 20px', textAlign: 'right' }}>UNIT PRICE ({displayCurrency})</th>
                <th style={{ padding: '12px 20px', textAlign: 'right' }}>TOTAL ({displayCurrency})</th>
              </tr>
            </thead>
            <tbody>
              {activeItems.map((item, index) => {
                const itemUnitPrice = getConvertedPrice(item.price);
                const itemTotal = itemUnitPrice * item.quantity;

                return (
                  <tr key={index}>
                    <td style={{ padding: '14px 20px', fontWeight: 600 }}>{item.title}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <span className="sku-text">{item.sku}</span>
                    </td>
                    <td style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>{item.variantTitle}</td>
                    
                    {/* QTY EDIT OR DISPLAY */}
                    <td style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 600 }}>
                      {isEditingDraft ? (
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => handleItemQtyChange(index, e.target.value)}
                          style={{
                            width: '55px',
                            textAlign: 'center',
                            padding: '4px 6px',
                            borderRadius: '4px',
                            border: '1px solid var(--border)',
                            fontWeight: 700
                          }}
                        />
                      ) : (
                        item.quantity
                      )}
                    </td>

                    {/* PRICE EDIT OR DISPLAY */}
                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      {isEditingDraft ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span>{sym}</span>
                          <input
                            type="number"
                            step="0.01"
                            value={item.customDisplayPrice !== undefined ? item.customDisplayPrice : getConvertedPrice(item.price)}
                            onChange={e => handleItemPriceChange(index, e.target.value)}
                            style={{
                              width: '90px',
                              textAlign: 'right',
                              padding: '4px 6px',
                              borderRadius: '4px',
                              border: '1px solid #a8d5b5',
                              background: '#f4fbf6',
                              fontWeight: 700,
                              color: '#1b5e20'
                            }}
                          />
                        </div>
                      ) : (
                        `${sym}${itemUnitPrice.toLocaleString(undefined, { minimumFractionDigits: displayCurrency === 'JPY' ? 0 : 2 })}`
                      )}
                    </td>

                    <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 600 }}>
                      {sym}{itemTotal.toLocaleString(undefined, { minimumFractionDigits: displayCurrency === 'JPY' ? 0 : 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* PRINT-ONLY INVOICE LAYOUT (GENERATES PDF IN SELECTED CURRENCY) */}
      <div id="invoice-print-area" className="print-only">
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #333', paddingBottom: '20px', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, margin: 0, letterSpacing: '1px', color: '#000' }}>CAPOTE</h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#555' }}>Capote Eyewear SL</p>
            <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>Calle de Mallorca 272, Barcelona, Spain</p>
            <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>VAT: ESB67230489</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#000', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {isCustomsPrint ? 'Customs Commercial Invoice' : 'Commercial Invoice'}
            </h2>
            <p style={{ margin: '8px 0 0 0', fontSize: '12.5px', color: '#000' }}><strong>Invoice / Order:</strong> {order.name}</p>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#000' }}><strong>Date:</strong> {new Date(order.createdAt).toLocaleDateString('en-GB')}</p>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#000' }}><strong>Currency:</strong> {displayCurrency} ({sym})</p>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#000' }}><strong>Status:</strong> {order.status}</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '30px', marginBottom: '30px' }}>
          <div>
            <h3 style={{ fontSize: '11px', fontWeight: 700, color: '#555', borderBottom: '1px solid #ddd', paddingBottom: '4px', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
              Exporter / Seller
            </h3>
            <p style={{ margin: 0, fontSize: '12.5px', fontWeight: 600, color: '#000' }}>Capote Eyewear SL</p>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#333' }}>Calle de Mallorca 272</p>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#333' }}>08037 Barcelona</p>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#333' }}>Spain</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#333' }}>Email: wholesale@capoteyewear.com</p>
          </div>

          <div>
            <h3 style={{ fontSize: '11px', fontWeight: 700, color: '#555', borderBottom: '1px solid #ddd', paddingBottom: '4px', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
              Billed To / Buyer
            </h3>
            <p style={{ margin: 0, fontSize: '12.5px', fontWeight: 600, color: '#000' }}>
              {order.billingAddress?.company || order.billingAddress?.name || order.customer?.name || 'B2B Partner'}
            </p>
            {order.billingAddress ? (
              <>
                {order.billingAddress.address1 && <p style={{ margin: 0, fontSize: '12.5px', color: '#333' }}>{order.billingAddress.address1}</p>}
                {order.billingAddress.address2 && <p style={{ margin: 0, fontSize: '12.5px', color: '#333' }}>{order.billingAddress.address2}</p>}
                <p style={{ margin: 0, fontSize: '12.5px', color: '#333' }}>
                  {order.billingAddress.city}{order.billingAddress.province ? `, ${order.billingAddress.province}` : ''} {order.billingAddress.zip}
                </p>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#333' }}>{order.billingAddress.country}</p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '12.5px', color: '#333' }}>Billing Address: Same as Shipping / On File</p>
            )}
            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#333' }}>Email: {order.customer?.email}</p>
          </div>

          <div>
            <h3 style={{ fontSize: '11px', fontWeight: 700, color: '#555', borderBottom: '1px solid #ddd', paddingBottom: '4px', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
              Importer / Ship To
            </h3>
            <p style={{ margin: 0, fontSize: '12.5px', fontWeight: 600, color: '#000' }}>
              {order.shippingAddress?.company || order.shippingAddress?.name || order.customer?.name || 'B2B Partner'}
            </p>
            {order.shippingAddress ? (
              <>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#333' }}>{order.shippingAddress.address1}</p>
                {order.shippingAddress.address2 && <p style={{ margin: 0, fontSize: '12.5px', color: '#333' }}>{order.shippingAddress.address2}</p>}
                <p style={{ margin: 0, fontSize: '12.5px', color: '#333' }}>{order.shippingAddress.city}, {order.shippingAddress.province} {order.shippingAddress.zip}</p>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#333' }}>{order.shippingAddress.country}</p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '12.5px', color: '#333' }}>Address: As registered on file</p>
            )}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333', textAlign: 'left', fontSize: '10.5px', fontWeight: 700, color: '#555' }}>
              <th style={{ padding: '8px 0' }}>DESCRIPTION</th>
              <th>SKU</th>
              {isCustomsPrint && (
                <>
                  <th>HS CODE</th>
                  <th>ORIGIN</th>
                </>
              )}
              <th style={{ textAlign: 'center' }}>QTY</th>
              <th style={{ textAlign: 'right' }}>PRICE ({displayCurrency})</th>
              <th style={{ textAlign: 'right', padding: '8px 0' }}>TOTAL ({displayCurrency})</th>
            </tr>
          </thead>
          <tbody>
            {activeItems.map((item, index) => {
              const itemUnitPrice = getConvertedPrice(item.price);
              const itemTotal = itemUnitPrice * item.quantity;

              return (
                <tr key={index} style={{ borderBottom: '1px solid #eee', fontSize: '12px', color: '#000' }}>
                  <td style={{ padding: '10px 0', fontWeight: 600 }}>{item.title}{item.variantTitle && item.variantTitle !== '—' ? ` - ${item.variantTitle}` : ''}</td>
                  <td>{item.sku}</td>
                  {isCustomsPrint && (
                    <>
                      <td style={{ fontFamily: 'monospace' }}>{item.hsCode || '9004.10.00'}</td>
                      <td>{item.origin || 'ES'}</td>
                    </>
                  )}
                  <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{sym}{itemUnitPrice.toLocaleString(undefined, { minimumFractionDigits: displayCurrency === 'JPY' ? 0 : 2 })}</td>
                  <td style={{ textAlign: 'right', padding: '10px 0', fontWeight: 600 }}>{sym}{itemTotal.toLocaleString(undefined, { minimumFractionDigits: displayCurrency === 'JPY' ? 0 : 2 })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <div style={{ width: '280px', fontSize: '12.5px', color: '#000' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>Subtotal ({displayCurrency}):</span>
              <span>{sym}{currentSubtotal?.toLocaleString(undefined, { minimumFractionDigits: displayCurrency === 'JPY' ? 0 : 2 })}</span>
            </div>
            {calculatedDiscountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#1b5e20', fontWeight: 600 }}>
                <span>Order Discount ({discountType === 'PERCENTAGE' ? `${discountValue}%` : 'Fixed'}):</span>
                <span>-{sym}{calculatedDiscountAmount?.toLocaleString(undefined, { minimumFractionDigits: displayCurrency === 'JPY' ? 0 : 2 })}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>Tax ({order?.tax ? 'Standard' : '0%'}):</span>
              <span>{sym}{currentTax?.toLocaleString(undefined, { minimumFractionDigits: displayCurrency === 'JPY' ? 0 : 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '2px solid #333', fontWeight: 700, fontSize: '14.5px' }}>
              <span>Total Due ({displayCurrency}):</span>
              <span>{sym}{currentTotal?.toLocaleString(undefined, { minimumFractionDigits: displayCurrency === 'JPY' ? 0 : 2 })} {displayCurrency}</span>
            </div>
          </div>
        </div>

        {isCustomsPrint && (
          <div style={{ marginTop: '50px', borderTop: '1px solid #ddd', paddingTop: '15px', fontSize: '10.5px', color: '#555', lineHeight: 1.4 }}>
            <p style={{ margin: '0 0 4px 0', fontWeight: 700, color: '#000' }}>CUSTOMS DECLARATION:</p>
            <p style={{ margin: 0 }}>
              The exporter of the products covered by this document declares that, except where otherwise clearly indicated,
              these products are of preferential origin. We certify that this invoice is true and correct, and that the value
              indicated represents the actual price paid for the goods described.
            </p>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        #invoice-print-area {
          display: none;
        }
        @media print {
          body * {
            visibility: hidden !important;
          }
          #invoice-print-area, #invoice-print-area * {
            visibility: visible !important;
          }
          #invoice-print-area {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          @page {
            size: A4;
            margin: 15mm;
          }
        }
      `}} />
    </div>
  );
}
