'use client';

import { useEffect } from 'react';
import Navbar from '../../components/Navbar';

export default function ProductDetailError({ error, reset }) {
  useEffect(() => {
    console.error('Product Detail Page Error:', error);
  }, [error]);

  return (
    <div>
      <Navbar activeTab="products" />
      <main className="app-container" style={{ paddingTop: 60, paddingBottom: 60, textAlign: 'center' }}>
        <div style={{
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '40px 24px',
          maxWidth: '500px',
          margin: '0 auto'
        }}>
          <div style={{ fontSize: '42px', marginBottom: '16px' }}>👓</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
            Product Configurator Refresh
          </h2>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '0 0 24px 0', lineHeight: 1.5 }}>
            Unable to load frame configurator details. Please click below to return to the catalog or retry.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => reset ? reset() : window.location.reload()}
              className="btn-primary"
              style={{ padding: '10px 20px', fontSize: '13.5px' }}
            >
              🔄 Retry Load
            </button>
            <a
              href="/products"
              className="btn-outline"
              style={{ padding: '10px 20px', fontSize: '13.5px', textDecoration: 'none' }}
            >
              Back to Products
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
