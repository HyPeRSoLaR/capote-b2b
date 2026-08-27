'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ConsentState = 'granted' | 'denied' | null;

interface ConsentContextType {
  consent: ConsentState;
  grant: () => void;
  deny: () => void;
}

const ConsentContext = createContext<ConsentContextType>({
  consent: null,
  grant: () => {},
  deny: () => {},
});

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentState>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('capote_consent');
      if (saved === 'granted' || saved === 'denied') {
        setConsent(saved as ConsentState);
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
