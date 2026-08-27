'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('App Router Runtime Error:', error);
  }, [error]);

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f3ef',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#1a1a1a',
      textAlign: 'center'
    }}>
      <div style={{
        background: '#fff',
        border: '1px solid #e5e0d8',
        borderRadius: '12px',
        padding: '40px',
        maxWidth: '480px',
        width: '100%',
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
      }}>
        <div style={{ fontSize: '42px', marginBottom: '16px' }}>👓</div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#111' }}>
          Temporary Connection Refresh
        </h2>
        <p style={{ fontSize: '13.5px', color: '#666', margin: '0 0 24px 0', lineHeight: 1.5 }}>
          The B2B portal encountered a temporary catalog sync delay. Please click below to refresh the page.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={() => reset ? reset() : window.location.reload()}
            style={{
              background: '#111',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '13.5px',
              cursor: 'pointer'
            }}
          >
            🔄 Reload Page
          </button>
          <a
            href="/dashboard"
            style={{
              display: 'inline-block',
              background: '#f5f3ef',
              color: '#111',
              border: '1px solid #ccc',
              padding: '10px 20px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '13.5px',
              textDecoration: 'none'
            }}
          >
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
