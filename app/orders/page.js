'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 15;

export default function OrdersHistoryPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draftOrders, setDraftOrders] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!res.ok || !data.authenticated) {
          router.push('/auth/login');
        } else {
          setUser(data.user);
          fetchOrders();
        }
      } catch { router.push('/auth/login'); }
      finally { setLoading(false); }
    }
    checkSession();
  }, [router]);

  async function fetchOrders(retryCount = 0) {
    const MAX_RETRIES = 2;
    try {
      setOrdersLoading(true);
      setError(null);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch('/api/orders/history', { signal: controller.signal });
      clearTimeout(timeout);
      let data = {};
      try { data = await res.json(); } catch {}
      if (res.ok) {
        setDraftOrders(data.draftOrders || []);
        setCompletedOrders(data.completedOrders || []);
        setError(null);
      } else if (retryCount < MAX_RETRIES && (res.status === 429 || res.status >= 500)) {
        await new Promise(r => setTimeout(r, 1500 * (retryCount + 1)));
        return fetchOrders(retryCount + 1);
      } else {
        setError(data.error || 'Could not load your orders');
      }
    } catch (err) {
      if (retryCount < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1500 * (retryCount + 1)));
        return fetchOrders(retryCount + 1);
      }
      setError('Could not load your orders. Please check your connection.');
    } finally { setOrdersLoading(false); }
  }


  const getCurrencySymbol = code => code === 'JPY' ? '¥' : code === 'CAD' ? 'CA$' : '€';

  const formatDate = isoString => {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const formatStatus = status => {
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

  const statusClass = status => {
    if (!status) return '';
    const s = status.toLowerCase().replace(/_/g, '-');
    if (s === 'paid') return 'paid';
    if (s === 'pending') return 'pending';
    if (s === 'open') return 'open';
    if (s.includes('invoice')) return 'invoice-sent';
    if (s === 'completed') return 'completed';
    return '';
  };

  const allOrders = [
    ...draftOrders.map(o => ({ ...o, type: 'Draft' })),
    ...completedOrders.map(o => ({ ...o, type: 'Order' })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const filteredOrders = allOrders.filter(o => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = !q || o.name?.toLowerCase().includes(q) || o.customer?.name?.toLowerCase().includes(q) || o.customer?.email?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || o.status?.toLowerCase() === statusFilter.toLowerCase();
    const matchType = typeFilter === 'all' || o.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const pagedOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalOrders = draftOrders.length + completedOrders.length;

  const getCustomerInitial = order => {
    const name = order.customer?.name || order.customer?.email || '?';
    return name.charAt(0).toUpperCase();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#e8e3da' }}>
        <div style={{ fontSize: '14px', color: '#6b6b6b' }}>Verifying session…</div>
      </div>
    );
  }

  return (
    <div>
      <Navbar user={user} activeTab="orders" />

      <main className="app-container">
        <div className="page-header">
          <div className="page-label">ORDER MANAGEMENT</div>
          <div className="page-title-row">
            <h1 className="page-title">Orders</h1>
            <span className="page-count">≡ <strong>{totalOrders}</strong> orders</span>
          </div>
        </div>

        {/* Search */}
        <div className="search-bar">
          <span className="search-bar__icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by order ID, customer name, or email..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>

        {/* Filters */}
        <div className="toolbar-row">
          <select className="toolbar-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="invoice_sent">Invoice Sent</option>
            <option value="completed">Completed</option>
          </select>
          <select className="toolbar-select" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
            <option value="all">All Types</option>
            <option value="Draft">Draft Orders</option>
            <option value="Order">Standard Orders</option>
          </select>
        </div>

        {/* Orders Table */}
        <div className="data-table-wrap">
          {ordersLoading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9e9e9e', fontSize: '14px' }}>
              Loading orders…
            </div>
          ) : error ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ background: '#fce8e6', color: '#c62828', padding: '12px 16px', borderRadius: '8px', maxWidth: '440px', margin: '0 auto 16px', fontSize: '13.5px' }}>
                ⚠️ {error}
              </div>
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '8px 24px', fontSize: '13px', cursor: 'pointer' }}
                onClick={() => fetchOrders(0)}
              >
                🔄 Retry
              </button>
            </div>
          ) : pagedOrders.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9e9e9e', fontSize: '14px' }}>
              No orders found.
            </div>
          ) : (
            <>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th style={{ textAlign: 'center' }}>Items</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedOrders.map(order => {
                    const sym = getCurrencySymbol(order.currency);
                    const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) || 0;
                    const status = formatStatus(order.status);

                    return (
                      <tr
                        key={order.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          const numId = order.id.split('/').pop();
                          router.push(`/orders/${numId}`);
                        }}
                      >
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '14px' }}>{order.name}</div>
                        </td>
                        <td>
                          <div className="customer-row">
                            <div className="customer-avatar">{getCustomerInitial(order)}</div>
                            <div>
                              <div style={{ fontWeight: 500 }}>{order.customer?.name || order.customer?.email || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="items-badge">{itemCount}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {sym}{order.total?.toLocaleString(undefined, { minimumFractionDigits: order.currency === 'JPY' ? 0 : 2 })}
                        </td>
                        <td>
                          {status && (
                            <span className={`status-badge ${statusClass(order.status)}`}>
                              {status}
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: '13px' }}>{formatDate(order.createdAt)}</div>
                          <div>
                            <span className={`order-type-tag ${order.type === 'Order' ? 'regular' : ''}`}>
                              {order.type === 'Draft' ? 'Draft Order' : 'Order'}
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {order.type === 'Draft' && order.invoiceUrl && (
                              <a
                                href={order.invoiceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="row-action-btn"
                                title="Edit / View Invoice"
                                onClick={e => e.stopPropagation()}
                              >
                                ✏
                              </a>
                            )}
                            <span className="row-action-btn">›</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={filteredOrders.length}
                onPage={setPage}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
