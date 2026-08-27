'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Navbar({ user, activeTab, cartCount = 0, onCartClick, currency: propCurrency, onCurrencyChange }) {
  const router = useRouter();

  const [currency, setCurrency] = useState('EUR');

  useEffect(() => {
    const savedCurrency = localStorage.getItem('capote_b2b_currency');
    if (savedCurrency) {
      setCurrency(savedCurrency);
    } else if (user?.currency) {
      setCurrency(user.currency);
    }
  }, [user]);

  useEffect(() => {
    if (propCurrency) {
      setCurrency(propCurrency);
    }
  }, [propCurrency]);

  const handleCurrencyChange = (e) => {
    const newCurr = e.target.value;
    setCurrency(newCurr);
    localStorage.setItem('capote_b2b_currency', newCurr);
    if (onCurrencyChange) {
      onCurrencyChange(newCurr);
    }
    window.dispatchEvent(new Event('capote_currency_changed'));
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
      router.push('/auth/login');
      router.refresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleStopImpersonation = async () => {
    try {
      const res = await fetch('/api/admin/stop-impersonate', { method: 'POST' });
      if (res.ok) {
        router.push('/customers');
        router.refresh();
      } else {
        alert('Failed to stop impersonation.');
      }
    } catch {
      alert('Error occurred.');
    }
  };

  const isAdmin = Boolean(user?.tags?.some(t => ['b2b-admin', 'admin'].includes(t.toLowerCase())) && !user?.impersonatedBy);
  const isAgent = Boolean(user?.tags?.some(t => t.toLowerCase().startsWith('agent_') || t.toLowerCase() === 'agent') && !user?.impersonatedBy);

  return (
    <nav className="navbar">
      <div className="app-container navbar__inner">
        {/* Brand */}
        <a href="/dashboard" className="navbar__brand">
          Capote <span>B2B</span>
        </a>

        {/* Nav Links */}
        <div className="navbar__menu">
          <a href="/dashboard" className={`navbar__link${activeTab === 'dashboard' ? ' active' : ''}`}>
            Dashboard
          </a>
          {(isAdmin || isAgent) && (
            <a href="/customers" className={`navbar__link${activeTab === 'customers' ? ' active' : ''}`}>
              Customers
            </a>
          )}
          <a href="/orders" className={`navbar__link${activeTab === 'orders' ? ' active' : ''}`}>
            Orders
          </a>
          <a href="/products" className={`navbar__link${activeTab === 'products' ? ' active' : ''}`}>
            Products
          </a>
          {isAdmin && (
            <a href="/hs-codes" className={`navbar__link${activeTab === 'hs-codes' ? ' active' : ''}`}>
              HS Codes
            </a>
          )}
        </div>

        {/* Right side */}
        <div className="navbar__meta">
          {/* Currency Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Select preferred currency">
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>CURRENCY:</span>
            <select
              value={currency}
              onChange={handleCurrencyChange}
              className="navbar__currency-select"
              style={{
                background: '#f5f3ef',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '12.5px',
                fontWeight: 600,
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

          {user?.impersonatedBy && (
            <button
              onClick={handleStopImpersonation}
              style={{
                background: '#d32f2f',
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                marginRight: '8px'
              }}
            >
              Stop Impersonation
            </button>
          )}

          {cartCount > 0 && (
            <button className="navbar__cart-btn" onClick={onCartClick}>
              🛒 View Cart
              <span style={{
                background: '#1a1a1a',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 700,
                padding: '1px 7px',
                borderRadius: '10px'
              }}>{cartCount}</span>
            </button>
          )}

          {user && (
            <span className="navbar__user-info">
              <strong>{user.firstName || user.name || user.email}</strong>
              <span style={{ fontSize: '12px', color: '#9e9e9e' }}>
                {user.impersonatedBy ? ' (customer)' : isAdmin ? ' (admin)' : ''}
              </span>
            </span>
          )}

          <button
            className="navbar__logout"
            onClick={handleLogout}
            title="Log out"
          >
            ⏏
          </button>
        </div>
      </div>
    </nav>
  );
}
