'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';

export default function HsCodesPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [mappings, setMappings] = useState([]);
  const [mappingsLoading, setMappingsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredMappings, setFilteredMappings] = useState([]);

  // Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
  const [currentMappingId, setCurrentMappingId] = useState('');
  const [baseCode, setBaseCode] = useState('90041000');
  const [country, setCountry] = useState('');
  const [nationalCode, setNationalCode] = useState('9004.10.00');
  const [description, setDescription] = useState('N/A');
  const [nationalLabel, setNationalLabel] = useState('HS Code');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);

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
        fetchMappings();
      } catch {
        router.push('/auth/login');
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, [router]);

  async function fetchMappings() {
    try {
      setMappingsLoading(true);
      const res = await fetch('/api/admin/hs-codes');
      const data = await res.json();
      if (res.ok) {
        setMappings(data.mappings || []);
        setFilteredMappings(data.mappings || []);
      } else {
        setError(data.error || 'Failed to load HS codes.');
      }
    } catch {
      setError('Connection error.');
    } finally {
      setMappingsLoading(false);
    }
  }

  useEffect(() => {
    const q = searchQuery.toLowerCase().trim();
    setFilteredMappings(!q ? mappings : mappings.filter(m =>
      (m.baseCode || '').toLowerCase().includes(q) ||
      (m.country || '').toLowerCase().includes(q) ||
      (m.description || '').toLowerCase().includes(q) ||
      (m.nationalCode || '').toLowerCase().includes(q)
    ));
  }, [mappings, searchQuery]);

  const handleOpenAdd = () => {
    setModalMode('add');
    setCurrentMappingId('');
    setBaseCode('90041000');
    setCountry('');
    setNationalCode('9004.10.00');
    setDescription('N/A');
    setNationalLabel('HS Code');
    setModalOpen(true);
  };

  const handleOpenEdit = (m) => {
    setModalMode('edit');
    setCurrentMappingId(m.id);
    setBaseCode(m.baseCode);
    setCountry(m.country);
    setNationalCode(m.nationalCode);
    setDescription(m.description);
    setNationalLabel(m.nationalLabel);
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this mapping?')) return;
    try {
      const res = await fetch(`/api/admin/hs-codes?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccessMsg('✅ Mapping deleted.');
        fetchMappings();
      } else {
        setError('Failed to delete mapping.');
      }
    } catch {
      setError('Connection error.');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSaving(true);

    const payload = { baseCode, country, nationalCode, description, nationalLabel };
    if (modalMode === 'edit') payload.id = currentMappingId;

    try {
      const res = await fetch('/api/admin/hs-codes', {
        method: modalMode === 'edit' ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`✅ Mapping ${modalMode === 'edit' ? 'updated' : 'added'} successfully.`);
        setModalOpen(false);
        fetchMappings();
      } else {
        setError(data.error || 'Failed to save mapping.');
      }
    } catch {
      setError('Connection error.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#e8e3da' }}>
        <div style={{ fontSize: '14px', color: '#6b6b6b' }}>Verifying session…</div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <Navbar user={user} activeTab="hs-codes" />

      <main className="app-container">
        <div className="page-header">
          <div className="page-label">CUSTOMS & LOGISTICS</div>
          <div className="page-title-row">
            <h1 className="page-title">HS Code Mappings</h1>
            <button className="btn-primary" onClick={handleOpenAdd}>
              Add HS Code Mapping
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="search-bar">
          <span className="search-bar__icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by HS code, country, or description..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}
        {successMsg && <div style={{ background: '#e6f4ea', color: '#1e7e34', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>{successMsg}</div>}

        {/* Table list */}
        <div className="data-table-wrap">
          {mappingsLoading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9e9e9e', fontSize: '14px' }}>Loading mappings…</div>
          ) : filteredMappings.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9e9e9e', fontSize: '14px' }}>No HS code mappings found.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Base HS Code</th>
                  <th>Country</th>
                  <th>National HS Code</th>
                  <th>Description</th>
                  <th>National HS Label</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMappings.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{m.baseCode}</td>
                    <td>{m.country}</td>
                    <td>{m.nationalCode}</td>
                    <td style={{ color: '#6b6b6b' }}>{m.description}</td>
                    <td>{m.nationalLabel}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button
                          className="impersonate-btn"
                          style={{ background: '#0288d1', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px' }}
                          onClick={() => handleOpenEdit(m)}
                        >
                          Edit
                        </button>
                        <button
                          className="impersonate-btn"
                          style={{ background: '#d32f2f', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px' }}
                          onClick={() => handleDelete(m.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* ADD/EDIT MODAL */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h2>{modalMode === 'edit' ? 'Edit HS Code Mapping' : 'Add HS Code Mapping'}</h2>
                <p>Configure national customs code overrides</p>
              </div>
              <button className="modal-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">Base HS Code</label>
                <input
                  type="text"
                  className="form-input"
                  value={baseCode}
                  onChange={e => setBaseCode(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Country (e.g. France (FR))</label>
                <input
                  type="text"
                  className="form-input"
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  placeholder="e.g. France (FR)"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">National HS Code</label>
                <input
                  type="text"
                  className="form-input"
                  value={nationalCode}
                  onChange={e => setNationalCode(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-input"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">National HS Label</label>
                <input
                  type="text"
                  className="form-input"
                  value={nationalLabel}
                  onChange={e => setNationalLabel(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
