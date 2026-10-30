import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

const PALETTES = {
  light: ['#F6F9FF', '#9BE0E8', '#C4B5F7', '#F8B8D9'],
  dark: ['#F0FBEF', '#8FE3B0', '#22C79A', '#0B5F51']
};

function HeroGradient() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !context) return undefined;

    let frame = 0;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let phase = 0;
    let palette = [];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const readPalette = () => {
      palette = document.documentElement.getAttribute('data-theme') === 'dark'
        ? PALETTES.dark : PALETTES.light;
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      paint();
    };
    const paint = () => {
      if (!width || !height) return;
      const base = context.createLinearGradient(0, 0, width, height);
      base.addColorStop(0, palette[0]);
      base.addColorStop(1, palette[0]);
      context.fillStyle = base;
      context.fillRect(0, 0, width, height);

      const time = phase;
      const blobs = [
        { x: 0.17 + Math.sin(time * 0.73) * 0.09, y: 0.15 + Math.cos(time * 0.51) * 0.08, r: 0.64, color: palette[1] },
        { x: 0.81 + Math.cos(time * 0.59) * 0.08, y: 0.3 + Math.sin(time * 0.67) * 0.1, r: 0.69, color: palette[2] },
        { x: 0.49 + Math.sin(time * 0.43) * 0.11, y: 0.93 + Math.cos(time * 0.38) * 0.07, r: 0.7, color: palette[3] }
      ];
      for (const blob of blobs) {
        const radius = Math.max(width, height) * blob.r;
        const gradient = context.createRadialGradient(blob.x * width, blob.y * height, 0, blob.x * width, blob.y * height, radius);
        gradient.addColorStop(0, `${blob.color}D9`);
        gradient.addColorStop(0.52, `${blob.color}80`);
        gradient.addColorStop(1, `${blob.color}00`);
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
      }
      // Keep the canvas inexpensive on mobile; the soft fields supply the texture.
    };
    const animate = () => {
      if (reducedMotion.matches || document.hidden) { paint(); frame = 0; return; }
      phase += 0.0026;
      paint();
      frame = window.requestAnimationFrame(animate);
    };
    const start = () => { if (!frame) frame = window.requestAnimationFrame(animate); };
    const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else start(); };
    const observer = new MutationObserver(() => { readPalette(); paint(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener?.('change', onVisibility);
    readPalette();
    resize();
    start();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener?.('change', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-gradient" aria-hidden="true" />;
}

const mount = document.getElementById('heroGradientRoot');
if (mount) createRoot(mount).render(<HeroGradient />);
