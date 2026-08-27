'use client';

import { useEffect } from 'react';
import Navbar from '../components/Navbar';

export default function ProductsError({ error, reset }) {
  useEffect(() => {
    console.error('Products Page Error:', error);
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
          maxWidth: '560px',
          margin: '0 auto'
        }}>
          <div style={{ fontSize: '42px', marginBottom: '16px' }}>👓</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
            Catalog Error Details
          </h2>
          
          <div style={{
            background: '#fff0f0',
            border: '1px solid #ffcdd2',
            borderRadius: '6px',
            padding: '12px 16px',
            margin: '16px 0 20px 0',
            textAlign: 'left',
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#c62828',
            wordBreak: 'break-word',
            maxHeight: '150px',
            overflowY: 'auto'
          }}>
            <strong>Error:</strong> {error?.message || String(error) || 'Unknown Client Exception'}
          </div>

          <button
            onClick={() => reset ? reset() : window.location.reload()}
            className="btn-primary"
            style={{ padding: '10px 24px', fontSize: '14px' }}
          >
            🔄 Reload Catalog
          </button>
        </div>
      </main>
    </div>
  );
}
