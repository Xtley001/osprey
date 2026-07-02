import React, { useRef, useEffect } from 'react';

interface SparklineProps {
  data:   number[];
  width:  number;
  height: number;
  color?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({ data, width, height, color }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const resolvedColor = color
      ?? getComputedStyle(document.documentElement).getPropertyValue('--hl-teal').trim();

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();

    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
    });

    ctx.strokeStyle = resolvedColor;
    ctx.lineWidth   = 1;
    ctx.stroke();
  }, [data, width, height, color]);

  return (
    <canvas
      ref={ref}
      style={{ width, height, display: 'block' }}
    />
  );
};
