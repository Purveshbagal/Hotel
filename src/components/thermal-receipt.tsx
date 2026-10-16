'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { CloseButton, PrintButton } from './print-button';

export function ThermalReceipt({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState('80');
  useEffect(() => {
    try { const saved = localStorage.getItem('receipt-width'); if (saved === '58' || saved === '80') setWidth(saved); } catch {}
  }, []);
  const changeWidth = (value: string) => {
    setWidth(value);
    try { localStorage.setItem('receipt-width', value); } catch {}
  };
  return <>
    <style>{`@media print {
      @page { size: auto; margin: 0; }
      html, body { width: ${width}mm !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; background: white !important; }
      .thermal-container { width: ${width}mm !important; max-width: none !important; margin: 0 !important; }
      .thermal-paper { width: ${width}mm !important; padding: 3mm !important; box-shadow: none !important; font-size: ${width === '58' ? '10' : '12'}px !important; }
    }`}</style>
    <div className="no-print mx-auto mb-6 max-w-xl px-4">
      <div className="card p-4"><div className="flex flex-wrap items-end justify-between gap-3"><label className="text-sm font-medium">Thermal paper<select aria-label="Thermal paper width" className="input mt-1" value={width} onChange={e => changeWidth(e.target.value)}><option value="80">80 mm</option><option value="58">58 mm</option></select></label><div className="flex gap-2"><CloseButton /><PrintButton /></div></div><p className="mt-3 text-xs leading-5 text-slate-500">Select your thermal printer and matching paper size in the print dialog. Use 100% scale, no margins, and turn off headers and footers. Paper preference is saved on this device.</p></div>
    </div>
    <div className="thermal-container mx-auto max-w-full" style={{ width: `${width}mm` }}><div className="thermal-paper bg-white p-[3mm] font-mono leading-snug text-black shadow" style={{ fontSize: width === '58' ? 10 : 12 }}>{children}</div></div>
  </>;
}
