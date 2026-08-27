'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

const ConsentContext = createContext({
  consent: null,
  grant: () => {},
  deny: () => {},
});

export function ConsentProvider({ children }) {
  const [consent, setConsent] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('capote_consent');
      if (saved === 'granted' || saved === 'denied') {
        setConsent(saved);
      }
    } catch (e) {
      console.error('Consent storage error:', e);
    }
  }, []);

  const grant = () => {
    try {
      localStorage.setItem('capote_consent', 'granted');
    } catch (e) {}
    setConsent('granted');
  };

  const deny = () => {
    try {
      localStorage.setItem('capote_consent', 'denied');
    } catch (e) {}
    setConsent('denied');
  };

  return (
    <ConsentContext.Provider value={{ consent, grant, deny }}>
      {children}
    </ConsentContext.Provider>
  );
}

export function useConsent() {
  return useContext(ConsentContext);
}
