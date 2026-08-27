'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import Pagination from '../components/Pagination';
import { fbEvent } from '@/lib/fbpixel';

const PAGE_SIZE = 15;

export default function CustomersPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [custPage, setCustPage] = useState(1);

  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editPasscode, setEditPasscode] = useState('');
  const [editDiscount, setEditDiscount] = useState(50);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPasscode, setNewPasscode] = useState('123456');
  const [newDiscount, setNewDiscount] = useState(50);
  const [submittingCreate, setSubmittingCreate] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [impersonatingId, setImpersonatingId] = useState('');
  const [sendingInviteId, setSendingInviteId] = useState('');

  const handleSendInvite = async (customerId, email) => {
    setSendingInviteId(customerId);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_invite', customerId })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`✅ Account activation email sent to ${email}.`);
      } else {
        setError(data.error || 'Failed to send activation email.');
      }
    } catch {
      setError('Connection error sending activation email.');
    } finally {
      setSendingInviteId('');
    }
  };

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!res.ok || !data.authenticated) {
          router.push('/auth/login');
          return;
        }
        const tags = data.user?.tags || [];
        const email = data.user?.email?.toLowerCase() || '';
        const isAdmin = tags.some(t => ['b2b-admin', 'admin'].includes(t.toLowerCase())) ||
          email === 'info@capoteyewear.com' || email === 'deanmoriarty190@gmail.com';
        const isAgent = tags.some(t => t.toLowerCase().includes('agent') || t.toLowerCase() === 'kostas');
        
        if (!isAdmin && !isAgent) {
          router.push('/dashboard');
        } else {
          setUser(data.user);
          fetchB2BCustomers();
        }
      } catch {
        router.push('/auth/login');
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, [router]);

  async function fetchB2BCustomers() {
    try {
      setCustomersLoading(true);
      const res = await fetch('/api/admin/customers');
      const data = await res.json();
      if (res.ok) {
        setCustomers(data.customers || []);
        setFilteredCustomers(data.customers || []);
      } else {
        setError(data.error || 'Failed to load customers.');
      }
    } catch {
      setError('Connection error.');
    } finally {
      setCustomersLoading(false);
    }
  }

  useEffect(() => {
    const q = searchQuery.toLowerCase().trim();
    setFilteredCustomers(!q ? customers : customers.filter(c =>
      (c.firstName || '').toLowerCase().includes(q) ||
      (c.lastName || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    ));
    setCustPage(1);
  }, [customers, searchQuery]);

  const handleImpersonate = async (customerId) => {
    setImpersonatingId(customerId);
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId })
      });
      const data = await res.json();
      if (res.ok) {
        router.push('/dashboard');
        router.refresh();
      } else {
        alert(data.error || 'Impersonation failed.');
      }
    } catch {
      alert('Error initiating impersonation.');
    } finally {
      setImpersonatingId('');
    }
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSubmittingEdit(true);
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: editingCustomer.id, passcode: editPasscode, discountPercent: parseInt(editDiscount) })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Update failed.');
      } else {
        setSuccessMsg('✅ B2B partner credentials updated.');
        setEditingCustomer(null);
        fetchB2BCustomers();
      }
    } catch {
      setError('An error occurred.');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSubmittingCreate(true);
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          email: newEmail,
          firstName: newFirstName,
          lastName: newLastName,
          passcode: newPasscode,
          discountPercent: parseInt(newDiscount)
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Creation failed.');
      } else {
        fbEvent("CompleteRegistration", { content_category: "B2B" });
        setSuccessMsg('✅ B2B partner customer created successfully.');
        setCreateModalOpen(false);
        setNewEmail('');
        setNewFirstName('');
        setNewLastName('');
        setNewPasscode('123456');
        setNewDiscount(50);
        fetchB2BCustomers();
      }
    } catch {
      setError('An error occurred.');
    } finally {
      setSubmittingCreate(false);
    }
  };

  const openEditModal = (c) => {
    setEditingCustomer(c);
    setEditPasscode(c.passcode || '');
    setEditDiscount(c.discountPercent || 50);
  };

  const getCustomerName = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || '—';
  const getInitial = (c) => (c.firstName || c.email || '?').charAt(0).toUpperCase();

  const pagedCustomers = filteredCustomers.slice((custPage - 1) * PAGE_SIZE, custPage * PAGE_SIZE);

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#e8e3da' }}>
        <div style={{ fontSize: '14px', color: '#6b6b6b' }}>Verifying session…</div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <Navbar user={user} activeTab="customers" />

      <main className="app-container">
        <div className="page-header">
          <div className="page-label">CRM</div>
          <div className="page-title-row">
            <h1 className="page-title">Customers</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="page-count">👥 <strong>{filteredCustomers.length}</strong> accounts</span>
              <button className="btn-primary" onClick={() => setCreateModalOpen(true)}>
                👤 Add Customer
              </button>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="search-bar">
          <span className="search-bar__icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, email, or company..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}
        {successMsg && <div style={{ background: '#e6f4ea', color: '#1e7e34', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>{successMsg}</div>}

        {/* Table list */}
        <div className="data-table-wrap">
          {customersLoading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9e9e9e', fontSize: '14px' }}>Loading customers…</div>
          ) : pagedCustomers.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9e9e9e', fontSize: '14px' }}>No customers found.</div>
          ) : (
            <>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Email</th>
                    <th style={{ textAlign: 'center' }}>Orders</th>
                    <th>Tags</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCustomers.map(customer => {
                    const name = getCustomerName(customer);
                    const orderCount = customer.orderCount || 0;
                    const b2bTags = (customer.tags || []).filter(t =>
                      t.toLowerCase().includes('b2b') || t.toLowerCase().includes('wholesale') ||
                      t.toLowerCase() === 'shop' || t.toLowerCase().startsWith('agent') ||
                      t.toLowerCase().startsWith('edouard') || t.toLowerCase().startsWith('8 agency')
                    );

                    return (
                      <tr key={customer.id}>
                        <td>
                          <div className="customer-row">
                            <div className="customer-avatar">{getInitial(customer)}</div>
                            <div style={{ fontWeight: 600 }}>{name}</div>
                          </div>
                        </td>
                        <td>
                          <span style={{ color: '#6b6b6b', fontSize: '13px' }}>✉ {customer.email}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`order-count-badge ${orderCount === 0 ? 'zero' : ''}`}>
                            {orderCount}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                            {b2bTags.slice(0, 4).map(tag => (
                              <span key={tag} className={`tag-pill ${tag.toLowerCase().startsWith('agent') || tag.toLowerCase().startsWith('8') || tag.toLowerCase() === 'shop' ? 'highlighted' : ''}`}>
                                    {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button
                              className="impersonate-btn"
                              style={{ color: '#1e7e34', borderColor: '#ceead6', background: '#e6f4ea' }}
                              disabled={sendingInviteId === customer.id}
                              onClick={() => handleSendInvite(customer.id, customer.email)}
                              title="Send official Shopify account activation email to client"
                            >
                              {sendingInviteId === customer.id ? 'Sending…' : '✉ Send Invite'}
                            </button>
                            <button
                              className="impersonate-btn"
                              style={{ color: '#6b6b6b' }}
                              onClick={() => openEditModal(customer)}
                            >
                              Edit
                            </button>
                            <button
                              className="impersonate-btn"
                              disabled={impersonatingId === customer.id}
                              onClick={() => handleImpersonate(customer.id)}
                            >
                              {impersonatingId === customer.id ? 'Connecting…' : 'Impersonate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination
                page={custPage}
                pageSize={PAGE_SIZE}
                total={filteredCustomers.length}
                onPage={setCustPage}
              />
            </>
          )}
        </div>
      </main>

      {/* EDIT CUSTOMER MODAL */}
      {editingCustomer && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setEditingCustomer(null); }}>
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h2>Edit B2B Partner</h2>
                <p>{getCustomerName(editingCustomer)} — {editingCustomer.email}</p>
              </div>
              <button className="modal-close" onClick={() => setEditingCustomer(null)}>✕</button>
            </div>
            <form onSubmit={handleUpdateCustomer}>
              <div className="form-group">
                <label className="form-label">Login Passcode</label>
                <input
                  type="text"
                  className="form-input"
                  value={editPasscode}
                  onChange={e => setEditPasscode(e.target.value)}
                  placeholder="Set a unique passcode..."
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">B2B Discount % (off retail price)</label>
                <input
                  type="number"
                  className="form-input"
                  min={0} max={100}
                  value={editDiscount}
                  onChange={e => setEditDiscount(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditingCustomer(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={submittingEdit}>
                  {submittingEdit ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* CREATE CUSTOMER MODAL */}
      {createModalOpen && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setCreateModalOpen(false); }}>
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h2>Add B2B Partner</h2>
                <p>Register a new B2B client customer account</p>
              </div>
              <button className="modal-close" onClick={() => setCreateModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateCustomer}>
              <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">First Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newFirstName}
                    onChange={e => setNewFirstName(e.target.value)}
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newLastName}
                    onChange={e => setNewLastName(e.target.value)}
                    placeholder="Doe"
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Email Address (required)</label>
                <input
                  type="email"
                  className="form-input"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="partner@client.com"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Login Passcode</label>
                <input
                  type="text"
                  className="form-input"
                  value={newPasscode}
                  onChange={e => setNewPasscode(e.target.value)}
                  placeholder="Set login passcode..."
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">B2B Discount % (off retail price)</label>
                <input
                  type="number"
                  className="form-input"
                  min={0} max={100}
                  value={newDiscount}
                  onChange={e => setNewDiscount(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setCreateModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={submittingCreate}>
                  {submittingCreate ? 'Creating…' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
