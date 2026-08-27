'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // On mount, read saved preference
  useEffect(() => {
    const saved = localStorage.getItem('capote_theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      setDark(true);
    } else {
      document.documentElement.removeAttribute('data-theme');
      setDark(false);
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('capote_theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('capote_theme', 'light');
    }
  };

  return (
    <button
      onClick={toggle}
      className="theme-toggle"
      title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      style={{ fontSize: '16px', lineHeight: 1, padding: '6px 10px' }}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}
