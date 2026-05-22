/**
 * useScan — Shared scan state management hook.
 * Used by both /scan (Scan.tsx) and /start (FunnelStart.tsx).
 */

import { useState, useEffect, useCallback } from 'react';
import type { ScanFormData, ScanResponse } from '@/components/scan/ScanConstants';
import { EMPTY_FORM_DATA, SCANNING_MESSAGES } from '@/components/scan/ScanConstants';

export type ScanPhase = 'form' | 'scanning' | 'results';

interface UseScanOptions {
  /** Custom scanning messages (defaults to SCANNING_MESSAGES) */
  scanningMessages?: readonly string[];
  /** Message rotation interval in ms (default 2500) */
  messageInterval?: number;
}

interface UseScanReturn {
  // Form
  formData: ScanFormData;
  handleFieldChange: (field: keyof ScanFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;

  // State
  phase: ScanPhase;
  scanResult: ScanResponse | null;
  error: string | null;
  setError: (e: string | null) => void;
  scanningMsgIndex: number;

  // Email gate
  unlockEmail: string;
  setUnlockEmail: (e: string) => void;
  unlockName: string;
  setUnlockName: (n: string) => void;
  unlocking: boolean;
  unlocked: boolean;

  // Actions
  handleSubmit: () => Promise<void>;
  handleUnlock: () => Promise<void>;
  handleReset: () => void;
}

export function useScan(options?: UseScanOptions): UseScanReturn {
  const messages = options?.scanningMessages ?? SCANNING_MESSAGES;
  const messageInterval = options?.messageInterval ?? 2500;

  // Form state
  const [formData, setFormData] = useState<ScanFormData>({ ...EMPTY_FORM_DATA });

  // App state
  const [phase, setPhase] = useState<ScanPhase>('form');
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanningMsgIndex, setScanningMsgIndex] = useState(0);

  // Email unlock state
  const [unlockEmail, setUnlockEmail] = useState('');
  const [unlockName, setUnlockName] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  // Rotate scanning messages
  useEffect(() => {
    if (phase !== 'scanning') return;
    const interval = setInterval(() => {
      setScanningMsgIndex(prev => (prev + 1) % messages.length);
    }, messageInterval);
    return () => clearInterval(interval);
  }, [phase, messages.length, messageInterval]);

  const handleFieldChange = useCallback((field: keyof ScanFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    setError(null);
  }, []);

  // Submit scan
  const handleSubmit = useCallback(async () => {
    if (!formData.website_url.trim()) {
      setError('Website URL is required');
      return;
    }

    setError(null);
    setPhase('scanning');
    setScanningMsgIndex(0);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Scan failed — please try again');
        setPhase('form');
        return;
      }

      setScanResult(data);
      setPhase('results');
    } catch {
      setError('Network error — please check your connection and try again');
      setPhase('form');
    }
  }, [formData]);

  // Unlock gated results
  const handleUnlock = useCallback(async () => {
    if (!unlockEmail.trim() || !scanResult?.scan_id) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(unlockEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setUnlocking(true);
    setError(null);

    try {
      const res = await fetch('/api/scan/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan_id: scanResult.scan_id, email: unlockEmail, name: unlockName.trim() || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to unlock results');
        setUnlocking(false);
        return;
      }

      setScanResult(data);
      setUnlocked(true);
      setUnlocking(false);
    } catch {
      setError('Network error — please try again');
      setUnlocking(false);
    }
  }, [unlockEmail, unlockName, scanResult?.scan_id]);

  // Reset
  const handleReset = useCallback(() => {
    setPhase('form');
    setScanResult(null);
    setError(null);
    setUnlockEmail('');
    setUnlockName('');
    setUnlocked(false);
    setFormData({ ...EMPTY_FORM_DATA });
  }, []);

  return {
    formData,
    handleFieldChange,
    phase,
    scanResult,
    error,
    setError,
    scanningMsgIndex,
    unlockEmail,
    setUnlockEmail,
    unlockName,
    setUnlockName,
    unlocking,
    unlocked,
    handleSubmit,
    handleUnlock,
    handleReset,
  };
}
