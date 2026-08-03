import { useRef } from 'react';
import { Download, Printer, X } from 'lucide-react';

export function DocHeader({ settings, docType, docNo, date }) {
  return (
    <div className="doc-header">
      <div>
        <div className="doc-company">{settings.companyName || 'Your Factory Name'}</div>
        {settings.companyAddress && <div className="doc-meta">{settings.companyAddress}</div>}
        <div className="doc-meta">
          {settings.companyPhone}{settings.companyPhone && settings.companyTin ? ' · ' : ''}
          {settings.companyTin ? `TIN ${settings.companyTin}` : ''}
        </div>
      </div>
      <div className="doc-title-block">
        <div className="doc-title">{docType}</div>
        <div className="doc-meta">No: <b>{docNo}</b></div>
        <div className="doc-meta">Date: {date}</div>
      </div>
    </div>
  );
}

export const DOC_STANDALONE_CSS = `
body{ font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#232323; padding:36px 40px; max-width:680px; margin:0 auto; }
.doc-header{ display:flex; justify-content:space-between; border-bottom:2px solid #1F4E78; padding-bottom:14px; margin-bottom:18px; }
.doc-company{ font-family:Georgia, serif; font-size:19px; font-weight:700; color:#1F4E78; }
.doc-meta{ font-size:12px; color:#555; }
.doc-title-block{ text-align:right; }
.doc-title{ font-size:16px; font-weight:700; letter-spacing:.05em; color:#BF8F00; }
.doc-party{ margin-bottom:14px; font-size:13.5px; }
.doc-table{ width:100%; border-collapse:collapse; margin-bottom:14px; }
.doc-table th{ background:#F1EEE4; text-align:left; }
.doc-table td, .doc-table th{ border:1px solid #E4E0D6; padding:7px 9px; font-size:13px; }
.doc-k{ font-weight:600; width:160px; background:#FAF8F3; }
.doc-totals{ margin-left:auto; max-width:260px; font-size:13.5px; display:flex; flex-direction:column; gap:3px; }
.doc-grand{ font-weight:700; font-size:15.5px; border-top:1px solid #232323; padding-top:5px; margin-top:3px; }
.doc-footnote{ font-size:10.5px; color:#999; margin-top:14px; font-style:italic; }
.doc-sign-row{ display:flex; justify-content:space-between; margin-top:46px; font-size:12.5px; }
`;

export default function PrintModal({ children, onClose, filename = 'document' }) {
  const areaRef = useRef(null);

  const download = () => {
    const inner = areaRef.current ? areaRef.current.innerHTML : '';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title><style>${DOC_STANDALONE_CSS}</style></head><body>${inner}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="print-overlay">
      <div className="print-toolbar no-print">
        <button className="btn-primary" onClick={() => window.print()}><Printer size={15} /> Print / Save as PDF</button>
        <button className="btn-ghost" onClick={download}><Download size={15} /> Download</button>
        <button className="btn-ghost" onClick={onClose}><X size={15} /> Close</button>
      </div>
      <div className="print-area" ref={areaRef}>{children}</div>
    </div>
  );
}
