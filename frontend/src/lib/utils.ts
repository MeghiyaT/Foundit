/**
 * Foundit — Shared utility functions
 */

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  // Compare calendar dates in local timezone rather than raw millisecond diff
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = nowStart.getTime() - dateStart.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen).trimEnd() + '…';
}

export function formatSimilarity(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export const CATEGORIES = [
  'Electronics', 'Bags & Backpacks', 'Books & Notes', 'Clothing',
  'Accessories', 'Keys', 'ID & Cards', 'Water Bottles', 'Eyewear', 'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export function getStatusClass(status: string): string {
  switch (status) {
    case 'open': return 'badge-open';
    case 'matched': return 'badge-matched';
    case 'closed': return 'badge-closed';
    default: return 'badge-open';
  }
}
