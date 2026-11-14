/* Motor de conversão PDF -> DOCX. Roda inteiro no navegador (ou no Node para testes). */
function createPdf2Docx(pdfjsLib, JSZip, env) {
  env = env || {};
  const OPS = pdfjsLib.OPS, U = pdfjsLib.Util;
  const esc = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tw = pt => Math.round(pt * 20);
  const emu = pt => Math.round(pt * 12700);
  const hex = c => c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();

  /* ---------- fontes ---------- */
  const METRICS = { // ascendente, descendente(+entrelinha) em fração do corpo
    'times new roman': [0.891, 0.258], 'arial': [0.905, 0.245], 'calibri': [0.952, 0.269],
    'courier new': [0.833, 0.300], 'verdana': [1.005, 0.210], 'tahoma': [1.000, 0.207],
    'cambria': [0.950, 0.222], 'georgia': [0.917, 0.219], 'segoe ui': [1.079, 0.251],
    'arial narrow': [0.936, 0.212], 'trebuchet ms': [0.939, 0.222], 'garamond': [0.862, 0.263],
    'book antiqua': [0.923, 0.283], 'century gothic': [1.006, 0.220], 'symbol': [1.005, 0.220]
  };
  const ALIAS = { helvetica: 'Arial', 'helvetica neue': 'Arial', times: 'Times New Roman', 'times roman': 'Times New Roman',
    courier: 'Courier New', arialmt: 'Arial', 'liberation serif': 'Times New Roman', 'liberation sans': 'Arial',
    'nimbus roman': 'Times New Roman', 'nimbus sans': 'Arial', 'dejavu sans': 'Verdana', carlito: 'Calibri', caladea: 'Cambria' };
  const fontCache = {};
  function fontInfo(page, fontName, styles) {
    if (fontCache[fontName]) return fontCache[fontName];
    let raw = '', f = null;
    try { f = page.commonObjs.get(fontName); raw = (f && f.name) || ''; } catch (e) {}
    const generic = (styles[fontName] && styles[fontName].fontFamily) || 'serif';
    let n = raw.replace(/^[A-Z]{6}\+/, '');
    const bold = /bold|black|heavy|semibold|demi/i.test(n) || !!(f && (f.bold || f.black));
    const italic = /italic|oblique/i.test(n) || !!(f && f.italic);
    n = n.split(/[-,]/)[0].replace(/(PS)?MT$/, '').replace(/PS$/, '')
      .replace(/(Bold|Italic|Oblique|Regular|Roman$)/g, m => m === 'Roman' ? ' Roman' : '')
      .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
    let fam = ALIAS[n.toLowerCase()] || n;
    if (fam.length < 3 || /^(CIDFont|F\d+|T\d+|TT\d+|Font\d*|R\d+|C\d+_\d+|g_d)/i.test(fam))
      fam = generic === 'monospace' ? 'Courier New' : generic === 'sans-serif' ? 'Arial' : 'Times New Roman';
    const m = METRICS[fam.toLowerCase()] || (generic === 'sans-serif' ? METRICS.arial : METRICS['times new roman']);
    const spw = /courier|consolas|mono|lucida console/i.test(fam) || generic === 'monospace' ? 0.6 : /arial|helvet|verdana|tahoma/i.test(fam) ? 0.28 : 0.25;
    return (fontCache[fontName] = { family: fam, bold, italic, asc: m[0], dsc: m[1], spw });
  }

  /* ---------- extração de uma página ---------- */
  async function extractPage(page, pageIndex) {
    const vp = page.getViewport({ scale: 1 });
    const W = vp.width, H = vp.height, VT = vp.transform;
    const opl = await page.getOperatorList();
    const tc = await page.getTextContent();
    const items = [], rawItems = tc.items;
    for (const it of []) {
    }
    // caminhos vetoriais
    const hs = [], vs = [], diags = [], fills = [], images = [], shows = [];
    let tm = [1, 0, 0, 1, 0, 0], lm = tm;
    let st = { ctm: [1, 0, 0, 1, 0, 0], fill: [0, 0, 0], stroke: [0, 0, 0], lw: 1 };
    const stack = []; let path = null;
    const P = (m, x, y) => { const p = U.applyTransform([x, y], m); return U.applyTransform(p, VT); };
    const addSeg = (a, b, t, color) => {
      const dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]);
      if (dx < 1 && dy < 1) return;
      if (dy < 0.8) hs.push({ y: (a[1] + b[1]) / 2, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), t, color });
      else if (dx < 0.8) vs.push({ x: (a[0] + b[0]) / 2, y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]), t, color });
      else diags.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], t });
    };
    const parsePath = (args, m) => {
      const o = args[0], c = args[1], subs = []; let k = 0, cur = null;
      for (const op of o) {
        if (op === OPS.rectangle) { const x = c[k], y = c[k + 1], w = c[k + 2], h = c[k + 3]; k += 4;
          subs.push({ rect: true, pts: [P(m, x, y), P(m, x + w, y), P(m, x + w, y + h), P(m, x, y + h)] }); cur = null; }
        else if (op === OPS.moveTo) { cur = { pts: [P(m, c[k], c[k + 1])] }; subs.push(cur); k += 2; }
        else if (op === OPS.lineTo) { if (cur) cur.pts.push(P(m, c[k], c[k + 1])); k += 2; }
        else if (op === OPS.curveTo) { if (cur) { cur.curve = true; cur.pts.push(P(m, c[k + 4], c[k + 5])); } k += 6; }
        else if (op === OPS.curveTo2 || op === OPS.curveTo3) { if (cur) { cur.curve = true; cur.pts.push(P(m, c[k + 2], c[k + 3])); } k += 4; }
        else if (op === OPS.closePath) { if (cur) cur.closed = true; }
      }
      return subs;
    };
    const scaleOf = m => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
    const cutSegs = (arr, key, a, b, k0, k1, lo, hi) => {
      for (let i = arr.length - 1; i >= 0; i--) { const g = arr[i];
        if (g[key] <= k0 + 0.7 || g[key] >= k1 - 0.7 || g[b] <= lo + 0.5 || g[a] >= hi - 0.5) continue;
        const parts = [];
        if (lo - g[a] > 1) { const p = Object.assign({}, g); p[b] = lo; parts.push(p); }
        if (g[b] - hi > 1) { const p = Object.assign({}, g); p[a] = hi; parts.push(p); }
        arr.splice(i, 1, ...parts); }
    };
    const addFill = (x0, y0, x1, y1, color) => {
      cutSegs(vs, 'x', 'y0', 'y1', x0, x1, y0, y1); cutSegs(hs, 'y', 'x0', 'x1', y0, y1, x0, x1);
      fills.push({ x0, y0, x1, y1, color: color.slice() });
    };
    const doFill = () => {
      if (!path) return;
      for (const s of path) {
        if (s.curve || s.pts.length < 3) continue;
        const xs = s.pts.map(p => p[0]), ys = s.pts.map(p => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const axis = s.pts.every(p => (Math.abs(p[0] - x0) < 0.3 || Math.abs(p[0] - x1) < 0.3) && (Math.abs(p[1] - y0) < 0.3 || Math.abs(p[1] - y1) < 0.3));
        if (!axis) continue;
        const w = x1 - x0, h = y1 - y0;
        if (w <= 3 && h <= 3) continue;
        if (h <= 3) hs.push({ y: (y0 + y1) / 2, x0, x1, t: h, color: st.fill });
        else if (w <= 3) vs.push({ x: (x0 + x1) / 2, y0, y1, t: w, color: st.fill });
        else addFill(x0, y0, x1, y1, st.fill);
      }
    };
    const doStroke = close => {
      if (!path) return;
      const t = Math.max(0.25, st.lw * scaleOf(st.ctm));
      for (const s of path) {
        if (s.curve) continue;
        const pts = s.pts.slice(); if (s.rect || close || s.closed) pts.push(pts[0]);
        for (let i = 1; i < pts.length; i++) addSeg(pts[i - 1], pts[i], t, st.stroke);
      }
    };
    const rgb = a => [a[0], a[1], a[2]];
    for (let i = 0; i < opl.fnArray.length; i++) {
      const fn = opl.fnArray[i], a = opl.argsArray[i];
      switch (fn) {
        case OPS.save: stack.push({ ctm: st.ctm.slice(), fill: st.fill, stroke: st.stroke, lw: st.lw }); break;
        case OPS.restore: if (stack.length) st = stack.pop(); break;
        case OPS.transform: st.ctm = U.transform(st.ctm, a); break;
        case OPS.paintFormXObjectBegin: stack.push({ ctm: st.ctm.slice(), fill: st.fill, stroke: st.stroke, lw: st.lw });
          if (a && a[0]) st.ctm = U.transform(st.ctm, a[0]); break;
        case OPS.paintFormXObjectEnd: if (stack.length) st = stack.pop(); break;
        case OPS.setFillRGBColor: st.fill = rgb(a); break;
        case OPS.setStrokeRGBColor: st.stroke = rgb(a); break;
        case OPS.setLineWidth: st.lw = a[0]; break;
        case OPS.beginText: tm = lm = [1, 0, 0, 1, 0, 0]; break;
        case OPS.setTextMatrix: tm = lm = [a[0], a[1], a[2], a[3], a[4], a[5]]; break;
        case OPS.moveText: case OPS.setLeadingMoveText: tm = lm = U.transform(lm, [1, 0, 0, 1, a[0], a[1]]); break;
        case OPS.showText: case OPS.showSpacedText: case OPS.nextLineShowText: case OPS.nextLineSetSpacingShowText: {
          const p = P(st.ctm, tm[4], tm[5]); shows.push({ x: p[0], y: p[1], c: st.fill }); break; }
        case OPS.constructPath: path = parsePath(a, st.ctm); break;
        case OPS.fill: case OPS.eoFill: doFill(); path = null; break;
        case OPS.stroke: doStroke(false); path = null; break;
        case OPS.closeStroke: doStroke(true); path = null; break;
        case OPS.fillStroke: case OPS.eoFillStroke: doFill(); doStroke(false); path = null; break;
        case OPS.closeFillStroke: case OPS.closeEOFillStroke: doFill(); doStroke(true); path = null; break;
        case OPS.endPath: path = null; break;
        case OPS.paintImageXObject: case OPS.paintJpegXObject: case OPS.paintInlineImageXObject: case OPS.paintImageXObjectRepeat: {
          const c = [P(st.ctm, 0, 0), P(st.ctm, 1, 0), P(st.ctm, 1, 1), P(st.ctm, 0, 1)];
          const xs = c.map(p => p[0]), ys = c.map(p => p[1]);
          const r = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), ref: a[0] };
          if (r.x1 - r.x0 > 2 && r.y1 - r.y0 > 2) images.push(r);
          break; }
      }
    }
    const rasters = [];
    if (env.imagePixels) for (const im of images) {
      let px = null; try { px = await env.imagePixels(page, im.ref); } catch (e) {}
      if (!px) continue;
      const d = px.data, n = px.w * px.h, step = Math.max(1, Math.floor(n / 4000));
      let mn = [255, 255, 255], mx = [0, 0, 0], vis = 0, cnt = 0;
      for (let i = 0; i < n; i += step) { cnt++; if (d[i * 4 + 3] < 16) continue; vis++;
        for (let c = 0; c < 3; c++) { const v = d[i * 4 + c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; } }
      if (!vis) { im.skip = true; continue; }
      if (vis === cnt && mx[0] - mn[0] < 10 && mx[1] - mn[1] < 10 && mx[2] - mn[2] < 10) { // cor única
        im.skip = true; const w = im.x1 - im.x0, h = im.y1 - im.y0, col = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
        if (h <= 3 && w > 3) hs.push({ y: (im.y0 + im.y1) / 2, x0: im.x0, x1: im.x1, t: h, color: col });
        else if (w <= 3 && h > 3) vs.push({ x: (im.x0 + im.x1) / 2, y0: im.y0, y1: im.y1, t: w, color: col });
        else if (w > 3 && h > 3) addFill(im.x0, im.y0, im.x1, im.y1, col);
        continue; }
      if (px.w < 40 || px.h < 16) continue;
      // procura linhas retas longas (bordas de tabela) nos pixels
      const W2 = px.w, H2 = px.h, lum = new Uint8Array(n);
      for (let i = 0; i < n; i++) lum[i] = d[i * 4 + 3] >= 128 ? Math.round(d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) : 255;
      const L = (x, y) => (x < 0 || y < 0 || x >= W2 || y >= H2) ? 255 : lum[y * W2 + x];
      // "crista": pixel mais escuro que os vizinhos dos dois lados (pega linhas claras e finas de JPEG)
      const hRidge = (x, y) => { const v = L(x, y); return v < 110 || v + 18 < Math.min(L(x, y - 2), L(x, y + 2)); };
      const vRidge = (y, x) => { const v = L(x, y); return v < 110 || v + 18 < Math.min(L(x - 2, y), L(x + 2, y)); };
      const sx = (im.x1 - im.x0) / W2, sy = (im.y1 - im.y0) / H2;
      const scan = (len, other, at, minRun, maxGap) => { const segs = [];
        for (let o = 0; o < other; o++) { let start = -1, gap = 0;
          for (let k = 0; k <= len; k++) { const v = k < len ? at(k, o) : 0;
            if (v) { if (start < 0) start = k; gap = 0; }
            else if (start >= 0 && (++gap > maxGap || k === len)) { const end = k - gap + 1; if (end - start >= minRun) segs.push({ o, a: start, b: end }); start = -1; gap = 0; } } }
        const out = []; // junta linhas vizinhas (espessura)
        for (const g of segs) { let m = null;
          for (let q = out.length - 1; q >= 0 && g.o - out[q].o1 <= 1; q--) { const c = out[q];
            const ov = Math.min(c.b, g.b) - Math.max(c.a, g.a); if (g.o - c.o1 >= 0 && ov >= 0.8 * Math.min(c.b - c.a, g.b - g.a)) { m = c; break; } }
          if (m) { m.o1 = g.o; m.a = Math.min(m.a, g.a); m.b = Math.max(m.b, g.b); } else out.push({ o0: g.o, o1: g.o, a: g.a, b: g.b }); }
        return out.filter(c => c.o1 - c.o0 < 8); };
      let rh = scan(W2, H2, hRidge, Math.max(30, Math.round(0.12 * W2)), Math.max(3, Math.round(0.012 * W2)));
      let rv = scan(H2, W2, vRidge, Math.max(14, Math.round(0.015 * H2)), 3);
      // agrupa por posição; descarta colunas com pouca cobertura (restos de diagonais) e completa linhas quase inteiras
      const groupBy = arr => { const gs = []; arr.slice().sort((p, q) => p.o0 - q.o0).forEach(g => { const l = gs[gs.length - 1]; if (l && g.o0 - l.o1 <= 2) { l.items.push(g); l.o1 = Math.max(l.o1, g.o1); } else gs.push({ o0: g.o0, o1: g.o1, items: [g] }); }); return gs; };
      const covLen = items => { const iv = items.map(g => [g.a, g.b]).sort((p, q) => p[0] - q[0]); let t = 0, end = -1; for (const [a2, b2] of iv) { if (b2 > end) { t += b2 - Math.max(a2, end); end = b2; } } return t; };
      rv = groupBy(rv).filter(g => covLen(g.items) >= 0.05 * H2).flatMap(g => g.items.map(q => ({ o0: g.o0, o1: g.o1, a: q.a, b: q.b })));
      if (rh.length) { const minA = Math.min(...rh.map(g => g.a)), maxB = Math.max(...rh.map(g => g.b));
        rh = groupBy(rh).flatMap(g => covLen(g.items) >= 0.7 * (maxB - minA) ? [{ o0: g.o0, o1: g.o1, a: minA, b: maxB }] : g.items.map(q => ({ o0: g.o0, o1: g.o1, a: q.a, b: q.b }))); }
      if (env.debug) console.log('RASTER', W2, H2, 'H', JSON.stringify(rh.map(g => [g.o0, g.o1, g.a, g.b])), 'V', JSON.stringify(rv.map(g => [g.o0, g.o1, g.a, g.b])));
      if (rh.length >= 2 && rv.length >= 2) {
        for (const g of rh) hs.push({ y: im.y0 + (g.o0 + g.o1 + 1) / 2 * sy, x0: im.x0 + g.a * sx, x1: im.x0 + g.b * sx, t: 0.5, color: [0, 0, 0] });
        for (const g of rv) vs.push({ x: im.x0 + (g.o0 + g.o1 + 1) / 2 * sx, y0: im.y0 + g.a * sy, y1: im.y0 + g.b * sy, t: 0.5, color: [0, 0, 0] });
        im.raster = true; rasters.push({ x0: im.x0, y0: im.y0, x1: im.x1, y1: im.y1, w: W2, h: H2, data: d, sx, sy });
      }
    }
    const byY = {};
    for (const sh of shows) { const k = Math.round(sh.y); (byY[k] = byY[k] || []).push(sh); }
    const colorAt = (x, y) => { let best = null, bd = 1e9; const k = Math.round(y);
      for (const kk of [k - 1, k, k + 1]) for (const sh of byY[kk] || []) { if (Math.abs(sh.y - y) > 0.7) continue;
        const d = x - sh.x; const cost = d < -0.7 ? 1e6 - d : d; if (cost < bd) { bd = cost; best = sh; } }
      if (!best || bd > 1e5) return null; const c = best.c; return (c[0] + c[1] + c[2] < 90) ? null : hex(c); };
    for (const it of rawItems) {
      if (!it.str || !it.str.trim()) continue;
      const t = U.transform(VT, it.transform);
      const size = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]);
      if (!size) continue;
      const fi = fontInfo(page, it.fontName, tc.styles);
      const lead = it.str.length - it.str.replace(/^\s+/, '').length;
      const trail = it.str.length - it.str.replace(/\s+$/, '').length;
      const cw = it.width / it.str.length;
      items.push({ str: it.str.trim(), x: t[4] + lead * cw * 0.5, y: t[5], w: Math.max(0, it.width - (lead + trail) * cw * 0.5),
        size, font: fi, spB: lead > 0, spA: trail > 0, color: colorAt(t[4], t[5]) });
    }
    return { W, H, items, hs, vs, diags, fills, images, rasters, index: pageIndex, page };
  }

  /* ---------- OCR: palavras reconhecidas viram itens de texto ---------- */
  function ocrItems(words) {
    if (!words.length) return [];
    let family = 'Arial';
    if (env.measure) {
      let best = Infinity;
      for (const fam of ['Arial', 'Times New Roman', 'Calibri']) {
        const fo = { family: fam, bold: false, italic: false }, rs = [];
        for (const w of words) { if (w.str.length < 4) continue; const sz = w.row * 1.17, m = env.measure(w.str, fo, sz); if (m == null) { rs.length = 0; break; } rs.push(m / Math.max(1, w.x1 - w.x0)); }
        if (rs.length < 5) continue; rs.sort((a, b) => a - b); const d = Math.abs(Math.log(rs[rs.length >> 1]));
        if (d < best) { best = d; family = fam; }
      }
    }
    const m = METRICS[family.toLowerCase()] || METRICS.arial;
    const font = { family, bold: false, italic: false, asc: m[0], dsc: m[1], spw: family === 'Times New Roman' ? 0.25 : 0.28, ocr: true };
    // tamanho pela altura da própria palavra (conforme tenha maiúsculas/hastes e descendentes), mediana por linha
    const est = w => { const h = w.y1 - w.y0, t = w.str, up = /[A-ZÀ-ÝbdfhklĺtíÍ0-9()\[\]\/|!?%&#@$]/.test(t), dn = /[gjpqyçÇ,;()\[\]\/|]/.test(t);
      const k = up && dn ? 0.93 : up ? 0.71 : dn ? 0.70 : 0.48; return h / k; };
    const lines = {}; for (const w of words) { const k = Math.round(w.base * 2); (lines[k] = lines[k] || []).push(est(w)); }
    const med = a => { const b = a.slice().sort((p, q) => p - q); return b[b.length >> 1]; };
    return words.map(w => { const k = Math.round(w.base * 2), ln = med(lines[k] || [est(w)]), own = est(w);
      let sz = Math.min(ln, w.row * 1.17 * 1.15); if (own < 0.75 * ln) { if (w.conf < 70) return null; sz = own; } // índice pequeno: só se lido com segurança
      return { str: w.str, x: w.x0, y: w.base, w: Math.max(1, w.x1 - w.x0), size: Math.max(4, Math.round(sz * 2) / 2), font, spB: false, spA: false, color: null, ocr: w }; }).filter(Boolean);
  }

  /* ---------- tabelas ---------- */
  function mergeCollinear(segs, key, a, b) {
    const out = []; const sorted = segs.slice().sort((p, q) => p[key] - q[key] || p[a] - q[a]);
    const groups = [];
    for (const s of sorted) { const g = groups[groups.length - 1];
      if (g && Math.abs(g.c - s[key]) <= 1.2) g.list.push(s); else groups.push({ c: s[key], list: [s] }); }
    for (const g of groups) {
      g.list.sort((p, q) => p[a] - q[a]); let cur = null;
      for (const s of g.list) {
        if (cur && s[a] <= cur[b] + 1.5) { cur[b] = Math.max(cur[b], s[b]); cur.t = Math.max(cur.t, s.t); }
        else { cur = Object.assign({}, s); cur[key] = g.c; out.push(cur); }
      }
    }
    return out;
  }
  const cluster = (vals, tol) => { const s = vals.slice().sort((a, b) => a - b), out = [];
    for (const v of s) { const l = out[out.length - 1]; if (l && v - l.max <= tol) { l.max = v; l.sum += v; l.n++; } else out.push({ max: v, sum: v, n: 1 }); }
    return out.map(o => o.sum / o.n); };

  function findTables(pg) {
    const H = mergeCollinear(pg.hs, 'y', 'x0', 'x1'), V = mergeCollinear(pg.vs, 'x', 'y0', 'y1');
    const n = H.length + V.length, parent = Array.from({ length: n }, (_, i) => i);
    const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    const T = 2;
    H.forEach((h, i) => V.forEach((v, j) => {
      if (v.x >= h.x0 - T && v.x <= h.x1 + T && h.y >= v.y0 - T && h.y <= v.y1 + T) parent[find(i)] = find(H.length + j);
    }));
    const comps = {};
    H.forEach((h, i) => { (comps[find(i)] = comps[find(i)] || { h: [], v: [] }).h.push(h); });
    V.forEach((v, j) => { const r = find(H.length + j); (comps[r] = comps[r] || { h: [], v: [] }).v.push(v); });
    const tables = [], loose = [];
    for (const k in comps) {
      const c = comps[k];
      if (c.h.length >= 2 && c.v.length >= 2) {
        const xs = cluster(c.v.map(v => v.x).concat(), 2), ys = cluster(c.h.map(h => h.y), 2);
        const minX = Math.min(...c.h.map(h => h.x0)), maxX = Math.max(...c.h.map(h => h.x1));
        const minY = Math.min(...c.v.map(v => v.y0)), maxY = Math.max(...c.v.map(v => v.y1));
        if (minX < xs[0] - 3) xs.unshift(minX); if (maxX > xs[xs.length - 1] + 3) xs.push(maxX);
        if (minY < ys[0] - 3) ys.unshift(minY); if (maxY > ys[ys.length - 1] + 3) ys.push(maxY);
        if (xs.length < 2 || ys.length < 2 || xs[xs.length - 1] - xs[0] < 8 || ys[ys.length - 1] - ys[0] < 6) { loose.push(...c.h); continue; }
        tables.push(buildGrid(xs, ys, c.h, c.v, pg));
      } else loose.push(...c.h);
    }
    // descarta molduras de 1 célula que envolvem outras tabelas
    const keep = tables.filter(t => !(t.cells.length === 1 && tables.some(o => o !== t && o.x0 >= t.x0 - 2 && o.x1 <= t.x1 + 2 && o.y0 >= t.y0 - 2 && o.y1 <= t.y1 + 2)));
    keep.sort((a, b) => a.y0 - b.y0);
    return { tables: keep, loose };
  }
  function buildGrid(xs, ys, hsegs, vsegs, pg) {
    const nr = ys.length - 1, nc = xs.length - 1;
    const cov = (segs, key, a, b, c, lo, hi) => { let s = 0, t = 0;
      for (const g of segs) if (Math.abs(g[key] - c) <= 2) { const o = Math.min(g[b], hi) - Math.max(g[a], lo); if (o > 0) { s += o; t = Math.max(t, g.t); } }
      return s >= 0.7 * (hi - lo) ? t || 0.5 : 0; };
    const hE = [], vE = [];
    for (let r = 0; r <= nr; r++) { hE.push([]); for (let c = 0; c < nc; c++) hE[r].push(cov(hsegs, 'y', 'x0', 'x1', ys[r], xs[c], xs[c + 1])); }
    for (let r = 0; r < nr; r++) { vE.push([]); for (let c = 0; c <= nc; c++) vE[r].push(cov(vsegs, 'x', 'y0', 'y1', xs[c], ys[r], ys[r + 1])); }
    const id = (r, c) => r * nc + c, par = Array.from({ length: nr * nc }, (_, i) => i);
    const find = i => par[i] === i ? i : (par[i] = find(par[i]));
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
      if (c + 1 < nc && !vE[r][c + 1]) par[find(id(r, c))] = find(id(r, c + 1));
      if (r + 1 < nr && !hE[r + 1][c]) par[find(id(r, c))] = find(id(r + 1, c));
    }
    const reg = {};
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) { const k = find(id(r, c));
      const g = reg[k] = reg[k] || { r0: r, r1: r, c0: c, c1: c };
      g.r0 = Math.min(g.r0, r); g.r1 = Math.max(g.r1, r); g.c0 = Math.min(g.c0, c); g.c1 = Math.max(g.c1, c); }
    let cells = Object.values(reg);
    // regiões não retangulares que se sobrepõem: volta para a grade simples
    const owner = {}; let clash = false;
    for (const g of cells) for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) { if (owner[id(r, c)]) clash = true; owner[id(r, c)] = g; }
    if (clash) { cells = []; for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) cells.push({ r0: r, r1: r, c0: c, c1: c }); }
    for (const g of cells) {
      g.x0 = xs[g.c0]; g.x1 = xs[g.c1 + 1]; g.y0 = ys[g.r0]; g.y1 = ys[g.r1 + 1];
      const mx = (arr) => arr.length ? Math.max(...arr) : 0, all = arr => arr.length && arr.every(v => v > 0);
      const top = [], bot = [], lef = [], rig = [];
      for (let c = g.c0; c <= g.c1; c++) { top.push(hE[g.r0][c]); bot.push(hE[g.r1 + 1][c]); }
      for (let r = g.r0; r <= g.r1; r++) { lef.push(vE[r][g.c0]); rig.push(vE[r][g.c1 + 1]); }
      g.b = { top: all(top) ? mx(top) : 0, bottom: all(bot) ? mx(bot) : 0, left: all(lef) ? mx(lef) : 0, right: all(rig) ? mx(rig) : 0 };
      const votes = {}; let nS = 0;
      const ras = (pg.rasters || []).find(r => (g.x0 + g.x1) / 2 > r.x0 && (g.x0 + g.x1) / 2 < r.x1 && (g.y0 + g.y1) / 2 > r.y0 && (g.y0 + g.y1) / 2 < r.y1);
      const lumAt = (r, x, y) => { const px = Math.min(r.w - 1, Math.max(0, Math.round((x - r.x0) / r.sx))), py = Math.min(r.h - 1, Math.max(0, Math.round((y - r.y0) / r.sy))), k = (py * r.w + px) * 4;
        return [r.data[k], r.data[k + 1], r.data[k + 2]]; };
      for (const fx of [0.12, 0.3, 0.5, 0.7, 0.88]) for (const fy of [0.25, 0.5, 0.75]) {
        const x = g.x0 + fx * (g.x1 - g.x0), y = g.y0 + fy * (g.y1 - g.y0); let col = null;
        for (let k = pg.fills.length - 1; k >= 0; k--) { const f = pg.fills[k]; if (x > f.x0 && x < f.x1 && y > f.y0 && y < f.y1) { col = f.color; break; } }
        if (!col && ras) { const c = lumAt(ras, x, y); if (c[0] + c[1] + c[2] < 480) continue; col = c.map(v => Math.min(255, Math.round(v / 4) * 4 + 1)); }
        nS++; if (!col) continue;
        const key = col.map(v => Math.round(v / 12)).join(','); (votes[key] = votes[key] || { n: 0, sum: [0, 0, 0] }); votes[key].n++; col.forEach((v, q) => votes[key].sum[q] += v);
      }
      let bestV = null; for (const k in votes) if (!bestV || votes[k].n > bestV.n) bestV = votes[k];
      if (bestV && bestV.n >= 0.6 * Math.max(nS, 8)) { const c = bestV.sum.map(v => v / bestV.n); if (!(c[0] > 243 && c[1] > 243 && c[2] > 243)) g.shade = hex(c); }
      if (ras && g.x1 - g.x0 > 8 && g.y1 - g.y0 > 5) {
        const bgs = []; for (const fx of [0.2, 0.4, 0.6, 0.8]) for (const fy of [0.2, 0.8]) { const c = lumAt(ras, g.x0 + fx * (g.x1 - g.x0), g.y0 + fy * (g.y1 - g.y0)); bgs.push(c[0] + c[1] + c[2]); }
        bgs.sort((p, q) => p - q); const bg = bgs[bgs.length >> 1];
        const hit = dir => { let h = 0, N = 24;
          for (let q = 0; q < N; q++) { const t = 0.12 + 0.76 * q / (N - 1), x = dir ? g.x0 + t * (g.x1 - g.x0) : g.x1 - t * (g.x1 - g.x0), y = g.y0 + t * (g.y1 - g.y0); let dk = false;
            for (let dy = -2; dy <= 2 && !dk; dy++) { const c = lumAt(ras, x, y + dy * ras.sy); if (c[0] + c[1] + c[2] < bg - 75) dk = true; }
            if (dk) h++; } return h / N; };
        const a = hit(true), b = hit(false);
        if (a > 0.8 && a > b + 0.3) g.tl2br = 0.5; else if (b > 0.8 && b > a + 0.3) g.tr2bl = 0.5;
      }
      for (const d of pg.diags) {
        const dx0 = Math.min(d.x0, d.x1), dx1 = Math.max(d.x0, d.x1), dy0 = Math.min(d.y0, d.y1), dy1 = Math.max(d.y0, d.y1);
        if (Math.abs(dx0 - g.x0) < 3 && Math.abs(dx1 - g.x1) < 3 && Math.abs(dy0 - g.y0) < 3 && Math.abs(dy1 - g.y1) < 3) {
          const down = (d.x1 - d.x0) * (d.y1 - d.y0) > 0; // desce da esquerda p/ direita
          g[down ? 'tl2br' : 'tr2bl'] = d.t; d.used = true;
        }
      }
      g.items = [];
    }
    return { xs, ys, nr, nc, cells, x0: xs[0], x1: xs[nc], y0: ys[0], y1: ys[nr], kind: 'table' };
  }

  /* ---------- linhas e parágrafos ---------- */
  function buildLines(items) {
    const lines = [];
    const sorted = items.slice().sort((a, b) => b.size - a.size || a.y - b.y);
    for (const it of sorted) {
      let best = null;
      const underLabel = lines.some(A => it.size < 0.85 * A.size && it.y > A.base && it.y - A.base < (A.items.length > 1 ? 1.0 : 1.15) * A.size && Math.abs(it.x - A.items[0].x) < 2.5 && (A.items.length > 1 || /^[(\[]?[0-9IVXLivxl]+(\.[0-9IVXivx]+)*[.)\]]?$/.test(A.items[0].str.trim())));
      if (underLabel) { const own = lines.find(A => A.isIdx && Math.abs(A.base - it.y) < 0.6); if (own) own.items.push(it); else lines.push({ base: it.y, size: it.size, items: [it], isIdx: true }); continue; }
      for (const l of lines) {
        const d = l.base - it.y; // positivo = item acima da linha de base
        const ok = Math.abs(d) < 0.12 * l.size + 0.6 || (it.size < 0.85 * l.size && d > -0.35 * l.size && d < 0.75 * l.size);
        const cost = ll => Math.abs(ll.base - it.y);
        if (!l.big) l.big = l.size; 
        if (ok && it.size < 0.85 * l.size && it.x + it.w < Math.min(...l.items.map(q => q.x)) - 1.5 * l.size) continue; // índice pequeno sob um rótulo de outra linha
        if (ok && (!best || cost(l) < cost(best))) best = l;
      }
      if (best) best.items.push(it); else lines.push({ base: it.y, size: it.size, items: [it] });
    }
    for (const l of lines) {
      l.items.sort((a, b) => a.x - b.x);
      for (const it of l.items) {
        const d = l.base - it.y;
        if (it.size < 0.85 * l.size && d > 0.15 * l.size) it.sup = true;
        else if (it.size < 0.85 * l.size && d < -0.08 * l.size) it.sub = true;
      }
      const main = l.items.filter(i => !i.sup && !i.sub);
      l.font = (main[0] || l.items[0]).font;
      l.x = l.items[0].x; const last = l.items[l.items.length - 1]; l.right = Math.max(...l.items.map(i => i.x + i.w));
      l.dsz = Math.round(l.size * 2) / 2;
      l.top = l.base - l.font.asc * l.dsz; l.bottom = l.base + l.font.dsc * l.dsz; l.nat = (l.font.asc + l.font.dsc) * l.dsz;
    }
    lines.sort((a, b) => a.base - b.base || a.x - b.x);
    // índice pequeno (ex.: (3)(4) sob o rótulo) que se sobrepõe à linha seguinte: vira subscrito da linha de cima
    for (let i = 1; i + 1 < lines.length; i++) {
      const L = lines[i], prev = lines[i - 1], next = lines[i + 1];
      if (L.size < 0.85 * prev.size && L.base - prev.base < 1.0 * prev.size && next.top < L.bottom - 0.5 && L.x >= prev.x - 2 && L.right < next.x) {
        const lab = prev.items.filter(it => it.x <= L.x + 1).sort((p, q) => q.x - p.x)[0];
        (prev.floats = prev.floats || []).push({ items: L.items.sort((p, q) => p.x - q.x), base: L.base, top: L.top, x: L.x, nat: L.nat, size: L.dsz, labR: lab ? lab.x + lab.w : null, pbase: prev.base, atEnd: !!lab && lab.x + lab.w >= prev.right - 1 });
        lines.splice(i, 1); i--;
      }
    }
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const A = lines[i], B = lines[j]; if (B.base - A.base >= 0.75 * Math.max(A.size, B.size)) break;
      if (Math.abs(A.size - B.size) > 0.2 * A.size) continue;
      if (B.x > A.right + 2 * A.size || A.x > B.right + 2 * A.size) { // disjuntas na horizontal: mesma linha, separadas por tabulação
        A.items = A.items.concat(B.items).sort((p, q) => p.x - q.x); A.x = A.items[0].x; A.right = Math.max(A.right, B.right);
        lines.splice(j, 1); j--; }
    }
    return lines;
  }
  const runFmt = it => ({ font: it.font.family, b: it.font.bold, i: it.font.italic, u: !!it.u, strike: !!it.strike, sup: !!it.sup, sub: !!it.sub,
    sz: Math.round(((it.sup || it.sub) ? it.size / 0.65 : it.size) * 2) / 2, field: it.field || null, color: it.color || null, pos: 0 });
  const sameFmt = (a, b) => a.font === b.font && a.b === b.b && a.i === b.i && a.u === b.u && a.strike === b.strike && a.sup === b.sup && a.sub === b.sub && a.sz === b.sz && a.color === b.color && !a.field && !b.field;

  function lineRuns(l, areaL, areaR) {
    const runs = [], tabs = []; let prev = null;
    const gaps = []; for (let i = 1; i < l.items.length; i++) gaps.push(l.items[i].x - (l.items[i - 1].x + l.items[i - 1].w));
    const wide = gaps.filter(g => g > 0.4 * l.size);
    const justified = l.right >= areaR - 2 && wide.length >= 3 && Math.max(...wide) / Math.min(...wide) < 1.8;
    const push = (text, fmt) => { const r = runs[runs.length - 1]; if (r && r.text != null && !r.br && fmt && sameFmt(r.fmt, fmt)) r.text += text; else runs.push({ text, fmt }); };
    for (const it of l.items) {
      const fmt = runFmt(it);
      if (prev) {
        const gap = it.x - (prev.x + prev.w);
        if (!justified && !it.glue && gap > Math.max(1.8 * prev.font.spw * l.size, 3.5) && !(it.sup || prev.sup)) {
          const lastChunk = !l.items.slice(l.items.indexOf(it) + 1).some((n2, q, arr) => n2.x - ((q ? arr[q - 1] : it).x + (q ? arr[q - 1] : it).w) > Math.max(1.8 * it.font.spw * l.size, 3.5) && !n2.glue);
          if (lastChunk && l.right - areaL > 0.75 * (areaR - areaL) && l.right - it.x < 0.35 * (areaR - areaL)) tabs.push({ pos: Math.min(l.right, areaR) - areaL, right: true }); else tabs.push(it.x - areaL);
          const tf = runFmt(prev); tf.field = null; tf.u = false; tf.strike = false; runs.push({ tab: true, fmt: tf });
        } else if (!(it.raw && it.glue) && (gap > 0.13 * Math.min(it.size, prev.size) || prev.spA || it.spB)) {
          const f = (prev.sup || prev.sub) ? fmt : runFmt(prev); f.u = prev.u && it.u; f.strike = prev.strike && it.strike; f.field = null;
          push(' ', f);
        }
      }
      push(it.str, fmt); prev = it;
    }
    return { runs, tabs };
  }

  const docState = { compressed: 0, stretched: 0 };
  const tabXs = l => { const out = []; for (let i = 1; i < l.items.length; i++) { const p = l.items[i - 1], it = l.items[i];
      if (!it.glue && !it.sup && !p.sup && it.x - (p.x + p.w) > Math.max(1.8 * p.font.spw * l.size, 3.5)) out.push(it.x); } return out; };
  function natW(l) {
    if (!env.measure) return null; let w = 0;
    for (const it of l.items) { const m = env.measure(it.str, it.font, it.size); if (m == null) return null; w += m; }
    for (let i = 1; i < l.items.length; i++) { const g = Math.max(0, l.items[i].x - l.items[i - 1].x - l.items[i - 1].w); w += (g > Math.max(1.8 * l.items[i - 1].font.spw * l.size, 3.5) && !l.items[i].glue) ? g : Math.min(0.25 * l.size, g); }
    return w;
  }
  const f0top = p => p.lines[0].base + p.lines[0].font.dsc * p.lines[0].dsz - p.exact;
  function buildParagraphs(lines, areaL, areaR, isCell) {
    const paras = []; const mid = (areaL + areaR) / 2;
    for (const l of lines) {
      const leftGap = l.x - areaL, rightGap = areaR - l.right;
      l.tx = tabXs(l);
      l.align = l.tx.length ? 'left' : (Math.abs((l.x + l.right) / 2 - mid) <= 1.6 && leftGap > 2.5) ? 'center' : (Math.abs(rightGap) <= 1.6 && leftGap > 6 ? 'right' : 'left');
      l.multiWord = l.items.length > 1 || /\s/.test(l.items[0].str);
      if (env.measure && l.right - l.x > 0.6 * (areaR - areaL)) { const nw = natW(l);
        if (nw != null) { const d = nw - (l.right - l.x); if (d > Math.max(1, 0.004 * nw)) { docState.compressed++; if (env.debug) console.log("COMP", d.toFixed(2), nw.toFixed(1), l.items.map(i => i.str + "[" + i.w.toFixed(1) + "/" + (env.measure(i.str, i.font, i.size) || 0).toFixed(1) + "]").join(" ").slice(0, 300)); } else if (d < -Math.max(2, 0.01 * nw)) docState.stretched++; } }
      const p = paras[paras.length - 1];
      let merged = false;
      if (p) {
        const q = p.lines[p.lines.length - 1];
        const pitch = l.base - q.base;
        const first = l.items[0]; const fw = first.w * (first.str.split(/\s/)[0].length / first.str.length);
        const free = q.align === 'center' ? (areaR - areaL) - (q.right - q.x) : q.align === 'right' ? q.x - areaL : areaR - q.right;
        let wrapped = (q.align === 'center' || q.align === 'right') ? free < 0.75 * fw : free < fw + 0.25 * l.size + 0.5, softBreak = false;
        const nat = natW(q);
        if (wrapped && q.align !== 'center' && q.align !== 'right' && nat != null && (q.right - q.x) - nat > Math.max(3, 0.025 * nat) && q.right >= areaR - 1.8) {
          q.stretched = true; // linha esticada (justificada): cabia mais uma palavra?
          const f1 = env.measure(first.str.split(/\s/)[0], first.font, first.size);
          if (f1 != null && (areaR - q.x) - nat > f1 + 0.3 * l.size + 1) softBreak = true;
        }
        const sameSize = Math.abs(l.size - q.size) < 0.7;
        const pitchOk = pitch > 0.6 * l.nat && pitch < 1.7 * l.nat && (p.lines.length < 2 || Math.abs(pitch - p.pitch) < 0.8);
        { const cx0 = p.lines.length > 1 ? p.lines[1].x : (q.tx && q.tx.length ? q.tx[q.tx.length - 1] : null); // linha cheia na coluna de continuação = justificada, não "à direita"
          if (cx0 != null && l.align !== 'left' && Math.abs(l.x - cx0) < 1.6 && Math.abs(areaR - l.right) < 2) l.align = 'left'; }
        let alignOk = l.align === q.align;
        const hang = p.lines.length < 2 && q.tx.length && Math.abs(l.x - q.tx[q.tx.length - 1]) < 1.6; // continuação alinhada ao texto depois do rótulo
        if (alignOk && l.align === 'left') alignOk = p.lines.length < 2 ? (hang || (l.x <= q.x + 40 && q.x - l.x < 0.3 * (areaR - areaL))) : Math.abs(l.x - p.lines[1].x) < 1.6;
        if (p.lines.length === 1 && q.align !== l.align && q.right >= areaR - 1.6 && l.align === 'left') alignOk = true; // 1ª linha justificada
        const hasTab = !hang && q.items.some((it, i) => i > 0 && !it.glue && it.x - (q.items[i - 1].x + q.items[i - 1].w) > 3 * q.size);
        if (wrapped && sameSize && pitchOk && alignOk && !hasTab && (l.multiWord || q.multiWord)) {
          p.lines.push(l); p.pitch = pitch; merged = true; l.softBreak = softBreak;
          if (q.align === 'left' && !softBreak && !q.stretched) { const f1 = env.measure ? env.measure(first.str.split(/\s/)[0], first.font, first.size) : null; l.fitAt = q.right + 0.22 * l.size + (f1 != null ? f1 : fw); }
        }
      }
      if (!merged) paras.push({ lines: [l], pitch: 0 });
    }
    for (const p of paras) {
      const f = p.lines[0], n = p.lines.length;
      p.size = f.dsz; p.font = f.font;
      p.exact = Math.round((n > 1 ? p.pitch : f.nat) * 20) / 20;
      p.top = f.base + f.font.dsc * f.dsz - p.exact; p.bottom = p.top + n * p.exact;
      p.align = f.align;
      if (n > 1) {
        const body = p.lines.slice(0, -1);
        if (p.lines[1].align === 'left' && body.every(l => l.right >= areaR - 1.8) && (f.align === 'left' || f.align === 'right' || f.align === 'center')) {
          p.align = 'both'; }
        else if (f.align !== p.lines[1].align) p.align = p.lines[1].align;
      }
      p.runs = []; p.tabs = [];
      p.lines.forEach((l, i) => {
        const lr = lineRuns(l, areaL, areaR); l.tabbed = lr.tabs.length > 0;
        if (i > 0) { const lastRun = p.runs[p.runs.length - 1];
          if (l.softBreak) p.runs.push({ br: true, fmt: lastRun.fmt });
          else if (lastRun && lastRun.text != null && !/[-\u00AD]$/.test(lastRun.text)) lastRun.text += ' '; }
        if (i === 0) p.tabs = lr.tabs;
        for (const r of lr.runs) { if (r.tab && i > 0) p.runs.push({ text: ' ', fmt: r.fmt }); else p.runs.push(r); }
      });
      if (p.align === 'left' || p.align === 'both') {
        const contX = n > 1 ? p.lines[1].x : f.x;
        p.indLeft = Math.max(0, contX - areaL); p.firstLine = n > 1 ? f.x - contX : 0;
        if (p.tabs.length && n === 1 && !p.tabs[0].right && p.tabs[0] - (f.x - areaL) < 40) { // item numerado: recuo deslocado
          p.indLeft = p.tabs[0]; p.firstLine = (f.x - areaL) - p.tabs[0]; }
        if (p.indLeft < 0.8) p.indLeft = 0;
      } else { p.indLeft = 0; p.firstLine = 0; }
      p.kind = 'p';
      p.floats = []; p.areaW = areaR - areaL;
      for (const l of p.lines) for (const f of (l.floats || [])) p.floats.push({ runs: f.items.map((it, k) => ({ text: (k && (it.spB || f.items[k - 1].spA || it.x - (f.items[k - 1].x + f.items[k - 1].w) > 0.13 * it.size) ? ' ' : '') + it.str, fmt: Object.assign(runFmt(it), { sub: false, sup: false, sz: Math.round(it.size * 2) / 2 }) })),
        dx: f.x - areaL, dy: f.top - f0top(p), labR: f.labR == null ? null : f.labR - areaL, drop: f.base - f.pbase, atEnd: f.atEnd && p.lines.length === 1, w: f.items[f.items.length - 1].x + f.items[f.items.length - 1].w - f.x + 1.5, h: f.nat + 0.5, exact: f.nat });
    }
    for (let i = 1; i < paras.length; i++) { const p = paras[i], prev = paras[i - 1]; if (p.lines.length > 1) continue;
      const f = p.lines[0], d = f.base - prev.lines[prev.lines.length - 1].base;
      if (d > 0.7 * f.nat && d < f.nat - 0.02 && Math.abs(f.size - prev.lines[0].size) < 0.7) { p.exact = Math.round(d * 20) / 20; p.top = p.bottom - p.exact; } }
    return paras;
  }

  /* ---------- XML ---------- */
  function rPr(f, extra) {
    return '<w:rPr><w:rFonts w:ascii="' + esc(f.font) + '" w:hAnsi="' + esc(f.font) + '" w:cs="' + esc(f.font) + '" w:eastAsia="' + esc(f.font) + '"/>' +
      (f.b ? '<w:b/><w:bCs/>' : '') + (f.i ? '<w:i/><w:iCs/>' : '') + (f.strike ? '<w:strike/>' : '') + (f.color ? '<w:color w:val="' + f.color + '"/>' : '') +
      (f.pos ? '<w:position w:val="' + f.pos + '"/>' : '') + '<w:sz w:val="' + Math.round(f.sz * 2) + '"/><w:szCs w:val="' + Math.round(f.sz * 2) + '"/>' + (f.u ? '<w:u w:val="single"/>' : '') +
      (f.sup ? '<w:vertAlign w:val="superscript"/>' : f.sub ? '<w:vertAlign w:val="subscript"/>' : '') + (extra || '') + '</w:rPr>';
  }
  function runsXml(runs) {
    let x = '';
    for (const r of runs) {
      const pr = rPr(r.fmt);
      if (r.tab) x += '<w:r>' + pr + '<w:tab/></w:r>';
      else if (r.br) x += '<w:r>' + pr + '<w:br/></w:r>';
      else if (r.fmt.field) x += '<w:r>' + pr + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + pr + '<w:instrText xml:space="preserve"> ' + r.fmt.field + ' </w:instrText></w:r><w:r>' + pr +
        '<w:fldChar w:fldCharType="separate"/></w:r><w:r>' + pr + '<w:t>' + esc(r.text) + '</w:t></w:r><w:r>' + pr + '<w:fldChar w:fldCharType="end"/></w:r>';
      else x += '<w:r>' + pr + '<w:t xml:space="preserve">' + esc(r.text) + '</w:t></w:r>';
    }
    return x;
  }
  function paraXml(p, before, after, opts) {
    opts = opts || {};
    // índices pequenos embaixo do rótulo ("(viii)" e "(3) (4) (5)"): viram texto normal logo depois do rótulo, um pouco rebaixado
    let ti0 = (p.runs || []).findIndex(r => r.tab);
    const whole = p.floats && p.floats.length && ti0 < 0 && p.floats.every(f => f.atEnd); // o rótulo é a linha inteira ("II.5")
    if (whole) ti0 = p.runs.length;
    if (p.floats && p.floats.length && ti0 > 0 && (whole || p.firstLine < -0.5) && p.floats.every(f => f.labR != null)) {
      const runs = p.runs.slice(); let end = Math.max(...p.floats.map(f => f.labR)), ins = [];
      for (const f of p.floats) { ins.push({ text: ' ', fmt: Object.assign({}, f.runs[0].fmt, { sub: true, sz: Math.round(f.runs[0].fmt.sz / 0.65 * 2) / 2 }) });
        f.runs.forEach(r => ins.push({ text: r.text, fmt: Object.assign({}, r.fmt, { sub: true, sz: Math.round(r.fmt.sz / 0.65 * 2) / 2 }) })); end += f.w + 1; }
      runs.splice(ti0, 0, ...ins);
      const tab0 = p.tabs && p.tabs.length ? (p.tabs[0].right ? null : p.tabs[0]) : p.indLeft;
      const need = end + 2 - (tab0 == null ? p.indLeft : tab0);
      p = Object.assign({}, p, { runs, floats: [] });
      if (need > 0 && !whole) { p.indLeft += need; p.firstLine -= need; if (p.tabs && p.tabs.length && !p.tabs[0].right) p.tabs = [p.tabs[0] + need].concat(p.tabs.slice(1)); }
    }
    let pr = '';
    if (opts.pageBreak) pr += '<w:pageBreakBefore/>';
    if (p.tabs && p.tabs.length) pr += '<w:tabs>' + p.tabs.map(t => t.right ? '<w:tab w:val="right" w:pos="' + tw(t.pos) + '"/>' : '<w:tab w:val="left" w:pos="' + tw(t) + '"/>').join('') + '</w:tabs>';
    pr += '<w:spacing w:before="' + Math.max(0, tw(before || 0)) + '" w:after="' + Math.max(0, tw(after || 0)) + '"' +
      ' w:line="' + tw(p.exact) + '" w:lineRule="exact"/>';
    if (p.indLeft || p.firstLine) pr += '<w:ind w:left="' + tw(p.indLeft) + '"' + (p.firstLine > 0.5 ? ' w:firstLine="' + tw(p.firstLine) + '"' : p.firstLine < -0.5 ? ' w:hanging="' + tw(-p.firstLine) + '"' : '') + '/>';
    if (p.align !== 'left') pr += '<w:jc w:val="' + p.align + '"/>';
    const ti = (p.runs || []).findIndex(r => r.tab);
    return '<w:p><w:pPr>' + pr + '</w:pPr>' + (opts.prefix || '') + (p.floats || []).map(floatXml).join('') + runsXml(p.runs) + '</w:p>';
  }
  // item com rótulo e índices pequenos embaixo dele ("(viii)" e "(3) (4) (5)"): tabela sem bordas de 2 colunas,
  // tudo como texto normal (sem caixa de texto); a coluna da esquerda tem a largura do recuo do rótulo
  function labelTableXml(p, before, after, ti) {
    const hang = -p.firstLine, left = p.indLeft - hang, w1 = tw(hang), w2 = tw(p.areaW - p.indLeft);
    const sp = (b, a, line) => '<w:spacing w:before="' + Math.max(0, tw(b)) + '" w:after="' + Math.max(0, tw(a || 0)) + '" w:line="' + tw(line) + '" w:lineRule="exact"/>';
    const fl = p.floats.slice().sort((a, b) => a.dy - b.dy); let y = p.exact, refs = '';
    for (const f of fl) { refs += '<w:p><w:pPr>' + sp(Math.max(0, f.dy - y), 0, f.exact) + '</w:pPr>' + runsXml(f.runs) + '</w:p>'; y = Math.max(y, f.dy) + f.exact; }
    const tabs = (p.tabs || []).map(t => t.right ? { right: true, pos: t.pos - p.indLeft } : t - p.indLeft).filter(t => (t.right ? t.pos : t) > 1).slice(1);
    const tabXml = tabs.length ? '<w:tabs>' + tabs.map(t => t.right ? '<w:tab w:val="right" w:pos="' + tw(t.pos) + '"/>' : '<w:tab w:val="left" w:pos="' + tw(t) + '"/>').join('') + '</w:tabs>' : '';
    const body = p.runs.slice(ti + 1);
    return '<w:tbl><w:tblPr><w:tblW w:w="' + (w1 + w2) + '" w:type="dxa"/><w:tblInd w:w="' + tw(left) + '" w:type="dxa"/><w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr>' +
      '<w:tblGrid><w:gridCol w:w="' + w1 + '"/><w:gridCol w:w="' + w2 + '"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="' + w1 + '" w:type="dxa"/></w:tcPr>' +
      '<w:p><w:pPr>' + sp(before, 0, p.exact) + '</w:pPr>' + runsXml(p.runs.slice(0, ti)) + '</w:p>' + refs + '</w:tc>' +
      '<w:tc><w:tcPr><w:tcW w:w="' + w2 + '" w:type="dxa"/></w:tcPr><w:p><w:pPr>' + tabXml + sp(before, after, p.exact) + (p.align !== 'left' ? '<w:jc w:val="' + p.align + '"/>' : '') + '</w:pPr>' + runsXml(body) + '</w:p></w:tc></w:tr></w:tbl>' +
      '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>';
  }
  let floatId = 7000;
  function floatXml(f) {
    const id = floatId++, cx = emu(f.w), cy = emu(f.h);
    return '<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="' + (251700000 + id) + '" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">' +
      '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>' + emu(f.dx) + '</wp:posOffset></wp:positionH><wp:positionV relativeFrom="line"><wp:posOffset>' + emu(f.dy) + '</wp:posOffset></wp:positionV>' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="' + id + '" name="Indice ' + id + '"/><wp:cNvGraphicFramePr/>' +
      '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr>' +
      '<wps:txbx><w:txbxContent><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="' + tw(f.exact) + '" w:lineRule="exact"/></w:pPr>' + runsXml(f.runs) + '</w:p></w:txbxContent></wps:txbx>' +
      '<wps:bodyPr rot="0" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0"><a:noAutofit/></wps:bodyPr></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
  }
  function spacerXml(h, opts) {
    opts = opts || {}; h = Math.max(1, h);
    return '<w:p><w:pPr>' + (opts.pageBreak ? '<w:pageBreakBefore/>' : '') + '<w:spacing w:before="0" w:after="0" w:line="' + tw(h) + '" w:lineRule="exact"/>' +
      '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>' + (opts.sect || '') + '</w:pPr>' + (opts.prefix || '') + '</w:p>';
  }
  function flowXml(elems, startY, ctx, pageOpts) {
    // elems: parágrafos e tabelas ordenados por y. Devolve XML e posição final.
    let x = '', cur = startY, first = true; pageOpts = pageOpts || {};
    const out = [];
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i], o = {};
      if (first) { o.pageBreak = pageOpts.pageBreak; o.prefix = pageOpts.prefix; }
      if (e.kind === 'p') {
        const next = elems[i + 1]; let after = 0;
        let before = Math.max(0, e.top - cur); const h = e.bottom - e.top;
        if (first && before > 0.5) { // espaço antes no topo da página é ignorado por Word/LibreOffice: usa um parágrafo espaçador
          out.push(spacerXml(before, o)); cur += Math.max(1, before); before = 0; o.pageBreak = false; o.prefix = ''; }
        if (next && next.kind === 'table') { after = Math.max(0, next.y0 - (cur + before + h)); }
        out.push(paraXml(e, before, after, o)); cur = cur + before + h + after; // posição real, para compensar sobreposições
      } else {
        const prev = elems[i - 1];
        if (!prev || prev.kind !== 'p') { const h = Math.max(1, e.y0 - cur); out.push(spacerXml(h, o)); cur += h; }
        out.push(tableXml(e, ctx)); cur = Math.max(cur, e.y0) + (e.y1 - e.y0);
      }
      first = false;
    }
    if (first && (pageOpts.pageBreak || pageOpts.prefix || pageOpts.forcePara)) out.push(spacerXml(1, { pageBreak: pageOpts.pageBreak, prefix: pageOpts.prefix }));
    return { xml: out.join(''), end: cur, endsWithTable: elems.length > 0 && elems[elems.length - 1].kind === 'table' };
  }
  function tableXml(t, ctx) {
    const m = t.mar;
    let x = '<w:tbl><w:tblPr><w:tblW w:w="' + tw(t.x1 - t.x0) + '" w:type="dxa"/><w:tblInd w:w="' + tw(t.x0 - ctx.areaL + (ctx.compat < 15 ? t.mar : 0)) + '" w:type="dxa"/>' +
      '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="' + tw(m) + '" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="' + tw(m) + '" w:type="dxa"/></w:tblCellMar>' +
      '<w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>';
    for (let c = 0; c < t.nc; c++) x += '<w:gridCol w:w="' + tw(t.xs[c + 1] - t.xs[c]) + '"/>';
    x += '</w:tblGrid>';
    const at = {}; for (const g of t.cells) for (let r = g.r0; r <= g.r1; r++) at[r + ':' + g.c0] = g;
    const bd = (name, v) => v ? '<w:' + name + ' w:val="single" w:sz="' + Math.max(2, Math.round(v * 8)) + '" w:space="0" w:color="000000"/>' : '<w:' + name + ' w:val="nil"/>';
    for (let r = 0; r < t.nr; r++) {
      const rh = t.ys[r + 1] - t.ys[r];
      x += '<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="' + tw(rh) + '" w:hRule="atLeast"/></w:trPr>';
      for (let c = 0; c < t.nc; c++) {
        const g = at[r + ':' + c]; if (!g) continue;
        const span = g.c1 - g.c0 + 1, startRow = r === g.r0;
        x += '<w:tc><w:tcPr><w:tcW w:w="' + tw(g.x1 - g.x0) + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') +
          (g.r1 > g.r0 ? (startRow ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>') : '') +
          '<w:tcBorders>' + bd('top', g.b.top) + bd('left', g.b.left) + bd('bottom', g.b.bottom) + bd('right', g.b.right) +
          (g.tl2br ? bd('tl2br', g.tl2br) : '') + (g.tr2bl ? bd('tr2bl', g.tr2bl) : '') + '</w:tcBorders>' +
          (g.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + g.shade + '"/>' : '') +
          (startRow && g.vAlign && g.vAlign !== 'top' ? '<w:vAlign w:val="' + g.vAlign + '"/>' : '') + '</w:tcPr>';
        if (startRow && g.paras.length) {
          let cur = g.vAlign === 'top' ? g.y0 : g.paras[0].top;
          const bef = g.paras.map(p => { const b = Math.max(0, p.top - cur); cur = cur + b + (p.bottom - p.top); return b; });
          let excess = bef.reduce((a, b) => a + b, 0) + g.paras.reduce((a, p) => a + p.bottom - p.top, 0) - (g.y1 - g.y0 - 0.5);
          for (let i = 0; i < bef.length && excess > 0; i++) { const d = Math.min(bef[i], excess); bef[i] -= d; excess -= d; }
          g.paras.forEach((p, i) => { x += paraXml(p, bef[i], 0); });
        } else {
          const sz = Math.max(2, Math.min(t.fontSize || 10, Math.floor((g.y1 - g.y0) / 1.25 * 2) / 2));
          x += '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:rPr><w:sz w:val="' + Math.round(sz * 2) + '"/><w:szCs w:val="' + Math.round(sz * 2) + '"/></w:rPr></w:pPr></w:p>';
        }
        x += '</w:tc>';
      }
      x += '</w:tr>';
    }
    return x + '</w:tbl>';
  }

  /* ---------- análise da página ---------- */
  function analyzePage(pg) {
    const { tables, loose } = findTables(pg);
    // sublinhados
    // sublinhado e tachado: linhas soltas logo abaixo da linha de base ou atravessando o meio do texto
    for (const h of loose) for (let k = 0; k < pg.items.length; k++) {
      const it = pg.items[k];
      const d = h.y - it.y; let prop = null;
      if (d >= -0.5 && d <= 0.3 * it.size + 1) prop = 'u';
      else if (d <= -0.12 * it.size && d >= -0.55 * it.size) prop = 'strike';
      if (!prop) continue;
      const o = Math.min(h.x1, it.x + it.w) - Math.max(h.x0, it.x);
      if (o >= 0.85 * it.w) it[prop] = true;
      else if (o > 2 && /\s/.test(it.str)) { // cobre só parte: divide em palavras
        const parts = [], re = /\S+/g; let m;
        const full = env.measure ? env.measure(it.str, it.font, it.size) : null;
        const pos = n => full ? env.measure(it.str.slice(0, n), it.font, it.size) / full * it.w : n * it.w / it.str.length;
        while ((m = re.exec(it.str))) { const px = it.x + pos(m.index), pw = pos(m.index + m[0].length) - pos(m.index);
          const p = Object.assign({}, it, { str: m[0], x: px, w: pw, spB: true, spA: true, glue: parts.length > 0 });
          if (px + pw / 2 > h.x0 && px + pw / 2 < h.x1) p[prop] = true; parts.push(p); }
        parts[0].spB = it.spB; parts[parts.length - 1].spA = it.spA;
        pg.items.splice(k, 1, ...parts); k += parts.length - 1;
      }
    }
    const body = [];
    for (const it of pg.items) {
      const cx = it.x + Math.min(it.w / 2, 3), cy = it.y - it.size * 0.3; let best = null;
      for (const t of tables) { if (cx < t.x0 - 1 || cx > t.x1 + 1 || cy < t.y0 || cy > t.y1) continue;
        for (const g of t.cells) if (cx >= g.x0 - 1 && cx <= g.x1 + 1 && cy >= g.y0 && cy <= g.y1) { best = g; break; }
        if (best) break; }
      if (best) best.items.push(it); else body.push(it);
    }
    for (const t of tables) {
      let m = 5.4; const sizes = {};
      for (const g of t.cells) { g.lines = buildLines(g.items);
        for (const l of g.lines) { m = Math.min(m, l.x - g.x0, g.x1 - l.right); sizes[l.dsz] = (sizes[l.dsz] || 0) + 1; } }
      t.mar = Math.max(0, Math.floor(m * 20) / 20 - 0.2); if (t.mar < 0.5) t.mar = 0;
      t.fontSize = +Object.keys(sizes).sort((a, b) => sizes[b] - sizes[a])[0] || 10;
      for (const g of t.cells) {
        g.paras = buildParagraphs(g.lines, g.x0 + t.mar, g.x1 - t.mar, true);
        if (g.paras.length) {
          const topGap = g.paras[0].top - g.y0, botGap = g.y1 - g.paras[g.paras.length - 1].bottom;
          g.vAlign = (g.paras.length === 1 && Math.abs(topGap - botGap) < 2.2 && topGap > 2.5) ? 'center' : (botGap < topGap - 2.2 && botGap < 3 ? 'bottom' : 'top');
        }
      }
    }
    pg.tables = tables; pg.bodyLines = buildLines(body);
  }

  /* ---------- cabeçalho / rodapé repetidos ---------- */
  const norm = l => l.items.map(i => i.str).join(' ').replace(/\d+/g, '#');
  function detectHF(pages) {
    const res = { h: 0, f: 0 };
    if (pages.length < 2) return res;
    const same = (k, fromEnd) => {
      const ref = pages[0].bodyLines; const rl = fromEnd ? ref[ref.length - 1 - k] : ref[k]; if (!rl) return false;
      if (fromEnd ? rl.base < pages[0].H * 0.75 : rl.base > pages[0].H * 0.3) return false;
      return pages.every(p => { const l = fromEnd ? p.bodyLines[p.bodyLines.length - 1 - k] : p.bodyLines[k];
        if (!l || norm(l) !== norm(rl) || Math.abs(l.base - rl.base) > 2 || Math.abs(l.x - rl.x) > 3) return false;
        if (!numsOk(pages.map(pp => { const ll = fromEnd ? pp.bodyLines[pp.bodyLines.length - 1 - k] : pp.bodyLines[k]; return ll ? ll.items.map(i => i.str).join(' ') : ''; }))) return false;
        return !p.tables.some(t => fromEnd ? t.y1 > l.top : t.y0 < l.bottom); });
    };
    while (res.h < 8 && same(res.h, false)) res.h++;
    const minLines = Math.min(...pages.map(p => p.bodyLines.length));
    while (res.f < 6 && res.h + res.f < minLines && same(res.f, true)) res.f++;
    return res;
  }
  const toks = str => str.match(/\d+|\D+/g) || [];
  // números em cabeçalho/rodapé: ou são iguais em todas as páginas, ou são o número da página
  function numsOk(strs) {
    const T = strs.map(toks); if (T.some(t => t.length !== T[0].length)) return false;
    for (let k = 0; k < T[0].length; k++) { if (!/^\d+$/.test(T[0][k])) continue;
      const same = T.every(t => t[k] === T[0][k]), isPage = T.every((t, i) => t[k] === String(i + 1));
      if (!same && !isPage) return false; }
    return true;
  }
  function markFields(pages, pick) {
    const n = pages.length, ref = pick(pages[0]);
    ref.forEach((l, li) => {
      const others = pages.map(p => pick(p)[li]);
      if (others.some(o => !o || o.items.length !== l.items.length)) return;
      const out = []; let hasPage = false;
      l.items.forEach((it, ii) => {
        const T = others.map(o => toks(o.items[ii].str));
        if (T[0].length < 2 && !/^\d+$/.test(it.str)) { out.push(it); return; }
        if (T.some(t => t.length !== T[0].length)) { out.push(it); return; }
        const full = env.measure ? env.measure(it.str, it.font, it.size) : null; let pos = 0;
        const at = c => full ? env.measure(it.str.slice(0, c), it.font, it.size) / full * it.w : c * it.w / it.str.length;
        T[0].forEach((tk, k) => {
          const p = Object.assign({}, it, { str: tk, x: it.x + at(pos), w: at(pos + tk.length) - at(pos), glue: k > 0, spB: k ? false : it.spB, spA: k < T[0].length - 1 ? false : it.spA, raw: true });
          if (/^\d+$/.test(tk) && n > 1 && T.every((t, i) => t[k] === String(i + 1))) { p.field = 'PAGE'; hasPage = true; }
          else if (/^\d+$/.test(tk) && tk === String(n)) p.maybeTotal = true;
          pos += tk.length; out.push(p);
        });
      });
      if (hasPage) { for (const p of out) if (p.maybeTotal) p.field = 'NUMPAGES'; l.items = out; }
    });
  }

  /* ---------- documento ---------- */
  async function convert(data, opts) {
    opts = opts || {}; const prog = opts.onProgress || (() => {});
    for (const k in fontCache) delete fontCache[k];
    docState.compressed = 0; docState.stretched = 0; floatId = 7000;
    const doc = await pdfjsLib.getDocument(Object.assign({ data, useSystemFonts: true, isEvalSupported: false }, env.docParams || {})).promise;
    const N = doc.numPages, pages = [];
    const media = [], rels = []; let scanned = 0, nTables = 0, nImages = 0, ocrPages = 0, ocrErr = null;
    for (let i = 1; i <= N; i++) {
      prog(i / N * 0.8, 'Lendo página ' + i + ' de ' + N);
      const page = await doc.getPage(i);
      const pg = await extractPage(page, i - 1);
      if (opts.ocr && env.ocrPage && !pg.items.length && pg.images.some(im => (im.x1 - im.x0) * (im.y1 - im.y0) > 0.3 * pg.W * pg.H)) {
        prog((i - 0.5) / N * 0.8, 'Lendo o texto da página ' + i + ' de ' + N + ' (OCR)');
        try { pg.items = ocrItems(await env.ocrPage(page)); if (pg.items.length) { pg.ocr = true; ocrPages++;
          pg.hs = pg.hs.filter(h => !pg.items.some(it => h.y > it.ocr.y0 - 0.8 && h.y < it.ocr.y1 + 0.8 && Math.min(h.x1, it.ocr.x1) - Math.max(h.x0, it.ocr.x0) > 0.3 * (it.ocr.x1 - it.ocr.x0) && (h.x1 - h.x0) < 3 * (it.ocr.x1 - it.ocr.x0) + 40)); } } catch (e) { ocrErr = e; }
      }
      analyzePage(pg); nTables += pg.tables.length;
      pg.pics = [];
      if (env.imageToPng) {
        if (!pg.items.length && (pg.images.length || pg.hs.length + pg.vs.length === 0)) {
          if (pg.images.length || env.forceRaster) { const r = await env.renderPage(page, 200 / 72);
            if (r) { pg.pics.push({ x0: 0, y0: 0, x1: pg.W, y1: pg.H, data: r.data, ext: r.ext, behind: true }); scanned++; nTables -= pg.tables.length; pg.tables = []; } }
        } else for (const im of pg.images) {
          if (im.skip) continue;
          if (pg.ocr && (im.x1 - im.x0) * (im.y1 - im.y0) > 0.3 * pg.W * pg.H) continue; // a digitalização foi trocada pelo texto reconhecido
          if (im.raster && pg.tables.some(t => { const ox = Math.min(t.x1, im.x1) - Math.max(t.x0, im.x0), oy = Math.min(t.y1, im.y1) - Math.max(t.y0, im.y0); return ox > 0 && oy > 0 && ox * oy > 0.6 * (im.x1 - im.x0) * (im.y1 - im.y0); })) continue;
          const under = pg.items.some(it => it.x + it.w / 2 > im.x0 && it.x + it.w / 2 < im.x1 && it.y - it.size * 0.3 > im.y0 && it.y - it.size * 0.3 < im.y1);
          try { const r = await env.imageToPng(page, im.ref); if (r) { pg.pics.push(Object.assign({ data: r.data, ext: r.ext, behind: under || (im.x1 - im.x0) * (im.y1 - im.y0) > 0.5 * pg.W * pg.H }, im)); nImages++; } } catch (e) {}
        }
      }
      pg.page = null; pg.rasters = null; pages.push(pg); page.cleanup();
    }
    prog(0.85, 'Montando o documento Word');
    const hf = detectHF(pages);
    for (const p of pages) { p.head = p.bodyLines.slice(0, hf.h); p.foot = hf.f ? p.bodyLines.slice(p.bodyLines.length - hf.f) : []; p.mid = p.bodyLines.slice(hf.h, p.bodyLines.length - hf.f); }
    if (hf.h) markFields(pages, p => p.head); if (hf.f) markFields(pages, p => p.foot);
    // margens
    const P0 = pages[0];
    let L = Infinity, R = 0, T = Infinity, B = 0;
    for (const p of pages) {
      for (const l of p.mid) { L = Math.min(L, l.x); R = Math.max(R, l.right); T = Math.min(T, l.top); B = Math.max(B, l.bottom); }
      for (const l of p.head.concat(p.foot)) { L = Math.min(L, l.x); R = Math.max(R, l.right); }
      for (const t of p.tables) { T = Math.min(T, t.y0 - 1); B = Math.max(B, t.y1);
        if (!isFinite(L) || !p.bodyLines.length) { L = Math.min(L, t.x0 + t.mar); } R = Math.max(R, 0); }
    }
    const maxTabR = Math.max(0, ...pages.flatMap(p => p.tables.map(t => t.x1)));
    if (!isFinite(L)) L = 36; if (!isFinite(T)) T = 36;
    L = Math.max(0, L);
    const minW = Math.min(...pages.map(p => p.W)), minH = Math.min(...pages.map(p => p.H));
    let areaR = Math.max(R, Math.min(minW - L, Math.max(minW - L, R)));
    if (areaR > minW) areaR = minW; if (areaR - L < 72) areaR = Math.min(minW, L + 72);
    // texto alinhado à esquerda não encosta na margem: estima a margem direita real pelo intervalo
    // [maior linha, menor "linha + palavra seguinte") para que as quebras de linha se repitam iguais
    { let hi = Infinity, nPairs = 0;
      for (const pg of pages) for (const p of buildParagraphs(pg.mid, L, pg.W - (minW - areaR), false)) for (const l of p.lines) if (l.fitAt) { hi = Math.min(hi, l.fitAt - (pg.W - minW)); nPairs++; }
      docState.compressed = 0; docState.stretched = 0;
      for (const pg of pages) for (const l of pg.bodyLines) { l.fitAt = 0; l.softBreak = false; l.stretched = false; }
      let atEdge = 0; for (const pg of pages) for (const l of pg.mid) if (l.right >= pg.W - (minW - areaR) - 1.2) atEdge++;
      if (nPairs && atEdge < 2 && hi > areaR + 1) { const sym = minW - L; hi = Math.min(hi, minW - 4);
        if (hi > areaR + 1) areaR = (sym > areaR && sym < hi - 0.5) ? sym : areaR + (hi - areaR) * 0.5; } }
    const marR = minW - areaR;
    let headTop = 0, marTop = Math.max(0, T), footBot = 0, marBot;
    if (hf.h) { headTop = Math.max(0, P0.head[0].top); marTop = Math.max(marTop, 0); }
    if (hf.f) { const fl = P0.foot; footBot = Math.max(0, P0.H - fl[fl.length - 1].bottom); marBot = Math.max(0, P0.H - fl[0].top); }
    else marBot = 0;
    const Bdist = Math.min(...pages.map(p => { let b = 0; for (const l of p.mid) b = Math.max(b, l.bottom); for (const t of p.tables) b = Math.max(b, t.y1 + 1); return b ? p.H - b : Infinity; }));
    if (isFinite(Bdist)) marBot = Math.max(marBot, Math.min(Bdist - 4, hf.f ? Infinity : Math.max(72, L)));
    marBot = Math.max(0, marBot);
    if (!hf.h) headTop = Math.min(marTop, 35.4);
    if (!hf.f) footBot = Math.min(marBot, 35.4);
    const ctx = { areaL: L, areaR };
    // corpo
    let body = '', relId = 10;
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';
    const anchorXml = (pic, id) => {
      const cx = emu(pic.x1 - pic.x0), cy = emu(pic.y1 - pic.y0);
      return '<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="' + (pic.behind ? 1 : 251650000 + id) + '" behindDoc="' + (pic.behind ? 1 : 0) + '" locked="0" layoutInCell="1" allowOverlap="1">' +
        '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>' + emu(pic.x0) + '</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>' + emu(pic.y0) + '</wp:posOffset></wp:positionV>' +
        '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="' + id + '" name="Imagem ' + id + '"/><wp:cNvGraphicFramePr/>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="Imagem ' + id + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
        '<pic:blipFill><a:blip r:embed="rId' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
    };
    const sectPr = (pg, last) => '<w:sectPr>' + (hf.h ? '<w:headerReference w:type="default" r:id="rId1"/>' : '') + (hf.f ? '<w:footerReference w:type="default" r:id="rId2"/>' : '') +
      (last ? '' : '<w:type w:val="nextPage"/>') + '<w:pgSz w:w="' + tw(pg.W) + '" w:h="' + tw(pg.H) + '"' + (pg.W > pg.H ? ' w:orient="landscape"' : '') + '/>' +
      '<w:pgMar w:top="' + tw(marTop) + '" w:right="' + tw(Math.max(0, pg.W - areaR)) + '" w:bottom="' + tw(marBot) + '" w:left="' + tw(L) + '" w:header="' + tw(headTop) + '" w:footer="' + tw(footBot) + '" w:gutter="0"/></w:sectPr>';
    // 1) parágrafos do corpo de cada página
    for (const pg of pages) {
      pg.paras = buildParagraphs(pg.mid, L, pg.W - (minW - areaR), false);
      pg.elems = pg.paras.concat(pg.tables).sort((a, b) => (a.kind === 'p' ? a.top : a.y0) - (b.kind === 'p' ? b.top : b.y0));
      pg.start = marTop;
    }
    // 2) parágrafo que continua na página seguinte: une e deixa o Word paginar
    let open = null, merges = 0;
    for (let pi = 0; pi + 1 < N; pi++) {
      const pg = pages[pi], nx = pages[pi + 1];
      const a = open || pg.elems[pg.elems.length - 1], b = nx.elems[0]; open = null;
      if (!a || !b || a.kind !== 'p' || b.kind !== 'p' || nx.pics.length) continue;
      if (Math.abs(nx.W - pg.W) > 1 || Math.abs(nx.H - pg.H) > 1) continue;
      const q = a.tail || a.lines[a.lines.length - 1], l = b.lines[0], aR = pg.W - (minW - areaR);
      const first = l.items[0], fw = first.w * (first.str.split(/\s/)[0].length / first.str.length);
      const contX = a.lines.length > 1 ? a.lines[1].x : null;
      const ok = Math.abs(q.size - l.size) < 0.7 && (a.align === 'left' || a.align === 'both') && (b.align === 'left' || b.align === 'both') &&
        (contX == null ? l.x <= q.x + 0.5 : Math.abs(l.x - contX) < 1.6) &&
        (aR - q.right) < fw + 0.25 * l.size + 0.5 && (l.multiWord || q.multiWord) && !q.softBreak &&
        (pg.H - q.bottom) - marBot < 0.8 * a.exact && l.top - marTop < 0.6 * a.exact &&
        (b.lines.length < 2 || a.lines.length < 2 || Math.abs(a.exact - b.exact) < 0.3);
      if (!ok) continue;
      if (a.lines.length < 2 && !a.tail && b.lines.length > 1) { a.exact = b.exact; a.top = a.bottom - a.exact; }
      if (a.lines.length < 2 && !a.tail) { a.indLeft = Math.max(0, l.x - L); a.firstLine = a.lines[0].x - l.x; if (a.indLeft < 0.8) a.indLeft = 0; }
      const lr = a.runs[a.runs.length - 1]; if (lr && lr.text != null && !/[-\u00AD]$/.test(lr.text)) lr.text += ' ';
      a.runs.push(...b.runs); a.tail = b.lines[b.lines.length - 1]; a.cont = true;
      if (b.align === 'both' || (a.lines.length < 2 && q.right >= aR - 1.8)) a.align = 'both';
      nx.elems.shift(); nx.start = b.bottom; nx.noBreak = true; merges++;
      if (!nx.elems.length) open = a;
    }
    // sem parágrafos atravessando páginas, não há por que apertar a margem inferior:
    // deixa folga para o Word (que soma as bordas à altura das linhas da tabela) não empurrar nada para a página seguinte
    if (!merges) marBot = hf.f ? Math.max(0, P0.H - P0.foot[0].top) : Math.max(0, Math.min(isFinite(Bdist) ? Bdist - 4 : 28, 28));
    // 3) XML
    ctx.compat = docState.compressed > docState.stretched * 0.2 && docState.compressed > 0 ? 15 : (env.measure ? 14 : 15);
    let breakNext = false;
    pages.forEach((pg, pi) => {
      const elems = pg.elems, last = elems[elems.length - 1];
      if (last && last.kind === 'p' && pages[pi + 1] && !pages[pi + 1].noBreak) {
        const slack = (pg.H - marBot) - last.bottom;
        if (slack < 4) { const cut = Math.min(4 - slack, 0.2 * last.exact * last.lines.length); last.exact = Math.round((last.exact - cut / last.lines.length) * 20) / 20; last.bottom = last.top + last.exact * last.lines.length; }
      }
      if (pg.noBreak) breakNext = false;
      let prefix = '';
      for (const pic of pg.pics) { const id = relId++; media.push({ name: 'image' + id + '.' + pic.ext, data: pic.data });
        rels.push('<Relationship Id="rId' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image' + id + '.' + pic.ext + '"/>');
        prefix += anchorXml(pic, id); }
      const next = pages[pi + 1];
      const sizeChange = next && (Math.abs(next.W - pg.W) > 1 || Math.abs(next.H - pg.H) > 1);
      let pre = '';
      if (prefix) { pre = spacerXml(1, { pageBreak: breakNext, prefix }); }
      const fl = flowXml(elems, pg.start + (prefix ? 1 : 0), ctx, { pageBreak: breakNext && !prefix });
      body += pre + fl.xml;
      if (!pre && !fl.xml && !pg.noBreak) body += spacerXml(1, { pageBreak: breakNext });
      if (sizeChange) { body += spacerXml(1, { sect: sectPr(pg, false) }); breakNext = false; }
      else { breakNext = !!next; if (!next && fl.endsWithTable) body += spacerXml(1); }
    });
    body += sectPr(pages[N - 1], true);
    const hfPart = (lines, tag, startY) => {
      const paras = buildParagraphs(lines, L, areaR, false); let cur = startY, x = '';
      for (const p of paras) { const b = Math.max(0, p.top - cur); x += paraXml(p, b, 0); cur += b + p.bottom - p.top; }
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:' + tag + ' ' + NS + '>' + x + '</w:' + tag + '>';
    };
    const zip = new JSZip(); const zf = (n, d) => zip.file(n, d, { createFolders: false });
    zf('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      (hf.h ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '') +
      (hf.f ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : '') + '</Types>');
    zf('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zf('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      (hf.h ? '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : '') +
      (hf.f ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : '') +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' + rels.join('') + '</Relationships>');
    zf('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:widowControl w:val="0"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>');
    zf('word/settings.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ' + NS + '><w:defaultTabStop w:val="708"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="' + ctx.compat + '"/></w:compat></w:settings>');
    zf('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + body + '</w:body></w:document>');
    if (hf.h) zf('word/header1.xml', hfPart(P0.head, 'hdr', headTop));
    if (hf.f) zf('word/footer1.xml', hfPart(P0.foot, 'ftr', P0.foot[0].top));
    for (const m of media) zf('word/media/' + m.name, m.data);
    prog(0.95, 'Compactando');
    const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    try { await doc.destroy(); } catch (e) {}
    prog(1, 'Pronto');
    return { data: out, pages: N, tables: nTables, images: nImages, scanned, ocrPages, ocrErr: ocrErr ? String(ocrErr.message || ocrErr) : null };
  }
  return { convert };
}
if (typeof module !== 'undefined') module.exports = createPdf2Docx;
