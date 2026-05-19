'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import ImageUpload from '@/components/ImageUpload';
import api, { invalidateCache } from '@/lib/api';
import { CATEGORIES } from '@/lib/utils';

const LOCATIONS = [
  'Main Building', 'Library', 'Cafeteria', 'Sports Complex',
  'Hostel Block A', 'Hostel Block B', 'Parking Lot', 'Lab Complex',
  'Auditorium', 'Admin Block', 'Other',
];

function ReportForm() {
  const params = useSearchParams();
  const router = useRouter();

  const [type, setType] = useState<'lost' | 'found'>(
    (params.get('type') as 'lost' | 'found') || 'lost'
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [dateReported, setDateReported] = useState(new Date().toISOString().slice(0, 10));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleFileSelect = useCallback((file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setErrors((prev) => ({ ...prev, image: '' }));
  }, []);

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview('');
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Title is required.';
    if (!category) e.category = 'Please select a category.';
    if (!location) e.location = 'Please select a location.';
    if (!imageFile) e.image = 'A photo is required for AI matching.';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    setErrors({});

    try {
      const formData = new FormData();
      formData.append('type', type);
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('category', category);
      formData.append('location', location);
      formData.append('date_reported', dateReported);
      formData.append('image', imageFile!);

      const { data } = await api.post('/items', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      invalidateCache('/items');
      invalidateCache('/my-items');

      router.push(`/items/${data.id}?success=1`);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || 'Something went wrong. Please try again.';
      setErrors({ submit: message });
      setLoading(false);
    }
  };

  const fieldStyle = {
    marginBottom: 20,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600,
    color: 'var(--text-primary)', marginBottom: 6,
  };

  const errorStyle: React.CSSProperties = {
    fontSize: 12, color: 'var(--danger)', marginTop: 5,
  };

  return (
    <main style={{ flex: 1, background: 'var(--bg-primary)', padding: '48px 0 80px' }}>
      <div className="container-main" style={{ maxWidth: 680 }}>

        {/* Header */}
        <div className="animate-fade-in-up" style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: 8 }}>
            Report an item
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
            Include a clear photo — our AI uses it to find matches automatically.
          </p>
        </div>

        {/* Form card */}
        <div className="card animate-fade-in" style={{ padding: '32px' }}>

          {/* Type toggle */}
          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>What are you reporting?</label>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 8, padding: 4,
              background: 'var(--bg-surface-hover)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}>
              {(['lost', 'found'] as const).map((t) => (
                <button
                  key={t}
                  id={`type-${t}-btn`}
                  type="button"
                  onClick={() => setType(t)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                    background: type === t
                      ? (t === 'lost' ? 'var(--danger)' : 'var(--success)')
                      : 'transparent',
                    color: type === t ? 'white' : 'var(--text-secondary)',
                    boxShadow: type === t ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  {t === 'lost' ? '❌ I lost something' : '✅ I found something'}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {/* Image upload */}
            <div style={fieldStyle}>
              <label style={labelStyle}>
                Photo <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <ImageUpload
                onFileSelect={handleFileSelect}
                preview={imagePreview}
                onRemove={handleRemoveImage}
                disabled={loading}
              />
              {errors.image && <p style={errorStyle}>{errors.image}</p>}
            </div>

            {/* Title */}
            <div style={fieldStyle}>
              <label htmlFor="title-input" style={labelStyle}>
                Title <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="title-input"
                className="input"
                type="text"
                placeholder={type === 'lost' ? 'e.g. Black Sony WH-1000XM4 headphones' : 'e.g. Blue Nike water bottle'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                disabled={loading}
              />
              {errors.title && <p style={errorStyle}>{errors.title}</p>}
            </div>

            {/* Description */}
            <div style={fieldStyle}>
              <label htmlFor="desc-input" style={labelStyle}>Description</label>
              <textarea
                id="desc-input"
                className="input"
                placeholder="Add any details that might help identify the item…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                disabled={loading}
                style={{ resize: 'vertical', minHeight: 80 }}
              />
            </div>

            {/* Category + Location row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <label htmlFor="category-select" style={labelStyle}>
                  Category <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <select
                  id="category-select"
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={loading}
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {errors.category && <p style={errorStyle}>{errors.category}</p>}
              </div>
              <div>
                <label htmlFor="location-select" style={labelStyle}>
                  Location <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <select
                  id="location-select"
                  className="input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={loading}
                >
                  <option value="">Select location</option>
                  {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                {errors.location && <p style={errorStyle}>{errors.location}</p>}
              </div>
            </div>

            {/* Date */}
            <div style={fieldStyle}>
              <label htmlFor="date-input" style={labelStyle}>
                Date {type === 'lost' ? 'lost' : 'found'}
              </label>
              <input
                id="date-input"
                className="input"
                type="date"
                value={dateReported}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDateReported(e.target.value)}
                disabled={loading}
                style={{ maxWidth: 200 }}
              />
            </div>

            {errors.submit && (
              <div style={{
                padding: '12px 16px',
                background: 'var(--danger-subtle)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 14, color: 'var(--danger)',
                marginBottom: 20,
              }}>
                {errors.submit}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => router.back()}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                id="submit-report-btn"
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ minWidth: 140 }}
              >
                {loading ? (
                  <>
                    <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    Submitting…
                  </>
                ) : (
                  `Submit ${type} report`
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function ReportPage() {
  return (
    <>
      <Navbar />
      <AuthGuard>
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
            <div className="spinner" style={{ width: 40, height: 40 }} />
          </div>
        }>
          <ReportForm />
        </Suspense>
      </AuthGuard>
    </>
  );
}
