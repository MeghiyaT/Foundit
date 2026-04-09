'use client';

import { RedirectToSignIn } from '@clerk/nextjs';

/**
 * Legacy /login route — redirects to Clerk's /sign-in page.
 */
export default function LoginPage() {
  return <RedirectToSignIn />;
}
