'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ProcessImageResult } from '@/lib/api';
import styles from './PublicCapture.module.scss';

type Status = 'idle' | 'camera' | 'processing' | 'done' | 'error';

interface Props {
  orgId: string;
}

export default function PublicCapture({ orgId }: Props): React.JSX.Element {
  const {
    page, header, back, title, main,
    uploadArea, hint, privacy, fileLabel, fileBtn, fileBtnSecondary,
    cameraOverlay, cameraVideo, cameraControls, shutterBtn, cancelBtn,
    preview, centered, processingText, subText,
    results, resultTitle, mockBadge, section, sectionTitle, resultList, resultRow, delta,
    doneBtn, errorText,
  } = styles;

  const [status, setStatus]       = useState<Status>('idle');
  const [result, setResult]       = useState<ProcessImageResult | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (status === 'camera' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [status]);

  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setStatus('camera');
    } catch {
      // Permission denied or no camera — fall back to file picker
      fileRef.current?.click();
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  async function capturePhoto() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    stopCamera();

    setStatus('processing');
    setResult(null);
    setErrorMsg('');

    try {
      const dataUrl = canvas.toDataURL('image/jpeg');
    setPreviewUrl(dataUrl);
    const imageBase64 = dataUrl.split(',')[1];
      const res = await api.image.processPublic(orgId, imageBase64, 'image/jpeg');
      setResult(res);
      setStatus('done');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Processing failed');
      setStatus('error');
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('processing');
    setResult(null);
    setErrorMsg('');

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    try {
      const imageBase64 = await toBase64(file);
      const res = await api.image.processPublic(orgId, imageBase64, file.type);
      setResult(res);
      setStatus('done');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Processing failed');
      setStatus('error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function reset() {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setStatus('idle');
    setResult(null);
    setErrorMsg('');
    setPreviewUrl(null);
  }

  return (
    <div className={page}>
      <header className={header}>
        <Link href="/pantry" className={back}>← Choose pantry</Link>
        <h1 className={title}>Log what you&apos;re taking</h1>
      </header>

      <main className={main}>
        {status === 'idle' && (
          <div className={uploadArea}>
            <p className={hint}>
              Take a photo of the items you&apos;re taking from the pantry. Our AI will automatically update the inventory.
            </p>
            <div className={fileLabel}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFile}
                hidden
              />
              <button className={fileBtn} onClick={openCamera}>Take photo</button>
              <button className={fileBtnSecondary} onClick={() => fileRef.current?.click()}>Choose from library</button>
            </div>
            <p className={privacy}>No account required. No personal data is collected.</p>
          </div>
        )}

        {status === 'camera' && (
          <div className={cameraOverlay}>
            <video ref={videoRef} autoPlay playsInline className={cameraVideo} />
            <div className={cameraControls}>
              <button onClick={capturePhoto} className={shutterBtn}>Capture</button>
              <button onClick={() => { stopCamera(); setStatus('idle'); }} className={cancelBtn}>Cancel</button>
            </div>
          </div>
        )}

        {status === 'processing' && (
          <div className={centered}>
            {previewUrl && <img src={previewUrl} alt="Captured" className={preview} />}
            <p className={processingText}>Analyzing your photo…</p>
            <p className={subText}>This may take a few seconds</p>
          </div>
        )}

        {status === 'done' && result && (
          <div className={results}>
            {previewUrl && <img src={previewUrl} alt="Captured" className={preview} />}
            <h2 className={resultTitle}>Thank you!</h2>
            <p className={subText}>The pantry inventory has been updated.</p>

            {result.mock && <p className={mockBadge}>Mock response (local dev)</p>}

            {result.updatedItems.length > 0 && (
              <section className={section}>
                <h3 className={sectionTitle}>Items logged</h3>
                <ul className={resultList}>
                  {result.updatedItems.map(item => (
                    <li key={item.itemId} className={resultRow}>
                      <span>{item.name}</span>
                      <span className={delta}>{Math.abs(item.quantityDelta)} taken</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.createdItems.length > 0 && (
              <section className={section}>
                <h3 className={sectionTitle}>New items recorded</h3>
                <ul className={resultList}>
                  {result.createdItems.map(item => (
                    <li key={item.itemId} className={resultRow}>
                      <span>{item.name}</span>
                      <span className={delta}>{item.quantity}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.updatedItems.length === 0 && result.createdItems.length === 0 && (
              <p className={subText}>No items were identified in the photo.</p>
            )}

            <button onClick={reset} className={doneBtn}>Done</button>
          </div>
        )}

        {status === 'error' && (
          <div className={centered}>
            <p className={errorText}>{errorMsg}</p>
            <button onClick={reset} className={doneBtn}>Try again</button>
          </div>
        )}
      </main>
    </div>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
