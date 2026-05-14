'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';

interface Props {
  onFileSelect: (file: File) => void;
  preview?: string;
  onRemove?: () => void;
  disabled?: boolean;
}

export default function ImageUpload({ onFileSelect, preview, onRemove, disabled }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSet = useCallback((file: File) => {
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Only JPG, PNG, or WebP images are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB.');
      return;
    }
    setFileName(file.name);
    onFileSelect(file);
  }, [onFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSet(file);
  }, [validateAndSet]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSet(file);
  };

  if (preview) {
    return (
      <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--bg-surface-hover)' }}>
        <Image
          src={preview}
          alt="Preview"
          width={600}
          height={400}
          style={{ width: '100%', height: 240, objectFit: 'cover', display: 'block' }}
        />
        {onRemove && !disabled && (
          <button
            type="button"
            onClick={onRemove}
            style={{
              position: 'absolute', top: 8, right: 8,
              width: 32, height: 32,
              background: 'rgba(0,0,0,0.6)',
              border: 'none', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'white',
              transition: 'background 150ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(220,38,38,0.85)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.6)')}
            aria-label="Remove image"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        )}
        <div style={{
          position: 'absolute', bottom: 8, left: 8,
          background: 'rgba(0,0,0,0.6)', color: 'white',
          padding: '3px 10px', borderRadius: 'var(--radius-full)',
          fontSize: 12, fontWeight: 500,
        }}>
          {fileName || '✓ Image selected'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        id="image-upload-zone"
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={disabled ? undefined : handleDrop}
        style={{
          border: `2px dashed ${isDragging ? 'var(--accent)' : error ? 'var(--danger)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '40px 24px',
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: isDragging ? 'var(--accent-subtle)' : 'var(--bg-surface-hover)',
          transition: 'all 150ms ease',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <div style={{
          width: 48, height: 48,
          background: isDragging ? 'var(--accent-subtle)' : 'var(--bg-surface)',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px',
          color: isDragging ? 'var(--accent)' : 'var(--text-tertiary)',
          transition: 'all 150ms ease',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
          </svg>
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          {isDragging ? 'Drop to upload' : 'Drag & drop your photo here'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          or <span style={{ color: 'var(--accent)', fontWeight: 500 }}>browse files</span>
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>JPG, PNG, WebP · Max 5 MB</p>
      </div>
      {error && (
        <p style={{ fontSize: 13, color: 'var(--danger)', marginTop: 8 }}>{error}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        style={{ display: 'none' }}
        disabled={disabled}
      />
    </div>
  );
}
