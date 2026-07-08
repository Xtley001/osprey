import React from 'react';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: React.CSSProperties;
}

/** Shimmer loading placeholder. Match it to the shape of the real content. */
export const Skeleton: React.FC<SkeletonProps> = ({ width = '100%', height = 14, radius = 'var(--r-sm)', style }) => (
  <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />
);

/** A row of skeleton cells — for table loading states. */
export const SkeletonRows: React.FC<{ rows?: number; cols?: number }> = ({ rows = 8, cols = 6 }) => (
  <>
    {Array.from({ length: rows }).map((_, r) => (
      <tr key={r} style={{ borderBottom: '1px solid var(--c-700)' }}>
        {Array.from({ length: cols }).map((_, c) => (
          <td key={c} style={{ padding: '11px 12px' }}>
            <Skeleton height={12} width={c === 0 ? '70%' : '55%'} />
          </td>
        ))}
      </tr>
    ))}
  </>
);

export default Skeleton;
