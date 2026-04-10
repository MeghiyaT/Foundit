'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { setTokenProvider } from '@/lib/api';

/**
 * AuthGuard — configures the API client to fetch the latest Clerk token
 * and shows a loading state while authentication initializes.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      // Register the provider so the API client can fetch fresh tokens dynamically
      setTokenProvider(async () => {
        if (!isSignedIn) return null;
        try {
          return await getToken();
        } catch (error) {
          console.error("Error fetching auth token:", error);
          return null;
        }
      });
      setSynced(true);
    }
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded || !synced) {
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
