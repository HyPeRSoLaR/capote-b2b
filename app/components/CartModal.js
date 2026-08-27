'use client';

import { useState } from 'react';

import { calculateShippingCost } from '@/lib/shipping';

export default function CartModal({
  isOpen,
  onClose,
  cart,
  onUpdateQty,
  onUpdatePrice,
  onRemoveItem,
  onClearCart,
  onConfirmOrder,
  submitting = false,
  discountPercent = 50,
  countryCode = 'ES'
}) {
  const [note, setNote] = useState('');

  if (!isOpen) return null;

  const cartKeys = Object.keys(cart || {});
  const cartItems = cartKeys.map(key => ({ key, ...cart[key] }));
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // Calculate estimated shipping for Barcelona & Canada warehouses
  const barcelonaItemsCount = cartItems.filter(i => (i.warehouse || 'barcelona').toLowerCase() !== 'canada').reduce((sum, i) => sum + i.quantity, 0);
  const canadaItemsCount = cartItems.filter(i => (i.warehouse || '').toLowerCase() === 'canada').reduce((sum, i) => sum + i.quantity, 0);

  const bcnShipping = barcelonaItemsCount > 0 ? calculateShippingCost({ warehouse: 'barcelona', countryCode, totalQuantity: barcelonaItemsCount }) : null;
  const caShipping = canadaItemsCount > 0 ? calculateShippingCost({ warehouse: 'canada', countryCode, totalQuantity: canadaItemsCount }) : null;

  // Group warehouse totals
  const warehouseTotals = cartItems.reduce((acc, item) => {
    const w = (item.warehouse || 'barcelona').toLowerCase();
    if (!acc[w]) {
      acc[w] = {
        quantity: 0,
        wholesale: 0,
        symbol: w === 'japan' ? '¥' : w === 'canada' ? 'CA$' : w === 'us' || w === 'usa' ? '$' : '€'
      };
    }
    const rawPrice = item.price || 0;
    const baseEurWholesale = item.isCustomPrice ? rawPrice : rawPrice * (1 - discountPercent / 100);
    let unitAmount = baseEurWholesale;
    if (w === 'japan') unitAmount = Math.round(baseEurWholesale * 170);
    else if (w === 'canada') unitAmount = parseFloat((baseEurWholesale * 1.5).toFixed(2));
    else if (w === 'us' || w === 'usa') unitAmount = parseFloat((baseEurWholesale * 1.1).toFixed(2));
    else unitAmount = parseFloat(baseEurWholesale.toFixed(2));

    acc[w].quantity += item.quantity;
    acc[w].wholesale += unitAmount * item.quantity;
    return acc;
  }, {});

  const handlePlaceOrder = () => {
    if (onConfirmOrder) {
      onConfirmOrder(note);
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ maxWidth: '680px', width: '92%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        
        {/* Header */}
        <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: '#faf9f6' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              🛒 Shopping Cart <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>({totalItems} items)</span>
            </h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>Review and edit quantities or unit prices before placing draft order</p>
          </div>
          <button className="modal-close" onClick={onClose} style={{ fontSize: '20px', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body / Item List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {cartItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>🛒</div>
              <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Your cart is currently empty</p>
              <p style={{ fontSize: '13px', margin: '6px 0 16px 0' }}>Explore our wholesale catalog to add products.</p>
              <button className="btn-primary" onClick={onClose}>Browse Products</button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {cartItems.map(item => {
                  const w = (item.warehouse || 'barcelona').toLowerCase();
                  const sym = w === 'japan' ? '¥' : w === 'canada' ? 'CA$' : w === 'us' || w === 'usa' ? '$' : '€';
                  const rawPrice = item.price || 0;
                  const baseEurWholesale = item.isCustomPrice ? rawPrice : rawPrice * (1 - discountPercent / 100);
                  let unitPrice = baseEurWholesale;
                  if (w === 'japan') unitPrice = Math.round(baseEurWholesale * 170);
                  else if (w === 'canada') unitPrice = parseFloat((baseEurWholesale * 1.5).toFixed(2));
                  else if (w === 'us' || w === 'usa') unitPrice = parseFloat((baseEurWholesale * 1.1).toFixed(2));
                  else unitPrice = parseFloat(baseEurWholesale.toFixed(2));

                  const itemTotal = unitPrice * item.quantity;

                  return (
                    <div
                      key={item.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 16px',
                        background: '#fcfbfa',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        gap: '12px'
                      }}
                    >
                      {/* Product Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                            {item.productTitle || item.title}
                          </span>
                          <span className={`badge-warehouse ${w}`} style={{ textTransform: 'capitalize', fontSize: '10.5px' }}>
                            {w}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {item.variantTitle && item.variantTitle !== 'Default Title' ? item.variantTitle : ''} {item.sku ? `(${item.sku})` : ''}
                        </div>
                        
                        {/* Unit Price Editing */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#1b5e20' }}>
                            {sym}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={unitPrice}
                            onChange={e => {
                              const p = parseFloat(e.target.value) || 0;
                              if (onUpdatePrice) onUpdatePrice(item.key, p);
                            }}
                            title="Click to edit unit price for draft order"
                            style={{
                              width: '80px',
                              padding: '2px 6px',
                              fontSize: '12.5px',
                              fontWeight: 700,
                              color: '#1b5e20',
                              border: '1px solid #a8d5b5',
                              borderRadius: '4px',
                              background: '#f4fbf6'
                            }}
                          />
                          <span style={{ fontSize: '11px', color: '#666' }}>/ unit {item.isCustomPrice ? '(Custom Override)' : '(B2B)'}</span>
                        </div>
                      </div>

                      {/* Quantity Controls & Remove */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {/* Qty edit */}
                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', background: '#fff' }}>
                          <button
                            onClick={() => onUpdateQty(item.key, item.quantity - 1)}
                            style={{
                              padding: '6px 12px',
                              background: '#f5f3ef',
                              border: 'none',
                              borderRight: '1px solid var(--border)',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: 700,
                              color: 'var(--text-primary)'
                            }}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={e => onUpdateQty(item.key, parseInt(e.target.value) || 1)}
                            style={{
                              width: '42px',
                              textAlign: 'center',
                              border: 'none',
                              fontSize: '13px',
                              fontWeight: 700,
                              padding: '4px 0',
                              color: 'var(--text-primary)',
                              MozAppearance: 'textfield'
                            }}
                          />
                          <button
                            onClick={() => onUpdateQty(item.key, item.quantity + 1)}
                            style={{
                              padding: '6px 12px',
                              background: '#f5f3ef',
                              border: 'none',
                              borderLeft: '1px solid var(--border)',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: 700,
                              color: 'var(--text-primary)'
                            }}
                          >
                            +
                          </button>
                        </div>

                        {/* Item Total */}
                        <div style={{ textAlign: 'right', minWidth: '70px', fontWeight: 700, fontSize: '14px' }}>
                          {sym}{itemTotal.toLocaleString(undefined, { minimumFractionDigits: w === 'japan' ? 0 : 2 })}
                        </div>

                        {/* Remove button */}
                        <button
                          onClick={() => onRemoveItem(item.key)}
                          title="Remove item"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#c62828',
                            fontSize: '16px',
                            padding: '4px'
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Special Instructions / Notes */}
              <div style={{ marginTop: '20px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  📝 Special Instructions / Order Notes
                </label>
                <textarea
                  placeholder="Add any specific requirements, delivery notes, or optical lens specifications..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={2}
                  style={{
                    width: '100%',
                    background: '#fff',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Summary Totals */}
              <div style={{ marginTop: '20px', padding: '16px', background: '#f5f3ef', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  WAREHOUSE TOTALS SUMMARY
                </div>
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                  {Object.entries(warehouseTotals).map(([w, t]) => (
                    <div key={w}>
                      <span style={{ fontSize: '12px', textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{w}: </span>
                      <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>
                        {t.symbol}{t.wholesale.toLocaleString(undefined, { minimumFractionDigits: w === 'japan' ? 0 : 2 })}
                      </strong>
                      <span style={{ fontSize: '11px', color: '#666', marginLeft: '4px' }}>({t.quantity} pcs)</span>
                    </div>
                  ))}
                </div>

                {/* Shipping Rates Breakdown */}
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e0ddd7' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    📦 ESTIMATED FREIGHT & SHIPPING ({countryCode})
                  </div>
                  {bcnShipping && (
                    <div style={{ fontSize: '12.5px', color: '#333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Barcelona Warehouse ({bcnShipping.carrier} ~ {bcnShipping.estKg.toFixed(1)}kg):</span>
                      <strong style={{ color: '#1b5e20' }}>€{bcnShipping.cost.toFixed(2)}</strong>
                    </div>
                  )}
                  {caShipping && (
                    <div style={{ fontSize: '12.5px', color: '#333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <span>Canada Warehouse ({caShipping.carrier} ~ {caShipping.estKg.toFixed(1)}kg):</span>
                      <strong style={{ color: '#1b5e20' }}>CA${caShipping.cost.toFixed(2)}</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {cartItems.length > 0 && (
          <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: '#faf9f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={onClearCart}
              style={{
                background: 'none',
                border: 'none',
                color: '#c62828',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0
              }}
            >
              Clear Cart
            </button>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn-secondary" onClick={onClose}>Continue Shopping</button>
              <button className="btn-primary" onClick={handlePlaceOrder} disabled={submitting}>
                {submitting 
                  ? 'Saving Changes…' 
                  : (typeof window !== 'undefined' && localStorage.getItem('capote_b2b_editing_draft_name'))
                    ? `🔄 Update Order ${localStorage.getItem('capote_b2b_editing_draft_name')}`
                    : '🛒 Place Draft Order'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
