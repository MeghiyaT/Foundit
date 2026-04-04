'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

interface Props {
  children: React.ReactNode;
  adminOnly?: boolean;
}

export default function AuthGuard({ children, adminOnly = false }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'auth' | 'unauth'>('loading');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login');
        setStatus('unauth');
      } else {
        setStatus('auth');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        router.replace('/login');
        setStatus('unauth');
      } else {
        setStatus('auth');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  if (status === 'loading') {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p className="text-body-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (status === 'unauth') return null;

  return <>{children}</>;
}
