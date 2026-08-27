'use client';

import { useConsent } from '@/lib/consent';

export default function CookieBanner() {
  const { consent, grant, deny } = useConsent();

  if (consent !== null) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 40px)',
        maxWidth: '720px',
        backgroundColor: '#1a1a1a',
        color: '#f5f5f7',
        padding: '20px 24px',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
        zIndex: 99999,
        fontFamily: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      <div style={{ fontSize: '13.5px', lineHeight: '1.5', color: '#e0e0e0' }}>
        We use cookies and Meta Pixel to measure and improve our wholesale experience. You can accept or decline analytics/marketing cookies.{' '}
        <a
          href="/privacy"
          style={{ color: '#ffffff', textDecoration: 'underline', fontWeight: 500 }}
        >
          Privacy Policy
        </a>
      </div>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button
          onClick={deny}
          style={{
            flex: '1',
            maxWidth: '140px',
            padding: '10px 18px',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            backgroundColor: 'transparent',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'background-color 0.2s',
          }}
        >
          Decline
        </button>
        <button
          onClick={grant}
          style={{
            flex: '1',
            maxWidth: '140px',
            padding: '10px 18px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: '#ffffff',
            color: '#1a1a1a',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'opacity 0.2s',
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
