/* Informe PDF «Analiza tus goles» (v16). Se genera en el dispositivo con jsPDF (lib/jspdf.umd.min.js, alojado en la web, MIT).
   Dibujo vectorial: texto real y seleccionable con Poppins y Anton incrustadas (../fonts/, se cargan solo al descargar). Sin servidor, sin CDN.
   Datos: los reales de la herramienta a través de window.AG_INFORME (app.js); objetivos según las reglas reales. */
(function () {
  'use strict';
  var C = { navy: '#0B1A3A', blue: '#1E3A8A', sky: '#3B9BE8', yel: '#F5C518', mu: '#5B6B8C', ln: '#C9D3E6', soft: '#F3F6FB', skyS: '#EAF4FD' };
  var W = 210, H = 297, M = 14, CW = W - 2 * M, TOP = 30, BOT = H - 18;
  var ZONAS = { pe: 'Área pequeña', ai: 'Área · izquierda', ac: 'Área · centro', ad: 'Área · derecha', fi: 'Fuera del área · izquierda', fc: 'Fuera del área · centro', fd: 'Fuera del área · derecha' };
  var PORT = {}; [['a', 'Arriba'], ['m', 'Media altura'], ['b', 'Abajo']].forEach(function (f) { [['i', 'izquierda'], ['c', 'centro'], ['d', 'derecha']].forEach(function (c) { PORT[f[0] + c[0]] = f[1] + ' · ' + c[1]; }); });
  var FONTS = [['Poppins-Regular.ttf', 'Poppins', 'normal'], ['Poppins-SemiBold.ttf', 'Poppins', 'bold'], ['Anton-Regular.ttf', 'Anton', 'normal']], fontCache = null;

  function b64(buf) { var s = '', a = new Uint8Array(buf), i, k = 0x8000; for (i = 0; i < a.length; i += k) s += String.fromCharCode.apply(null, a.subarray(i, i + k)); return btoa(s); }
  function cargarFuentes(base) {
    if (fontCache) return Promise.resolve(fontCache);
    return Promise.all(FONTS.map(function (f) { return fetch(base + f[0]).then(function (r) { return r.arrayBuffer(); }).then(b64); }))
      .then(function (l) { fontCache = l; return l; });
  }

  // ---------- datos ----------
  var D, O;
  var fecha = function (f) { if (!f) return 'sin fecha'; var d = f.split('-'); return d[2] + '/' + d[1] + '/' + d[0].slice(2); };
  var tempTxt = function (t) { return t ? t.replace('-', '/') : 'Todas'; };
  var pc = function (v, n) { return n ? Math.round(100 * v / n) : 0; };
  var A = function () { return window.AG_INFORME; };
  var club = function (id) { return D.clubes.filter(function (c) { return c.id === id; })[0] || { id: '', nombre: 'Sin club', color: C.blue }; };
  var ini = function (n) { return A().iniciales(n); };
  var nom = function (k) { return (k && k.nombre) || (D.perfil && D.perfil.nombre) || (A().coach() ? A().nombre(k) : 'Portero/a'); };
  var pl = function (n, a, b) { return n + ' ' + (n === 1 ? a : b); };
  var objs = function (k) { return A().objetivos(k.id); };
  var slug = function (s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  function partidos(k) {
    var ps = (O.grupoObj ? O.grupoObj.partidos(k) : A().partidos(k.id)).filter(function (p) { return (!O.club || p.clubId === O.club) && (!O.temp || p.temporada === O.temp); }).sort(function (a, b) { return (a.fecha || '') < (b.fecha || '') ? -1 : 1; });
    return O.ultimos ? ps.slice(-O.ultimos) : ps;
  }
  function stats(ps) {
    var gs = []; ps.forEach(function (p) { p.goles.forEach(function (g) { gs.push(g); }); });
    return { ps: ps, gs: gs, gc: ps.reduce(function (s, p) { return s + (+p.gc || 0); }, 0), cero: ps.filter(function (p) { return +p.gc === 0; }).length,
      poco: gs.filter(function (g) { return g.depende === 'Poco'; }).length, pen: gs.filter(function (g) { return g.llegada === 'Penalti'; }).length };
  }
  function cuenta(gs, campo) { var c = {}; gs.forEach(function (g) { var v = g[campo]; if (v) c[v] = (c[v] || 0) + 1; }); return c; }
  function gpp(s) { return s.ps.length ? (s.gc / s.ps.length).toFixed(1).replace('.', ',') : '0'; }
  function fuertes(s) {
    var o = [], n = s.gs.length, fuera = s.gs.filter(function (g) { return g.zona && g.zona[0] === 'f'; }).length, arriba = s.gs.filter(function (g) { return g.porteria && g.porteria[0] === 'a'; }).length;
    if (s.cero) o.push({ t: pl(s.cero, 'portería a cero', 'porterías a cero'), p: 'En ' + pl(s.cero, 'partido', 'partidos') + ' de ' + s.ps.length + ' no te marcaron. Es trabajo tuyo y del equipo, y merece quedarse apuntado.' });
    if (n >= 5 && fuera / n <= 0.15) o.push({ t: 'Desde lejos, casi nada', p: 'Solo ' + fuera + ' de ' + n + ' goles llegaron con remate desde fuera del área. Tu colocación frente a los disparos lejanos funciona.' });
    if (n >= 5 && arriba / n <= 0.2) o.push({ t: 'Por arriba, bien cerrado', p: 'Solo ' + arriba + ' de ' + n + ' goles entraron por la parte alta de la portería.' });
    return o.slice(0, 2);
  }
  function repetido(s) {
    var gs = s.gs.filter(function (g) { return g.llegada !== 'Penalti'; }), c = cuenta(gs, 'porteria'), top = null;
    Object.keys(c).forEach(function (k) { if (!top || c[k] > c[top]) top = k; });
    if (!top || c[top] < 3) return null;
    return { t: c[top] + ' de ' + gs.length + ' ' + PORT[top].toLowerCase().replace(' · ', ' a la ').replace('media altura a la', 'a media altura,'),
      p: 'Sin contar penaltis, vista de frente. No dice de quién fue cada gol: solo marca dónde poner el foco en los entrenamientos.' };
  }
  function notaEnt(o) { return o.notaEntrenador && (O.version === 'completo' || o.notaEntrenadorCompartida) ? o.notaEntrenador : ''; }
  function notaPor(o) { return O.notasPortero !== false ? (o.notaPortero || '') : ''; }

  // ---------- dibujo ----------
  var doc, nombreInforme;
  var LH = 1.35, pt2mm = 0.3528;
  function font(f, size, color) { doc.setFont(f === 'anton' ? 'Anton' : 'Poppins', f === 'bold' ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color || C.navy); }
  function lines(t, f, size, w) { font(f, size); return doc.splitTextToSize(String(t), w); }
  function hText(t, f, size, w) { return lines(t, f, size, w).length * size * pt2mm * LH; }
  function text(t, x, y, f, size, color, w, opt) {
    var ls = w ? lines(t, f, size, w) : [String(t)]; font(f, size, color);
    doc.text(ls, x, y, Object.assign({ baseline: 'top', lineHeightFactor: LH }, opt || {}));
    return ls.length * size * pt2mm * LH;
  }
  function box(x, y, w, h, fill, stroke, r) { doc.setLineWidth(0.3); if (stroke !== 'none') doc.setDrawColor(stroke || C.ln); if (fill) doc.setFillColor(fill); doc.roundedRect(x, y, w, h, r == null ? 2 : r, r == null ? 2 : r, fill ? (stroke === 'none' ? 'F' : 'FD') : 'S'); }
  function bar(x, y, w, h, color) { doc.setFillColor(color); doc.rect(x, y, w, h, 'F'); }
  var IMG = {};
  function crest(c, cx, cy, r) {
    var im = IMG[c.id]; if (im) { var k = Math.min(2 * r / im.w, 2 * r / im.h); doc.addImage(im.url, 'PNG', cx - im.w * k / 2, cy - im.h * k / 2, im.w * k, im.h * k, 'c-' + c.id); return; }
    doc.setFillColor(c.color || C.blue); doc.circle(cx, cy, r, 'F');
    if (!c.id) { // Sin club: escudo vacío dibujado en vector, sin texto
      var s = r * 0.055; doc.setDrawColor('#FFFFFF'); doc.setLineWidth(r * 0.1); doc.setLineJoin && doc.setLineJoin('round');
      doc.lines([[8 * s, 3 * s], [0, 6.2 * s], [0, 4.6 * s, -3.3 * s, 8.3 * s, -8 * s, 9.8 * s], [-4.7 * s, -1.5 * s, -8 * s, -5.2 * s, -8 * s, -9.8 * s], [0, -6.2 * s]], cx, cy - 9.5 * s, [1, 1], 'S', true); return;
    }
    font('anton', r * 1.5, '#FFFFFF'); doc.text(ini(c.nombre), cx, cy, { align: 'center', baseline: 'middle' });
  }
  // Escudo (webp de la biblioteca o imagen subida) -> PNG con canvas, porque jsPDF no lee webp.
  function cargarEscudo(c) {
    var src = c && A().escudo(c); if (!src) return Promise.resolve();
    return new Promise(function (ok) { var i = new Image(); i.onload = function () { try { var m = 256, k = Math.min(m / i.naturalWidth, m / i.naturalHeight, 1), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(i.naturalWidth * k)); cv.height = Math.max(1, Math.round(i.naturalHeight * k)); cv.getContext('2d').drawImage(i, 0, 0, cv.width, cv.height);
      IMG[c.id] = { url: cv.toDataURL('image/png'), w: cv.width, h: cv.height }; } catch (e) { } ok(); }; i.onerror = function () { ok(); }; i.src = src; });
  }
  // Nombre en Anton que nunca se sale: reduce el tamaño y, si hace falta, corta con «…».
  function nombreAjustado(t, x, y, w, max, min) {
    t = t.toUpperCase(); var size = max; font('anton', size); while (size > min && doc.getTextWidth(t) > w) { size -= 1; font('anton', size); }
    while (doc.getTextWidth(t) > w && t.length > 3) t = t.slice(0, -2) + '…';
    font('anton', size, C.navy); doc.text(t, x, y, { baseline: 'top' }); return size;
  }
  function nuevaPagina(primera) {
    if (!primera) doc.addPage();
    font('anton', 12, C.navy); doc.text('ANALIZA', M, 13, { baseline: 'top' }); var w = doc.getTextWidth('ANALIZA ');
    font('anton', 12, C.blue); doc.text('TUS GOLES', M + w, 13, { baseline: 'top' });
    var tw = 0;
    if (O.demo) { var tag = 'DATOS DE EJEMPLO'; font('bold', 6.5, C.navy); tw = doc.getTextWidth(tag) + 4;
      doc.setLineDashPattern([0.8, 0.6], 0); box(W - M - tw, 13, tw, 5, null, C.yel, 1); doc.setLineDashPattern([], 0);
      doc.text(tag, W - M - tw / 2, 15.6, { align: 'center', baseline: 'middle' }); tw += 3; }
    font('normal', 8, C.mu); var ni = nombreInforme; while (doc.getTextWidth(ni) > 95 && ni.length > 6) ni = ni.slice(0, -2) + '…';
    doc.text(ni, W - M - tw, 15.6, { align: 'right', baseline: 'middle' });
    bar(M, 21, CW, 0.3, C.ln); bar(M, 21, 18, 0.8, C.yel);
    return TOP;
  }
  // Símbolo de Joan (la escuadra con el balón-sol), en vector, lado s mm
  function marca(x, y, s) {
    var k = s / 40; doc.setFillColor(C.navy);
    doc.lines([[40 * k, 0], [-8 * k, 8 * k], [-24 * k, 0], [0, 24 * k], [-8 * k, 8 * k]], x, y, [1, 1], 'F', true);
    doc.setFillColor('#F5C518'); doc.circle(x + 17 * k, y + 16 * k, 5.2 * k, 'F');
  }
  function pies() {
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i); bar(M, H - 13, CW, 0.3, C.ln);
      marca(M, H - 10.9, 3.4); font('bold', 7.5, C.blue); doc.text('@joancosta.gk', M + 4.8, H - 10.5, { baseline: 'top' }); var w = doc.getTextWidth('@joancosta.gk') + 4.8;
      font('normal', 7.5, C.mu); doc.text(' · Analiza tus goles · generado en tu dispositivo, sin enviar datos', M + w, H - 10.5, { baseline: 'top' });
      doc.text('Pág. ' + i + '/' + n, W - M, H - 10.5, { baseline: 'top', align: 'right' });
    }
  }
  function titulo(y, kicker, t1, t2, lead) {
    text(kicker.toUpperCase(), M, y, 'bold', 7, C.sky, null, { charSpace: 0.4 }); y += 4;
    font('anton', 19, C.navy); doc.text(t1.toUpperCase(), M, y, { baseline: 'top' }); var w = doc.getTextWidth(t1.toUpperCase() + ' ');
    font('anton', 19, C.blue); doc.text(t2.toUpperCase(), M + w, y, { baseline: 'top' }); y += 9;
    if (lead) y += text(lead, M, y, 'normal', 8.5, C.mu, 165) + 1;
    return y + 3;
  }
  function contexto(y, bold, rest) {
    var w = CW - 9, h1 = hText(bold, 'bold', 8.5, w), h2 = hText(rest, 'normal', 8.5, w), h = h1 + h2 + 6;
    box(M, y, CW, h, C.skyS, 'none', 1.5); bar(M, y, 1, h, C.sky);
    text(bold, M + 5, y + 3, 'bold', 8.5, C.navy, w); text(rest, M + 5, y + 3 + h1, 'normal', 8.5, C.navy, w);
    return y + h + 5;
  }
  // Tarjetas hermanas alineadas: cada «sección» mide lo mismo en todas (el máximo), como un subgrid.
  function filaTarjetas(y, n, gap, secciones, dibujar, opts) {
    opts = opts || {}; var w = (CW - gap * (n - 1)) / n, pad = 4, alt = secciones.map(function (s) { return Math.max.apply(null, s.map(function (f) { return f(w - 2 * pad); })); });
    var h = alt.reduce(function (a, b) { return a + b; }, 0) + 2 * pad + (alt.length - 1) * (opts.sep || 2);
    for (var i = 0; i < n; i++) {
      if (opts.solo != null && i >= opts.solo) continue;
      var x = M + i * (w + gap); box(x, y, w, h, '#FFFFFF', C.ln); if (opts.acento) bar(x + 0.15, y + 0.15, w - 0.3, 0.9, opts.acento(i));
      var yy = y + pad; for (var s = 0; s < alt.length; s++) { dibujar(i, s, x + pad, yy, w - 2 * pad, alt[s]); yy += alt[s] + (opts.sep || 2); }
    }
    return y + h;
  }

  // ---------- mapas vectoriales, colores claros para imprimir ----------
  function tono(v, max) { var t = max ? 0.12 + 0.6 * v / max : 0; var a = [255, 255, 255], b = [59, 155, 232]; return 'rgb(' + a.map(function (c, i) { return Math.round(c + (b[i] - c) * t); }) + ')'; }
  function rgb(s) { var m = s.match(/\d+/g); return m.map(Number); }
  function fill(s) { var c = rgb(s); doc.setFillColor(c[0], c[1], c[2]); }
  function mapaPorteria(s, x, y, w) {
    var c = cuenta(s.gs, 'porteria'), n = s.gs.length, max = Math.max.apply(null, [0].concat(Object.values(c))), cw = (w - 6) / 3, ch = cw * 0.5;
    doc.setDrawColor(C.navy); doc.setLineWidth(1.6); doc.lines([[0, -(3 * ch + 3)], [w, 0], [0, 3 * ch + 3]], x, y + 3 * ch + 4.5, [1, 1], 'S');
    ['a', 'm', 'b'].forEach(function (f, r) { ['i', 'c', 'd'].forEach(function (k, j) {
      var v = c[f + k] || 0, xx = x + 3 + j * cw, yy = y + 3 + r * ch; fill(tono(v, max)); doc.setDrawColor(C.ln); doc.setLineWidth(0.3); doc.rect(xx, yy, cw, ch, 'FD');
      font('anton', 13, v ? C.navy : '#9AA8C3'); doc.text(String(v), xx + cw / 2, yy + ch / 2 - 1.2, { align: 'center', baseline: 'middle' });
      font('normal', 6.5, C.mu); doc.text(pc(v, n) + ' %', xx + cw / 2, yy + ch / 2 + 3.6, { align: 'center', baseline: 'middle' });
    }); });
    doc.setDrawColor(C.navy); doc.setLineWidth(0.6); doc.line(x - 2, y + 3 * ch + 4.5, x + w + 2, y + 3 * ch + 4.5);
    return 3 * ch + 6;
  }
  function mapaCampo(s, x, y, w) {
    var c = cuenta(s.gs, 'zona'), n = s.gs.length, max = Math.max.apply(null, [0].concat(Object.values(c))), k = w / 340;
    var P = function (pts) { return pts.map(function (p) { return [x + p[0] * k, y + p[1] * k]; }); };
    var zonas = [['fi', [[0, 20], [60, 20], [60, 130], [113, 130], [113, 260], [0, 260]], 56, 195], ['fc', [[113, 130], [227, 130], [227, 260], [113, 260]], 170, 195], ['fd', [[340, 20], [280, 20], [280, 130], [227, 130], [227, 260], [340, 260]], 284, 195],
      ['ai', [[60, 20], [120, 20], [120, 130], [60, 130]], 90, 75], ['ac', [[120, 60], [220, 60], [220, 130], [120, 130]], 170, 95], ['ad', [[220, 20], [280, 20], [280, 130], [220, 130]], 250, 75], ['pe', [[120, 20], [220, 20], [220, 60], [120, 60]], 170, 40]];
    zonas.forEach(function (z) {
      var v = c[z[0]] || 0, pts = P(z[1]), seg = []; for (var i = 1; i < pts.length; i++) seg.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
      fill(tono(v, max)); doc.setDrawColor(C.navy); doc.setLineWidth(0.35); doc.lines(seg, pts[0][0], pts[0][1], [1, 1], 'FD', true);
      font('anton', z[0] === 'pe' ? 11 : 13, v ? C.navy : '#9AA8C3'); doc.text(String(v), x + z[2] * k, y + z[3] * k - 1, { align: 'center', baseline: 'middle' });
      font('normal', 6.5, C.mu); doc.text(pc(v, n) + ' %', x + z[2] * k + (z[0] === 'pe' ? 7 : 0), y + z[3] * k + (z[0] === 'pe' ? -1 : 4), { align: z[0] === 'pe' ? 'left' : 'center', baseline: 'middle' });
    });
    doc.setFillColor(C.navy); doc.rect(x + 145 * k, y + 14 * k, 50 * k, 6 * k, 'F');
    return 262 * k;
  }

  // ---------- informe del portero ----------
  function informePortero(k) {
    var s = stats(partidos(k)), n = s.gs.length, f = fuertes(s), r = repetido(s);
    var c = O.club ? club(O.club) : (s.ps.length ? club(s.ps[s.ps.length - 1].clubId) : club(D.clubActual));
    nombreInforme = 'Informe de ' + nom(k);
    var y = nuevaPagina(true);
    // portada
    box(M, y, CW, 42, C.soft, 'none', 2.5); bar(M, y + 4, 1.2, 34, C.yel);
    crest(c, M + 21, y + 21, 13);
    var x = M + 42; text(('Informe de goles · ' + (O.version === 'completo' ? 'Informe completo' : 'Informe para el portero')).toUpperCase(), x, y + 6, 'bold', 7, C.sky, null, { charSpace: 0.3 });
    nombreAjustado(nom(k), x, y + 12, CW - 46, 30, 18);
    var meta = [['Club', O.club ? c.nombre : 'Todos'], ['Temporada', tempTxt(O.temp)], ['Periodo', (O.ultimos ? 'Últimos ' + O.ultimos + ' partidos' : (O.temp ? 'Temporada completa' : 'Todo lo apuntado')) + (s.ps.length ? ' (' + fecha(s.ps[0].fecha) + ' a ' + fecha(s.ps[s.ps.length - 1].fecha) + ')' : ' (sin partidos)')], ['Generado', new Date().toLocaleDateString('es-ES')]];
    meta.forEach(function (m, i) { var xx = x + (i % 2) * 82, yy = y + 28 + Math.floor(i / 2) * 5.5; font('normal', 8.5, C.mu); doc.text(m[0], xx, yy, { baseline: 'top' }); var lw = doc.getTextWidth(m[0] + '  '), mv = m[1]; font('bold', 8.5); while (doc.getTextWidth(mv) > 80 - lw && mv.length > 4) mv = mv.slice(0, -2) + '…'; text(mv, xx + lw, yy, 'bold', 8.5, C.navy); });
    y += 50;
    y = titulo(y, 'Resumen', 'Tus números del', 'periodo');
    var st = [[s.ps.length, 'Partidos', 'jugados en el periodo'], [s.gc, 'Goles encajados', n + ' apuntados con detalle'], [gpp(s), 'Goles por partido', 'media del periodo'], [s.cero, 'Porterías a cero', 'partidos sin gol en contra']];
    y = filaTarjetas(y, 4, 4, [[function () { return 11; }], [function (w) { return Math.max.apply(null, st.map(function (a) { return hText(a[1], 'bold', 8.5, w); })); }], [function (w) { return Math.max.apply(null, st.map(function (a) { return hText(a[2], 'normal', 7, w); })); }]],
      function (i, sec, x, yy, w) { var a = st[i]; if (sec === 0) text(String(a[0]), x + w / 2, yy, 'anton', 24, C.blue, null, { align: 'center' }); if (sec === 1) text(a[1], x + w / 2, yy, 'bold', 8.5, C.navy, w, { align: 'center' }); if (sec === 2) text(a[2], x + w / 2, yy, 'normal', 7, C.mu, w, { align: 'center' }); }) + 5;
    if (!n) y = contexto(y, 'Aún no hay goles apuntados en este periodo.', s.ps.length ? 'Si fueron porterías a cero, ya cuentan arriba. Si encajaste, apunta los goles en «Partidos» y el informe se completa solo.' : 'Apunta tus partidos en «Partidos» y vuelve a descargar el informe.');
    else y = contexto(y, 'Los goles los encaja el equipo.', 'Hay 10 jugadores más en el campo y no todos los goles se pueden parar: puedes perder 5-0 y ser el mejor del partido. De ' + n + ' goles, ' + s.poco + ' ' + (s.poco === 1 ? 'lo marcaste' : 'los marcaste') + ' como «¿Cuánto dependía de ti? Poco» (marca o defensa)' + (s.pen ? ' y ' + pl(s.pen, 'fue de penalti', 'fueron de penalti') : '') + '.');
    var cards = f.map(function (a) { return { k: 'Lo que te sale bien', t: a.t, p: a.p, col: C.sky }; }); if (r) cards.push({ k: 'Lo que más se repite', t: r.t, p: r.p, col: C.yel });
    if (cards.length) y = filaTarjetas(y, cards.length, 4, [[function () { return 3; }], [function (w) { return Math.max.apply(null, cards.map(function (a) { return hText(a.t.toUpperCase(), 'anton', 12, w); })); }], [function (w) { return Math.max.apply(null, cards.map(function (a) { return hText(a.p, 'normal', 8, w); })); }]],
      function (i, sec, x, yy, w) { var a = cards[i]; if (sec === 0) text(a.k.toUpperCase(), x, yy, 'bold', 6.5, a.col === C.yel ? C.blue : C.sky, null, { charSpace: 0.4 }); if (sec === 1) text(a.t.toUpperCase(), x, yy, 'anton', 12, C.navy, w); if (sec === 2) text(a.p, x, yy, 'normal', 8, C.mu, w); },
      { acento: function (i) { return cards[i].col; }, sep: 2.5 });

    // página 2 · mapas y datos clave
    y = nuevaPagina(); y = titulo(y, 'Mapas', 'Desde dónde y', 'por dónde', 'Cuenta todos los goles del periodo (' + n + '). Izquierda y derecha vistas de frente, mirando hacia la portería. Con pocos goles, un solo partido cambia mucho los porcentajes.');
    var mw = (CW - 5) / 2, iw = mw - 10, hCampo = 262 * iw / 340;
    y = filaTarjetas(y, 2, 5, [[function () { return 6; }], [function () { return hCampo; }], [function () { return 4; }]], function (i, sec, x, yy, w) {
      if (sec === 0) text((i ? 'Por dónde entró' : 'Desde dónde remataron').toUpperCase(), x, yy, 'anton', 11, C.navy);
      if (sec === 1) { if (i) mapaPorteria(s, x + 2, yy + (hCampo - ((w - 4 - 6) / 3 * 1.5 + 6)) / 2, w - 4); else mapaCampo(s, x + 2, yy, w - 4); }
      if (sec === 2) text(i ? 'Zona de la portería por la que entró el balón.' : 'Zona del remate en el campo.', x, yy, 'normal', 7, C.mu);
    }) + 6;
    text('DATOS CLAVE', M, y, 'bold', 7, C.sky, null, { charSpace: 0.4 }); y += 5;
    var dep = cuenta(s.gs.map(function (g) { return { depende: g.depende || 'Mucho' }; }), 'depende');
    var B = [['Cómo llegó el gol', cuenta(s.gs, 'llegada')], ['Con qué remataron', cuenta(s.gs, 'remate')], ['¿Cuánto dependía de ti?', dep, ['Mucho', 'En parte', 'Poco']]];
    B.forEach(function (b) { b.ks = (b[2] || Object.keys(b[1]).sort(function (p, q) { return b[1][q] - b[1][p]; })).filter(function (k2) { return b[1][k2]; }).slice(0, 6); });
    if (!n) B.forEach(function (b) { b.ks = []; });
    var rowH = function (w) { return Math.max(5, Math.max.apply(null, B.map(function (b) { return b.ks.reduce(function (a, k2) { return a + Math.max(4.2, hText(k2, 'normal', 7.5, w * 0.5)) + 1; }, 0); }))); };
    y = filaTarjetas(y, 3, 4, [[function () { return 6; }], [rowH]], function (i, sec, x, yy, w) {
      var b = B[i]; if (sec === 0) { text(b[0].toUpperCase(), x, yy, 'anton', 10.5, C.navy); return; }
      if (!b.ks.length) { text('Sin goles en este periodo.', x, yy, 'normal', 7.5, C.mu); return; }
      b.ks.forEach(function (k2) { var v = b[1][k2], hl = Math.max(4.2, hText(k2, 'normal', 7.5, w * 0.5));
        text(k2, x, yy, 'normal', 7.5, C.navy, w * 0.5); var bx = x + w * 0.52, bw = w * 0.28; box(bx, yy + 1, bw, 2, '#E3E9F4', 'none', 1); box(bx, yy + 1, Math.max(1, n ? bw * v / n : 0), 2, k2 === 'Poco' ? '#9AA8C3' : C.sky, 'none', 1);
        text(v + ' · ' + pc(v, n) + ' %', x + w, yy, 'normal', 7, C.mu, null, { align: 'right' }); yy += hl + 1; });
    }) + 5;
    contexto(y, '«Poco» significa que el gol dependía sobre todo de la marca o de la defensa.', 'Esos goles no cuentan para tus objetivos técnicos: sirven para hablar en equipo de la comunicación.');

    // página 3 · objetivos
    y = nuevaPagina(); y = titulo(y, 'Objetivos activos', 'En qué estás', 'trabajando', 'Cada objetivo se revisa en los 3 partidos siguientes a activarlo. Los penaltis no cuentan.');
    var ob = objs(k);
    if (!ob.length) contexto(y, 'Ahora mismo no hay objetivos en marcha.', 'Cuando un patrón se repite en al menos 3 goles, la herramienta propone objetivos en «Objetivos». Si aceptas uno, aparecerá aquí con su seguimiento de los 3 partidos siguientes. No tener ninguno también está bien.');
    else for (var oi = 0; oi < ob.length; oi += 2) {
      var fila = ob.slice(oi, oi + 2), mxo = function (fn, f2, sz) { return function (w) { return Math.max.apply(null, fila.map(function (o) { return hText(fn(o), f2, sz, w); })); }; };
      y = filaTarjetas(y, 2, 5, [[function () { return 4; }], [mxo(function (o) { return o.titulo.toUpperCase(); }, 'anton', 13)], [mxo(function (o) { return o.porque; }, 'normal', 8)], [mxo(function (o) { return 'Cómo se mide: ' + o.metrica; }, 'normal', 8)],
        [function () { return 13; }], [function () { return 4; }], [mxo(function (o) { return o.veredicto; }, 'normal', 8)]],
        function (i, sec, x, yy, w) {
          var o = fila[i]; if (!o) return;
          if (sec === 0) { text(o.area.toUpperCase(), x, yy, 'bold', 6.5, C.sky, null, { charSpace: 0.4 }); font('bold', 6.5); var tw = doc.getTextWidth('EN MARCHA') + 4; box(x + w - tw, yy - 0.8, tw, 4.4, C.skyS, C.sky, 1); font('bold', 6.5, C.blue); doc.text('EN MARCHA', x + w - tw / 2, yy + 1.4, { align: 'center', baseline: 'middle' }); }
          if (sec === 1) text(o.titulo.toUpperCase(), x, yy, 'anton', 13, C.navy, w);
          if (sec === 2) text(o.porque, x, yy, 'normal', 8, C.mu, w);
          if (sec === 3) text('Cómo se mide: ' + o.metrica, x, yy, 'normal', 8, C.navy, w);
          if (sec === 4) { var bw = (w - 4) / 3; for (var j = 0; j < 3; j++) { var sg = o.seg[j], bx = x + j * (bw + 2);
            if (sg) { var bien = sg.n === 0; box(bx, yy, bw, 13, bien ? C.skyS : '#FFFFFF', bien ? C.sky : C.ln, 1.5); text(sg.n === 0 ? 'Ninguno' : pl(sg.n, 'gol de este tipo', 'goles de este tipo'), bx + bw / 2, yy + 1.8, 'bold', 7.3, bien ? C.blue : C.navy, bw - 2, { align: 'center' });
              var lab = sg.rival + ' · ' + fecha(sg.fecha); font('normal', 6.3); while (doc.getTextWidth(lab) > bw - 2 && lab.length > 6) lab = lab.slice(0, -2) + '…'; text(lab, bx + bw / 2, yy + 7.6, 'normal', 6.3, C.mu, null, { align: 'center' }); }
            else { doc.setLineDashPattern([0.8, 0.6], 0); box(bx, yy, bw, 13, null, C.ln, 1.5); doc.setLineDashPattern([], 0); text('Pendiente', bx + bw / 2, yy + 1.8, 'bold', 7.3, C.mu, null, { align: 'center' }); text('próximo partido', bx + bw / 2, yy + 7.6, 'normal', 6.3, C.mu, null, { align: 'center' }); } } }
          if (sec === 5) text('Seguimiento: ' + o.seg.length + ' de ' + o.nseg + ' partidos', x, yy, 'bold', 8, C.navy);
          if (sec === 6) text(o.veredicto, x, yy, 'normal', 8, C.mu, w);
        }, { sep: 2.5, solo: fila.length }) + 5;
      if (oi + 2 < ob.length && y > BOT - 90) y = nuevaPagina();
    }

    // página 4+ · partidos y goles
    y = nuevaPagina(); y = titulo(y, 'Partidos y goles', 'Todo lo', 'apuntado', 'Del más reciente al más antiguo. «Mucho / En parte / Poco» es tu respuesta a «¿Cuánto dependía de ti?».');
    var cols = [['Parte', 14], ['Cómo llegó', 34], ['Remate desde', 28], ['Entró por', 27], ['Dependía', 22], ['Notas', CW - 125]], cx = [M]; cols.forEach(function (c2, i) { cx.push(cx[i] + c2[1]); });
    var cab = function () { cols.forEach(function (c2, i) { text(c2[0].toUpperCase(), cx[i] + 1, y, 'bold', 6.3, C.sky, null, { charSpace: 0.3 }); }); y += 4; bar(M, y, CW, 0.4, C.sky); y += 1.5; };
    cab();
    s.ps.slice().reverse().forEach(function (p) {
      if (y > BOT - 20) { y = nuevaPagina(); cab(); }
      box(M, y, CW, 6.5, C.soft, 'none', 1); var mt = fecha(p.fecha) + ' · ' + (p.lugar === 'Casa' ? 'vs ' : 'en ') + (p.rival || 'Rival sin nombre'); font('bold', 8); while (doc.getTextWidth(mt) > cx[2] - M - 4 && mt.length > 8) mt = mt.slice(0, -2) + '…'; text(mt, M + 2, y + 1.5, 'bold', 8, C.navy);
      text(p.gf + '-' + p.gc, cx[2] + 1, y + 0.9, 'anton', 10, C.blue);
      text(+p.gc === 0 ? 'Portería a cero' : pl(p.goles.length, 'gol apuntado', 'goles apuntados'), cx[3] + 1, y + 1.7, +p.gc === 0 ? 'bold' : 'normal', 7.5, +p.gc === 0 ? C.blue : C.mu);
      y += 8;
      p.goles.forEach(function (g) {
        var nt = []; if (notaPor(g)) nt.push('Tú: ' + notaPor(g)); if (notaEnt(g)) nt.push('Entrenador: ' + notaEnt(g));
        var cel = [g.parte || '', (g.llegada || '') + (g.remate ? ' · ' + g.remate : ''), ZONAS[g.zona] || '', PORT[g.porteria] || '', g.depende === 'Poco' ? 'Poco · marca o defensa' : (g.depende || 'Mucho'), nt.join('\n')];
        var hh = Math.max.apply(null, cel.map(function (t, i) { return t ? hText(t, 'normal', 7.3, cols[i][1] - 2) : 0; })) + 2.5;
        if (y + hh > BOT) { y = nuevaPagina(); cab(); }
        cel.forEach(function (t, i) { if (t) text(t, cx[i] + 1, y, i === 4 && g.depende === 'Poco' ? 'bold' : 'normal', 7.3, i === 5 ? C.mu : C.navy, cols[i][1] - 2); });
        y += hh; bar(M, y - 1, CW, 0.2, C.ln);
      });
      y += 1;
    });
    if (!s.ps.length) text('No hay partidos en este periodo.', M, y, 'normal', 8.5, C.mu);
    return 'informe-' + (slug(nom(k)) || 'portero') + '-' + (O.temp || 'todas') + '.pdf';
  }

  // ---------- resumen de grupo (solo resumen; cada portero se descarga aparte) ----------
  function informeGrupo(gr) {
    var c = club(gr.clubId); O.club = gr.clubId; O.temp = gr.temporada; O.grupoObj = gr; nombreInforme = 'Resumen del grupo';
    var ks = gr.porteros;
    var y = nuevaPagina(true);
    box(M, y, CW, 36, C.soft, 'none', 2.5); bar(M, y + 4, 1.2, 28, C.yel); crest(c, M + 19, y + 18, 11);
    var x = M + 38; text('RESUMEN DEL GRUPO · VISTA DEL ENTRENADOR', x, y + 6, 'bold', 7, C.sky, null, { charSpace: 0.3 }); nombreAjustado(gr.nombre, x, y + 12, CW - 42, 24, 15);
    text('Porteros ' + ks.length + '   ·   Temporada ' + tempTxt(gr.temporada) + '   ·   Generado ' + new Date().toLocaleDateString('es-ES'), x, y + 25, 'normal', 8.5, C.mu);
    y += 44;
    y = titulo(y, 'Resumen del grupo', 'Cada portero,', 'su contexto', 'En el orden en que los añadiste. No es una clasificación: cada portero juega partidos distintos, con defensas y rivales distintos. El informe de cada uno se descarga por separado.');
    var data = ks.map(function (k) { var s = stats(partidos(k)), r = repetido(s), ob = objs(k)[0];
      return { k: k, s: s, l1: !s.gs.length ? 'Aún no hay goles apuntados en este grupo.' : s.poco + ' de ' + s.gs.length + ' goles marcados «Poco» (marca o defensa).', l2: 'Lo que más se repite: ' + (r ? r.t : 'aún pocos goles para ver un patrón') + '.', l3: 'Objetivo activo: ' + (ob ? ob.titulo + ' · ' + ob.seg.length + '/3' : 'ninguno ahora mismo') + '.' }; });
    if (!data.length) y = contexto(y, 'Este grupo aún no tiene porteros.', 'Añádelos desde la vista del entrenador con «Editar grupo».');
    for (var i = 0; i < data.length; i += 2) {
      if (i && y > BOT - 75) y = nuevaPagina();
      var fila = data.slice(i, i + 2);
      var mx = function (key) { return function (w) { return Math.max.apply(null, fila.map(function (d) { return hText(d[key], 'normal', 8, w); })); }; };
      y = filaTarjetas(y, 2, 5, [[function () { return 10; }], [function () { return 11; }], [mx('l1')], [mx('l2')], [mx('l3')], [function (w) { return hText('Los goles dependen de todo el equipo y no todos se pueden parar.', 'normal', 7.3, w - 6) + 4; }]],
        function (j, sec, x2, yy, w) {
          var d = fila[j]; if (!d) return;
          if (sec === 0) { crest(c, x2 + 4.5, yy + 4.5, 4.5); nombreAjustado(nom(d.k), x2 + 12, yy + 1.5, w - 12, 14, 10); }
          if (sec === 1) [[d.s.ps.length, 'partidos'], [d.s.gc, 'goles'], [gpp(d.s), 'por partido'], [d.s.cero, 'a cero']].forEach(function (a, q) { var cw = w / 4; text(String(a[0]), x2 + cw * q + cw / 2, yy, 'anton', 13, C.blue, null, { align: 'center' }); text(a[1], x2 + cw * q + cw / 2, yy + 6.8, 'normal', 6.5, C.mu, null, { align: 'center' }); });
          if (sec === 2) text(d.l1, x2, yy, 'normal', 8, C.navy, w);
          if (sec === 3) text(d.l2, x2, yy, 'normal', 8, C.navy, w);
          if (sec === 4) text(d.l3, x2, yy, 'normal', 8, C.navy, w);
          if (sec === 5) { var hh = hText('Los goles dependen de todo el equipo y no todos se pueden parar.', 'normal', 7.3, w - 6) + 3; box(x2, yy, w, hh, C.skyS, 'none', 1); bar(x2, yy, 0.8, hh, C.sky); text('Los goles dependen de todo el equipo y no todos se pueden parar.', x2 + 3, yy + 1.5, 'normal', 7.3, C.navy, w - 6); }
        }, { sep: 2.5, solo: fila.length }) + 5;
    }
    var pats = gr.patrones;
    if (y > BOT - 40) y = nuevaPagina();
    if (!pats.length) contexto(y, 'Lo que se repite en el grupo', 'Ahora mismo no hay un patrón que se repita en 2 o más porteros. Cuando lo haya, aparecerá aquí como foco de equipo.');
    else pats.slice(0, 2).forEach(function (pt) {
      var foco = pt.titulo + '.', fx = pt.exp + ' ' + pt.foco + ' Es un foco de equipo, no de un portero.';
      var h = 8 + hText(foco, 'bold', 8.5, CW - 10) + hText(fx, 'normal', 8.5, CW - 10) + 3;
      box(M, y, CW, h, '#FFFFFF', C.ln); bar(M + 0.15, y + 0.15, CW - 0.3, 0.9, C.yel);
      text('LO QUE SE REPITE EN EL GRUPO', M + 5, y + 3.5, 'bold', 6.5, C.blue, null, { charSpace: 0.4 });
      var yy = y + 8; yy += text(foco, M + 5, yy, 'bold', 8.5, C.navy, CW - 10); text(fx, M + 5, yy, 'normal', 8.5, C.mu, CW - 10); y += h + 4;
    });
    return 'informe-grupo-' + (slug(gr.nombre.split('·')[0]) || 'grupo') + '-' + gr.temporada + '.pdf';
  }

  function generar(opts) {
    D = A().datos(); O = Object.assign({ tipo: 'portero', version: 'portero', notasPortero: true, ultimos: 0 }, opts); IMG = {};
    if (!A().coach()) O.version = 'portero';
    var gr = O.tipo === 'grupo' ? A().grupo(O.grupo) : null, k = gr ? null : D.porteros.filter(function (g) { return g.id === O.gk; })[0];
    if (!gr && !k) return Promise.reject(new Error('No encuentro ese portero.'));
    var ks = gr ? gr.porteros : [k];
    O.demo = ks.some(function (q) { return (gr ? gr.partidos(q) : A().partidos(q.id)).some(function (p) { return p.demo; }); });
    var clubsUsados = {}; if (gr) clubsUsados[gr.clubId] = 1; else A().partidos(k.id).forEach(function (p) { clubsUsados[p.clubId] = 1; }); if (O.club) clubsUsados[O.club] = 1; if (D.clubActual) clubsUsados[D.clubActual] = 1;
    return Promise.all([cargarFuentes(O.fontsBase || '../fonts/')].concat(Object.keys(clubsUsados).map(function (id) { return cargarEscudo(club(id)); }))).then(function (r) {
      var fs = r[0];
      doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
      FONTS.forEach(function (f, i) { doc.addFileToVFS(f[0], fs[i]); doc.addFont(f[0], f[1], f[2]); });
      doc.setProperties({ title: 'Informe de goles', author: '@joancosta.gk · Analiza tus goles', creator: 'Analiza tus goles (generado en el dispositivo)' });
      var nombre = gr ? informeGrupo(gr) : informePortero(k);
      pies(); return { doc: doc, nombre: nombre };
    });
  }
  window.InformePDF = {
    generar: generar,
    descargar: function (opts) { return generar(opts).then(function (r) { r.doc.save(r.nombre); return r.nombre; }); }
  };
})();
