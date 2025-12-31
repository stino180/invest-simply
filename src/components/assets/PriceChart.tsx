import { useState } from 'react';
import { cn } from '@/lib/utils';

interface PriceChartProps {
  isPositive: boolean;
  sparkline?: number[];
}

const timeframes = ['1H', '1D', '1W', '1M', '1Y', 'ALL'];

export const PriceChart = ({ isPositive, sparkline }: PriceChartProps) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState('1D');
  
  // Use sparkline data if provided, otherwise generate placeholder
  const data = sparkline && sparkline.length > 0 ? sparkline : Array(24).fill(100);
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const height = 200;
  const width = 360;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 20);
    return { x, y };
  });
  
  const pathD = points.reduce((acc, point, i) => {
    if (i === 0) return `M ${point.x} ${point.y}`;
    return `${acc} L ${point.x} ${point.y}`;
  }, '');
  
  // Create gradient fill path
  const fillPath = `${pathD} L ${width} ${height} L 0 ${height} Z`;
  
  const strokeColor = isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))';
  const gradientId = isPositive ? 'gradient-success' : 'gradient-destructive';

  return (
    <div className="space-y-4">
      <svg 
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-48"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        
        <path
          d={fillPath}
          fill={`url(#${gradientId})`}
        />
        
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      
      <div className="flex items-center justify-center gap-2">
        {timeframes.map((tf) => (
          <button
            key={tf}
            onClick={() => setSelectedTimeframe(tf)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              selectedTimeframe === tf
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            {tf}
          </button>
        ))}
      </div>
    </div>
  );
};
