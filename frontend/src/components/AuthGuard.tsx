'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';
import { setAuthToken } from '@/lib/api';

/**
 * AuthGuard — syncs the Clerk token into the API client
 * and shows a loading state while authentication initializes.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useEffect(() => {
    async function syncToken() {
      if (isSignedIn) {
        const token = await getToken();
        setAuthToken(token);
      } else {
        setAuthToken(null);
      }
    }
    if (isLoaded) syncToken();
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '60vh', background: 'var(--bg-primary)',
      }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return <>{children}</>;
}
