'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ProcessImageResult, UserOrg } from '@/lib/api';
import styles from './CaptureView.module.scss';

type Status = 'idle' | 'camera' | 'processing' | 'done' | 'error';

export default function CaptureView(): React.JSX.Element {
  const {
    page, header, back, title, main,
    uploadArea, hint, fileLabel, fileBtn, fileBtnSecondary, warn,
    cameraOverlay, cameraVideo, cameraControls, shutterBtn, cancelBtn,
    preview, centered, processingText, subText,
    results, resultTitle, mockBadge, section, sectionTitle, resultList, resultRow, delta,
    resultActions, primaryBtn, secondaryBtn, errorText,
  } = styles;

  const [org, setOrg]             = useState<UserOrg | null>(null);
  const [status, setStatus]       = useState<Status>('idle');
  const [result, setResult]       = useState<ProcessImageResult | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    api.orgs.listMine().then(orgs => {
      if (orgs.length > 0) setOrg(orgs[0]);
    }).catch(() => {});
  }, []);

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
      fileRef.current?.click();
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  async function capturePhoto() {
    if (!videoRef.current || !org) return;
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
      const res = await api.image.process(org.orgId, imageBase64, 'image/jpeg');
      setResult(res);
      setStatus('done');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Processing failed');
      setStatus('error');
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !org) return;

    setStatus('processing');
    setResult(null);
    setErrorMsg('');

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    try {
      const imageBase64 = await toBase64(file);
      const res = await api.image.process(org.orgId, imageBase64, file.type);
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
        <Link href="/inventory" className={back}>← Inventory</Link>
        <h1 className={title}>AI capture</h1>
      </header>

      <main className={main}>
        {status === 'idle' && (
          <div className={uploadArea}>
            <p className={hint}>
              Take a photo of what you&apos;re adding or removing and the AI will update your inventory automatically.
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
            {!org && <p className={warn}>Loading org…</p>}
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
            <p className={processingText}>Analyzing image…</p>
            <p className={subText}>This may take a few seconds</p>
          </div>
        )}

        {status === 'done' && result && (
          <div className={results}>
            {previewUrl && <img src={previewUrl} alt="Captured" className={preview} />}
            <h2 className={resultTitle}>Inventory updated</h2>

            {result.mock && <p className={mockBadge}>Mock response (local dev)</p>}

            {result.updatedItems.length > 0 && (
              <section className={section}>
                <h3 className={sectionTitle}>Updated items</h3>
                <ul className={resultList}>
                  {result.updatedItems.map(item => (
                    <li key={item.itemId} className={resultRow}>
                      <span>{item.name}</span>
                      <span className={delta}>
                        {item.quantityDelta > 0 ? `+${item.quantityDelta}` : item.quantityDelta}
                        {' → '}{item.newQuantity}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.createdItems.length > 0 && (
              <section className={section}>
                <h3 className={sectionTitle}>New items added</h3>
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
              <p className={subText}>No inventory changes detected.</p>
            )}

            <div className={resultActions}>
              <button onClick={reset} className={primaryBtn}>Capture another</button>
              <Link href="/inventory" className={secondaryBtn}>View inventory</Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className={centered}>
            <p className={errorText}>{errorMsg}</p>
            <button onClick={reset} className={primaryBtn}>Try again</button>
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
