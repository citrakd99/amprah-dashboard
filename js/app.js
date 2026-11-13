/* Dashboard Tracking Pengeluaran Amprah – view only.
 * Alur: baca Google Sheet langsung dari link -> olah -> render. Bagian tanpa data tidak ditampilkan. */
(function () {
  'use strict';
  const CFG = window.CASH_CONFIG || {};
  const DAY = 864e5;
  const $ = (s, r) => (r || document).querySelector(s);

  // ---------- kunci akses ----------
  // Link Google Sheet TIDAK disimpan di kode. Ia diberikan lewat #k=... di alamat (bagian setelah #
  // tidak pernah dikirim ke server) atau ditempel di form, lalu disimpan hanya di browser ini.
  const LS = 'amprah.sheet';
  const parseId = s => {
    const v = String(s || '').trim();
    const m = v.match(/\/d\/([A-Za-z0-9_-]{20,})/) || v.match(/^([A-Za-z0-9_-]{20,})$/);
    return m ? m[1] : '';
  };
  const store = {
    get() { try { return localStorage.getItem(LS) || ''; } catch (e) { return ''; } },
    set(v) { try { v ? localStorage.setItem(LS, v) : localStorage.removeItem(LS); } catch (e) { /* abaikan */ } }
  };
  let KEY = '';
  function readHash() {
    let h = '';
    try { h = decodeURIComponent(location.hash.slice(1)); } catch (e) { h = location.hash.slice(1); }
    const id = parseId(h.replace(/^k=/, ''));
    if (id) { store.set(id); history.replaceState(null, '', location.pathname + location.search); }
    return id;
  }
  KEY = readHash() || store.get() || parseId(CFG.sheetId);
  addEventListener('hashchange', () => { const id = readHash(); if (id) { KEY = id; load(); } });

  // ---------- format ----------
  const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
  const rp = n => (n == null || isNaN(n) ? '–' : 'Rp ' + nf0.format(Math.round(n)));
  function short(n) {
    const a = Math.abs(n);
    if (a >= 1e9) return nf2.format(n / 1e9) + ' M';
    if (a >= 1e6) return nf1.format(n / 1e6) + ' jt';
    if (a >= 1e3) return nf0.format(n / 1e3) + ' rb';
    return nf0.format(n);
  }
  const rpc = n => 'Rp ' + short(n);
  const pct = x => (x == null || isNaN(x) ? '–' : (x * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dF = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const dS = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  const mF = new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const ts = iso => (iso ? Date.parse(iso) : NaN);
  const tgl = iso => (isNaN(ts(iso)) ? '–' : dF.format(new Date(ts(iso))));
  const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
  const iso = t => new Date(t).toISOString().slice(0, 10);

  // ---------- olah data ----------
  const NOTA = { 'DONE': 'done', 'MASIH DI PIC': 'pic', 'TIDAK ADA NOTA': 'none' };
  function normBank(b) {
    const s = b.toLowerCase().replace(/[^a-z]/g, '');
    if (!s) return '(tidak diisi)';
    if (s.startsWith('qris')) return 'QRIS';
    if (s === 'topup') return 'Top-up e-money';
    if (s === 'cash') return 'Cash';
    return b.length <= 4 ? b.toUpperCase() : b[0].toUpperCase() + b.slice(1);
  }
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  function processData(m) {
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const tx = m.tx.map((r, i) => Object.assign({}, r, {
      no: r.no == null ? i + 1 : r.no,
      jenis: r.jenis || '(tanpa jenis)', pic: r.pic || '(tanpa PIC)', metode: normBank(r.bank),
      nota: r.nota || '(kosong)', st: NOTA[r.nota] || 'other',
      umur: isNaN(ts(r.tgl)) ? null : Math.max(0, Math.round((today - ts(r.tgl)) / DAY))
    }));
    const total = sum(tx, r => r.total);
    const group = key => {
      const map = new Map();
      tx.forEach(r => {
        const k = r[key];
        if (!map.has(k)) map.set(k, { key: k, total: 0, n: 0, done: 0, pic: 0, none: 0, other: 0, nPic: 0, maxUmur: 0 });
        const g = map.get(k);
        g.total += r.total; g.n++; g[r.st] += r.total;
        if (r.st === 'pic') { g.nPic++; g.maxUmur = Math.max(g.maxUmur, r.umur || 0); }
      });
      return [...map.values()].sort((a, b) => b.total - a.total);
    };
    const byJenis = group('jenis'), byPIC = group('pic'), byMetode = group('metode'), byNota = group('nota');

    // deret waktu: harian; otomatis mingguan / bulanan bila rentangnya panjang
    const dated = tx.filter(r => !isNaN(ts(r.tgl)));
    const t0 = Math.min(...dated.map(r => ts(r.tgl))), t1 = Math.max(...dated.map(r => ts(r.tgl)));
    const nDays = dated.length ? Math.round((t1 - t0) / DAY) + 1 : 0;
    const mode = nDays <= 31 ? 'hari' : nDays <= 210 ? 'minggu' : 'bulan';
    const bucket = t => {
      if (mode === 'hari') return t;
      if (mode === 'minggu') return t0 + Math.floor((t - t0) / (7 * DAY)) * 7 * DAY;
      const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    };
    const next = t => {
      if (mode === 'hari') return t + DAY;
      if (mode === 'minggu') return t + 7 * DAY;
      const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    };
    const series = [];
    if (dated.length) for (let t = bucket(t0); t <= t1; t = next(t)) series.push({ t, label: mode === 'bulan' ? mF.format(new Date(t)) : dS.format(new Date(t)), total: 0, n: 0 });
    const idx = new Map(series.map((s, i) => [s.t, i]));
    dated.forEach(r => { const s = series[idx.get(bucket(ts(r.tgl)))]; if (s) { s.total += r.total; s.n++; } });
    let c = 0; series.forEach(s => { c += s.total; s.kum = c; });

    const open = tx.filter(r => r.st === 'pic').sort((a, b) => (b.umur || 0) - (a.umur || 0));
    const noNota = tx.filter(r => r.st === 'none');
    const inc = m.incoming || [];
    return {
      m, tx, total, today, byJenis, byPIC, byMetode, byNota, series, mode, nDays, t0, t1, open, noNota,
      done: tx.filter(r => r.st === 'done'),
      top: [...tx].sort((a, b) => b.total - a.total).slice(0, 5),
      masuk: inc.length ? sum(inc, r => r.total) : null
    };
  }

  // ---------- tooltip ----------
  const tip = $('#tip');
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let L = x + 14, T = y + 14;
    if (L + r.width > innerWidth - 8) L = x - r.width - 14;
    if (T + r.height > innerHeight - 8) T = y - r.height - 14;
    tip.style.left = Math.max(8, L) + 'px'; tip.style.top = Math.max(8, T) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  document.addEventListener('pointermove', e => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el) showTip(el.getAttribute('data-tip'), e.clientX, e.clientY);
    else if (!e.target.closest || !e.target.closest('.chart')) hideTip();
  });
  const tipRows = (title, rows) => `<b>${esc(title)}</b>` + rows.map(r =>
    `<div class="r"><span>${r[2] ? `<i class="sw" style="background:${r[2]}"></i>` : ''}${esc(r[0])}</span><span>${esc(r[1])}</span></div>`).join('');
  const tipAttr = (title, rows) => esc(tipRows(title, rows));

  // ---------- chart (SVG) ----------
  function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 4 ? 4 : f <= 5 ? 5 : 10) * p;
  }
  function frame(el, max, H, n) {
    const W = Math.max(300, el.clientWidth), m = { l: 52, r: 14, t: 14, b: 26 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const y = v => m.t + ih * (1 - v / max);
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = max * i / 4, yy = y(v);
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" stroke="var(${i ? '--grid' : '--axis'})" stroke-width="1"/>` +
        `<text x="${m.l - 8}" y="${yy + 4}" text-anchor="end">${short(v)}</text>`;
    }
    return { W, H, m, iw, ih, y, g, step: Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 56)))) };
  }

  function lineChart(el, cfg) {
    const n = cfg.labels.length, vals = cfg.values;
    const f = frame(el, niceMax(Math.max(0, ...vals)), 250, n);
    const x = i => f.m.l + (n === 1 ? f.iw / 2 : f.iw * i / (n - 1));
    let s = `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(cfg.title)}">${f.g}`;
    cfg.labels.forEach((l, i) => { if (i % f.step === 0) s += `<text x="${x(i)}" y="${f.H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(l)}</text>`; });
    const pts = vals.map((v, i) => [x(i), f.y(v)]);
    s += `<path d="M${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L')}" fill="none" stroke="${cfg.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (n <= 40) pts.forEach(p => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${cfg.color}" stroke="var(--surface)" stroke-width="2"/>`; });
    const last = pts[n - 1];
    s += `<text class="dl" x="${last[0] - (n > 1 ? 8 : -8)}" y="${last[1] - 9}" text-anchor="${n > 1 ? 'end' : 'start'}">${short(vals[n - 1])}</text>`;
    s += `<line class="xh" y1="${f.m.t}" y2="${f.m.t + f.ih}" stroke="var(--axis)" stroke-width="1" visibility="hidden"/>` +
      `<rect x="${f.m.l}" y="${f.m.t}" width="${f.iw}" height="${f.ih}" fill="transparent"/></svg>`;
    el.innerHTML = s;
    const svg = $('svg', el), xh = $('.xh', el);
    svg.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) * f.W / r.width;
      const i = Math.max(0, Math.min(n - 1, Math.round((px - f.m.l) / (n === 1 ? 1 : f.iw / (n - 1)))));
      xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
      showTip(tipRows(cfg.labels[i], cfg.tip(i)), e.clientX, e.clientY);
    });
    svg.addEventListener('pointerleave', () => { xh.setAttribute('visibility', 'hidden'); hideTip(); });
  }

  function barChart(el, cfg) {
    const n = cfg.labels.length, vals = cfg.values;
    const f = frame(el, niceMax(Math.max(0, ...vals)), 250, n);
    const band = f.iw / n, bw = Math.max(2, Math.min(28, band - 2)), y0 = f.y(0);
    const iMax = vals.indexOf(Math.max(...vals));
    let s = `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(cfg.title)}">${f.g}`;
    cfg.labels.forEach((l, i) => {
      const cx = f.m.l + band * (i + 0.5), v = vals[i];
      if (i % f.step === 0) s += `<text x="${cx}" y="${f.H - 8}" text-anchor="middle">${esc(l)}</text>`;
      if (v > 0) {
        const bx = cx - bw / 2, by = f.y(v), r = Math.min(4, bw / 2, y0 - by);
        s += `<path d="M${bx},${y0}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + bw - r}Q${bx + bw},${by} ${bx + bw},${by + r}V${y0}Z" fill="${cfg.color}"/>`;
        if (i === iMax) s += `<text class="dl" x="${cx}" y="${by - 5}" text-anchor="middle">${short(v)}</text>`;
      }
      s += `<rect x="${f.m.l + band * i}" y="${f.m.t}" width="${band}" height="${f.ih}" fill="transparent" data-tip="${tipAttr(l, cfg.tip(i))}"/>`;
    });
    el.innerHTML = s + '</svg>';
  }

  // ---------- komponen kecil ----------
  const C = { main: 'var(--s1)', open: 'var(--s2)' };
  const ST = { done: ['good', '✓', 'var(--good)'], pic: ['warn', '●', 'var(--warn)'], none: ['crit', '▲', 'var(--crit)'], other: ['mute', '○', 'var(--muted)'] };
  const kpiTile = (lbl, val, ctx, tipTxt) => `<div class="card kpi"${tipTxt ? ` data-tip="${esc(tipTxt)}"` : ''}><p class="lbl">${esc(lbl)}</p><p class="val">${val}</p><p class="ctx">${ctx || '&nbsp;'}</p></div>`;
  const chip = (cls, ico, label) => `<span class="chip ${cls}"><b>${ico}</b>${esc(label)}</span>`;
  const notaChip = r => chip(ST[r.st][0], ST[r.st][1], r.nota);
  const legend = items => `<div class="legend">${items.map(s => `<span><i class="sw" style="background:${s[1]}"></i>${esc(s[0])}</span>`).join('')}</div>`;
  function tableHtml(cols, rows, foot) {
    const blank = v => v === '' || v === '–' || v == null;
    const keep = cols.map((c, i) => c.keep || !rows.length || rows.some(r => !blank(r[i])));
    if (keep.includes(false)) {
      const f = a => a.filter((_, i) => keep[i]);
      cols = f(cols); rows = rows.map(f); if (foot) foot = f(foot);
    }
    return `<div class="tw"><table><thead><tr>${cols.map(c => `<th class="${c.n ? 'n' : ''}"${c.sort ? ` data-sort="${c.sort}"` : ''}>${esc(c.t)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((v, i) => `<td class="${cols[i].n ? 'n' : ''}${cols[i].code ? ' code' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody>${foot ? `<tfoot><tr>${foot.map((v, i) => `<td class="${cols[i].n ? 'n' : ''}">${v}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
  }
  // baris batang horizontal; klik = buka tab Transaksi dengan filter itu
  function hbars(groups, field, max, overlay) {
    return `<div class="hbars">${groups.map(g => {
      const rows = [['Total', rp(g.total), C.main], ['Transaksi', g.n + 'x'], ['Porsi', pct(D.total ? g.total / D.total : 0)]];
      if (g.pic) rows.push(['Nota masih di PIC', `${rp(g.pic)} (${g.nPic}x)`, C.open]);
      if (g.none) rows.push(['Tidak ada nota', rp(g.none)]);
      return `<div class="hbar click" data-f="${field}" data-v="${esc(g.key)}" data-tip="${tipAttr(g.key, rows)}"><span class="nm">${esc(g.key)} <small>· ${g.n}x</small></span><span class="tr"><i style="width:${g.total / max * 100}%"></i>${overlay && g.pic > 0 ? `<i class="c" style="width:${g.pic / max * 100}%"></i>` : ''}</span><span class="v">${short(g.total)}</span></div>`;
    }).join('')}</div>`;
  }

  // ---------- TAB: Ringkasan ----------
  let D = null;
  const charts = [];
  function renderRingkasan() {
    const { tx, total, byJenis, byPIC, byMetode, byNota, series, open, noNota, done, top, mode } = D;
    const vOpen = sum(open, r => r.total), vNone = sum(noNota, r => r.total), vDone = sum(done, r => r.total);
    const unit = { hari: 'hari', minggu: 'minggu', bulan: 'bulan' }[mode];
    const kpis = [
      kpiTile('Total pengeluaran', rpc(total), `${tx.length} transaksi${D.nDays ? ` · ${dS.format(new Date(D.t0))} – ${dS.format(new Date(D.t1))}` : ''}`, rp(total)),
      D.masuk != null && kpiTile('Dana masuk', rpc(D.masuk), `saldo ${rp(D.masuk - total)}`, rp(D.masuk)),
      done.length && kpiTile('Nota sudah beres', rpc(vDone), `${done.length} transaksi · ${pct(vDone / total)} dari nilai`, rp(vDone)),
      open.length && kpiTile('Nota masih di PIC', rpc(vOpen), `${open.length} transaksi · ${pct(vOpen / total)} dari nilai`, rp(vOpen)),
      noNota.length && kpiTile('Tidak ada nota', rpc(vNone), `${noNota.length} transaksi · ${pct(vNone / total)} dari nilai`, rp(vNone)),
      series.length > 1 && kpiTile(`Rata-rata per ${unit}`, rpc(total / series.length), `${nf1.format(tx.length / series.length)} transaksi per ${unit}`, rp(total / series.length)),
      kpiTile('Rata-rata per transaksi', rpc(total / tx.length), `terbesar ${rpc(top[0].total)}`, rp(total / tx.length))
    ].filter(Boolean).join('');

    // Temuan otomatis
    const A = [];
    const add = (cls, ico, t) => A.push(`<li><span class="ico ${cls}">${ico}</span><span>${t}</span></li>`);
    if (open.length) {
      const h = [...byPIC].filter(g => g.pic > 0).sort((a, b) => b.pic - a.pic);
      add('warn', '●', `<b>${open.length} nota masih di PIC</b> senilai ${rp(vOpen)} (${pct(vOpen / total)} dari total). Terbesar: ${h.slice(0, 3).map(g => `${esc(g.key)} ${rpc(g.pic)}`).join(', ')}.`);
      const o = open[0];
      if (o.umur != null) add('warn', '●', `Nota tertua yang belum masuk: <b>${esc(o.item)}</b> (${esc(o.pic)}, ${rp(o.total)}) – sudah ${o.umur} hari sejak ${tgl(o.tgl)}.`);
    }
    if (noNota.length) add('crit', '▲', `<b>${noNota.length} transaksi tanpa nota</b> senilai ${rp(vNone)}: ${noNota.slice(0, 3).map(r => esc(r.item)).join('; ')}${noNota.length > 3 ? '; …' : ''}.`);
    if (byJenis.length > 1) add('info', 'i', `Jenis terbesar: <b>${esc(byJenis[0].key)}</b> ${rp(byJenis[0].total)} (${pct(byJenis[0].total / total)}), disusul ${esc(byJenis[1].key)} ${rp(byJenis[1].total)} (${pct(byJenis[1].total / total)}).`);
    add('info', 'i', `Transaksi terbesar: <b>${esc(top[0].item)}</b> ${rp(top[0].total)} (${pct(top[0].total / total)} dari total), ${tgl(top[0].tgl)}.`);
    const pk = series.reduce((a, b) => (b.total > a.total ? b : a), series[0] || { total: 0 });
    if (series.length > 1) add('info', 'i', `Pengeluaran tertinggi pada <b>${esc(pk.label)}</b>: ${rp(pk.total)} dalam ${pk.n} transaksi.`);
    // kualitas data
    const q = [];
    const nb = tx.filter(r => r.metode === '(tidak diisi)').length;
    if (nb) q.push(`${nb} transaksi belum diisi kolom BANK`);
    const nt = tx.filter(r => r.umur == null).length;
    if (nt) q.push(`${nt} transaksi tanpa tanggal yang valid`);
    const multi = byJenis.filter(g => g.key.includes(','));
    if (multi.length) q.push(`jenis ganda dalam satu baris (${multi.map(g => esc(g.key)).join('; ')})`);
    const names = byPIC.map(g => g.key).filter(k => k.length >= 4), pairs = [];
    names.forEach((a, i) => names.slice(i + 1).forEach(b => { if (lev(a.toLowerCase(), b.toLowerCase()) === 1) pairs.push(`${esc(a)} / ${esc(b)}`); }));
    if (pairs.length) q.push(`nama PIC mirip, mungkin orang yang sama: ${pairs.join(', ')}`);
    if (q.length) add('info', 'i', `Kerapian data: ${q.join(' · ')}.`);
    if (D.m.meta.incomingDuplicate) add('info', 'i', 'Sheet “INCOMING AMPRAH” isinya sama persis dengan sheet pengeluaran, jadi dana masuk &amp; saldo belum dihitung.');

    const stRows = byNota.map(g => { const st = ST[NOTA[g.key] || 'other']; return { g, st }; });
    const split = `<div class="split">${stRows.map(({ g, st }) => `<i class="click" data-f="nota" data-v="${esc(g.key)}" style="flex:${g.total};background:${st[2]}" data-tip="${tipAttr(g.key, [['Nilai', rp(g.total)], ['Porsi', pct(g.total / total)], ['Transaksi', g.n + 'x']])}"></i>`).join('')}</div>` +
      `<div class="stlist">${stRows.map(({ g, st }) => `<div class="click" data-f="nota" data-v="${esc(g.key)}">${chip(st[0], st[1], g.key)}<span>${g.n} transaksi</span><b>${rp(g.total)}</b><span>${pct(g.total / total)}</span></div>`).join('')}</div>`;

    const lbl = { hari: 'per hari', minggu: 'per minggu', bulan: 'per bulan' }[mode];
    const sTable = tableHtml([{ t: 'Periode', keep: 1 }, { t: 'Transaksi', n: 1 }, { t: 'Pengeluaran', n: 1 }, { t: 'Kumulatif', n: 1 }],
      series.map(s => [esc(s.label), s.n, rp(s.total), rp(s.kum)]));
    const topT = tableHtml([{ t: 'Tanggal' }, { t: 'Item' }, { t: 'Jenis' }, { t: 'PIC' }, { t: 'Nota' }, { t: 'Total', n: 1 }],
      top.map(r => [tgl(r.tgl), esc(r.item), esc(r.jenis), esc(r.pic), notaChip(r), nf0.format(r.total)]));

    $('#tab-ringkasan').innerHTML = `
      <div class="grid kpis">${kpis}</div>
      ${series.length > 1 ? `<div class="grid g2">
        <div class="card"><div class="card-head"><div><h2>Pengeluaran ${lbl} (Rp)</h2><p class="hint">Jumlah nilai amprah menurut tanggal transaksi</p></div></div><div class="chart" id="chB"></div>
          <details class="tbl"><summary>Lihat tabel</summary>${sTable}</details></div>
        <div class="card"><div class="card-head"><div><h2>Pengeluaran kumulatif (Rp)</h2><p class="hint">Akumulasi sejak ${tgl(iso(D.t0))}</p></div></div><div class="chart" id="chS"></div></div>
      </div>` : ''}
      <div class="grid g2">
        <div class="card"><div class="card-head"><div><h2>Temuan</h2><p class="hint">Dihitung otomatis dari data sheet</p></div></div><ul class="alerts">${A.join('')}</ul></div>
        <div class="card"><div class="card-head"><div><h2>Status nota</h2><p class="hint">Porsi nilai pengeluaran · klik untuk melihat transaksinya</p></div></div>${split}</div>
      </div>
      <div class="grid g2">
        <div class="card"><div class="card-head"><div><h2>Pengeluaran per jenis amprah</h2><p class="hint">${byJenis.length} jenis · klik untuk melihat transaksinya</p></div>${open.length ? legend([['Total', C.main], ['Nota masih di PIC', C.open]]) : ''}</div>${hbars(byJenis, 'jenis', byJenis[0].total, true)}</div>
        <div class="card"><div class="card-head"><div><h2>Pengeluaran per PIC</h2><p class="hint">${byPIC.length} PIC · klik untuk melihat transaksinya</p></div>${open.length ? legend([['Total', C.main], ['Nota masih di PIC', C.open]]) : ''}</div>${hbars(byPIC, 'pic', byPIC[0].total, true)}</div>
      </div>
      <div class="grid g2">
        <div class="card"><div class="card-head"><div><h2>Metode pembayaran</h2><p class="hint">Dari kolom BANK, penulisan diseragamkan</p></div></div>${hbars(byMetode, 'metode', byMetode[0].total, false)}</div>
        <div class="card"><div class="card-head"><div><h2>${top.length} transaksi terbesar</h2><p class="hint">${pct(sum(top, r => r.total) / total)} dari total pengeluaran</p></div></div>${topT}</div>
      </div>`;

    charts.length = 0;
    if (series.length > 1) {
      const labels = series.map(s => s.label);
      charts.push(() => barChart($('#chB'), { title: 'Pengeluaran ' + lbl, labels, values: series.map(s => s.total), color: C.main, tip: i => [['Pengeluaran', rp(series[i].total), C.main], ['Transaksi', series[i].n + 'x']] }));
      charts.push(() => lineChart($('#chS'), { title: 'Pengeluaran kumulatif', labels, values: series.map(s => s.kum), color: C.main, tip: i => [['Kumulatif', rp(series[i].kum), C.main], ['Periode ini', rp(series[i].total)]] }));
    }
    drawCharts();
  }
  function drawCharts() { if ($('#tab-ringkasan').classList.contains('on')) charts.forEach(f => f()); }

  // ---------- TAB: Transaksi ----------
  const F = { q: '', jenis: '', pic: '', nota: '', metode: '', sort: 'no', dir: 1 };
  function renderTransaksi() {
    const opt = (groups, cur) => groups.map(g => g.key).sort((a, b) => a.localeCompare(b, 'id')).map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
    $('#tab-transaksi').innerHTML = `<div class="card"><div class="card-head"><div><h2>Daftar transaksi amprah</h2><p class="hint">Klik judul kolom untuk mengurutkan</p></div></div>
      <div class="filters">
        <input type="search" id="fq" placeholder="Cari item / remarks / bukti TF…" value="${esc(F.q)}">
        <select id="fjenis"><option value="">Semua jenis</option>${opt(D.byJenis, F.jenis)}</select>
        <select id="fpic"><option value="">Semua PIC</option>${opt(D.byPIC, F.pic)}</select>
        <select id="fnota"><option value="">Semua status nota</option>${opt(D.byNota, F.nota)}</select>
        <select id="fmetode"><option value="">Semua metode</option>${opt(D.byMetode, F.metode)}</select>
        <button type="button" id="freset">Reset</button>
        <span class="count" id="fcount"></span>
      </div><div id="txTbl"></div></div>`;
    const t = $('#tab-transaksi');
    $('#fq', t).addEventListener('input', e => { F.q = e.target.value; drawTx(); });
    ['jenis', 'pic', 'nota', 'metode'].forEach(k => $('#f' + k, t).addEventListener('change', e => { F[k] = e.target.value; drawTx(); }));
    $('#freset', t).addEventListener('click', () => { Object.assign(F, { q: '', jenis: '', pic: '', nota: '', metode: '' }); renderTransaksi(); });
    $('#txTbl').addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]'); if (!th) return;
      const k = th.dataset.sort; F.dir = F.sort === k ? -F.dir : 1; F.sort = k; drawTx();
    });
    drawTx();
  }
  function drawTx() {
    const q = F.q.trim().toLowerCase();
    const rows = D.tx.filter(r => (!F.jenis || r.jenis === F.jenis) && (!F.pic || r.pic === F.pic) && (!F.nota || r.nota === F.nota) && (!F.metode || r.metode === F.metode) &&
      (!q || (r.item + ' ' + r.remarks + ' ' + r.bukti + ' ' + r.pic + ' ' + r.jenis).toLowerCase().includes(q)));
    const k = F.sort;
    rows.sort((a, b) => (typeof a[k] === 'number' && typeof b[k] === 'number' ? a[k] - b[k] : String(a[k] || '').localeCompare(String(b[k] || ''), 'id', { numeric: true })) * F.dir);
    const ar = s => (F.sort === s ? (F.dir > 0 ? ' ▲' : ' ▼') : '');
    const cols = [{ t: 'No' + ar('no'), sort: 'no', n: 1 }, { t: 'Tanggal' + ar('tgl'), sort: 'tgl' }, { t: 'Item' + ar('item'), sort: 'item' }, { t: 'Jenis' + ar('jenis'), sort: 'jenis' },
      { t: 'PIC' + ar('pic'), sort: 'pic' }, { t: 'Metode' + ar('metode'), sort: 'metode' }, { t: 'Nota' + ar('nota'), sort: 'nota' }, { t: 'Total' + ar('total'), sort: 'total', n: 1 }, { t: 'Bukti TF' }, { t: 'Remarks' }];
    const body = rows.map(r => [r.no, `<span class="nw">${tgl(r.tgl)}</span>`, esc(r.item), esc(r.jenis), esc(r.pic), esc(r.metode), notaChip(r), nf0.format(r.total), `<span class="sm">${esc(r.bukti)}</span>`, esc(r.remarks)]);
    const tv = sum(rows, r => r.total);
    $('#txTbl').innerHTML = rows.length ? tableHtml(cols, body, ['', '', `${rows.length} transaksi`, '', '', '', '', nf0.format(tv), '', '']) : '<div class="empty">Tidak ada transaksi yang cocok dengan filter.</div>';
    $('#fcount').textContent = `${rows.length} dari ${D.tx.length} transaksi · ${rp(tv)}`;
  }

  // ---------- TAB: Nota belum beres ----------
  function renderNota() {
    const { open, noNota, byPIC } = D;
    const holders = byPIC.filter(g => g.nPic).sort((a, b) => b.pic - a.pic);
    const cards = holders.map(g => `<div class="click" data-f="pic" data-v="${esc(g.key)}" data-n="MASIH DI PIC"><p class="l">${esc(g.key)}</p><p class="c">${rpc(g.pic)}</p><p class="a">${g.nPic} nota · tertua ${g.maxUmur} hari</p></div>`).join('');
    const tbl = list => tableHtml([{ t: 'Tanggal' }, { t: 'Umur (hari)', n: 1 }, { t: 'Item' }, { t: 'Jenis' }, { t: 'PIC' }, { t: 'Total', n: 1 }, { t: 'Remarks' }],
      list.map(r => [`<span class="nw">${tgl(r.tgl)}</span>`, r.umur == null ? '–' : r.umur, esc(r.item), esc(r.jenis), esc(r.pic), nf0.format(r.total), esc(r.remarks)]),
      ['', '', `${list.length} transaksi`, '', '', nf0.format(sum(list, r => r.total)), '']);
    $('#tab-nota').innerHTML = `
      ${open.length ? `<div class="card mb"><div class="card-head"><div><h2>Nota masih di PIC – per orang</h2><p class="hint">${open.length} nota senilai ${rp(sum(open, r => r.total))} · klik untuk melihat transaksinya</p></div></div><div class="pipe">${cards}</div></div>
      <div class="card mb"><div class="card-head"><div><h2>Daftar nota yang masih di PIC</h2><p class="hint">Urut dari yang paling lama · umur dihitung sampai ${tgl(iso(D.today))}</p></div></div>${tbl(open)}</div>` : ''}
      ${noNota.length ? `<div class="card mb"><div class="card-head"><div><h2>Transaksi tanpa nota</h2><p class="hint">Berstatus “TIDAK ADA NOTA” di sheet</p></div></div>${tbl(noNota)}</div>` : ''}`;
  }

  // ---------- render & muat ----------
  function showTab(name) {
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === name));
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.id === 'tab-' + name));
    drawCharts(); scrollTo(0, 0);
  }
  function renderAll(model) {
    if (!model.tx.length) throw new Error('sheet tidak berisi baris transaksi');
    D = processData(model);
    document.body.classList.remove('locked');
    $('#projSub').textContent = `${D.tx.length} transaksi · ${rp(D.total)}${D.nDays ? ` · ${tgl(iso(D.t0))} – ${tgl(iso(D.t1))}` : ''}`;
    const b = $('#srcBadge'); b.className = 'badge live'; b.textContent = 'Live · Google Sheet';
    $('#srcNote').textContent = 'dimuat ' + new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date());
    renderRingkasan(); renderTransaksi(); renderNota();
    const hasNota = D.open.length + D.noNota.length > 0, nb = $('#tabs button[data-tab=nota]');
    nb.hidden = !hasNota; nb.textContent = `Nota belum beres (${D.open.length + D.noNota.length})`;
    if (!hasNota && nb.classList.contains('on')) showTab('ringkasan');
  }

  function loadScript(src) {
    return new Promise((ok, no) => {
      if (window.XLSX) return ok();
      const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('gagal memuat ' + src));
      document.head.appendChild(s);
    });
  }
  async function loadLive() {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${KEY}/export?format=xlsx`, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if ((r.headers.get('content-type') || '').includes('text/html')) throw new Error('sheet belum dibagikan');
    const buf = await r.arrayBuffer();
    await loadScript('vendor/xlsx.full.min.js');
    return window.CashExtract.extract(window.XLSX, window.XLSX.read(buf, { type: 'array' }), { source: 'live' });
  }

  function showGate(msg) {
    D = null;
    document.body.classList.add('locked');
    $('#projSub').textContent = 'Akses terbatas';
    document.querySelectorAll('.tab').forEach(x => { x.classList.toggle('on', x.id === 'tab-ringkasan'); if (x.id !== 'tab-ringkasan') x.innerHTML = ''; });
    $('#tab-ringkasan').innerHTML = `<form class="card gate" id="gate"><h2>Masukkan link data</h2>
      <p class="hint">Dashboard ini tidak menyimpan data apa pun. Tempel link Google Sheet yang Anda terima untuk membukanya. Link hanya disimpan di browser ini.</p>
      ${msg ? `<p class="neg">${esc(msg)}</p>` : ''}
      <input type="password" id="gateIn" autocomplete="off" spellcheck="false" placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="Link Google Sheet">
      <button type="submit">Buka dashboard</button></form>`;
    $('#gate').addEventListener('submit', e => {
      e.preventDefault();
      const id = parseId($('#gateIn').value);
      if (!id) return showGate('Link tidak dikenali. Tempel link Google Sheet lengkap.');
      KEY = id; store.set(id); load();
    });
  }

  let busy = false;
  async function load() {
    if (!KEY) return showGate();
    if (busy) return; busy = true;
    const btn = $('#btnRefresh'), b = $('#srcBadge');
    btn.disabled = true; $('#srcNote').textContent = 'membaca Google Sheet…';
    try {
      renderAll(await loadLive());
    } catch (e) {
      b.className = 'badge err'; b.textContent = 'Gagal memuat';
      $('#srcNote').textContent = D ? 'gagal memperbarui – menampilkan data terakhir' : '';
      if (!D) { KEY = ''; store.set(''); showGate('Sheet tidak bisa dibaca. Periksa link-nya, pastikan sheet dibagikan “Siapa saja yang memiliki link → Pelihat”, dan koneksi internet aktif.'); }
    } finally { busy = false; btn.disabled = false; }
  }

  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });
  // klik batang / status di ringkasan -> tab Transaksi terfilter
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-f]'); if (!el || !D) return;
    Object.assign(F, { q: '', jenis: '', pic: '', nota: '', metode: '' });
    F[el.dataset.f] = el.dataset.v; if (el.dataset.n) F.nota = el.dataset.n;
    renderTransaksi(); hideTip(); showTab('transaksi');
  });
  $('#btnRefresh').addEventListener('click', load);

  // ---------- aplikasi terpasang (PWA) ----------
  if ('serviceWorker' in navigator) addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  let installEvt = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#btnInstall').hidden = false; });
  addEventListener('appinstalled', () => { installEvt = null; $('#btnInstall').hidden = true; });
  $('#btnInstall').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt(); await installEvt.userChoice.catch(() => {});
    installEvt = null; $('#btnInstall').hidden = true;
  });
  $('#btnLock').addEventListener('click', () => { KEY = ''; store.set(''); showGate(); });
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawCharts, 150); });
  load();
})();
