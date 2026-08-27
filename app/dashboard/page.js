'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Admin tabs: 'dashboard' | 'customers' (customers will redirect to /customers)
  const [activeAdminTab, setActiveAdminTab] = useState('dashboard');

  const [salesData, setSalesData] = useState(null);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesRange, setSalesRange] = useState('all');

  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!res.ok || !data.authenticated) {
          router.push('/auth/login');
          return;
        }
        setUser(data.user);
        
        // If admin, load analytics data
        const tags = data.user.tags || [];
        const email = data.user.email?.toLowerCase();
        const isAdmin = tags.some(t => ['b2b-admin', 'admin'].includes(t.toLowerCase())) ||
          email === 'info@capoteyewear.com' || email === 'deanmoriarty190@gmail.com';
        
        if (isAdmin && !data.user.impersonatedBy) {
          fetchSalesData();
        }
      } catch {
        router.push('/auth/login');
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, [router, salesRange]);

  async function fetchSalesData() {
    try {
      setSalesLoading(true);
      const res = await fetch(`/api/admin/sales?range=${salesRange}`);
      const data = await res.json();
      if (res.ok) setSalesData(data);
    } catch {}
    finally { setSalesLoading(false); }
  }

  const formatAmount = (amount, currency) => {
    const sym = currency === 'JPY' ? '¥' : currency === 'CAD' ? 'CA$' : '€';
    return `${sym}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: currency === 'JPY' ? 0 : 2 })}`;
  };

  const formatDate = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const statusClass = status => {
    const s = (status || '').toLowerCase().replace(/_/g, '-');
    if (s === 'paid') return 'paid';
    if (s === 'pending') return 'pending';
    if (s === 'open') return 'open';
    if (s.includes('invoice')) return 'invoice-sent';
    return '';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#e8e3da' }}>
        <div style={{ fontSize: '14px', color: '#6b6b6b' }}>Verifying session…</div>
      </div>
    );
  }

  const isAdmin = user?.tags?.some(t => ['b2b-admin', 'admin'].includes(t.toLowerCase())) && !user.impersonatedBy;

  // ── RENDER CUSTOMER DASHBOARD ──
  if (!isAdmin) {
    const displayName = (user.firstName || user.name || user.email).toUpperCase();
    return (
      <div>
        <Navbar user={user} activeTab="dashboard" />
        <main className="app-container" style={{ paddingBottom: 60 }}>
          <div style={{ padding: '40px 0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div className="page-label">WELCOME BACK</div>
              <h1 className="page-title">{displayName}</h1>
            </div>
            <button className="btn-primary" onClick={() => router.push('/products')}>
              Shop Products →
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 10 }}>
            {[
              {
                title: 'Browse Products',
                sub: 'View our complete product catalog',
                icon: '🛒',
                action: () => router.push('/products')
              },
              {
                title: 'Order History',
                sub: 'View your past orders and status',
                icon: '🕒',
                action: () => router.push('/orders')
              },
              {
                title: 'Account Settings',
                sub: 'Update your account information',
                icon: '⚙️',
                action: () => router.push('/account')
              }
            ].map(card => (
              <button
                key={card.title}
                onClick={card.action}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-card)',
                  boxShadow: 'var(--shadow-card)',
                  padding: '30px 24px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  transition: 'var(--transition)'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-focus)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <span style={{ fontSize: 32 }}>{card.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {card.title}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {card.sub}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ── RENDER ADMIN DASHBOARD ──
  return (
    <div style={{ paddingBottom: 40 }}>
      <Navbar user={user} activeTab="dashboard" />

      <main className="app-container">
        <div className="page-header">
          <div className="page-label">ADMINISTRATION</div>
          <h1 className="page-title">Admin Dashboard</h1>
        </div>

        {/* Sub-tabs inside admin dashboard */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid #e2ddd6' }}>
          <button
            onClick={() => setActiveAdminTab('dashboard')}
            style={{
              padding: '10px 20px',
              fontWeight: 600,
              borderBottom: '2px solid #1a1a1a',
              color: '#1a1a1a',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              marginBottom: -1,
            }}
          >
            Dashboard
          </button>
          <button
            onClick={() => router.push('/customers')}
            style={{
              padding: '10px 20px',
              fontWeight: 400,
              borderBottom: '2px solid transparent',
              color: '#6b6b6b',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              marginBottom: -1,
            }}
          >
            Customers
          </button>
        </div>

        {/* Sync Card */}
        <div className="sync-card">
          <div className="sync-card__header">
            <div>
              <div className="sync-card__title">Data Synchronization</div>
              {salesData?.lastSync && (
                <div className="sync-card__meta">
                  Last synchronized: {formatDate(salesData.lastSync)}
                </div>
              )}
            </div>
            <button
              className="btn-outline"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true); setSyncMsg('');
                try {
                  const res = await fetch(`/api/admin/sales?range=${salesRange}`);
                  const data = await res.json();
                  if (res.ok) {
                    setSalesData(data);
                    setSyncMsg('✅ Data refreshed successfully.');
                  } else {
                    setSyncMsg('❌ Refresh failed.');
                  }
                } catch { setSyncMsg('❌ Refresh failed.'); }
                finally { setSyncing(false); setTimeout(() => setSyncMsg(''), 4000); }
              }}
            >
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
          {syncMsg && <div style={{ fontSize: 13, color: syncMsg.includes('✅') ? '#1e7e34' : '#c62828', marginBottom: 8 }}>{syncMsg}</div>}
          <div className="sync-results">
            {[
              { label: 'Products', added: 0, updated: salesData?.productCount || 0, removed: 0 },
              { label: 'Variants', added: 0, updated: salesData?.variantCount || 0, removed: 0 },
              { label: 'Customers', added: 0, updated: salesData?.customerCount || 0, removed: 0 },
            ].map(g => (
              <div key={g.label}>
                <div className="sync-result-group__title">{g.label}</div>
                <div className="sync-result-group__row">Added: <span>{g.added}</span></div>
                <div className="sync-result-group__row">Updated: <span>{g.updated}</span></div>
                <div className="sync-result-group__row">Removed: <span>{g.removed}</span></div>
              </div>
            ))}
          </div>
        </div>

        {/* Stat Cards */}
        <div className="stat-cards-row">
          {[
            { label: 'PRODUCTS', value: salesData?.productCount ?? '…', icon: '⚙️', color: 'blue' },
            { label: 'CUSTOMERS', value: salesData?.customerCount ?? '…', icon: '👥', color: 'green' },
            { label: 'ORDERS', value: salesData?.orderCount ?? '…', icon: '≡', color: 'purple' },
            { label: 'LAST SYNC', value: salesData?.lastSync ? new Date(salesData.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—', icon: '🕐', color: 'orange' },
          ].map(card => (
            <div key={card.label} className={`stat-card ${card.color}`}>
              <div className="stat-card__label">{card.label}</div>
              <div className="stat-card__value">{card.value}</div>
              <div className="stat-card__icon">{card.icon}</div>
            </div>
          ))}
        </div>

        {/* Grid layout */}
        <div className="dashboard-grid">
          <div className="recent-orders-card">
            <div className="recent-orders-card__header">
              <div className="recent-orders-card__title">Recent Orders</div>
              <a href="/orders" className="view-all-link">View all →</a>
            </div>
            {salesLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>Loading…</div>
            ) : !salesData?.recentOrders?.length ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>No recent orders.</div>
            ) : salesData.recentOrders.slice(0, 6).map(order => {
              const numId = order.id.split('/').pop();
              return (
                <div
                  key={order.id}
                  className="recent-order-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/orders/${numId}`)}
                >
                  <div className="customer-avatar" style={{ fontSize: 13, width: 32, height: 32 }}>
                    {(order.customerName || order.customer || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="recent-order-info">
                    <div className="recent-order-name">{order.customerName || order.customer || '—'}</div>
                    <div className="recent-order-meta">
                      {order.name} · {formatDate(order.createdAt || order.date)}
                    </div>
                  </div>
                  <span className={`status-badge ${statusClass(order.status)}`} style={{ fontSize: 11 }}>
                    {order.status?.charAt(0).toUpperCase() + order.status?.slice(1).toLowerCase()}
                  </span>
                  <div className="recent-order-amount">
                    {formatAmount(order.total, order.currency)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="quick-actions-card">
            <div className="quick-actions-card__title">Quick Actions</div>
            {[
              { label: 'Customers', sub: 'Manage B2B accounts', icon: '👥', href: '/customers' },
              { label: 'Products', sub: 'Browse catalog', icon: '⚙️', href: '/products' },
              { label: 'Orders', sub: 'Status and history', icon: '≡', href: '/orders' },
              { label: 'HS Codes', sub: 'Manage code mappings', icon: '🏷️', href: '/admin/hs-codes' },
            ].map(item => (
              <a key={item.label} href={item.href} className="quick-action-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className="quick-action-item__icon">{item.icon}</span>
                  <div>
                    <div className="quick-action-item__label">{item.label}</div>
                    <div className="quick-action-item__sub">{item.sub}</div>
                  </div>
                </div>
                <span className="quick-action-item__arrow">›</span>
              </a>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
