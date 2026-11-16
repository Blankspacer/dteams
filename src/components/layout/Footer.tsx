import React from 'react';

interface FooterProps {
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({ className = '' }) => {
  return (
    <footer
      className={`w-full bg-white border-t border-slate-200 px-4 py-2 text-center text-[11px] sm:text-xs text-slate-500 leading-snug shrink-0 ${className}`}
    >
      <p className="font-medium text-slate-600">@All rights reserved - DoubleW</p>
      <p className="text-slate-500">Developer :Syed Shahrier Ali</p>
    </footer>
  );
};
