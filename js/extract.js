/* Ekstraksi workbook "Tracking Pengeluaran Amprah" -> model data ringkas.
 * SENGAJA tidak mengambil kolom NO REKENING dan REKENING A.N. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CashExtract = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const str = v => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
  const numv = v => {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v == null || v === '') return null;
    const n = +String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    return isFinite(n) ? n : null;
  };
  function date(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v > 0 ? new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10) : null;
    const s = str(v), m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isNaN(Date.parse(s)) ? null : new Date(Date.parse(s)).toISOString().slice(0, 10);
  }

  function readSheet(XLSX, wb, match) {
    const name = wb.SheetNames.find(n => match.test(n));
    if (!name) return [];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const h = rows.findIndex(r => r && r.some(c => /^tanggal$/i.test(str(c))));
    if (h < 0) return [];
    const head = rows[h].map(c => str(c).toUpperCase());
    const col = re => head.findIndex(x => re.test(x));
    const C = {
      no: col(/^NO$/), tgl: col(/^TANGGAL$/), item: col(/^(ITEM|PROJECT|URAIAN)$/), jenis: col(/JENIS/), pic: col(/^PIC$/),
      bank: col(/^BANK$/), nota: col(/^NOTA$/), total: col(/TOTAL/), bukti: col(/BUKTI/), remarks: col(/REMARK|KETERANGAN/)
    };
    const g = (r, k) => (C[k] < 0 ? null : r[C[k]]);
    const out = [];
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const item = str(g(r, 'item')), total = numv(g(r, 'total'));
      if (!item && total == null) continue;
      out.push({
        no: numv(g(r, 'no')), tgl: date(g(r, 'tgl')), item, jenis: str(g(r, 'jenis')).toUpperCase(), pic: str(g(r, 'pic')),
        bank: str(g(r, 'bank')), nota: str(g(r, 'nota')).toUpperCase(), total: total || 0,
        bukti: str(g(r, 'bukti')), remarks: str(g(r, 'remarks'))
      });
    }
    return out;
  }

  function extract(XLSX, wb, meta) {
    const tx = readSheet(XLSX, wb, /PENGELUARAN/i);
    let incoming = readSheet(XLSX, wb, /INCOMING/i);
    // Sheet INCOMING yang isinya salinan persis sheet pengeluaran belum berisi data dana masuk
    const incomingDuplicate = incoming.length > 0 && JSON.stringify(incoming) === JSON.stringify(tx);
    if (incomingDuplicate) incoming = [];
    return { meta: Object.assign({ generatedAt: new Date().toISOString(), incomingDuplicate }, meta || {}), tx, incoming };
  }

  return { extract };
});
