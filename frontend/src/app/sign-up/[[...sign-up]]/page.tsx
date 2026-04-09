'use client';

import { SignUp } from '@clerk/nextjs';
import Navbar from '@/components/Navbar';

export default function SignUpPage() {
  return (
    <>
      <Navbar />
      <main style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        padding: '40px 24px',
      }}>
        <SignUp
          appearance={{
            elements: {
              rootBox: { width: '100%', maxWidth: 440 },
              card: {
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
              },
            },
          }}
        />
      </main>
    </>
  );
}
