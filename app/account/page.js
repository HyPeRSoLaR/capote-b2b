'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';

export default function AccountPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!res.ok || !data.authenticated) {
          router.push('/auth/login');
        } else {
          setUser(data.user);
          fetchProfile();
        }
      } catch {
        router.push('/auth/login');
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, [router]);

  async function fetchProfile() {
    try {
      setProfileLoading(true);
      const res = await fetch('/api/account');
      const data = await res.json();
      if (res.ok) {
        setProfile(data.profile);
      } else {
        setError(data.error || 'Failed to load profile.');
      }
    } catch {
      setError('Connection error.');
    } finally {
      setProfileLoading(false);
    }
  }

  const handlePasscodeUpdate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (passcode !== confirmPasscode) {
      setError('Passcodes do not match.');
      return;
    }
    if (passcode.trim().length < 4) {
      setError('Passcode must be at least 4 characters long.');
      return;
    }

    setFormLoading(true);
    try {
      const response = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to update passcode.');
      } else {
        setSuccessMsg('✅ B2B passcode updated successfully!');
        setPasscode('');
        setConfirmPasscode('');
      }
    } catch {
      setError('An error occurred.');
    } finally {
      setFormLoading(false);
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
      <Navbar user={user} activeTab="dashboard" />

      <main className="app-container">
        <div className="page-header">
          <div className="page-label">SETTINGS</div>
          <h1 className="page-title">My Account</h1>
        </div>

        {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}
        {successMsg && <div style={{ background: '#e6f4ea', color: '#1e7e34', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>{successMsg}</div>}

        {profileLoading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#9e9e9e', fontSize: '14px' }}>Loading profile…</div>
        ) : !profile ? (
          <div className="login-error">Failed to load profile.</div>
        ) : (
          <div className="account-grid">
            {/* PROFILE CARD */}
            <div className="account-card-info">
              <h2 style={{ fontSize: '18px', fontWeight: 600, borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
                Company Information
              </h2>
              <div className="info-row">
                <span className="info-label">Contact Person</span>
                <span className="info-value">{profile.firstName} {profile.lastName}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Email Address</span>
                <span className="info-value">{profile.email}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Wholesale Discount</span>
                <span className="info-value" style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>{profile.discountPercent}% off retail</span>
              </div>

              {profile.defaultAddress && (
                <div style={{ marginTop: '24px' }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: '10px' }}>
                    Default Shipping Address
                  </h3>
                  <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.5, background: 'var(--bg-table-th)', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{profile.firstName} {profile.lastName}</p>
                    <p>{profile.defaultAddress.address1}</p>
                    {profile.defaultAddress.address2 && <p>{profile.defaultAddress.address2}</p>}
                    <p>{profile.defaultAddress.city}, {profile.defaultAddress.province} {profile.defaultAddress.zip}</p>
                    <p>{profile.defaultAddress.country}</p>
                  </div>
                </div>
              )}
            </div>

            {/* SECURITY CARD */}
            <div className="account-card-security">
              <h2 style={{ fontSize: '18px', fontWeight: 600, borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
                Portal Security
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px', lineHeight: 1.5 }}>
                Change the passcode used to log in to this B2B wholesale portal.
              </p>

              <form onSubmit={handlePasscodeUpdate}>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-passcode">New Passcode</label>
                  <input
                    type="password"
                    id="new-passcode"
                    className="form-input"
                    placeholder="Enter new 4+ character passcode"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    required
                    disabled={formLoading}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '24px' }}>
                  <label className="form-label" htmlFor="confirm-passcode">Confirm Passcode</label>
                  <input
                    type="password"
                    id="confirm-passcode"
                    className="form-input"
                    placeholder="Confirm new passcode"
                    value={confirmPasscode}
                    onChange={(e) => setConfirmPasscode(e.target.value)}
                    required
                    disabled={formLoading}
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={formLoading}>
                  {formLoading ? 'Saving...' : 'Update Passcode'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
