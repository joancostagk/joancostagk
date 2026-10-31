/* Analiza tus goles · ficha del gol, patrones, objetivos y vista del entrenador (v10). Todo en localStorage, sin peticiones externas.
   Formato 6 (v11): { version: 6, modo, perfil, clubes, clubActual, porteroActivo, porteros: [{ id, nombre, partidos, objetivos }],
               grupos: [{ id, nombre, clubId, temporada, miembros, reabierto }], grupoActivo, objetivosGrupo: { grupoId: { patronId: { estado, desde } } } }
   Cada gol: notaPortero, notaEntrenador y notaEntrenadorCompartida (false por defecto: el portero solo ve las notas compartidas).
   Valor antiguo de técnica «Con fallo» -> «Con error». */
(function () {
  'use strict';
  var KEY = 'analizaGoles.v1';
  var app = document.getElementById('app');

  var OPT = {
    llegada: ['Jugada elaborada', 'Contraataque', 'Centro lateral', 'Córner', 'Falta', 'Penalti', 'Rechace / segunda jugada', 'Salida que no salió como quería'],
    remate: ['Pie derecho', 'Pie izquierdo', 'Cabeza', 'Otro'],
    posicion: ['Bien colocado', 'Adelantado', 'Retrasado', 'Desplazado hacia un lateral'],
    parte: ['1.ª parte', '2.ª parte'],
    decision: ['Correcta', 'Mejorable'],
    decisionFalta: ['Salir', 'Quedarme', 'Blocar en vez de despejar', 'Despejar en vez de blocar'],
    tecnica: ['Correcta', 'Con error'],
    tecnicaFallo: ['Posición de espera', 'Desplazamiento', 'Caída', 'Blocaje', 'Despeje', 'Juego de pies'],
    parable: ['Sí', 'Dudoso', 'No'],
    superficie: ['Natural', 'Artificial', 'Tierra'],
    lugar: ['Casa', 'Fuera'],
    depende: ['Mucho', 'En parte', 'Poco']
  };
  var SALIDA_OLD = 'Error propio en la salida', SALIDA = 'Salida que no salió como quería';
  var DEP_LBL = { 'Mucho': 'Mucho', 'En parte': 'En parte', 'Poco': 'Poco: marca o defensa' };
  var ZONAS = {
    pe: 'Área pequeña', ai: 'Área · izquierda', ac: 'Área · centro', ad: 'Área · derecha',
    fi: 'Fuera del área · izquierda', fc: 'Fuera del área · centro', fd: 'Fuera del área · derecha'
  };
  var PORTERIA = {};
  [['a', 'Arriba'], ['m', 'Media'], ['b', 'Abajo']].forEach(function (f) {
    [['i', 'izquierda'], ['c', 'centro'], ['d', 'derecha']].forEach(function (c) { PORTERIA[f[0] + c[0]] = f[1] + ' · ' + c[1]; });
  });

  var DEMO = [
    ['J1', '2026-09-20', 'CD San Antonio A', 'Fuera', 0, 2],
    ['J2', '2026-09-27', 'Ezkurdi KT B', 'Casa', 4, 3],
    ['J3', '2026-10-04', 'CD Ibarsusi', 'Fuera', 1, 1],
    ['J4', '2026-10-11', 'CD Montefuerte A', 'Casa', 0, 0],
    ['J5', '2026-10-18', 'CD Galdakao B', 'Fuera', 3, 2],
    ['J6', '2026-10-25', 'CD Orduña', 'Casa', 0, 3]
  ];

  // ---------- almacenamiento ----------
  function temporadaDe(f) {
    var d = f ? new Date(f + 'T12:00:00') : new Date(); if (isNaN(d.getTime())) d = new Date();
    var y = d.getFullYear(), s = d.getMonth() + 1 >= 7 ? y : y - 1;
    return s + '-' + String((s + 1) % 100).padStart(2, '0');
  }
  var CUR = temporadaDe('');
  var DEMO_CLUBS = [{ id: 'demo-club-ib', nombre: 'Iberlanda', demo: true, logo: '', color: '#0E7C4A' }, { id: 'demo-club-ej', nombre: 'CD Ejemplo', demo: true, logo: '', color: '#B45309' }];
  function load() {
    var raw = null, d = null;
    try { raw = localStorage.getItem(KEY); d = JSON.parse(raw); } catch (e) { d = null; }
    // copia de seguridad única de los datos anteriores a los perfiles por portero (v8 y antes)
    if (d && typeof d === 'object' && !Array.isArray(d.porteros) && Array.isArray(d.partidos) && d.partidos.length) {
      try { if (!localStorage.getItem(KEY + '.copia-v8')) localStorage.setItem(KEY + '.copia-v8', raw); } catch (e) {}
    }
    // copia de seguridad única de los datos v9 (formato 4) antes de pasar al formato 5
    if (d && typeof d === 'object' && Array.isArray(d.porteros) && d.version === 5) {
      try { if (!localStorage.getItem(KEY + '.copia-v10')) localStorage.setItem(KEY + '.copia-v10', raw); } catch (e) {}
    }
    if (d && typeof d === 'object' && Array.isArray(d.porteros) && !(d.version >= 5)) {
      try { if (!localStorage.getItem(KEY + '.copia-v9')) localStorage.setItem(KEY + '.copia-v9', raw); } catch (e) {}
    }
    return migrateRoot(d && typeof d === 'object' ? d : {});
  }
  function newGK(nombre, partidos) { return { id: 'gk-' + uid(), nombre: String(nombre || '').slice(0, 60), partidos: partidos || [], objetivos: {} }; }
  // v3 (un solo portero) -> v4 (perfiles por portero). Admite archivos antiguos (v1-v3) y nuevos.
  function migrateRoot(d, extraClubs) {
    var multi = Array.isArray(d.porteros);
    var src = multi ? d.porteros.filter(function (g) { return g && typeof g === 'object'; }) : [{ partidos: d.partidos, objetivos: d.objetivos, nombre: d.perfil && d.perfil.nombre }];
    if (!src.length) src = [{}];
    var root = { version: 6, modo: d.modo === 'portero' || d.modo === 'entrenador' ? d.modo : '', perfil: d.perfil, clubes: d.clubes, clubActual: d.clubActual, porteroActivo: d.porteroActivo, porteros: [], grupos: [], grupoActivo: d.grupoActivo || '', objetivosGrupo: {} };
    var seen = {};
    src.forEach(function (g) {
      var m = migrate({ version: multi ? 4 : d.version, partidos: Array.isArray(g.partidos) ? g.partidos : [], perfil: root.perfil, clubes: root.clubes, clubActual: root.clubActual }, extraClubs);
      root.perfil = m.perfil; root.clubes = m.clubes; root.clubActual = m.clubActual;
      var k = newGK(g.nombre, m.partidos);
      if (g.id && !seen[g.id]) k.id = String(g.id);
      seen[k.id] = 1;
      if (g.objetivos && typeof g.objetivos === 'object' && !Array.isArray(g.objetivos)) k.objetivos = g.objetivos;
      if (g.demo) k.demo = true;
      root.porteros.push(k);
    });
    // grupos (v10): uno por club y temporada; solo miembros que existen
    var ids = {}; root.porteros.forEach(function (g) { ids[g.id] = 1; });
    (Array.isArray(d.grupos) ? d.grupos : []).forEach(function (g) {
      if (!g || !g.id || !g.clubId || !/^\d{4}-\d{2}$/.test(g.temporada || '')) return;
      root.grupos.push({ id: String(g.id), nombre: String(g.nombre || '').slice(0, 80), clubId: g.clubId, temporada: g.temporada, miembros: (g.miembros || []).filter(function (m) { return ids[m]; }), reabierto: !!g.reabierto, demo: !!g.demo || undefined });
    });
    if (d.objetivosGrupo && typeof d.objetivosGrupo === 'object') root.grupos.forEach(function (g) { if (d.objetivosGrupo[g.id]) root.objetivosGrupo[g.id] = d.objetivosGrupo[g.id]; });
    if (!root.grupos.some(function (g) { return g.id === root.grupoActivo; })) root.grupoActivo = '';
    if (!root.porteros.some(function (g) { return g.id === root.porteroActivo; })) root.porteroActivo = root.porteros[0].id;
    if (root.modo === 'portero' && root.porteros.length > 1) root.modo = 'entrenador';
    return root;
  }
  // v1 -> v2: faltas unificadas, posición renombrada, parte explícita, izquierda/derecha frontal (espejo)
  // v2 -> v3: perfil, clubes (con logo), club y temporada por partido
  function migrate(d, extraClubs) {
    var old = !(d.version >= 2);
    var mir = { i: 'd', d: 'i' };
    d.partidos = d.partidos.filter(function (p) { return p && typeof p === 'object' && p.id; });
    d.partidos.forEach(function (p) {
      if (!Array.isArray(p.goles)) p.goles = [];
      p.goles.forEach(function (g) {
        if (g.llegada === 'Falta directa' || g.llegada === 'Falta indirecta') g.llegada = 'Falta';
        if (g.posicion === 'Descolocado hacia un palo') g.posicion = 'Desplazado hacia un lateral';
        if (!g.parte && g.minuto != null && g.minuto !== '') g.parte = Number(g.minuto) <= 45 ? '1.ª parte' : '2.ª parte';
        delete g.minuto; delete g._tras;
        if (g.llegada === SALIDA_OLD) g.llegada = SALIDA;
        if (g.notaPortero == null) g.notaPortero = g.nota != null ? String(g.nota) : '';
        if (g.notaEntrenador == null) g.notaEntrenador = '';
        g.notaEntrenadorCompartida = g.notaEntrenadorCompartida === true;
        if (g.tecnica === 'Con fallo') g.tecnica = 'Con error';
        delete g.nota;
        if (old) {
          if (g.zona && mir[g.zona[1]]) g.zona = g.zona[0] + mir[g.zona[1]];
          if (g.porteria && mir[g.porteria[1]]) g.porteria = g.porteria[0] + mir[g.porteria[1]];
        }
      });
    });
    if (!d.perfil || typeof d.perfil !== 'object') d.perfil = { nombre: '', rol: '' };
    if (!Array.isArray(d.clubes)) d.clubes = [];
    d.clubes = d.clubes.filter(function (c) { return c && c.id && c.nombre; });
    d.clubes.forEach(function (c) { if (c.logo && String(c.logo).indexOf('data:image/') !== 0) c.logo = ''; });
    var known = d.clubes.concat(extraClubs || []);
    var has = function (id) { return known.some(function (c) { return c.id === id; }); };
    if (d.partidos.some(function (p) { return p.demo; })) DEMO_CLUBS.forEach(function (c) { if (!has(c.id)) { d.clubes.push(clone(c)); known.push(c); } });
    var realDef = d.clubActual && has(d.clubActual) && !String(d.clubActual).match(/^demo-/) ? d.clubActual : (known.filter(function (c) { return !c.demo; })[0] || {}).id;
    d.partidos.forEach(function (p) {
      if (!p.clubId || !has(p.clubId)) {
        if (p.demo) p.clubId = 'demo-club-ib';
        else {
          if (!realDef) { var mc = { id: 'club-' + uid(), nombre: 'Mi club', logo: '', color: '#3B9BE8' }; d.clubes.push(mc); known.push(mc); realDef = mc.id; }
          p.clubId = realDef;
        }
      }
      if (!/^\d{4}-\d{2}$/.test(p.temporada || '')) p.temporada = temporadaDe(p.fecha);
    });
    if (!d.clubActual || !has(d.clubActual)) d.clubActual = realDef || '';
    d.version = 3;
    return d;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var db = load();
  function findGK(id) { for (var i = 0; i < db.porteros.length; i++) if (db.porteros[i].id === id) return db.porteros[i]; return null; }
  function gk() { return findGK(db.porteroActivo) || db.porteros[0]; }
  function isCoach() { return db.modo === 'entrenador'; }
  function gkName(g) { g = g || gk(); return (g && g.nombre) || (isCoach() ? 'Portero sin nombre' : (db.perfil.nombre || 'Tú')); }
  // db.partidos apunta siempre a los partidos del portero activo (no se exporta dos veces)
  Object.defineProperty(db, 'partidos', { configurable: true, enumerable: false, get: function () { return gk().partidos; }, set: function (v) { gk().partidos = v; } });
  save();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('No se pudo guardar: el almacenamiento del navegador está lleno.'); } }
  function findP(id) { for (var i = 0; i < db.partidos.length; i++) if (db.partidos[i].id === id) return db.partidos[i]; return null; }
  function findC(id) { for (var i = 0; i < db.clubes.length; i++) if (db.clubes[i].id === id) return db.clubes[i]; return null; }
  function headClub() { return findC(db.clubActual) || (hasDemo() ? findC('demo-club-ib') : null) || db.clubes[0] || null; }
  var STOP = { cd: 1, sd: 1, ud: 1, fc: 1, cf: 1, ke: 1, kt: 1, ft: 1, kk: 1, fk: 1, ad: 1, club: 1, de: 1, del: 1, la: 1, el: 1, los: 1, real: 0 };
  function initials(n) {
    var w = String(n || '?').replace(/\./g, ' ').split(/\s+/).filter(function (x) { return x && !STOP[x.toLowerCase()]; });
    if (!w.length) w = String(n || '?').split(/\s+/);
    return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
  }
  // ---- Biblioteca local de escudos (escudos/escudos.js) ----
  var NSTOP = { cd: 1, sd: 1, cf: 1, fc: 1, ud: 1, scd: 1, ad: 1, ke: 1, kt: 1, ft: 1, fk: 1, kk: 1, ked: 1, kead: 1, club: 1, deportivo: 1, sociedad: 1, deportiva: 1, union: 1, agrupacion: 1, kirol: 1, taldea: 1, elkartea: 1, futbol: 1, de: 1, del: 1 };
  function normClub(n) {
    var w = String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ñ/g, 'n').replace(/\./g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(function (x) { return x && !NSTOP[x]; });
    while (w.length > 1 && /^[a-d]$/.test(w[w.length - 1])) w.pop();
    return w.join('');
  }
  var ESC_IDX = {};
  (window.AG_ESCUDOS || []).forEach(function (e) { [e.nombre].concat(e.alias || []).forEach(function (a) { var k = normClub(a); if (k && !ESC_IDX[k]) ESC_IDX[k] = e; }); });
  function crestFor(n) {
    var k = normClub(n); if (!k) return null;
    if (ESC_IDX[k]) return ESC_IDX[k];
    var m = k.match(/^(.{3,}?)[bc]$/); // «San MiguelB»
    return m && ESC_IDX[m[1]] || null;
  }
  function crestSrc(e) { return 'escudos/' + e.archivo; }
  function clubCrest(c) { return c && !c.logo && !c.sinEscudo ? crestFor(c.nombre) : null; }
  function rivalBadge(n, size) { var e = crestFor(n); return e ? '<img class="rbadge" src="' + esc(crestSrc(e)) + '" alt="" width="' + size + '" height="' + size + '" loading="lazy">' : ''; }
  function clubBadge(c, size) {
    size = size || 40;
    var st = 'width:' + size + 'px;height:' + size + 'px;';
    if (c && c.logo) return '<img class="cbadge" src="' + esc(c.logo) + '" alt="" style="' + st + '">';
    var cr = clubCrest(c); if (cr) return '<img class="cbadge lib" src="' + esc(crestSrc(cr)) + '" alt="" style="' + st + '">';
    if (!c) return '<span class="cbadge mono" aria-hidden="true" style="' + st + '--cc:#3B9BE8"><svg viewBox="0 0 24 24" width="58%" height="58%"><path d="M12 2.5l8 3v6.2c0 4.6-3.3 8.3-8 9.8-4.7-1.5-8-5.2-8-9.8V5.5z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg></span>';
    return '<span class="cbadge mono" aria-hidden="true" style="' + st + 'font-size:' + Math.round(size * 0.38) + 'px;--cc:' + esc((c && c.color) || '#3B9BE8') + '">' + esc(initials(c ? c.nombre : '?')) + '</span>';
  }
  function dlClubes() { return '<datalist id="dlClubes">' + (window.AG_ESCUDOS || []).map(function (e) { return '<option value="' + esc(e.nombre) + '">'; }).join('') + '</datalist>'; }
  function libInfo(e) {
    var cr = crestFor(e.nombre); if (!cr) return '';
    if (e.logo) return '<p class="note lib-n">Hay un escudo de <b>' + esc(cr.nombre) + '</b> en la biblioteca, pero estás usando el tuyo. <button type="button" class="lnk" id="cfUsarLib">Usar el de la biblioteca</button></p>';
    if (e.sinEscudo) return '<p class="note lib-n">Mostrando iniciales. <button type="button" class="lnk" id="cfUsarLib">Usar escudo de ' + esc(cr.nombre) + '</button></p>';
    return '<p class="note lib-n ok">✓ Escudo de <b>' + esc(cr.nombre) + '</b> asignado automáticamente. <button type="button" class="lnk" id="cfIni">Usar iniciales</button></p>';
  }
  function resizeLogo(file, cb) {
    if (!file || !/^image\//.test(file.type)) return cb(null, 'El archivo no es una imagen.');
    if (file.size > 8 * 1024 * 1024) return cb(null, 'La imagen pesa demasiado (máx. 8 MB).');
    var r = new FileReader();
    r.onload = function () {
      var im = new Image();
      im.onload = function () {
        var S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
        var k = Math.min(S / im.width, S / im.height), w = im.width * k, h = im.height * k;
        cv.getContext('2d').drawImage(im, (S - w) / 2, (S - h) / 2, w, h);
        cb(cv.toDataURL('image/png'));
      };
      im.onerror = function () { cb(null, 'No se pudo leer la imagen.'); };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  }
  var ROLES = ['Portero', 'Portera', 'Entrenador de porteros', 'Entrenadora de porteros'];
  var IC = {
    doc: '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    plus: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    list: '<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor"/></svg>',
    chart: '<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    down: '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M4 20h16"/></svg>',
    up: '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V9M7 14l5-5 5 5M4 4h16"/></svg>',
    target: '<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>',
    gloves: '<svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 21v-4l-2.5-4.5a1.6 1.6 0 0 1 2.8-1.6L8 12V5a1.5 1.5 0 0 1 3 0v5V3.5a1.5 1.5 0 0 1 3 0V10V4.5a1.5 1.5 0 0 1 3 0V11v-4a1.5 1.5 0 0 1 3 0v7c0 3-2 5-4 6v1"/><path d="M7 21h10"/></svg>',
    board: '<svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21l4-4 4 4M7 9l2 2M9 9l-2 2M14 8c2 0 3 1 3 3m0 0l-1.5-1M17 11l1-1.2"/></svg>',
    team: '<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="9" cy="8" r="3.4"/><path d="M2.5 20c0-3.6 3-5.6 6.5-5.6s6.5 2 6.5 5.6"/><path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M18 14.6c2.2.6 3.5 2.4 3.5 5.4"/></svg>',
    user: '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>'
  };

  // ---------- utilidades ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(t) { var el = document.getElementById('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('show'); }, 2200); }
  function fmtFecha(f) { if (!f) return 'Sin fecha'; var p = f.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function chips(name, opts, val, multi) {
    return '<div class="chips" data-chips="' + name + '">' + opts.map(function (o) {
      return '<button type="button" class="chip" data-v="' + esc(o) + '" aria-pressed="' + (val === o) + '">' + esc(o) + '</button>';
    }).join('') + '</div>';
  }
  function q(n, t, extra) { return '<p class="q">' + (n !== '' ? '<span class="n">' + n + '</span>' : '') + t + (extra ? ' <small>' + extra + '</small>' : '') + '</p>'; }

  // ---------- cálculos automáticos ----------
  function computeGoles(p) {
    var gs = p.goles.slice();
    return gs;
  }

  // ---------- vistas ----------
  // ---------- navegación interna (hash + historial) ----------
  var view = { name: 'lista' }, draftP = null, draftG = null, popAt = 0, lastGol = null;
  function hashFor(v) {
    return { lista: '#partidos', patrones: '#patrones', perfil: '#perfil', gol: '#gol', objetivos: '#objetivos', entrenador: '#entrenador', bienvenida: '#bienvenida', objetivo: '#objetivo-' + v.id, partido: v.nuevo ? '#nuevo' : '#partido-' + (draftP && draftP.id) }[v.name] || '#partidos';
  }
  function go(name, o) {
    o = o || {};
    view = { name: name, nuevo: !!o.nuevo, id: o.id };
    var h = hashFor(view);
    if (location.hash !== h) { if (o.replace) history.replaceState(null, '', h); else history.pushState(null, '', h); }
    show();
  }
  function show() { render(); window.scrollTo(0, 0); app.classList.remove('ag-enter'); void app.offsetWidth; app.classList.add('ag-enter'); }
  function newDraft() {
    var club = findC(db.clubActual) && !findC(db.clubActual).demo ? db.clubActual : ((db.clubes.filter(function (c) { return !c.demo; })[0] || {}).id || '');
    draftP = { id: uid(), fecha: '', rival: '', competicion: '', lugar: '', gf: '', gc: '', superficie: '', clubId: club, temporada: CUR, goles: [] };
  }
  function route() {
    var h = location.hash.replace(/^#/, '');
    if (!db.modo) { view = { name: 'bienvenida', next: h && h !== 'bienvenida' ? h : 'partidos' }; if (h !== 'bienvenida') history.replaceState(null, '', '#bienvenida'); show(); return; }
    if (h === 'objetivos') view = { name: 'objetivos' };
    else if (h === 'entrenador') view = { name: isCoach() ? 'entrenador' : 'lista' };
    else if (h.indexOf('objetivo-') === 0) view = { name: 'objetivo', id: h.slice(9) };
    else if (h === 'bienvenida') view = { name: 'lista' };
    else if (h === 'patrones') view = { name: 'patrones' };
    else if (h === 'perfil') view = { name: 'perfil' };
    else if (h === 'nuevo') { if (!(view.name === 'partido' && view.nuevo && draftP)) newDraft(); view = { name: 'partido', nuevo: true }; }
    else if (h.indexOf('partido-') === 0) { var p = findP(h.slice(8)); if (p) { if (!draftP || draftP.id !== p.id || (view.name !== 'partido' && view.name !== 'gol')) draftP = clone(p); view = { name: 'partido' }; } else view = { name: 'lista' }; }
    else if (h === 'gol' && draftP && draftG) view = { name: 'gol' };
    else if (h === 'gol' && draftP) view = { name: 'partido', nuevo: !findP(draftP.id) };
    else view = { name: 'lista' };
    show();
  }
  window.addEventListener('popstate', function () { popAt = Date.now(); route(); });
  window.addEventListener('hashchange', function () { if (Date.now() - popAt > 150) route(); });

  function render() {
    var root = document.querySelector('.ag');
    document.body.classList.toggle('dash-mode', view.name === 'patrones');
    if (root) { root.classList.toggle('is-dash', view.name === 'patrones'); root.classList.toggle('is-wide', ['lista', 'perfil', 'objetivos', 'objetivo', 'bienvenida', 'entrenador'].indexOf(view.name) >= 0); }
    var hd = document.querySelector('header'); if (hd) document.documentElement.style.setProperty('--hh', hd.offsetHeight + 'px');
    if (view.name === 'lista') renderLista();
    else if (view.name === 'partido') renderPartido();
    else if (view.name === 'patrones') renderPatrones();
    else if (view.name === 'perfil') renderPerfil();
    else if (view.name === 'objetivos') renderObjetivos();
    else if (view.name === 'objetivo') renderObjetivo(view.id);
    else if (view.name === 'bienvenida') renderBienvenida();
    else if (view.name === 'entrenador') renderEntrenador();
    else renderGol();
  }

  // ---------- cabecera de la herramienta ----------
  function toolHead(active) {
    var c = headClub(), pf = db.perfil || {};
    var gsel = isCoach() ? '<label class="gks" for="gkSel"><span>Portero/a</span><select id="gkSel">' + db.porteros.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === gk().id ? ' selected' : '') + '>' + esc(gkName(g)) + '</option>'; }).join('') + '</select></label>' : '';
    return '<div class="th' + (isCoach() ? ' coach' : '') + '">' +
      '<a class="th-id" href="#perfil" title="Editar perfil y clubes">' + clubBadge(c, 52) +
      '<span class="th-tx"><b>' + esc(pf.nombre || 'Tu nombre') + '</b><small>' + esc(pf.rol || (isCoach() ? 'Entrenador/a de porteros' : 'Portero/a')) + (c ? ' · ' + esc(c.nombre) : '') + '</small></span></a>' +
      '<div class="th-r">' + gsel +
      '<div class="seg2" role="tablist" aria-label="Vista"><a role="tab" href="#partidos" aria-selected="' + (active === 'partidos') + '">' + IC.list + 'Partidos</a><a role="tab" id="verPat" href="#patrones" aria-selected="' + (active === 'patrones') + '">' + IC.chart + 'Patrones</a><a role="tab" id="verObj" href="#objetivos" aria-selected="' + (active === 'objetivos') + '">' + IC.target + 'Objetivos</a>' + (isCoach() ? '<a role="tab" id="verEnt" href="#entrenador" aria-selected="' + (active === 'entrenador') + '">' + IC.team + '<span><span class="lg">Vista del </span><span>entrenador</span></span></a>' : '') + '</div>' +
      '<a class="btn pri" id="nuevo" href="#nuevo">' + IC.plus + '<span>Nuevo partido</span></a></div>' +
      '<div class="th-u"><a class="btn ghost sm" id="btnPerfil" href="#perfil">' + IC.user + 'Perfil y clubes</a><button class="btn ghost sm" id="btnInforme" type="button" data-informe>' + IC.doc + 'Informe PDF</button><button class="btn ghost sm" id="btnExport" type="button">' + IC.down + 'Exportar</button><label class="btn ghost sm" for="fileImport" tabindex="0" id="lblImport">' + IC.up + 'Importar</label></div>' +
      '</div>';
  }
  function bindHead() {
    app.querySelectorAll('.th a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault(); var h = a.getAttribute('href').slice(1);
        if (h === 'nuevo') { newDraft(); go('partido', { nuevo: true }); } else go(h === 'partidos' ? 'lista' : h);
      });
    });
    var gs = document.getElementById('gkSel');
    if (gs) gs.onchange = function () { setGK(this.value); };
    var li = document.getElementById('lblImport'); if (li) li.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('fileImport').click(); } };
  }

  function setGK(id) {
    if (!findGK(id)) return;
    db.porteroActivo = id; save(); draftP = null; draftG = null;
    toast('Portero activo: ' + gkName());
    if (view.name === 'partido' || view.name === 'gol') go('lista', { replace: true });
    else if (view.name === 'objetivo') go('objetivos', { replace: true });
    else keepScroll(render);
  }

  // ---------- lista de partidos con barra lateral ----------
  var listFilt = { club: '', temp: CUR };
  function renderLista() {
    var all = db.partidos;
    var inTemp = function (p) { return listFilt.temp === 'todas' || p.temporada === listFilt.temp; };
    var inClub = function (p) { return !listFilt.club || p.clubId === listFilt.club; };
    var temps = {}; temps[CUR] = 0; all.forEach(function (p) { temps[p.temporada] = (temps[p.temporada] || 0) + (inClub(p) ? 1 : 0); });
    var side = '<aside class="side" aria-label="Filtros"><p class="bgt">Club</p>' +
      '<button type="button" class="sfi" data-lc="" aria-pressed="' + (!listFilt.club) + '"><span class="cbadge all" aria-hidden="true">★</span><span class="sfn">Todos</span><span class="cnt">' + all.filter(inTemp).length + '</span></button>' +
      db.clubes.map(function (c) { return '<button type="button" class="sfi" data-lc="' + esc(c.id) + '" aria-pressed="' + (listFilt.club === c.id) + '">' + clubBadge(c, 26) + '<span class="sfn">' + esc(c.nombre) + (c.demo ? ' <span class="badge y">EJEMPLO</span>' : '') + '</span><span class="cnt">' + all.filter(function (p) { return p.clubId === c.id && inTemp(p); }).length + '</span></button>'; }).join('') +
      '<p class="bgt">Temporada</p>' +
      Object.keys(temps).sort().reverse().map(function (t) { return '<button type="button" class="sfi" data-lt="' + t + '" aria-pressed="' + (listFilt.temp === t) + '"><span class="sfn">' + t + (t === CUR ? ' <small>actual</small>' : '') + '</span><span class="cnt">' + temps[t] + '</span></button>'; }).join('') +
      '<button type="button" class="sfi" data-lt="todas" aria-pressed="' + (listFilt.temp === 'todas') + '"><span class="sfn">Todas (histórico)</span><span class="cnt">' + all.filter(inClub).length + '</span></button>' +
      '</aside>';
    var ps = all.filter(function (p) { return inTemp(p) && inClub(p); }).sort(function (a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
    var h = toolHead('partidos') + '<div class="lw">' + side + '<section class="lmain">';
    h += (isCoach() ? '<h1>Partidos de <em>' + esc(gkName()) + '</em></h1>' : '<h1>Tus <em>partidos</em></h1>') + '<p class="lead">' + (listFilt.temp === 'todas' ? 'Todas las temporadas' : 'Temporada ' + listFilt.temp) + (listFilt.club ? ' · ' + esc((findC(listFilt.club) || {}).nombre || '') : '') + '. Apunta cada gol que encajas en menos de un minuto.</p>';
    if (!all.length) h += '<div class="ag-card empty">Aún no hay partidos. Empieza por el último que jugaste.</div>';
    else if (!ps.length) h += '<div class="ag-card empty">No hay partidos con estos filtros.' + (listFilt.temp !== 'todas' ? ' <button type="button" class="linkb" data-lt="todas">Ver todas las temporadas</button>' : '') + '</div>';
    ps.forEach(function (p) {
      var gs = computeGoles(p), c = findC(p.clubId);
      var res = (p.gf !== '' && p.gf != null && p.gc !== '' && p.gc != null) ? p.gf + '-' + p.gc : '';
      h += '<div class="ag-card match-item" data-open="' + p.id + '" role="button" tabindex="0">' + clubBadge(c, 34) + '<div class="mi-b"><h2>' + (p.demo ? '<span class="badge y">EJEMPLO</span> ' : '') + rivalBadge(p.rival, 22) + esc(p.rival || 'Rival sin nombre') + '</h2>' +
        '<div class="small">' + fmtFecha(p.fecha) + (p.lugar ? ' · ' + p.lugar : '') + (p.competicion ? ' · ' + esc(p.competicion) : '') + ' · ' + esc(p.temporada) + '</div>' +
        '<div>' + (res ? '<span class="badge y">' + res + '</span>' : '') + '<span class="badge">' + gs.length + (gs.length === 1 ? ' gol' : ' goles') + ' en ficha</span>' +
        gs.map(function (g) { return '<span class="badge">' + (g.parte || '¿parte?') + (g.llegada ? ' ' + esc(g.llegada) : '') + '</span>'; }).join('') +
        '</div></div><span aria-hidden="true">›</span></div>';
    });
    h += hasDemo() ? '<div class="demo-banner">DATOS DE EJEMPLO cargados <button class="btn danger sm" type="button" id="borrarDemo">Borrar ejemplo</button></div>'
      : '<button class="btn ghost block" type="button" id="cargarDemo" style="margin-top:10px">Cargar datos de ejemplo</button>';
    h += '</section></div>';
    app.innerHTML = h;
    bindHead(); bindDemo();
    app.querySelectorAll('[data-lc]').forEach(function (b) { b.onclick = function () { listFilt.club = b.getAttribute('data-lc'); keepScroll(renderLista); }; });
    app.querySelectorAll('[data-lt]').forEach(function (b) { b.onclick = function () { listFilt.temp = b.getAttribute('data-lt'); keepScroll(renderLista); }; });
    app.querySelectorAll('[data-open]').forEach(function (el) {
      var op = function () { draftP = clone(findP(el.getAttribute('data-open'))); go('partido'); };
      el.onclick = op; el.onkeydown = function (e) { if (e.key === 'Enter') op(); };
    });
  }

  // ---------- perfil y clubes ----------
  var editClub = null;
  function renderPerfil() {
    var pf = db.perfil;
    var coach = isCoach(), roles = coach ? ROLES.slice(2) : ROLES.slice(0, 2);
    var h = toolHead('') + '<h1>Perfil y <em>clubes</em></h1><p class="lead">Se guarda solo en este dispositivo. Aparece en la cabecera y en cada partido.</p>';
    h += '<div class="ag-card"><h2>Tú</h2><label class="f" for="pfNombre">Nombre</label><input type="text" id="pfNombre" maxlength="60" value="' + esc(pf.nombre) + '" placeholder="Tu nombre">' +
      q('', 'Rol') + chips('rol', roles, pf.rol) +
      '<div class="modo-row"><p class="small">Usas la herramienta como <b>' + (coach ? 'entrenador/a de porteros' : 'portero/a') + '</b>.</p>' +
      (coach && db.porteros.length > 1 ? '<p class="note">Para pasar a modo portero/a deja un solo portero en la lista.</p>' : '<button type="button" class="btn ghost sm" id="cambiarModo">' + (coach ? 'Cambiar a modo portero/a' : 'Cambiar a modo entrenador/a') + '</button>') + '</div></div>';
    if (coach) h += porterosCard();
    h += '<div class="ag-card"><h2>Tus clubes</h2>';
    if (!db.clubes.length) h += '<p class="small">Aún no has añadido ningún club.</p>';
    db.clubes.forEach(function (c) {
      var n = db.partidos.filter(function (p) { return p.clubId === c.id; }).length, act = db.clubActual === c.id;
      h += '<div class="club-row">' + clubBadge(c, 48) + '<div class="cr-b"><b>' + esc(c.nombre) + '</b>' + (c.demo ? ' <span class="badge y">EJEMPLO</span>' : '') + '<small>' + n + (n === 1 ? ' partido' : ' partidos') + (act ? ' · club actual' : '') + '</small></div>' +
        (c.demo ? '' : '<div class="cr-a">' + (act ? '<span class="badge y">Actual</span>' : '<button type="button" class="btn ghost sm" data-cact="' + c.id + '">Usar como actual</button>') +
        '<button type="button" class="btn ghost sm" data-cedit="' + c.id + '">Editar</button>' +
        (n ? '' : '<button type="button" class="btn danger sm" data-cdel="' + c.id + '">Borrar</button>') + '</div>') + '</div>';
    });
    if (editClub) {
      var e = editClub;
      h += '<div class="club-form" id="clubForm"><h2>' + (findC(e.id) ? 'Editar club' : 'Nuevo club') + '</h2>' +
        '<div class="cf-g"><div class="cf-prev" id="cfPrev">' + clubBadge(e, 96) + '</div><div>' +
        '<label class="f" for="cfNombre">Nombre del club</label><input type="text" id="cfNombre" maxlength="50" value="' + esc(e.nombre) + '" placeholder="Ej. CD Iberlanda" list="dlClubes" autocomplete="off">' + dlClubes() +
        '<div class="row" style="margin-top:12px"><label class="btn ghost sm" for="cfLogo" tabindex="0" id="cfLogoLbl">' + IC.up + 'Subir escudo</label>' + (e.logo ? '<button type="button" class="btn ghost sm" id="cfQuitar">Quitar escudo</button>' : '') +
        '<label class="cf-col">Color <input type="color" id="cfColor" value="' + esc(e.color || '#3B9BE8') + '"></label></div>' +
        '<input type="file" id="cfLogo" accept="image/*" hidden><div id="cfLib">' + libInfo(e) + '</div><p class="note">Se reduce a 128 px en tu dispositivo. Sin escudo se muestran las iniciales con el color elegido.</p></div></div>' +
        '<div class="row" style="margin-top:12px"><button type="button" class="btn pri" id="cfSave">Guardar club</button><button type="button" class="btn ghost" id="cfCancel">Cancelar</button></div></div>';
    } else h += '<button type="button" class="btn sec" id="cfNew" style="margin-top:12px">' + IC.plus + 'Añadir club</button>';
    h += '</div>';
    app.innerHTML = h;
    bindHead();
    document.getElementById('pfNombre').oninput = function () { db.perfil.nombre = this.value.trim(); if (!isCoach()) gk().nombre = db.perfil.nombre; save(); var b = app.querySelector('.th-tx b'); if (b) b.textContent = db.perfil.nombre || 'Tu nombre'; };
    bindChips(db.perfil, function () { save(); renderPerfil(); });
    bindPorteros();
    var cm = document.getElementById('cambiarModo');
    if (cm) cm.onclick = function () {
      if (cm.dataset.sure !== '1') { cm.dataset.sure = '1'; cm.textContent = 'Pulsa otra vez para confirmar'; return; }
      if (isCoach()) { db.modo = 'portero'; if (!db.perfil.nombre && gk().nombre) db.perfil.nombre = gk().nombre; gk().nombre = db.perfil.nombre; }
      else { db.modo = 'entrenador'; if (!gk().nombre) gk().nombre = db.perfil.nombre || 'Portero 1'; }
      if (ROLES.indexOf(db.perfil.rol) >= 0 && (ROLES.indexOf(db.perfil.rol) >= 2) !== isCoach()) db.perfil.rol = '';
      save(); keepScroll(renderPerfil); toast(isCoach() ? 'Modo entrenador/a activado' : 'Modo portero/a activado');
    };
    app.querySelectorAll('[data-cact]').forEach(function (b) { b.onclick = function () { db.clubActual = b.getAttribute('data-cact'); save(); keepScroll(renderPerfil); toast('Club actual cambiado'); }; });
    app.querySelectorAll('[data-cedit]').forEach(function (b) { b.onclick = function () { editClub = clone(findC(b.getAttribute('data-cedit'))); keepScroll(renderPerfil); }; });
    app.querySelectorAll('[data-cdel]').forEach(function (b) { b.onclick = function () {
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '¿Seguro?'; return; }
      var id = b.getAttribute('data-cdel'); db.clubes = db.clubes.filter(function (c) { return c.id !== id; });
      if (db.clubActual === id) db.clubActual = (db.clubes.filter(function (c) { return !c.demo; })[0] || {}).id || '';
      save(); keepScroll(renderPerfil); toast('Club borrado'); }; });
    var nw = document.getElementById('cfNew'); if (nw) nw.onclick = function () { editClub = { id: 'club-' + uid(), nombre: '', logo: '', color: '#3B9BE8' }; keepScroll(renderPerfil); var i = document.getElementById('cfNombre'); if (i) i.focus(); };
    if (editClub) {
      var e = editClub, prev = function () { document.getElementById('cfPrev').innerHTML = clubBadge(e, 96); };
      var lib = function () { document.getElementById('cfLib').innerHTML = libInfo(e); bindLib(); };
      var bindLib = function () {
        var a = document.getElementById('cfIni'); if (a) a.onclick = function () { e.sinEscudo = true; prev(); lib(); };
        var b2 = document.getElementById('cfUsarLib'); if (b2) b2.onclick = function () { e.sinEscudo = false; e.logo = ''; keepScroll(renderPerfil); };
      };
      bindLib();
      document.getElementById('cfNombre').oninput = function () { e.nombre = this.value; prev(); lib(); };
      document.getElementById('cfColor').oninput = function () { e.color = this.value; prev(); };
      document.getElementById('cfLogoLbl').onkeydown = function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); document.getElementById('cfLogo').click(); } };
      document.getElementById('cfLogo').onchange = function () { var f = this.files[0]; resizeLogo(f, function (url, err) { if (!url) { toast(err); return; } e.logo = url; keepScroll(renderPerfil); toast('Escudo listo. Guarda el club.'); }); };
      var qq = document.getElementById('cfQuitar'); if (qq) qq.onclick = function () { e.logo = ''; keepScroll(renderPerfil); };
      document.getElementById('cfCancel').onclick = function () { editClub = null; keepScroll(renderPerfil); };
      document.getElementById('cfSave').onclick = function () {
        e.nombre = (e.nombre || '').trim(); if (!e.nombre) { toast('Escribe el nombre del club'); document.getElementById('cfNombre').focus(); return; }
        var i = db.clubes.findIndex(function (c) { return c.id === e.id; });
        if (i >= 0) db.clubes[i] = e; else db.clubes.push(e);
        if (!db.clubActual || (findC(db.clubActual) || {}).demo) db.clubActual = e.id;
        editClub = null; save(); keepScroll(renderPerfil); toast('Club guardado');
      };
    }
  }

  function renderPartido() {
    var p = draftP;
    var h = toolHead('') + '<button class="back" id="volver" type="button">‹ Tus partidos</button><h1>Datos del <em>partido</em></h1><p class="lead">Todo opcional. Rellena lo que sepas.</p>';
    h += '<div class="ag-card"><h2>Importar partidos desde el calendario de tu equipo</h2>' +
      '<label class="f" for="calUrl">Enlace al calendario en la web de tu club</label>' +
      '<input type="url" id="calUrl" inputmode="url" placeholder="https://www.tuclub.com/.../calendario/">' +
      '<div class="row" style="margin-top:10px"><button class="btn sky" type="button" id="calImport">Importar</button><button class="btn ghost" type="button" id="calDemo">Ver ejemplo</button></div>' +
      '<div id="calMsg"></div></div>';
    h += '<div class="ag-card">' +
      '<div class="grid2"><div><label class="f" for="fecha">Fecha</label><input type="date" id="fecha" value="' + esc(p.fecha) + '"></div>' +
      '<div><label class="f" for="rival">Rival</label><input type="text" id="rival" value="' + esc(p.rival) + '" placeholder="Nombre del rival" list="dlClubes" autocomplete="off"><span id="rivCrest" class="riv-c">' + rivalBadge(p.rival, 28) + '</span>' + dlClubes() + '</div></div>' +
      '<div class="grid2"><div><label class="f" for="clubSel">Club</label><select id="clubSel">' +
      db.clubes.filter(function (c) { return !c.demo || c.id === p.clubId; }).map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === p.clubId ? ' selected' : '') + '>' + esc(c.nombre) + '</option>'; }).join('') +
      (db.clubes.some(function (c) { return !c.demo; }) ? '' : '<option value="" selected>Mi club (se crea al guardar)</option>') + '</select></div>' +
      '<div><label class="f" for="temp">Temporada</label><input type="text" id="temp" inputmode="numeric" maxlength="7" value="' + esc(p.temporada) + '" placeholder="' + CUR + '"></div></div>' +
      '<p class="note">La temporada va del 1 de julio al 30 de junio y se calcula con la fecha. Puedes cambiarla. <a href="#perfil" class="linkb" id="goPerfil">Gestionar clubes</a></p>' +
      '<label class="f" for="comp">Competición</label><input type="text" id="comp" value="' + esc(p.competicion) + '" placeholder="Liga, copa, amistoso…">' +
      q('', '¿Casa o fuera?') + chips('lugar', OPT.lugar, p.lugar) +
      q('', 'Resultado') + '<div class="score"><input type="number" id="gf" inputmode="numeric" min="0" placeholder="A favor" value="' + esc(p.gf) + '"><span>-</span><input type="number" id="gc" inputmode="numeric" min="0" placeholder="En contra" value="' + esc(p.gc) + '"></div>' +
      q('', 'Superficie') + chips('superficie', OPT.superficie, p.superficie) + '</div>';
    var gs = computeGoles(p).slice().reverse(); // el último añadido, arriba
    // barra de acciones arriba y fija al hacer scroll (v12)
    h += '<div class="pbar" role="toolbar" aria-label="Acciones del partido"><button class="btn sky" type="button" id="addGol">' + IC.plus + '<span class="l">Añadir gol</span><span class="s">Gol</span></button>' +
      '<button class="btn pri" type="button" id="guardarP"><span class="l">Guardar partido</span><span class="s">Guardar</span></button>' +
      (!view.nuevo ? '<button class="btn danger" type="button" id="borrarP"><span class="l">Borrar partido</span><span class="s">Borrar</span></button>' : '') + '</div>';
    h += '<div class="ag-card" id="golesCard"><h2>Goles encajados (' + gs.length + ')</h2>';
    if (!gs.length) h += '<p class="small">Añade una ficha por cada gol con «Añadir gol». El último que añadas sale el primero.</p>';
    gs.forEach(function (g) {
      h += '<div class="goal-item ag-card' + (g.id === lastGol ? ' flash' : '') + '" id="gi-' + esc(g.id) + '" style="margin:10px 0;background:#0B1A3A"><span class="min">' + (g.parte ? g.parte.slice(0, 3) : '¿?') + '</span>' +
        '<div class="gsum">' + esc(g.llegada || 'Sin tipo') + (g.zona ? ' · ' + ZONAS[g.zona] : '') + (g.porteria ? ' · ' + PORTERIA[g.porteria] : '') +
        '<br>' + (g.parte ? '<span class="badge">' + g.parte + '</span>' : '') + '' + (g.parable ? '<span class="badge">Parable: ' + g.parable + '</span>' : '') + (g.depende ? '<span class="badge">Dependía de ti: ' + esc(DEP_LBL[g.depende] || g.depende) + '</span>' : '') + '</div>' +
        '<div class="row" style="flex:0 0 auto;flex-direction:column;gap:6px"><button class="btn ghost" type="button" data-edit="' + g.id + '">Editar</button><button class="btn danger" type="button" data-del="' + g.id + '">Borrar</button></div></div>';
    });
    h += '</div>';
    app.innerHTML = h; bindHead();
    if (lastGol) { var gi = document.getElementById('gi-' + lastGol); lastGol = null;
      if (gi) setTimeout(function () { var bar = app.querySelector('.pbar'), off = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hh'), 10) || 72) + (bar ? bar.offsetHeight : 0) + 12;
        window.scrollTo({ top: document.getElementById('golesCard').getBoundingClientRect().top + window.scrollY - off, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, 30); }

    function bindText(id, k) { var el = document.getElementById(id); el.oninput = function () { p[k] = el.value; }; }
    document.getElementById('fecha').oninput = function () { p.fecha = this.value; if (!p._tempManual) { p.temporada = temporadaDe(p.fecha); document.getElementById('temp').value = p.temporada; } };
    document.getElementById('temp').oninput = function () { p.temporada = this.value.trim(); p._tempManual = true; };
    document.getElementById('clubSel').onchange = function () { p.clubId = this.value; };
    document.getElementById('goPerfil').onclick = function (e) { e.preventDefault(); go('perfil'); };
    bindText('rival', 'rival');
    var rv = document.getElementById('rival'); if (rv) rv.addEventListener('input', function () { document.getElementById('rivCrest').innerHTML = rivalBadge(this.value, 28); }); bindText('comp', 'competicion');
    ['gf', 'gc'].forEach(function (k) { var el = document.getElementById(k); el.oninput = function () { p[k] = el.value === '' ? '' : Math.max(0, parseInt(el.value, 10) || 0); }; });
    bindChips(p, render);
    document.getElementById('volver').onclick = function () { go('lista'); };
    document.getElementById('calImport').onclick = function () {
      var u = document.getElementById('calUrl').value.trim();
      document.getElementById('calMsg').innerHTML = '<div class="msg">' + (u ? '' : 'Pega primero el enlace del calendario. ') +
        'La importación automática se activará cuando la herramienta esté publicada: leerá esa página una sola vez al pulsar, y solo de webs de clubes que lo permitan (robots.txt). Nunca de las webs de las federaciones. Mientras tanto, prueba «Ver ejemplo» o rellena a mano.</div>';
    };
    document.getElementById('calDemo').onclick = function () {
      var s = '<div class="msg"><label class="f" for="demoSel" style="margin-top:0">Ejemplo: CD Iberlanda · 2ª Regional Bizkaia 2026-27</label><select id="demoSel"><option value="">Elige un partido…</option>' +
        DEMO.map(function (d, i) { return '<option value="' + i + '">' + d[0] + ' · ' + fmtFecha(d[1]).slice(0, 5) + ' · ' + (d[3] === 'Casa' ? 'Iberlanda ' + d[4] + '-' + d[5] + ' ' + d[2] : d[2] + ' ' + d[5] + '-' + d[4] + ' Iberlanda') + '</option>'; }).join('') +
        '</select><p class="note">Las fechas son las de la jornada y pueden no coincidir con el día real del partido. Revísalas.</p></div>';
      document.getElementById('calMsg').innerHTML = s;
      document.getElementById('demoSel').onchange = function () {
        var d = DEMO[this.value]; if (!d) return;
        p.fecha = d[1]; p.temporada = temporadaDe(d[1]); p._tempManual = false; p.rival = d[2]; p.lugar = d[3]; p.gf = d[4]; p.gc = d[5]; p.competicion = '2ª División Regional Bizkaia';
        render(); toast('Datos del ' + d[0] + ' rellenados. Puedes editarlos.');
      };
    };
    document.getElementById('addGol').onclick = function () { draftG = { id: uid() }; go('gol'); };
    app.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { draftG = clone(p.goles.filter(function (g) { return g.id === b.getAttribute('data-edit'); })[0]); go('gol'); }; });
    app.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () {
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '¿Seguro?'; return; }
      p.goles = p.goles.filter(function (g) { return g.id !== b.getAttribute('data-del'); }); commitP(); render(); toast('Gol borrado');
    }; });
    document.getElementById('guardarP').onclick = function () { commitP(); go('lista'); toast('Partido guardado'); };
    var bp = document.getElementById('borrarP');
    if (bp) bp.onclick = function () {
      if (bp.dataset.sure !== '1') { bp.dataset.sure = '1'; bp.classList.add('sure'); bp.innerHTML = '<span class="l">Pulsa otra vez para borrar</span><span class="s">¿Seguro?</span>'; return; }
      db.partidos = db.partidos.filter(function (x) { return x.id !== p.id; }); save(); go('lista', { replace: true }); toast('Partido borrado');
    };
  }

  function commitP() {
    if (!draftP.clubId || !findC(draftP.clubId)) { var mc = db.clubes.filter(function (x) { return !x.demo; })[0]; if (!mc) { mc = { id: 'club-' + uid(), nombre: 'Mi club', logo: '', color: '#3B9BE8' }; db.clubes.push(mc); if (!db.clubActual || (findC(db.clubActual) || {}).demo) db.clubActual = mc.id; } draftP.clubId = mc.id; }
    if (!/^\d{4}-\d{2}$/.test(draftP.temporada || '')) draftP.temporada = temporadaDe(draftP.fecha);
    var c = clone(draftP); delete c._tempManual; c.goles.forEach(function (g) { delete g._tras; delete g.minuto; });
    var i = db.partidos.findIndex(function (x) { return x.id === c.id; });
    if (i >= 0) db.partidos[i] = c; else db.partidos.push(c);
    save(); if (view.nuevo) { view.nuevo = false; history.replaceState(null, '', '#partido-' + c.id); }
  }

  function bindChips(obj, rerender) {
    app.querySelectorAll('[data-chips]').forEach(function (box) {
      var k = box.getAttribute('data-chips');
      box.querySelectorAll('.chip').forEach(function (b) {
        b.onclick = function () { var v = b.getAttribute('data-v'); obj[k] = obj[k] === v ? '' : v; keepScroll(rerender); };
      });
    });
  }
  function keepScroll(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }

  function pitchSVG(sel) {
    // Vista frontal: la portería arriba, miramos hacia ella. Izquierda = izquierda de quien mira.
    var z = [
      ['fi', 'polygon', 'points="0,20 60,20 60,130 113,130 113,260 0,260"', 56, 200, ['Fuera', 'izq.']],
      ['fc', 'rect', 'x="113" y="130" width="114" height="130"', 170, 200, ['Fuera', 'centro']],
      ['fd', 'polygon', 'points="340,20 280,20 280,130 227,130 227,260 340,260"', 284, 200, ['Fuera', 'dcha.']],
      ['ai', 'rect', 'x="60" y="20" width="60" height="110"', 90, 72, ['Área', 'izq.']],
      ['ac', 'rect', 'x="120" y="60" width="100" height="70"', 170, 92, ['Área', 'centro']],
      ['ad', 'rect', 'x="220" y="20" width="60" height="110"', 250, 72, ['Área', 'dcha.']],
      ['pe', 'rect', 'x="120" y="20" width="100" height="40"', 170, 38, ['Área', 'pequeña']]
    ];
    return '<svg class="map" id="pitch" viewBox="0 0 340 262" role="group" aria-label="Medio campo visto de frente hacia la portería: toca la zona del remate">' +
      '<rect x="0" y="20" width="340" height="240" fill="#1d6b3a" opacity=".55"/>' +
      '<rect x="145" y="10" width="50" height="10" fill="#fff"/><text x="225" y="15" style="font-size:10px">portería</text>' +
      z.map(function (a) {
        var small = a[0] === 'pe';
        return '<' + a[1] + ' class="z' + (sel === a[0] ? ' on' : '') + '" data-z="' + a[0] + '" ' + a[2] + ' role="button" tabindex="0" aria-label="' + ZONAS[a[0]] + '"/>' +
          '<text x="' + a[3] + '" y="' + a[4] + '" text-anchor="middle"' + (small ? ' style="font-size:11px"' : '') + '>' +
          (small ? a[5].join(' ') : '<tspan x="' + a[3] + '">' + a[5][0] + '</tspan><tspan x="' + a[3] + '" dy="16">' + a[5][1] + '</tspan>') + '</text>';
      }).join('') + '</svg>';
  }
  function goalSVG(sel) {
    var h = '<svg class="map" id="goalmap" viewBox="0 0 340 160" role="group" aria-label="Portería vista de frente: toca por dónde entró">';
    var rows = ['a', 'm', 'b'], cols = ['i', 'c', 'd'], W = 320 / 3, H = 130 / 3;
    rows.forEach(function (r, ri) { cols.forEach(function (c, ci) {
      var id = r + c, x = 10 + ci * W, y = 10 + ri * H;
      h += '<rect class="z' + (sel === id ? ' on' : '') + '" data-g="' + id + '" x="' + x + '" y="' + y + '" width="' + W + '" height="' + H + '" role="button" tabindex="0" aria-label="' + PORTERIA[id] + '"/>' +
        '<text x="' + (x + W / 2) + '" y="' + (y + H / 2 + 5) + '" text-anchor="middle">' + PORTERIA[id].replace(' · ', ' ').replace('izquierda', 'izq.').replace('derecha', 'dcha.') + '</text>';
    }); });
    return h + '<path d="M6 144 V6 H334 V144" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><line x1="0" y1="144" x2="340" y2="144" stroke="#ffffff66" stroke-width="2"/></svg>';
  }

  function renderGol() {
    var g = draftG, p = draftP;
    var h = toolHead('') + '<button class="back" id="volverP" type="button">‹ ' + esc(p.rival || 'Partido') + '</button><h1>Ficha del <em>gol</em></h1>';
    h += '<div class="ag-card">' + q(1, '¿En qué parte?') + chips('parte', OPT.parte, g.parte) +
      '<p class="note" id="parteReq">Obligatorio: elige 1.ª o 2.ª parte.</p></div>';
    h += '<div class="ag-card">' + q(2, '¿Cómo llegó?') + chips('llegada', OPT.llegada, g.llegada) + '</div>';
    h += '<div class="ag-card">' + q(3, '¿Desde dónde remató?') + pitchSVG(g.zona) + '<p class="note">Izquierda y derecha vistas de frente, mirando hacia la portería.</p>' + '<p class="mapsel">' + (g.zona ? ZONAS[g.zona] : '') + '</p></div>';
    h += '<div class="ag-card">' + q(4, '¿Con qué remató?') + chips('remate', OPT.remate, g.remate) + '</div>';
    h += '<div class="ag-card">' + q(5, '¿Por dónde entró?') + goalSVG(g.porteria) + '<p class="note">Izquierda y derecha vistas de frente, mirando hacia la portería.</p>' + '<p class="mapsel">' + (g.porteria ? PORTERIA[g.porteria] : '') + '</p></div>';
    h += '<div class="ag-card">' + q(6, 'Tu posición') + chips('posicion', OPT.posicion, g.posicion) + '</div>';
    h += '<div class="ag-card">' + q(7, 'Tu decisión') + chips('decision', OPT.decision, g.decision) +
      (g.decision === 'Mejorable' ? '<p class="q">¿Qué faltó?</p><div class="chips sub">' + chips('decisionFalta', OPT.decisionFalta, g.decisionFalta).replace(/^<div class="chips"[^>]*>|<\/div>$/g, '') + '</div>' : '') + '</div>';
    h += '<div class="ag-card">' + q(8, 'Técnica') + chips('tecnica', OPT.tecnica, g.tecnica) +
      (g.tecnica === 'Con error' ? '<p class="q">¿Dónde estuvo el error?</p><div class="chips sub">' + chips('tecnicaFallo', OPT.tecnicaFallo, g.tecnicaFallo).replace(/^<div class="chips"[^>]*>|<\/div>$/g, '') + '</div>' : '') + '</div>';
    h += '<div class="ag-card">' + q(9, '¿Era parable?') + chips('parable', OPT.parable, g.parable) + '</div>';
    h += '<div class="ag-card" id="cardDepende">' + q(10, '¿Cuánto dependía de ti?', 'opcional') + '<div class="chips" data-chips="depende">' + OPT.depende.map(function (o) {
      return '<button type="button" class="chip" data-v="' + esc(o) + '" aria-pressed="' + (g.depende === o) + '">' + esc(DEP_LBL[o]) + '</button>'; }).join('') + '</div>' +
      '<p class="note">Elige «Poco» si el gol dependió sobre todo de la marca o de la defensa. Esos goles no cuentan para los objetivos técnicos, pero sí para ver si hace falta trabajar la comunicación con la defensa.</p></div>';
    var mineK = isCoach() ? 'notaEntrenador' : 'notaPortero', otherK = isCoach() ? 'notaPortero' : 'notaEntrenador';
    h += '<div class="ag-card">' + q(11, isCoach() ? 'Nota del entrenador' : 'Tu nota', 'opcional') + '<textarea id="nota" maxlength="500" placeholder="' + (isCoach() ? 'Lo que quieras recordar de este gol. Es tu nota: no cambia la del portero.' : 'Lo que quieras recordar. Si el gol forma parte de un objetivo, la verás junto a él.') + '">' + esc(g[mineK]) + '</textarea>' +
      (isCoach() ? '<label class="share-t"><input type="checkbox" id="notaComp"' + (g.notaEntrenadorCompartida ? ' checked' : '') + '><span>Compartir con el portero</span></label><p class="note">Si no la compartes, es solo para ti: no la verá el portero ni saldrá en la copia «Para el portero».</p>' : '') +
      (isCoach() ? '<div class="nota-otra"><span class="lbl">Nota del portero</span>' + (g.notaPortero ? '«' + esc(g.notaPortero) + '»' : '<i class="sin">Sin nota</i>') + '</div>'
        : (g.notaEntrenador && g.notaEntrenadorCompartida ? '<div class="nota-otra"><span class="lbl">Nota de tu entrenador</span>«' + esc(g.notaEntrenador) + '»</div>' : '')) +
      '<p class="note">Cada uno escribe su nota por separado: portero y entrenador no se pisan.</p></div>';
    h += '<div class="sticky-save"><button class="btn block" type="button" id="guardarG">Guardar gol</button></div>';
    app.innerHTML = h; bindHead();

    // chips de sub-preguntas: su data-chips quedó fuera tras el replace, se lo ponemos
    app.querySelectorAll('.chips.sub').forEach(function (s, i) {
      var parentQ = s.previousElementSibling.textContent.indexOf('faltó') >= 0 ? 'decisionFalta' : 'tecnicaFallo';
      s.setAttribute('data-chips', parentQ);
    });
    bindChips(g, function () {
      if (g.decision !== 'Mejorable') g.decisionFalta = '';
      if (g.tecnica !== 'Con error') g.tecnicaFallo = '';
      renderGol();
    });
    document.getElementById('nota').oninput = function () { g[mineK] = this.value; };
    var nc = document.getElementById('notaComp'); if (nc) nc.onchange = function () { g.notaEntrenadorCompartida = this.checked; };
    function mapBind(attr, key) {
      app.querySelectorAll('[' + attr + ']').forEach(function (el) {
        var act = function () { var v = el.getAttribute(attr); g[key] = g[key] === v ? '' : v; keepScroll(renderGol); };
        el.addEventListener('click', act);
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
      });
    }
    mapBind('data-z', 'zona'); mapBind('data-g', 'porteria');
    if (!g.parte) { var fc = app.querySelector('[data-chips="parte"] .chip'); if (fc) fc.focus({ preventScroll: true }); }
    document.getElementById('volverP').onclick = function () { go('partido', { nuevo: !findP(draftP.id) }); };
    document.getElementById('guardarG').onclick = function () {
      if (!g.parte) { var pr = document.getElementById('parteReq'); pr.classList.add('req'); pr.scrollIntoView({ block: 'center' }); toast('Indica en qué parte fue el gol'); return; }
      delete g.minuto;
      var i = p.goles.findIndex(function (x) { return x.id === g.id; });
      if (i >= 0) p.goles[i] = g; else p.goles.push(g);
      lastGol = g.id; commitP(); draftG = null; go('partido', { replace: true }); toast('Gol guardado');
    };
  }

  // ---------- exportar / importar ----------
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#btnExport')) doExport(); });
  function doExport() {
    if (!isCoach()) return descargar(clone(db), 'analiza-goles-');
    var old = document.getElementById('expDlg'); if (old) old.remove();
    var dl = document.createElement('dialog'); dl.id = 'expDlg'; dl.className = 'ag-dlg'; dl.setAttribute('aria-labelledby', 'expT');
    dl.innerHTML = '<h2 id="expT">Exportar</h2><p>¿Para quién es la copia?</p><div class="dlg-a">' +
      '<button type="button" class="btn pri" data-ex="portero">Para el portero: ' + esc(gkName()) + ' (solo notas compartidas)</button>' +
      '<button type="button" class="btn ghost" data-ex="completa">Copia completa (para ti, con todas tus notas)</button>' +
      '<button type="button" class="lnk" data-ex="no">Cancelar</button></div><p class="small">La copia para el portero lleva solo sus partidos y las notas que has marcado «Compartir con el portero». Tus notas no compartidas no salen.</p>';
    (document.querySelector('.ag') || document.body).appendChild(dl);
    dl.querySelectorAll('[data-ex]').forEach(function (b) { b.onclick = function () {
      var t = b.getAttribute('data-ex'); dl.close(); dl.remove();
      if (t === 'completa') descargar(clone(db), 'analiza-goles-completa-');
      else if (t === 'portero') descargar(paraPortero(gk()), 'analiza-goles-' + String(gkName()).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-') + '-');
    }; });
    dl.addEventListener('cancel', function () { dl.remove(); });
    if (dl.showModal) dl.showModal(); else dl.setAttribute('open', '');
  }
  // Copia para el portero: solo su perfil y partidos; las notas del entrenador no compartidas se quitan.
  function paraPortero(k) {
    var c = clone(k), usados = {};
    c.partidos.forEach(function (p) { usados[p.clubId] = 1; p.goles.forEach(function (g) { if (!g.notaEntrenadorCompartida) { g.notaEntrenador = ''; g.notaEntrenadorCompartida = false; } }); });
    return { version: 6, paraPortero: true, modo: 'portero', perfil: { nombre: k.nombre || '', rol: '' }, clubes: clone(db.clubes.filter(function (x) { return usados[x.id]; })), clubActual: c.partidos.length ? c.partidos[0].clubId : db.clubActual, porteroActivo: c.id, porteros: [c], grupos: [], objetivosGrupo: {} };
  }
  function descargar(data, pref) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = pref + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Copia descargada');
  }
  document.getElementById('fileImport').onchange = function () {
    var f = this.files[0]; if (!f) return; var input = this;
    var r = new FileReader();
    r.onload = function () {
      var d;
      try { d = JSON.parse(r.result); if (!d || typeof d !== 'object' || (!Array.isArray(d.partidos) && !Array.isArray(d.porteros))) throw new Error('formato'); }
      catch (e) { toast('Archivo no válido'); input.value = ''; return; }
      input.value = '';
      if (!(Array.isArray(d.clubes) && d.clubes.length)) d.clubActual = db.clubActual;
      var R = migrateRoot(d, db.clubes), coachFile = R.porteros.length > 1 || d.modo === 'entrenador';
      if (!isCoach() && R.porteros.length > 1) { toast('Este archivo es de un entrenador con ' + R.porteros.length + ' porteros. Pasa a modo entrenador/a en «Perfil y clubes» para importarlo.'); return; }
      var mergeClubs = function () {
        R.clubes.forEach(function (c) { var i = db.clubes.findIndex(function (x) { return x.id === c.id; }); if (i >= 0) db.clubes[i] = c; else db.clubes.push(c); });
        if (!db.clubActual || !findC(db.clubActual)) db.clubActual = R.clubActual;
      };
      impDup = 0;
      var done = function (n, msg) { save(); listFilt.club = ''; filt.club = ''; go('lista'); impResult((msg || (n + (n === 1 ? ' partido nuevo añadido' : ' partidos nuevos añadidos'))) + (impDup ? ' · ' + impDup + (impDup === 1 ? ' ya estaba y no se ha duplicado' : ' ya estaban y no se han duplicado') : '')); };
      if (!isCoach()) {
        mergeClubs();
        if (R.perfil && R.perfil.nombre && !coachFile) { db.perfil = R.perfil; if (ROLES.indexOf(db.perfil.rol) >= 2) db.perfil.rol = ''; gk().nombre = db.perfil.nombre; }
        return done(mergeGK(gk(), R.porteros[0]));
      }
      if (R.porteros.length > 1) {
        mergeClubs(); var n = 0, nuevos = 0;
        R.porteros.forEach(function (src) { var t = findGK(src.id); if (!t) { t = newGK(src.nombre); t.id = src.id; if (src.demo) t.demo = true; db.porteros.push(t); nuevos++; } n += mergeGK(t, src); });
        R.grupos.forEach(function (g) { if (!db.grupos.some(function (x) { return x.id === g.id || (x.clubId === g.clubId && x.temporada === g.temporada); })) { db.grupos.push(g); if (R.objetivosGrupo[g.id]) db.objetivosGrupo[g.id] = R.objetivosGrupo[g.id]; } });
        return done(n, n + (n === 1 ? ' partido nuevo añadido' : ' partidos nuevos añadidos') + (nuevos ? ' · ' + nuevos + ' porteros nuevos' : ''));
      }
      var src = R.porteros[0], nombre = src.nombre || (!coachFile && R.perfil && R.perfil.nombre) || 'Portero importado', same = findGK(src.id);
      importDialog(nombre, src.partidos.length, same, function (op) {
        if (op === 'cancel') return;
        mergeClubs();
        var t;
        if (op === 'nuevo') { t = newGK(nombre); db.porteros.push(t); }
        else t = op === 'igual' ? same : gk();
        var n = mergeGK(t, src); db.porteroActivo = t.id;
        done(n, n + (n === 1 ? ' partido nuevo añadido' : ' partidos nuevos añadidos') + ' a ' + gkName(t));
      });
    };
    r.readAsText(f);
  };
  // Importar AÑADE: un partido que ya existe (mismo portero, misma fecha y mismo rival, o mismo id) no se duplica.
  // De los duplicados solo se completan las notas que estén vacías aquí.
  var impDup = 0;
  function dupKey(p) { return (p.fecha || '') + '|' + String(p.rival || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function mergeGK(t, src) {
    var n = 0;
    src.partidos.forEach(function (p) {
      var ex = t.partidos.filter(function (x) { return x.id === p.id || (p.fecha && dupKey(x) === dupKey(p)); })[0];
      if (ex) {
        impDup++;
        (p.goles || []).forEach(function (g) { var eg = (ex.goles || []).filter(function (x) { return x.id === g.id; })[0]; if (!eg) return; if (!eg.notaPortero && g.notaPortero) eg.notaPortero = g.notaPortero; if (!eg.notaEntrenador && g.notaEntrenador) { eg.notaEntrenador = g.notaEntrenador; eg.notaEntrenadorCompartida = g.notaEntrenadorCompartida === true; } });
        return;
      }
      t.partidos.push(p); n++;
    });
    Object.keys(src.objetivos || {}).forEach(function (k) { if (!t.objetivos[k]) t.objetivos[k] = src.objetivos[k]; });
    if (!t.nombre && src.nombre) t.nombre = src.nombre;
    return n;
  }
  function impResult(t) {
    var old = document.getElementById('impRes'); if (old) old.remove();
    var dl = document.createElement('dialog'); dl.id = 'impRes'; dl.className = 'ag-dlg'; dl.setAttribute('aria-labelledby', 'impRT');
    dl.innerHTML = '<h2 id="impRT">Importación terminada</h2><p>' + esc(t) + '.</p><div class="dlg-a"><button type="button" class="btn pri" id="impOk">Entendido</button></div>';
    (document.querySelector('.ag') || document.body).appendChild(dl);
    dl.querySelector('#impOk').onclick = function () { dl.close(); dl.remove(); };
    dl.addEventListener('cancel', function () { dl.remove(); });
    if (dl.showModal) dl.showModal(); else dl.setAttribute('open', '');
    toast(t);
  }
  function importDialog(nombre, n, same, cb) {
    var old = document.getElementById('impDlg'); if (old) old.remove();
    var dl = document.createElement('dialog'); dl.id = 'impDlg'; dl.className = 'ag-dlg';
    dl.setAttribute('aria-labelledby', 'impT');
    dl.innerHTML = '<h2 id="impT">Importar archivo</h2><p>El archivo trae <b>' + n + (n === 1 ? ' partido' : ' partidos') + '</b> de <b>' + esc(nombre) + '</b>. ¿Dónde lo guardas?</p><p class="small">Se añaden solo los partidos nuevos. Si ya tienes un partido con la misma fecha y el mismo rival, no se duplica (solo se completan las notas vacías).</p><div class="dlg-a">' +
      (same ? '<button type="button" class="btn pri" data-op="igual">Actualizar a ' + esc(gkName(same)) + '</button>' : '') +
      '<button type="button" class="btn ' + (same ? 'ghost' : 'pri') + '" data-op="nuevo">Añadir como portero nuevo</button>' +
      (!same ? '<button type="button" class="btn ghost" data-op="activo">Juntar con ' + esc(gkName()) + '</button>' : '') +
      '<button type="button" class="lnk" data-op="cancel">Cancelar</button></div>';
    (document.querySelector('.ag') || document.body).appendChild(dl);
    dl.querySelectorAll('[data-op]').forEach(function (b) { b.onclick = function () { dl.close(); dl.remove(); cb(b.getAttribute('data-op')); }; });
    dl.addEventListener('cancel', function () { dl.remove(); });
    if (dl.showModal) dl.showModal(); else dl.setAttribute('open', '');
  }

  // ================= FASE 1: PATRONES =================
  function hasDemo() { return db.partidos.some(function (p) { return p.demo; }); }
  function bindDemo() {
    var c = document.getElementById('cargarDemo'), b = document.getElementById('borrarDemo');
    if (c) c.onclick = function () { loadDemo(); keepScroll(render); toast('Datos de ejemplo cargados'); };
    if (b) b.onclick = function () {
      db.partidos = db.partidos.filter(function (p) { return !p.demo; }); db.clubes = db.clubes.filter(function (c) { return !c.demo; });
      if (!findC(db.clubActual)) db.clubActual = (db.clubes[0] || {}).id || '';
      if (listFilt.club && !findC(listFilt.club)) listFilt.club = ''; if (filt.club && !findC(filt.club)) filt.club = '';
      var ob = gk().objetivos; Object.keys(ob).forEach(function (k) { if (ob[k] && ob[k].demo) delete ob[k]; });
      save(); keepScroll(render); toast('Ejemplo borrado'); };
  }
  function loadDemo() {
    // [parte, minuto, llegada, zona, remate, porteria, posicion, decision, decisionFalta, tecnica, tecnicaFallo, parable]
    var M = [
      ['2026-09-20', 'CD San Antonio A', 'Fuera', 0, 2, 'Artificial', [
        ['1.ª parte', 22, 'Centro lateral', 'ac', 'Cabeza', 'bi', 'Bien colocado', 'Correcta', '', 'Correcta', '', 'No', 'En parte', 'Llegué tarde al primer palo, el centro fue muy tenso.'],
        ['2.ª parte', 80, 'Contraataque', 'ai', 'Pie derecho', 'bi', 'Adelantado', 'Mejorable', 'Quedarme', 'Correcta', '', 'Dudoso', 'Mucho', 'Me quedé a media salida, tenía que esperar.']]],
      ['2026-09-27', 'Ezkurdi KT B', 'Casa', 4, 3, 'Artificial', [
        ['1.ª parte', 10, 'Córner', 'pe', 'Cabeza', 'ac', 'Bien colocado', 'Mejorable', 'Salir', 'Correcta', '', 'Sí', 'Poco', 'El delantero se quedó solo, nadie lo marcó.'],
        ['2.ª parte', 58, 'Jugada elaborada', 'ad', 'Pie izquierdo', 'bd', 'Desplazado hacia un lateral', 'Correcta', '', 'Con error', 'Desplazamiento', 'Sí', 'Mucho', ''],
        ['2.ª parte', 61, 'Rechace / segunda jugada', 'pe', 'Pie derecho', 'bi', 'Bien colocado', 'Correcta', '', 'Con error', 'Blocaje', 'Dudoso', 'Mucho', 'Se me escapó el primer balón.']]],
      ['2026-10-04', 'CD Ibarsusi', 'Fuera', 1, 1, 'Natural', [
        ['2.ª parte', null, 'Falta', 'fc', 'Pie derecho', 'ai', 'Retrasado', 'Correcta', '', 'Correcta', '', 'Dudoso', 'En parte', 'La barrera no tapaba bien su palo.']]],
      ['2026-10-11', 'CD Montefuerte A', 'Casa', 0, 0, 'Artificial', []],
      ['2026-10-18', 'CD Galdakao B', 'Fuera', 3, 2, 'Artificial', [
        ['1.ª parte', 38, 'Penalti', 'ac', 'Pie derecho', 'bi', 'Bien colocado', 'Correcta', '', 'Correcta', '', 'No', 'En parte', ''],
        ['1.ª parte', 41, 'Contraataque', 'ai', 'Pie derecho', 'bi', 'Adelantado', 'Correcta', '', 'Con error', 'Caída', 'Sí', 'Mucho', 'Llegué tarde con la caída al palo corto.']]],
      ['2026-10-25', 'CD Orduña', 'Casa', 0, 3, 'Artificial', [
        ['1.ª parte', 30, 'Salida que no salió como quería', 'fc', 'Pie derecho', 'mc', 'Adelantado', 'Mejorable', 'Quedarme', 'Con error', 'Juego de pies', 'Sí', 'Mucho', 'Pase arriesgado en la salida.'],
        ['2.ª parte', null, 'Centro lateral', 'pe', 'Cabeza', 'ad', 'Bien colocado', 'Mejorable', 'Salir', 'Correcta', '', 'Dudoso', 'Poco', 'Remató libre en el segundo palo: el lateral perdió la marca.'],
        ['2.ª parte', 88, 'Jugada elaborada', 'ai', 'Pie izquierdo', 'bi', 'Desplazado hacia un lateral', 'Correcta', '', 'Con error', 'Posición de espera', 'Sí', 'Mucho', '']]],
      ['2026-11-01', 'Umore Ona B', 'Fuera', 1, 1, 'Natural', [
        ['2.ª parte', 67, 'Córner', 'pe', 'Cabeza', 'ai', 'Bien colocado', 'Mejorable', 'Blocar en vez de despejar', 'Correcta', '', 'Dudoso', 'Poco', 'Dos rivales sin marca en el área pequeña.']]],
      ['2026-11-08', 'Lumo KE', 'Casa', 2, 0, 'Artificial', []],
      // temporada anterior, otro club (histórico de ejemplo)
      ['2026-03-08', 'SD Deusto B', 'Casa', 1, 2, 'Natural', [
        ['1.ª parte', null, 'Centro lateral', 'pe', 'Cabeza', 'ad', 'Bien colocado', 'Mejorable', 'Salir', 'Correcta', '', 'Dudoso'],
        ['2.ª parte', null, 'Jugada elaborada', 'ac', 'Pie derecho', 'bd', 'Retrasado', 'Correcta', '', 'Con error', 'Caída', 'Sí']], 'demo-club-ej'],
      ['2026-04-12', 'CD Elorrio', 'Fuera', 0, 1, 'Artificial', [
        ['2.ª parte', null, 'Falta', 'fd', 'Pie izquierdo', 'ad', 'Bien colocado', 'Correcta', '', 'Correcta', '', 'No']], 'demo-club-ej'],
      ['2026-05-10', 'Zalla UC B', 'Casa', 2, 2, 'Natural', [
        ['1.ª parte', null, 'Córner', 'pe', 'Cabeza', 'md', 'Adelantado', 'Mejorable', 'Quedarme', 'Correcta', '', 'Sí'],
        ['2.ª parte', null, 'Contraataque', 'ad', 'Pie derecho', 'bd', 'Bien colocado', 'Correcta', '', 'Con error', 'Desplazamiento', 'Dudoso']], 'demo-club-ej']
    ];
    DEMO_CLUBS.forEach(function (c) { if (!findC(c.id)) db.clubes.push(clone(c)); });
    var K = ['parte', 'minuto', 'llegada', 'zona', 'remate', 'porteria', 'posicion', 'decision', 'decisionFalta', 'tecnica', 'tecnicaFallo', 'parable', 'depende', 'notaPortero'];
    M.forEach(function (m, i) {
      db.partidos.push({ id: 'demo-' + i, demo: true, clubId: m[7] || 'demo-club-ib', temporada: temporadaDe(m[0]), fecha: m[0], rival: m[1], lugar: m[2], gf: m[3], gc: m[4], superficie: m[5],
        competicion: '2ª División Regional Bizkaia', goles: m[6].map(function (t, j) { var g = { id: 'demo-' + i + '-' + j }; K.forEach(function (k, n) { if (t[n] != null && t[n] !== '' || n < 12) g[k] = t[n]; }); delete g.minuto; if (g.notaPortero == null) g.notaPortero = ''; g.notaEntrenador = ''; return g; }) });
    });
    save();
  }

  var filt = { alcance: 'temporada', comp: '', sup: '', temp: CUR, club: '', sel: {} };
  var dashTab = 'resumen';
  var dataTab = 'jugada';
  var DE = { 'Jugada elaborada': 'de jugada elaborada', 'Contraataque': 'de contraataque', 'Centro lateral': 'de centro lateral', 'Córner': 'de córner', 'Falta': 'de falta', 'Penalti': 'de penalti', 'Rechace / segunda jugada': 'de rechace o segunda jugada', 'Salida que no salió como quería': 'tras una salida que no salió como querías' };
  function xn(x, n, w) { return x + ' de ' + n + (w ? ' ' + w : '') + (n >= 10 ? ' (' + pct(x, n) + ' %)' : ''); }
  function zonaTxt(z) { return { pe: 'el área pequeña', ai: 'el área, lado izquierdo', ac: 'el centro del área', ad: 'el área, lado derecho', fi: 'fuera del área, lado izquierdo', fc: 'fuera del área, por el centro', fd: 'fuera del área, lado derecho' }[z]; }
  function buildHeadline(G, sel) {
    var n = G.length; if (n < 2) return null;
    var EXC = {}; Object.keys(sel || {}).forEach(function (k) { if (k === 'porteria') { EXC.lado = 1; EXC.altura = 1; } else EXC[k] = 1; });
    var REM = { 'Pie derecho': 'con la derecha', 'Pie izquierdo': 'con la izquierda', 'Cabeza': 'de cabeza', 'Otro': 'con otra parte del cuerpo' };
    var FALTA = { 'Salir': 'salir', 'Quedarme': 'quedarte', 'Blocar en vez de despejar': 'blocar en vez de despejar', 'Despejar en vez de blocar': 'despejar en vez de blocar' };
    var TFALLO = { 'Posición de espera': 'la posición de espera', 'Desplazamiento': 'el desplazamiento', 'Caída': 'la caída', 'Blocaje': 'el blocaje', 'Despeje': 'el despeje', 'Juego de pies': 'el juego de pies' };
    var ROW = { a: 'arriba', m: 'a media altura', b: 'abajo' }, SIDE = { i: 'izquierdo', c: 'central', d: 'derecho' };
    var uniqTop = function (c) { var t = tops(c); return t.length === 1 ? t[0] : null; };
    var cnt = function (c, m) { return c === m ? (m === 2 ? 'Los 2' : 'Los ' + m) : c + ' de ' + m; };
    // dimensiones: id, función que da la clave de cada gol (o null)
    var D = {
      lado: function (g) { return g.porteria && g.porteria[1] !== 'c' ? g.porteria[1] : null; },
      altura: function (g) { return g.porteria ? g.porteria[0] : null; },
      parte: function (g) { return g.parte || null; },
      zona: function (g) { return g.zona || null; },
      llegada: function (g) { return g.llegada || null; },
      remate: function (g) { return g.remate || null; },
      posicion: function (g) { return g.posicion && g.posicion !== 'Bien colocado' ? 'mal' : null; },
      parable: function (g) { return g.parable === 'Sí' ? 'si' : null; },
      decision: function (g) { return g.decision === 'Mejorable' ? 'mej' : null; },
      tecnica: function (g) { return g.tecnica === 'Con error' ? 'fallo' : null; }
    };
    function count(gs, d) { var c = {}; gs.forEach(function (g) { var k = D[d](g); if (k) c[k] = (c[k] || 0) + 1; }); return c; }
    var HEAD = {
      lado: function (k, c) { return cnt(c, n) + ' goles entran por el lado ' + SIDE[k]; },
      altura: function (k, c) { return cnt(c, n) + ' goles entran ' + ROW[k]; },
      parte: function (k, c) { return cnt(c, n) + ' goles llegan en la ' + k; },
      zona: function (k, c) { return cnt(c, n) + ' goles se rematan desde ' + zonaTxt(k); },
      llegada: function (k, c) { return cnt(c, n) + ' goles llegan ' + DE[k]; },
      remate: function (k, c) { return cnt(c, n) + ' goles se rematan ' + REM[k]; },
      posicion: function (k, c) { return c === n ? 'En ningún gol estabas bien colocado' : 'En ' + c + ' de ' + n + ' goles no estabas bien colocado'; },
      parable: function (k, c) { return cnt(c, n) + ' goles los marcaste como parables'; },
      decision: function (k, c) { return 'En ' + cnt(c, n).toLowerCase() + ' goles tu decisión fue mejorable'; },
      tecnica: function (k, c) { return 'En ' + cnt(c, n).toLowerCase() + ' goles hubo un error técnico'; }
    };
    var best = null;
    Object.keys(HEAD).forEach(function (d) {
      if (EXC[d]) return;
      var c = count(G, d), k = uniqTop(c); if (!k || c[k] < 2) return;
      if (d === 'parte' && c[k] * 2 <= n) return;
      if (!best || c[k] > best.c) best = { d: d, k: k, c: c[k] };
    });
    if (!best) return null;
    var S = G.filter(function (g) { return D[best.d](g) === best.k; }), m = S.length;
    var q = function (k) { return k === m ? (m === 2 ? 'los dos' : 'todos') : String(k); };
    var FACT = {
      lado: function (k, c) { return [c, 'entraron por el lado ' + SIDE[k]]; },
      altura: function (k, c) { return [c, 'entraron ' + ROW[k]]; },
      parte: function (k, c) { return [c, 'llegaron en la ' + k]; },
      zona: function (k, c) { return [c, 'se remataron desde ' + zonaTxt(k)]; },
      llegada: function (k, c) { return [c, 'llegaron ' + DE[k]]; },
      remate: function (k, c) { return [c, 'se remataron ' + REM[k]]; },
      posicion: function (k, c) { return c === m ? 'en ninguno estabas bien colocado' : 'en ' + c + ' no estabas bien colocado'; },
      parable: function (k, c) { return [c, 'los marcaste como parables']; },
      decision: function (k, c) { return 'en ' + q(c) + ' tu decisión fue mejorable'; },
      tecnica: function (k, c) { return 'en ' + q(c) + ' hubo un error técnico'; }
    };
    var facts = [];
    // detalle propio del titular
    var own = '';
    if (best.d === 'posicion') { var cp = countBy(S, 'posicion'); own = 'Estabas ' + Object.keys(cp).sort(function (a, b) { return cp[b] - cp[a]; }).map(function (k) { return lc(k) + ' (' + cp[k] + ')'; }).join(', ').replace(/, ([^,]*)$/, ' o $1') + '.'; }
    if (best.d === 'decision') { var cd = countBy(S, 'decisionFalta'), dk = uniqTop(cd); if (dk && cd[dk] >= 2) own = 'Lo que más faltó fue ' + FALTA[dk] + ' (' + cd[dk] + ').'; }
    if (best.d === 'tecnica') { var ct = countBy(S, 'tecnicaFallo'), tk = uniqTop(ct); if (tk && ct[tk] >= 2) own = 'Sobre todo en ' + TFALLO[tk] + ' (' + ct[tk] + ').'; }
    if (best.d === 'lado') own = 'Mirando a portería.';
    Object.keys(FACT).forEach(function (d) {
      if (EXC[d] || d === best.d || (best.d === 'lado' && d === 'altura') || (best.d === 'altura' && d === 'lado')) return;
      var c = count(S, d), k = uniqTop(c); if (!k || c[k] < 2) return;
      if (d === 'parte' && c[k] * 2 <= m) return;
      facts.push({ d: d, c: c[k], t: FACT[d](k, c[k]) });
    });
    facts.sort(function (a, b) { return b.c - a.c; });
    var fz = facts.filter(function (x) { return x.d === 'zona'; })[0], fr = facts.filter(function (x) { return x.d === 'remate'; })[0];
    if (fz && fr && fz.c === fr.c) { facts = facts.filter(function (x) { return x !== fz && x !== fr; }); facts.unshift({ d: 'zr', c: fz.c, t: [fz.c, fr.t[1] + ' ' + fz.t[1].replace('se remataron ', '')] }); facts.sort(function (x, y) { return y.c - x.c; }); }
    var F = facts.slice(0, own && best.d !== 'lado' ? 1 : 2), s = '';
    if (F.length) {
      var allSubj = F.every(function (x) { return Array.isArray(x.t) && x.t[0] === m; });
      var allC = (Array.isArray(F[0].t) ? F[0].t[0] : F[0].c) === m;
      if (allSubj) s = (m === 2 ? 'Ambos ' : 'Todos ') + F.map(function (x) { return x.t[1]; }).join(' y ') + '.';
      else if (allC) { s = F.map(function (x) { return Array.isArray(x.t) ? q(x.t[0]) + ' ' + x.t[1] : x.t; }).join(' y ') + '.'; s = s.charAt(0).toUpperCase() + s.slice(1); }
      else s = 'De ellos, ' + F.map(function (x) { return Array.isArray(x.t) ? q(x.t[0]) + ' ' + x.t[1] : x.t; }).join(' y ') + '.';
    }
    var exp = own ? (s ? own + ' ' + s : own) : s;
    return { t: HEAD[best.d](best.k, best.c) + '.', e: exp };
  }


  var FL = { parte: 'Parte', zona: 'Desde', porteria: 'Entró', llegada: 'Llegada', remate: 'Remate', posicion: 'Posición', decision: 'Decisión', tecnica: 'Técnica', parable: 'Parable', depende: 'Dependía de ti' };
  function pct(a, b) { return b ? Math.round(a * 100 / b) : 0; }
  function countBy(gs, k) { var c = {}; gs.forEach(function (g) { if (g[k]) c[g[k]] = (c[g[k]] || 0) + 1; }); return c; }
  function sumV(c) { var t = 0; for (var k in c) t += c[k]; return t; }
  function topKey(c) { var b = null; for (var k in c) if (b === null || c[k] > c[b]) b = k; return b; }
  function tops(c) { var m = 0, r = []; for (var k in c) m = Math.max(m, c[k]); for (var k2 in c) if (c[k2] === m && m) r.push(k2); return r; }
  function joinY(a) { return a.length > 1 ? a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] : a[0]; }
  function lc(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function heat(v, mx) { return v ? 0.18 + 0.72 * v / mx : 0; }
  function valLabel(k, v) { return k === 'zona' ? ZONAS[v] : k === 'porteria' ? PORTERIA[v] : v; }
  function fattr(k, v) { return ' data-fk="' + k + '" data-fv="' + esc(v) + '" role="button" tabindex="0"'; }

  function barGroup(title, k, opts, c) {
    var n = sumV(c), mx = Math.max.apply(null, opts.map(function (o) { return c[o] || 0; }).concat([1]));
    return '<div class="bg"><p class="bgt">' + title + '</p>' + opts.map(function (o) {
      var v = c[o] || 0, on = filt.sel[k] === o;
      return '<div class="bar' + (on ? ' on' : '') + '"' + fattr(k, o) + ' aria-pressed="' + on + '"><span class="bl">' + esc(o) + '</span><span class="bt"><i style="width:' + (v * 100 / mx) + '%"></i></span><span class="bv">' + v + (n ? ' · ' + pct(v, n) + '%' : '') + '</span></div>';
    }).join('') + '</div>';
  }

  // Sin alturas fijas ni scroll interno: solo la barra general de la página.
  // Los dos mapas se dimensionan para caber juntos en la pantalla (debajo de la cabecera y los filtros).
  function fitDash() {
    var mp = app.querySelector('.mapw.mp svg'), mg = app.querySelector('.mapw.mg svg'); if (!mp || !mg || !mp.getClientRects().length) return;
    mp.style.maxHeight = mg.style.maxHeight = '';
    var top = mp.getBoundingClientRect().top + window.scrollY, gHead = mg.getBoundingClientRect().top - mp.getBoundingClientRect().bottom;
    // En móvil los filtros ocupan media pantalla: los mapas caben juntos en una pantalla al llegar a ellos (bajo la cabecera fija)
    var hh = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hh'), 10) || 64;
    var below = window.innerHeight - top - gHead - 16;
    // Si debajo de cabecera y filtros no hay sitio digno (p. ej. 1366x768 con datos de ejemplo), caben juntos en una pantalla al bajar un poco
    var avail = (window.innerWidth < 900 || below < 300) ? window.innerHeight - hh - (mp.getBoundingClientRect().top - app.querySelector('.c-mapas').getBoundingClientRect().top) - gHead - 24 : window.innerHeight - top - gHead - 16;
    var free = Math.max(220, avail), hP = free * 262 / 422, hG = free * 160 / 422;
    mp.style.maxHeight = Math.round(hP) + 'px'; mg.style.maxHeight = Math.round(hG) + 'px';
  }
  window.addEventListener('resize', function () { if (view.name === 'patrones') fitDash(); });
  function renderPatrones() {
    var demo = hasDemo();
    var src = db.partidos.filter(function (p) { return demo ? p.demo : !p.demo; });
    var temps = {}; temps[CUR] = 1; src.forEach(function (p) { temps[p.temporada] = 1; });
    var clubsU = {}; src.forEach(function (p) { clubsU[p.clubId] = 1; });
    if (filt.temp !== 'todas') src = src.filter(function (p) { return p.temporada === filt.temp; });
    if (filt.club) src = src.filter(function (p) { return p.clubId === filt.club; });
    var comps = {}, sups = {};
    src.forEach(function (p) { if (p.competicion) comps[p.competicion] = 1; if (p.superficie) sups[p.superficie] = 1; });
    var ps = src.slice().sort(function (a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
    if (filt.comp) ps = ps.filter(function (p) { return p.competicion === filt.comp; });
    if (filt.sup) ps = ps.filter(function (p) { return p.superficie === filt.sup; });
    if (filt.alcance === 'ult5') ps = ps.slice(0, 5);
    var all = [];
    ps.forEach(function (p) { computeGoles(p).forEach(function (g) { all.push(g); }); });
    var G = all.filter(function (g) { for (var k in filt.sel) if (g[k] !== filt.sel[k]) return false; return true; });
    var n = G.length;

    // barra de filtros
    var chip = function (k, v, on, txt) { return '<button type="button" class="chip sm" data-bar="' + k + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + txt + '</button>'; };
    var h = toolHead('patrones') + (isCoach() ? '<p class="gk-ctx">Patrones de <b>' + esc(gkName()) + '</b></p>' : '') + '<div class="fbar"><div class="fbar-in">' +
      '<select id="fTemp" aria-label="Temporada">' + Object.keys(temps).sort().reverse().map(function (t) { return '<option value="' + t + '"' + (filt.temp === t ? ' selected' : '') + '>Temporada ' + t + (t === CUR ? ' (actual)' : '') + '</option>'; }).join('') + '<option value="todas"' + (filt.temp === 'todas' ? ' selected' : '') + '>Todas las temporadas</option></select>' +
      '<select id="fClub" aria-label="Club"><option value="">Club: todos</option>' + Object.keys(clubsU).map(function (id) { var c = findC(id); return c ? '<option value="' + esc(id) + '"' + (filt.club === id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>' : ''; }).join('') + '</select>' +
      chip('alcance', 'temporada', filt.alcance === 'temporada', 'Temporada completa') + chip('alcance', 'ult5', filt.alcance === 'ult5', 'Últimos 5 partidos') +
      '<select id="fComp" aria-label="Competición"><option value="">Competición: todas</option>' + Object.keys(comps).map(function (c) { return '<option' + (filt.comp === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select id="fSup" aria-label="Superficie"><option value="">Superficie: todas</option>' + Object.keys(sups).map(function (c) { return '<option' + (filt.sup === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      chip('parte', '1.ª parte', filt.sel.parte === '1.ª parte', '1.ª parte') + chip('parte', '2.ª parte', filt.sel.parte === '2.ª parte', '2.ª parte') +
      '</div>';
    var act = [];
    if (filt.temp !== CUR) act.push(['temp', filt.temp === 'todas' ? 'Todas las temporadas' : 'Temporada ' + filt.temp]);
    if (filt.club) act.push(['club', 'Club: ' + ((findC(filt.club) || {}).nombre || '')]);
    if (filt.alcance === 'ult5') act.push(['alcance', 'Últimos 5 partidos']);
    if (filt.comp) act.push(['comp', filt.comp]);
    if (filt.sup) act.push(['sup', filt.sup]);
    for (var k in filt.sel) act.push(['sel:' + k, FL[k] + ': ' + valLabel(k, filt.sel[k])]);
    if (act.length) h += '<div class="achips">' + act.map(function (a) { return '<button type="button" class="achip" data-clear="' + a[0] + '">' + esc(a[1]) + ' ✕</button>'; }).join('') + '<button type="button" class="achip clr" data-clear="all">Limpiar todo</button></div>';
    h += '<div class="tabs" role="tablist">' + [['resumen', 'Resumen'], ['mapas', 'Mapas'], ['datos', 'Datos']].map(function (t) {
      return '<button type="button" role="tab" class="tab" data-tab="' + t[0] + '" aria-selected="' + (dashTab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div></div>';
    if (demo) h += '<div class="demo-banner">DATOS DE EJEMPLO · no son tus partidos reales <button class="btn danger" type="button" id="borrarDemo">Borrar ejemplo</button></div>';

    // RESUMEN (propuesta v5)
    var conG = ps.filter(function (p) { return p.goles.length; }).length;
    var ceros = ps.filter(function (p) { return p.gc === 0 || p.gc === '0'; }).length;
    var cp = countBy(G, 'porteria'), tp = topKey(cp);
    var cz = countBy(G, 'zona'), tz = topKey(cz);
    var cl = countBy(G, 'llegada');
    var hl = buildHeadline(G, filt.sel);
    var golFilt = Object.keys(filt.sel).length > 0;
    var colR = '<h2>Resumen</h2>' + (n < 5 ? '<div class="msg">Con pocos goles los patrones aún no son fiables. Sigue apuntando.</div>' : '') +
      '<div class="kpis g2"><div class="k-main' + (golFilt ? ' k-wide' : '') + '"><b>' + n + (golFilt ? '<small> de ' + all.length + '</small>' : '') + '</b><span>' + (golFilt ? 'goles con este filtro' : 'goles encajados') + '</span></div>' +
      (golFilt ? '</div><p class="k-tag">Temporada completa</p><div class="kpis g3 k-season">' : '') +
      '<div><b>' + ps.length + '</b><span>partidos</span></div>' +
      '<div><b>' + (conG ? (all.length / conG).toFixed(1).replace('.', ',') : '–') + '</b><span>goles por partido*</span></div><div><b>' + ceros + '</b><span>porterías a cero</span></div></div>' +
      '<p class="note">* Media sobre los ' + conG + ' partidos con goles apuntados. Porterías a cero: partidos con 0 en contra en el resultado.</p>' +
      '<div class="hl"><p class="bgt">Lo más repetido</p>' + (hl ? '<p class="hl-t">' + esc(hl.t) + '</p>' + (hl.e ? '<p class="hl-e">' + esc(hl.e) + '</p>' : '') : '<p class="hl-e">Aún no hay nada que se repita en al menos dos goles.</p>') + '</div>';
    // MAPAS
    var nz = sumV(cz), mxz = cz[tz] || 1;
    var Z = [['fi', 'polygon', 'points="0,20 60,20 60,130 113,130 113,260 0,260"', 56, 195], ['fc', 'rect', 'x="113" y="130" width="114" height="130"', 170, 195], ['fd', 'polygon', 'points="340,20 280,20 280,130 227,130 227,260 340,260"', 284, 195],
      ['ai', 'rect', 'x="60" y="20" width="60" height="110"', 90, 80], ['ac', 'rect', 'x="120" y="60" width="100" height="70"', 170, 95], ['ad', 'rect', 'x="220" y="20" width="60" height="110"', 250, 80], ['pe', 'rect', 'x="120" y="20" width="100" height="40"', 170, 40]];
    var pitch = '<svg class="map hm" viewBox="0 0 340 262" aria-label="Desde dónde: toca una zona para filtrar"><rect x="0" y="20" width="340" height="240" fill="#1d6b3a" opacity=".55"/><rect x="145" y="10" width="50" height="10" fill="#fff"/>' +
      Z.map(function (a) { var v = cz[a[0]] || 0, on = filt.sel.zona === a[0];
        return '<' + a[1] + ' class="hz' + (on ? ' sel' : '') + '"' + fattr('zona', a[0]) + ' aria-label="' + ZONAS[a[0]] + ': ' + v + '" ' + a[2] + ' fill="#F5C518" fill-opacity="' + heat(v, mxz) + '"/>' +
        '<text x="' + a[3] + '" y="' + a[4] + '" text-anchor="middle" style="font-size:16px;font-weight:700">' + v + '</text><text x="' + a[3] + '" y="' + (a[4] + 15) + '" text-anchor="middle" style="font-size:11px">' + pct(v, nz) + '%</text>'; }).join('') + '</svg>';
    var np = sumV(cp), mxp = cp[tp] || 1, W = 320 / 3, H = 130 / 3;
    var goal = '<svg class="map hm" viewBox="0 0 340 160" aria-label="Por dónde entró: toca una celda para filtrar">';
    ['a', 'm', 'b'].forEach(function (r, ri) { ['i', 'c', 'd'].forEach(function (c, ci) {
      var id = r + c, v = cp[id] || 0, x = 10 + ci * W, y = 10 + ri * H, on = filt.sel.porteria === id;
      goal += '<rect class="hz' + (on ? ' sel' : '') + '"' + fattr('porteria', id) + ' aria-label="' + PORTERIA[id] + ': ' + v + '" x="' + x + '" y="' + y + '" width="' + W + '" height="' + H + '" fill="#F5C518" fill-opacity="' + heat(v, mxp) + '"/>' +
        '<text x="' + (x + W / 2) + '" y="' + (y + H / 2 - 2) + '" text-anchor="middle" style="font-size:16px;font-weight:700">' + v + '</text><text x="' + (x + W / 2) + '" y="' + (y + H / 2 + 14) + '" text-anchor="middle" style="font-size:11px">' + pct(v, np) + '%</text>';
    }); });
    goal += '<path d="M6 144 V6 H334 V144" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round" pointer-events="none"/></svg>';
    var colM = '<h2>Mapas</h2><p class="note" style="margin-top:0">Izquierda y derecha vistas de frente, mirando hacia la portería. Toca una zona para filtrar.</p>' +
      '<div class="mapw mp"><p class="bgt">¿Desde dónde?</p>' + pitch + '</div><div class="mapw mg"><p class="bgt">¿Por dónde entró?</p>' + goal + '</div>';

    // DATOS (propuesta v5): selector de grupo + subtarjetas
    var zl = {}; for (var zk in ZONAS) zl[ZONAS[zk]] = zk;
    var GR = {
      jugada: [['¿Cómo llegó el gol?', 'tipo de jugada del rival', 'llegada', OPT.llegada],
        ['¿Desde dónde remató?', 'zona del remate (vista de frente)', 'zona', Object.keys(ZONAS)],
        ['¿En qué parte?', '1.ª o 2.ª parte', 'parte', OPT.parte]],
      remate: [['¿Con qué remató?', 'parte del cuerpo del rival', 'remate', OPT.remate],
        ['¿Era parable?', 'tu valoración después del partido', 'parable', OPT.parable]],
      actuacion: [['Tu posición', 'dónde estabas cuando remataron', 'posicion', OPT.posicion],
        ['Tu decisión', 'si la elección fue la adecuada', 'decision', OPT.decision],
        ['Qué faltó en la decisión', 'solo goles con decisión mejorable', 'decisionFalta', OPT.decisionFalta],
        ['Tu técnica', 'ejecución del gesto', 'tecnica', OPT.tecnica],
        ['Dónde estuvo el error técnico', 'solo goles con técnica con error', 'tecnicaFallo', OPT.tecnicaFallo],
        ['¿Cuánto dependía de ti?', 'solo goles en los que lo indicaste', 'depende', OPT.depende]]
    };
    function sub(t, st, k, opts, cnt) {
      var c = cnt || countBy(G, k), tot = sumV(c);
      if (k === 'decisionFalta' || k === 'tecnicaFallo' || k === 'depende') { if (!tot) return ''; }
      var items = opts.map(function (o) { return [o, c[o] || 0]; }).sort(function (a, b) { return b[1] - a[1]; });
      var mx = Math.max(1, items[0] ? items[0][1] : 1);
      var row = function (it) {
        var o = it[0], v = it[1], on = k && filt.sel[k] === o, lab = k === 'zona' ? ZONAS[o] : o;
        return '<div class="bar' + (on ? ' on' : '') + (k ? '' : ' ro') + '"' + (k ? fattr(k, o) + ' aria-pressed="' + on + '"' : '') + '><span class="bl">' + esc(lab) + '</span><span class="bt"><i style="width:' + (v * 100 / mx) + '%"></i></span><span class="bv"><b>' + v + '</b> · ' + pct(v, tot) + '%</span></div>';
      };
      var nz = items.filter(function (i) { return i[1] > 0; }), z = items.filter(function (i) { return i[1] === 0; });
      return '<div class="sc"><p class="sct">' + t + '</p><p class="scs">' + st + '</p>' + (nz.length ? nz.map(row).join('') : '<p class="small">Sin datos.</p>') +
        (z.length ? '<details><summary>ver todas (' + z.length + ' sin goles)</summary>' + z.map(row).join('') + '</details>' : '') + '</div>';
    }
    var colD = '<h2>Datos y gráficos</h2><div class="seg" role="tablist">' + [['jugada', 'La jugada'], ['remate', 'El remate'], ['actuacion', 'Tu actuación']].map(function (t) {
      return '<button type="button" role="tab" class="sg sg-' + t[0] + '" data-dtab="' + t[0] + '" aria-selected="' + (dataTab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="grp grp-' + dataTab + '">' + GR[dataTab].map(function (s) { return sub(s[0], s[1], s[2], s[3], s[4]); }).join('') + '</div>';
    h += '<div class="dash" data-tab="' + dashTab + '"><section class="col c-resumen">' + colR + '</section><section class="col c-mapas">' + colM + '</section><section class="col c-datos">' + colD + '</section></div>';
    app.innerHTML = h;

    fitDash();
    bindHead(); bindDemo();
    document.getElementById('fTemp').onchange = function () { filt.temp = this.value; rr(); };
    document.getElementById('fClub').onchange = function () { filt.club = this.value; rr(); };
    var rr = function () { keepScroll(renderPatrones); };
    app.querySelectorAll('[data-bar]').forEach(function (b) { b.onclick = function () {
      var k = b.getAttribute('data-bar'), v = b.getAttribute('data-v');
      if (k === 'alcance') filt.alcance = v; else { if (filt.sel[k] === v) delete filt.sel[k]; else filt.sel[k] = v; }
      rr(); }; });
    document.getElementById('fComp').onchange = function () { filt.comp = this.value; rr(); };
    document.getElementById('fSup').onchange = function () { filt.sup = this.value; rr(); };
    app.querySelectorAll('[data-clear]').forEach(function (b) { b.onclick = function () {
      var c = b.getAttribute('data-clear');
      if (c === 'all') filt = { alcance: 'temporada', comp: '', sup: '', temp: CUR, club: '', sel: {} };
      else if (c === 'alcance') filt.alcance = 'temporada'; else if (c === 'temp') filt.temp = CUR; else if (c.indexOf('sel:') === 0) delete filt.sel[c.slice(4)]; else filt[c] = '';
      rr(); }; });
    app.querySelectorAll('[data-dtab]').forEach(function (b) { b.onclick = function () { dataTab = b.getAttribute('data-dtab'); rr(); }; });
    app.querySelectorAll('[data-tab]').forEach(function (b) { if (b.classList.contains('tab')) b.onclick = function () { dashTab = b.getAttribute('data-tab'); rr(); }; });
    app.querySelectorAll('[data-fk]').forEach(function (el) {
      var go = function () { var k = el.getAttribute('data-fk'), v = el.getAttribute('data-fv'); if (filt.sel[k] === v) delete filt.sel[k]; else filt.sel[k] = v; rr(); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  // ================= PERFILES LOCALES: BIENVENIDA Y PORTEROS =================
  function renderBienvenida() {
    var n = 0; db.porteros.forEach(function (g) { n += g.partidos.length; });
    var card = function (id, ic, t, p, b) { return '<article class="rolc"><span class="rolc-ic">' + ic + '</span><h2>' + t + '</h2><p>' + p + '</p><button type="button" class="btn pri block" data-modo="' + id + '">' + b + '</button></article>'; };
    var h = '<h1>Analiza tus <em>goles</em></h1><p class="lead">Antes de empezar, dinos cómo vas a usar la herramienta. Puedes cambiarlo cuando quieras en «Perfil y clubes».</p>' +
      (n ? '<div class="msg">Tus ' + n + (n === 1 ? ' partido guardado se mantiene' : ' partidos guardados se mantienen') + ' tal cual, elijas lo que elijas.</div>' : '') +
      '<div class="rolg">' +
      card('portero', IC.gloves, 'Soy portero/portera', 'Apuntas los goles que encajas, ves tus patrones y eliges tus objetivos. Un solo perfil: el tuyo.', 'Empezar como portero/a') +
      card('entrenador', IC.board, 'Soy entrenador/a de porteros', 'Llevas a varios porteros. Cada uno tiene sus partidos, sus patrones y sus objetivos, y cambias de uno a otro desde la cabecera.', 'Empezar como entrenador/a') +
      '</div><p class="note">No hace falta registrarse. Todo se guarda solo en este dispositivo.</p>';
    app.innerHTML = h;
    app.querySelectorAll('[data-modo]').forEach(function (b) { b.onclick = function () {
      var m = b.getAttribute('data-modo'), next = view.next || 'partidos';
      db.modo = m;
      if (ROLES.indexOf(db.perfil.rol) >= 0 && (ROLES.indexOf(db.perfil.rol) >= 2) !== (m === 'entrenador')) db.perfil.rol = '';
      if (m === 'portero') gk().nombre = db.perfil.nombre || gk().nombre;
      else if (!gk().nombre) gk().nombre = (ROLES.indexOf(db.perfil.rol) < 2 && db.perfil.nombre) || 'Portero 1';
      save();
      if (m === 'entrenador') { history.replaceState(null, '', '#perfil'); toast('Añade a tus porteros'); }
      else history.replaceState(null, '', '#' + (next === 'bienvenida' ? 'partidos' : next));
      route();
    }; });
  }
  var editGK = null;
  function porterosCard() {
    var h = '<div class="ag-card" id="porteros"><h2>Tus porteros</h2><p class="small">Cada portero tiene sus partidos, patrones y objetivos. El activo es el que ves en la cabecera.</p>';
    db.porteros.forEach(function (g) {
      var np = g.partidos.length, ng = 0, act = g.id === gk().id; g.partidos.forEach(function (p) { ng += p.goles.length; });
      if (editGK && editGK.id === g.id) { h += gkForm(); return; }
      h += '<div class="club-row gk-row"><span class="cbadge mono" aria-hidden="true" style="width:40px;height:40px;font-size:15px;--cc:#1E3A8A">' + esc(initials(gkName(g))) + '</span><div class="cr-b"><b>' + esc(gkName(g)) + '</b><small>' + np + (np === 1 ? ' partido' : ' partidos') + ' · ' + ng + (ng === 1 ? ' gol' : ' goles') + (act ? ' · activo' : '') + '</small></div>' +
        '<div class="cr-a">' + (act ? '<span class="badge y">Activo</span>' : '<button type="button" class="btn ghost sm" data-gact="' + esc(g.id) + '">Usar como activo</button>') +
        '<button type="button" class="btn ghost sm" data-gren="' + esc(g.id) + '">Renombrar</button>' +
        (db.porteros.length > 1 ? '<button type="button" class="btn danger sm" data-gdel="' + esc(g.id) + '">Borrar</button>' : '') + '</div></div>';
    });
    if (editGK && !findGK(editGK.id)) h += gkForm();
    else if (!editGK) h += '<div class="row" style="margin-top:12px"><button type="button" class="btn sec" id="gkNew">' + IC.plus + 'Añadir portero</button><label class="btn ghost" for="fileImport" tabindex="0" id="gkImp">' + IC.up + 'Importar archivo de un portero</label></div>' +
      '<p class="note">Si tu portero usa la herramienta, puede exportar su copia y pasártela. Al importarla eliges si es un portero nuevo o uno que ya tienes.</p>';
    return h + '</div>';
  }
  function gkForm() {
    return '<div class="club-form" id="gkForm"><h2>' + (findGK(editGK.id) ? 'Renombrar portero' : 'Nuevo portero') + '</h2><label class="f" for="gkNombre">Nombre</label><input type="text" id="gkNombre" maxlength="60" value="' + esc(editGK.nombre) + '" placeholder="Ej. Iker" autocomplete="off">' +
      '<div class="row" style="margin-top:12px"><button type="button" class="btn pri" id="gkSave">Guardar</button><button type="button" class="btn ghost" id="gkCancel">Cancelar</button></div></div>';
  }
  function bindPorteros() {
    if (!isCoach()) return;
    app.querySelectorAll('[data-gact]').forEach(function (b) { b.onclick = function () { db.porteroActivo = b.getAttribute('data-gact'); save(); keepScroll(renderPerfil); toast('Portero activo: ' + gkName()); }; });
    app.querySelectorAll('[data-gren]').forEach(function (b) { b.onclick = function () { var g = findGK(b.getAttribute('data-gren')); editGK = { id: g.id, nombre: g.nombre }; keepScroll(renderPerfil); var i = document.getElementById('gkNombre'); if (i) i.focus(); }; });
    app.querySelectorAll('[data-gdel]').forEach(function (b) { b.onclick = function () {
      var g = findGK(b.getAttribute('data-gdel'));
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '¿Borrar a ' + gkName(g) + ' y sus ' + g.partidos.length + ' partidos? Pulsa otra vez'; return; }
      db.porteros = db.porteros.filter(function (x) { return x.id !== g.id; });
      db.grupos.forEach(function (gr) { gr.miembros = gr.miembros.filter(function (m) { return m !== g.id; }); });
      if (!findGK(db.porteroActivo)) db.porteroActivo = db.porteros[0].id;
      save(); keepScroll(renderPerfil); toast(gkName(g) + ' borrado');
    }; });
    var nw = document.getElementById('gkNew'); if (nw) nw.onclick = function () { editGK = { id: 'gk-' + uid(), nombre: '' }; keepScroll(renderPerfil); var i = document.getElementById('gkNombre'); if (i) i.focus(); };
    var gi = document.getElementById('gkImp'); if (gi) gi.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('fileImport').click(); } };
    if (editGK) {
      document.getElementById('gkNombre').oninput = function () { editGK.nombre = this.value; };
      document.getElementById('gkCancel').onclick = function () { editGK = null; keepScroll(renderPerfil); };
      document.getElementById('gkSave').onclick = function () {
        var nm = (editGK.nombre || '').trim(); if (!nm) { toast('Escribe el nombre del portero'); document.getElementById('gkNombre').focus(); return; }
        var g = findGK(editGK.id);
        if (g) g.nombre = nm; else { g = newGK(nm); g.id = editGK.id; db.porteros.push(g); db.porteroActivo = g.id; }
        editGK = null; save(); keepScroll(renderPerfil); toast('Portero guardado');
      };
    }
  }

  // ================= FASE 2: OBJETIVOS =================
  var RO = window.REGLAS_OBJETIVOS || { minGoles: 3, maxObjetivos: 3, partidosSeguimiento: 3, excluirLlegada: ['Penalti'], reglas: [] };
  var NSEG = RO.partidosSeguimiento || 3, MINP = Math.max(3, RO.minGoles || 3);
  var objFilt = { temp: CUR, club: '' };
  var LADO = { bi: 'izquierda', bd: 'derecha' };
  var FALTA_TX = { 'Salir': 'salir', 'Quedarme': 'quedarte', 'Blocar en vez de despejar': 'blocar en vez de despejar', 'Despejar en vez de blocar': 'despejar en vez de blocar' };
  function srcPartidos() { var demo = hasDemo(); return db.partidos.filter(function (p) { return demo ? p.demo : !p.demo; }); }
  function scopeP(temp, club) { return srcPartidos().filter(function (p) { return (temp === 'todas' || p.temporada === temp) && (!club || p.clubId === club); }); }
  function goalsOf(ps) { var a = []; ps.forEach(function (p) { p.goles.forEach(function (g) { var w = Object.assign({}, g); w._p = p; a.push(w); }); }); return a; }
  function validG(gs) { return gs.filter(function (g) { return (RO.excluirLlegada || []).indexOf(g.llegada) < 0; }); }
  function inP(p, g) { return p.valores.indexOf(g[p.campo]) >= 0; }
  function matchRule(r, G, key) {
    var p = r.patron, pool = r.tipo === 'tecnico' ? G.filter(function (g) { return g.depende !== 'Poco'; }) : G;
    if (p.agrupar) {
      if (key === undefined) { var c = {}; pool.forEach(function (g) { if (inP(p, g)) c[g[p.campo]] = (c[g[p.campo]] || 0) + 1; }); key = topKey(c); }
      return { key: key, g: key ? pool.filter(function (g) { return g[p.campo] === key; }) : [] };
    }
    var m = pool.filter(function (g) { return inP(p, g) && (!p.y || inP(p.y, g)) && (!p.o || p.o.some(function (c) { return inP(c, g); })); });
    if (p.top) { if (key === undefined) key = topKey(countBy(m, p.campo)); m = m.filter(function (g) { return g[p.campo] === key; }); }
    return { key: key === undefined ? null : key, g: m };
  }
  function ruleById(id) { return (RO.reglas || []).filter(function (r) { return r.id === id; })[0] || null; }
  function txt(z, o) {
    var top = o.key && !LADO[o.key] ? lc(String(o.key)) : '';
    var tf = ''; if (o.r.id === 'salir-quedarse') { var k = topKey(countBy(o.goles, 'decisionFalta')); if (k) tf = ' (lo que más se repite: ' + FALTA_TX[k] + ')'; }
    return String(z || '').replace(/\{x\}/g, o.x).replace(/\{n\}/g, o.n).replace(/\{lado\}/g, LADO[o.key] || '').replace(/\{topTxt\}/g, tf).replace(/\{top\}/g, top);
  }
  function mkObj(r, ps, key) {
    var all = goalsOf(ps), G = validG(all), s = matchRule(r, G, key), o = { r: r, id: r.id, key: s.key, goles: s.g, x: s.g.length, n: G.length, pct: pct(s.g.length, G.length), partidos: ps.length, ps: ps };
    o.porque = txt(r.porque, o); o.metrica = txt(r.metrica, o); return o;
  }
  function detectar(ps) {
    var all = goalsOf(ps), G = validG(all), n = G.length, out = [];
    var res = { n: n, pen: all.length - n, poco: G.filter(function (g) { return g.depende === 'Poco'; }).length, list: out };
    if (n < MINP) return res;
    (RO.reglas || []).forEach(function (r) {
      var o = mkObj(r, ps); if (!o.x || o.x < Math.max(MINP, r.min || 0) || o.pct < (r.pct || 0)) return; out.push(o);
    });
    out.sort(function (a, b) { return b.pct - a.pct || (a.r.tipo === 'comunicacion' ? -1 : 0); });
    return res;
  }
  function maxFecha(ps) { var m = ''; ps.forEach(function (p) { if (p.fecha && p.fecha > m) m = p.fecha; }); return m; }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  // Objetivo aceptado: base = partidos de su ámbito hasta la fecha de corte; seguimiento = los 3 siguientes partidos reales.
  function objState(id) { return gk().objetivos[id] || null; }
  function accepted(id) {
    var st = objState(id), r = ruleById(id); if (!st || !r) return null;
    var base = scopeP(st.temp || 'todas', st.club || '').filter(function (p) { return !p.fecha || p.fecha <= st.hasta; });
    var o = mkObj(r, base, st.key === undefined ? null : st.key);
    var seg = srcPartidos().filter(function (p) { return p.fecha && p.fecha > st.hasta && (!st.club || p.clubId === st.club); })
      .sort(function (a, b) { return a.fecha.localeCompare(b.fecha); }).slice(0, NSEG);
    var segG = validG(goalsOf(seg)), s2 = matchRule(r, segG, o.key);
    o.st = st; o.seg = seg; o.segX = s2.g.length; o.segN = segG.length; o.segGoles = s2.g;
    o.perSeg = seg.map(function (p) { return s2.g.filter(function (g) { return g._p === p; }).length; });
    return o;
  }
  function rate(x, n) { return n ? (x / n).toFixed(1).replace('.', ',') : '–'; }
  function matchLbl(p) { return (p.fecha ? fmtFecha(p.fecha).slice(0, 5) + ' · ' : '') + (p.rival || 'Rival sin nombre'); }
  function dpBadge(d) { return '<span class="dp' + (d === 'Poco' ? ' poco' : '') + '">' + esc(d ? DEP_LBL[d] : 'Sin indicar') + '</span>'; }
  function notasHTML(goles, open) {
    var verE = function (g) { return g.notaEntrenador && (isCoach() || g.notaEntrenadorCompartida); };
    var conNota = goles.filter(function (g) { return g.notaPortero || verE(g); }).length;
    var L = goles.map(function (g) { return '<li><b>' + rivalBadge(g._p.rival, 18) + esc(matchLbl(g._p)) + '</b>' + dpBadge(g.depende) + '<br>' + (g.notaPortero ? '«' + esc(g.notaPortero) + '»' : '<i class="sin">Sin nota del portero</i>') +
      (verE(g) ? '<span class="nt-e"><span class="lbl">Entrenador' + (isCoach() ? (g.notaEntrenadorCompartida ? ' · compartida' : ' · solo para ti') : '') + '</span>«' + esc(g.notaEntrenador) + '»</span>' : '') + '</li>'; }).join('');
    return '<details class="xp"' + (open ? ' open' : '') + '><summary>Notas de estos goles (' + conNota + ' de ' + goles.length + ')</summary><ul class="nt">' + L + '</ul></details>';
  }
  function stPill(st) { return !st ? '<span class="st">Sugerido</span>' : st.estado === 'ok' ? '<span class="st ok">En marcha</span>' : st.estado === 'fin' ? '<span class="st fin">Conseguido</span>' : '<span class="st">Descartado</span>'; }
  function segDots(o) {
    var d = ''; for (var i = 0; i < NSEG; i++) { var p = o.seg && o.seg[i]; d += '<span class="sd' + (p ? ' on' : '') + '" title="' + (p ? esc(matchLbl(p)) : 'Pendiente') + '">' + (p ? o.perSeg[i] : '') + '</span>'; }
    return d;
  }
  function segTxt(o) {
    if (!o.st) return '<p class="segt">Si lo aceptas, se sigue en tus próximos ' + NSEG + ' partidos.</p>';
    var k = o.seg.length;
    return '<div class="segw"><span class="sds" aria-hidden="true">' + segDots(o) + '</span><p class="segt">Seguimiento: <b>' + k + ' de ' + NSEG + '</b> partidos' + (k < NSEG ? '. Apunta los siguientes y se actualiza solo.' : '. Listo para comparar.') + '</p></div>';
  }
  function verdict(o) {
    var a = o.partidos ? o.x / o.partidos : 0, b = o.seg.length ? o.segX / o.seg.length : 0;
    if (o.seg.length < NSEG) return 'Aún faltan ' + (NSEG - o.seg.length) + ' partidos para comparar. Sigue apuntando tus goles con normalidad.';
    return b < a ? 'Va en buena dirección: de ' + rate(o.x, o.partidos) + ' a ' + rate(o.segX, o.seg.length) + ' goles de este tipo por partido. Si en el entrenamiento también lo notas, puedes marcarlo como conseguido.'
      : 'De momento se mantiene. Es normal en pocas semanas, y un gol nunca depende solo de ti. Puedes seguir con él o cambiarlo por otro objetivo.';
  }
  function objFilters(temps, clubsU) {
    return '<div class="octx"><select id="oTemp" aria-label="Temporada">' + Object.keys(temps).sort().reverse().map(function (t) { return '<option value="' + t + '"' + (objFilt.temp === t ? ' selected' : '') + '>Temporada ' + t + (t === CUR ? ' (actual)' : '') + '</option>'; }).join('') + '<option value="todas"' + (objFilt.temp === 'todas' ? ' selected' : '') + '>Todas las temporadas</option></select>' +
      '<select id="oClub" aria-label="Club"><option value="">Club: todos</option>' + Object.keys(clubsU).map(function (id) { var c = findC(id); return c ? '<option value="' + esc(id) + '"' + (objFilt.club === id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>' : ''; }).join('') + '</select></div>';
  }
  function objCard(o, i) {
    var st = o.st || null, com = o.r.tipo === 'comunicacion';
    var acts = !st ? '<button type="button" class="btn pri" data-oa="ok" data-id="' + o.id + '">Aceptar</button><a class="btn ghost" href="#objetivo-' + o.id + '">Ver detalle</a><button type="button" class="lnk" data-oa="des" data-id="' + o.id + '">Descartar</button>'
      : '<a class="btn pri" href="#objetivo-' + o.id + '">Ver progreso</a><button type="button" class="btn ghost" data-oa="fin" data-id="' + o.id + '"' + (o.seg.length < NSEG ? ' disabled title="Disponible tras ' + NSEG + ' partidos de seguimiento"' : '') + '>Conseguido</button>';
    return '<article class="ocard' + (com ? ' com' : '') + '"><div class="pr"><span class="prio">' + (st ? 'En marcha' : 'Prioridad ' + i) + '</span>' + stPill(st) + '</div>' +
      '<h2>' + esc(o.r.titulo) + '</h2><p class="area">' + esc(o.r.area) + '</p>' +
      '<div class="why"><b>' + o.x + '<small> de ' + o.n + '</small></b><span>' + esc(o.porque) + '</span></div>' +
      '<div class="onotes">' + notasHTML(o.goles) + '</div>' +
      '<div class="omet"><p class="lbl">Cómo lo medimos</p><p class="met">' + esc(o.metrica) + '</p></div>' +
      segTxt(o) + '<div class="acts">' + acts + '</div></article>';
  }
  function renderObjetivos() {
    var srcAll = srcPartidos(), temps = {}; temps[CUR] = 1; var clubsU = {};
    srcAll.forEach(function (p) { temps[p.temporada] = 1; clubsU[p.clubId] = 1; });
    var ps = scopeP(objFilt.temp, objFilt.club), D = detectar(ps), ob = gk().objetivos;
    var acc = Object.keys(ob).filter(function (k) { return ob[k] && ob[k].estado === 'ok' && ruleById(k); }).map(accepted).filter(Boolean);
    var fin = Object.keys(ob).filter(function (k) { return ob[k] && ob[k].estado === 'fin' && ruleById(k); });
    var des = Object.keys(ob).filter(function (k) { return ob[k] && ob[k].estado === 'des'; });
    var sug = D.list.filter(function (o) { return !ob[o.id]; }).slice(0, Math.max(0, (RO.maxObjetivos || 3) - acc.length));
    var quien = isCoach() ? esc(gkName()) : '';
    var h = toolHead('objetivos') + '<div class="ohead"><div><h1>' + (isCoach() ? 'Objetivos de <em>' + quien + '</em>' : 'Tus <em>objetivos</em>') + '</h1>' +
      '<p class="lead">Sugerencias para las próximas semanas a partir de lo que más se repite y de tus notas. Tú decides cuáles trabajar.</p>' +
      '<p class="ctxinfo">' + D.n + (D.n === 1 ? ' gol analizado' : ' goles analizados') + (D.pen ? ' · ' + D.pen + (D.pen === 1 ? ' penalti no cuenta' : ' penaltis no cuentan') : '') + (D.poco ? ' · ' + D.poco + ' marcados «Poco» solo cuentan para la comunicación con la defensa' : '') + '</p></div>' + objFilters(temps, clubsU) + '</div>';
    if (hasDemo()) h += '<div class="demo-banner">DATOS DE EJEMPLO · no son tus partidos reales <button class="btn danger sm" type="button" id="borrarDemo">Borrar ejemplo</button></div>';
    var cards = acc.concat(sug);
    if (!cards.length) {
      h += D.n < MINP ? '<div class="ag-card empty omsg"><b>Aún no hay objetivos.</b> ' + (isCoach() ? quien + ' lleva ' : 'Llevas ') + D.n + (D.n === 1 ? ' gol analizado' : ' goles analizados') + ' (sin contar penaltis). Hacen falta al menos ' + MINP + ' para ver un patrón. Sigue apuntando los partidos y aquí aparecerán sugerencias.</div>'
        : '<div class="ag-card empty omsg"><b>Nada se repite lo suficiente.</b> Con ' + D.n + ' goles analizados no hay ningún patrón de al menos ' + MINP + ' goles que proponer como objetivo. Sigue apuntando y vuelve a mirar en unas semanas.</div>';
    } else h += '<div class="ogrid">' + cards.map(function (o, i) { return objCard(o, i + 1 - acc.length); }).join('') + '</div>';
    h += '<p class="note onote">Son sugerencias, no un examen: un gol nunca depende solo del portero.' + (des.length ? ' ' + des.length + (des.length === 1 ? ' descartado' : ' descartados') + ' · <button type="button" class="lnk" id="oRest">Recuperar</button>' : '') + '</p>';
    if (fin.length) h += '<div class="ag-card ofin"><h2>Conseguidos</h2>' + fin.map(function (k) { var r = ruleById(k); return '<div class="club-row"><div class="cr-b"><b>' + esc(r.titulo) + '</b><small>' + esc(r.area) + (ob[k].finFecha ? ' · ' + fmtFecha(ob[k].finFecha) : '') + '</small></div><div class="cr-a"><a class="btn ghost sm" href="#objetivo-' + k + '">Ver</a></div></div>'; }).join('') + '</div>';
    app.innerHTML = h;
    bindHead(); bindDemo(); bindObj();
    document.getElementById('oTemp').onchange = function () { objFilt.temp = this.value; keepScroll(renderObjetivos); };
    document.getElementById('oClub').onchange = function () { objFilt.club = this.value; keepScroll(renderObjetivos); };
    var rs = document.getElementById('oRest'); if (rs) rs.onclick = function () { des.forEach(function (k) { delete ob[k]; }); save(); keepScroll(renderObjetivos); toast('Objetivos recuperados'); };
  }
  function setObj(id, a) {
    var ob = gk().objetivos;
    if (a === 'ok') {
      var cur = ob[id];
      if (cur && cur.hasta) cur.estado = 'ok';
      else { var o = mkObj(ruleById(id), scopeP(objFilt.temp, objFilt.club)), ps = scopeP(objFilt.temp, objFilt.club);
        ob[id] = { estado: 'ok', key: o.key, temp: objFilt.temp, club: objFilt.club, hasta: maxFecha(ps) || hoy(), aceptado: hoy(), demo: hasDemo() || undefined }; }
      toast('Objetivo aceptado. Se sigue en tus próximos ' + NSEG + ' partidos.');
    } else if (a === 'fin') { ob[id].estado = 'fin'; ob[id].finFecha = hoy(); toast('Objetivo conseguido'); }
    else if (a === 'des') { ob[id] = Object.assign(ob[id] || {}, { estado: 'des', demo: hasDemo() || undefined }); toast('Objetivo descartado. Puedes recuperarlo.'); }
    else if (a === 'quitar' || a === 'rec') { delete ob[id]; toast(a === 'rec' ? 'Objetivo recuperado' : 'Has dejado de seguir este objetivo'); }
    save();
  }
  function bindObj() {
    app.querySelectorAll('[data-oa]').forEach(function (b) { b.onclick = function () {
      var a = b.getAttribute('data-oa'), id = b.getAttribute('data-id');
      if (a === 'quitar' && b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Pulsa otra vez para dejarlo'; return; }
      setObj(id, a);
      if (view.name === 'objetivo' && (a === 'des' || a === 'quitar')) go('objetivos', { replace: true }); else keepScroll(render);
    }; });
    app.querySelectorAll('a[href^="#objetivo"]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); var h = a.getAttribute('href').slice(1); if (h === 'objetivos') go('objetivos'); else go('objetivo', { id: h.slice(9) }); }; });
  }
  var PAT_SEL = { 'comunicacion-defensa': function () { return { depende: 'Poco' }; }, 'caida-baja': function (k) { return { porteria: k }; }, 'aereo-parado': function () { return { remate: 'Cabeza' }; },
    'salir-quedarse': function () { return { decision: 'Mejorable' }; }, 'colocacion': function (k) { return { posicion: k }; }, 'blocaje': function () { return { tecnica: 'Con error' }; }, 'pies': function () { return { llegada: SALIDA }; } };
  function renderObjetivo(id) {
    var r = ruleById(id); if (!r) { go('objetivos', { replace: true }); return; }
    var st = objState(id), o;
    if (st && st.hasta) o = accepted(id);
    else { var ps = scopeP(objFilt.temp, objFilt.club), D = detectar(ps); o = D.list.filter(function (x) { return x.id === id; })[0]; if (!o) { go('objetivos', { replace: true }); return; } o.st = st && st.estado === 'des' ? st : null; }
    var com = r.tipo === 'comunicacion', s = o.st;
    var gr = '';
    if (r.patron.agrupar) {
      var c = countBy(validG(goalsOf(o.ps)).filter(function (g) { return g.depende !== 'Poco'; }), 'porteria');
      gr = '<div class="pgrid" aria-label="Por dónde entraron los goles">' + ['ai', 'ac', 'ad', 'mi', 'mc', 'md', 'bi', 'bc', 'bd'].map(function (k) { var v = c[k] || 0; return '<div class="' + (k === o.key ? 'on' : v ? 'v' : '') + '" title="' + PORTERIA[k] + '">' + (v || '') + '</div>'; }).join('') + '</div><p class="leg">Por dónde entraron, vista de frente a la portería. Sin penaltis ni goles «Poco».</p>';
    }
    var comTx = com ? '<p class="met">La marca depende de los defensas. Lo que sí está en tu mano es organizar, avisar y ordenar a tu defensa antes de que llegue el balón.</p>' : '<p class="met">Solo cuentan los goles en los que marcaste que dependía de ti mucho o en parte, o en los que no lo indicaste.</p>';
    var ambito = s ? ((s.temp === 'todas' ? 'todas las temporadas' : 'temporada ' + s.temp) + (s.club && findC(s.club) ? ' · ' + findC(s.club).nombre : '') + ' · hasta el ' + fmtFecha(s.hasta)) : (objFilt.temp === 'todas' ? 'todas las temporadas' : 'temporada ' + objFilt.temp);
    var col1 = '<section class="ocol' + (com ? ' com' : '') + '"><p class="lbl">Por qué</p><div class="why"><b>' + o.x + '<small> de ' + o.n + '</small></b><span>' + esc(o.porque) + '</span></div>' + gr + comTx +
      '<div class="acts"><button type="button" class="btn ghost" id="oPat">' + IC.chart + 'Ver estos goles en Patrones</button></div></section>';
    var col2 = '<section class="ocol"><p class="lbl">Tus notas de estos goles</p><p class="leg">Léelas para decidir si el objetivo tiene sentido. Un gol nunca depende solo del portero.</p>' + notasHTML(o.goles, true) + '</section>';
    var seg = '';
    if (s && s.estado !== 'des') {
      var a = o.partidos ? o.x / o.partidos : 0, b = o.seg.length ? o.segX / o.seg.length : 0, mx = Math.max(a, b, 0.01);
      seg = '<p class="lbl">Seguimiento · próximos ' + NSEG + ' partidos</p><ol class="segl">' + (function () { var L = ''; for (var i = 0; i < NSEG; i++) { var p = o.seg[i]; L += '<li class="' + (p ? 'on' : '') + '"><span>' + (p ? esc(matchLbl(p)) : 'Pendiente') + '</span><b>' + (p ? o.perSeg[i] + (o.perSeg[i] === 1 ? ' gol' : ' goles') : '') + '</b></li>'; } return L; })() + '</ol>' +
        (o.seg.length ? '<div class="ba"><span>Antes</span><span class="bt"><i style="width:' + Math.round(a * 100 / mx) + '%"></i></span><b>' + rate(o.x, o.partidos) + '</b></div><div class="ba"><span>Después</span><span class="bt"><i class="y" style="width:' + Math.round(b * 100 / mx) + '%"></i></span><b>' + rate(o.segX, o.seg.length) + '</b></div><p class="leg">Goles de este tipo por partido.</p>' : '') +
        '<p class="met">' + esc(verdict(o)) + '</p>';
    } else seg = '<p class="met">Si lo aceptas, se compara con tus próximos ' + NSEG + ' partidos reales: los que apuntes con fecha posterior al último partido de ahora.</p>';
    var acts = !s ? '<button type="button" class="btn pri" data-oa="ok" data-id="' + id + '">Aceptar</button><button type="button" class="lnk" data-oa="des" data-id="' + id + '">Descartar</button>'
      : s.estado === 'des' ? '<button type="button" class="btn pri" data-oa="rec" data-id="' + id + '">Recuperar</button>'
      : s.estado === 'ok' ? '<button type="button" class="btn pri" data-oa="fin" data-id="' + id + '"' + (o.seg.length < NSEG ? ' disabled title="Disponible tras ' + NSEG + ' partidos de seguimiento"' : '') + '>Conseguido</button><button type="button" class="lnk" data-oa="quitar" data-id="' + id + '">Dejar de seguir</button>'
      : '<button type="button" class="btn pri" data-oa="ok" data-id="' + id + '">Volver a en marcha</button>';
    var col3 = '<section class="ocol"><p class="lbl">Cómo lo medimos</p><p class="met">' + esc(o.metrica) + '</p><div class="big"><b>' + rate(o.x, o.partidos) + '</b><span class="leg">por partido · punto de partida (' + o.x + ' en ' + o.partidos + (o.partidos === 1 ? ' partido' : ' partidos') + ')</span></div>' + seg + '<div class="acts">' + acts + '</div></section>';
    var h = toolHead('objetivos') + '<button class="back" id="oBack" type="button">‹ Objetivos</button><div class="ohead"><div><h1>' + esc(r.titulo) + '</h1><p class="lead">' + esc(r.area) + ' · ' + stPill(s && s.estado !== 'des' ? s : null).replace('Sugerido', s ? 'Descartado' : 'Sugerido') + '</p><p class="ctxinfo">' + (isCoach() ? esc(gkName()) + ' · ' : '') + o.n + ' goles analizados · ' + esc(ambito) + '</p></div></div>' +
      '<div class="odet">' + col1 + col2 + col3 + '</div>';
    app.innerHTML = h;
    bindHead(); bindObj();
    document.getElementById('oBack').onclick = function () { go('objetivos'); };
    document.getElementById('oPat').onclick = function () {
      filt = { alcance: 'temporada', comp: '', sup: '', temp: s ? s.temp : objFilt.temp, club: s ? s.club : objFilt.club, sel: (PAT_SEL[id] || function () { return {}; })(o.key) };
      Object.keys(filt.sel).forEach(function (k) { if (!filt.sel[k]) delete filt.sel[k]; });
      dashTab = 'datos'; dataTab = id === 'caida-baja' ? 'jugada' : 'actuacion'; go('patrones');
    };
  }


  // ================= FASE 3: VISTA DEL ENTRENADOR =================
  // Grupos: uno por club y temporada. Los de temporadas pasadas son de solo consulta (se pueden reabrir para corregir).
  // Principio: ayudar al portero a mejorar, nunca señalarlo. Un gol es del equipo entero.
  var cvVista = 'porteria', cvOff = {};
  function grupoAct() { var g = db.grupos.filter(function (x) { return x.id === db.grupoActivo; })[0]; if (!g && db.grupos.length) { g = grupoOrden()[0]; db.grupoActivo = g.id; } return g || null; }
  function grupoOrden() { return db.grupos.slice().sort(function (a, b) { return b.temporada.localeCompare(a.temporada) || a.nombre.localeCompare(b.nombre); }); }
  function tempLbl(t) { return t.slice(0, 4) + '/' + t.slice(5); }
  function grupoPasado(g) { return g.temporada < CUR; }
  function soloLectura(g) { return grupoPasado(g) && !g.reabierto; }
  function autoNombre(clubId, temp) { var c = findC(clubId); return (c ? c.nombre : 'Club') + ' · ' + tempLbl(temp); }
  function gPart(k, g) { return k.partidos.filter(function (p) { return p.clubId === g.clubId && p.temporada === g.temporada; }).sort(function (a, b) { return (a.fecha || '').localeCompare(b.fecha || ''); }); }
  function gGoles(ps) { var a = []; ps.forEach(function (p) { p.goles.forEach(function (x) { var w = Object.assign({}, x); w._p = p; a.push(w); }); }); return a; }
  function sinPen(G) { return G.filter(function (x) { return (RO.excluirLlegada || []).indexOf(x.llegada) < 0; }); }
  function miembros(g) { return db.porteros.filter(function (k) { return g.miembros.indexOf(k.id) >= 0; }); }
  function visiblesG(g) { return miembros(g).filter(function (k) { return !cvOff[k.id]; }); }
  function conGK(id, fn) { var prev = db.porteroActivo; db.porteroActivo = id; try { return fn(); } finally { db.porteroActivo = prev; } }
  var PTX = { ai: 'arriba a la izquierda', ac: 'arriba por el centro', ad: 'arriba a la derecha', mi: 'a media altura a la izquierda', mc: 'a media altura por el centro', md: 'a media altura a la derecha', bi: 'abajo a la izquierda', bc: 'abajo por el centro', bd: 'abajo a la derecha' };
  var BPARADO = ['Córner', 'Centro lateral', 'Falta'];
  function nPor(k) { return k === 1 ? '1 portero' : k + ' porteros'; }
  function patronPrincipal(G) {
    var g = sinPen(G), n = g.length; if (n < MINP) return null;
    var cand = [], c = countBy(g, 'porteria'), l = countBy(g, 'llegada');
    Object.keys(c).forEach(function (k) { cand.push({ x: c[k], t: c[k] + ' de ' + n + ' goles entraron ' + PTX[k] }); });
    Object.keys(l).forEach(function (k) { cand.push({ x: l[k], t: l[k] + ' de ' + n + ' goles llegaron ' + (DE[k] || 'de ' + lc(k)) }); });
    var hb = g.filter(function (x) { return BPARADO.indexOf(x.llegada) >= 0 && x.remate === 'Cabeza'; }).length;
    if (hb) cand.push({ x: hb + 0.5, t: hb + ' de ' + n + ' goles fueron de cabeza tras córner, centro o falta' });
    cand = cand.filter(function (o) { return o.t; }).sort(function (a, b) { return b.x - a.x; });
    return cand.length && cand[0].x >= 2 ? cand[0].t : null;
  }
  function objActivo(k) {
    var ob = k.objetivos || {}, id = Object.keys(ob).filter(function (i) { return ob[i] && ob[i].estado === 'ok' && ruleById(i); })[0];
    return id ? conGK(k.id, function () { return accepted(id); }) : null;
  }
  // ---- patrones del grupo ----
  var GRUPO_PAT = [
    { id: 'aereo', tag: 'Balón parado', min: 2,
      test: function (G) { return G.filter(function (x) { return BPARADO.indexOf(x.llegada) >= 0 && x.remate === 'Cabeza'; }).length; },
      titulo: function (k) { return 'En ' + nPor(k) + ' se repiten los remates de cabeza a balón parado'; },
      exp: 'Aparece en varios porteros a la vez, con partidos distintos. Cuando pasa eso suele haber algo del sistema defensivo detrás: marcas, primer palo o quién ataca el balón.',
      foco: 'Comunicación con la defensa: una sesión conjunta de balón parado con los porteros y la línea defensiva, con las mismas palabras clave para todos.' },
    { id: 'poco', tag: 'Marca y defensa', min: 2,
      test: function (G) { return G.filter(function (x) { return x.depende === 'Poco'; }).length; },
      titulo: function (k) { return 'En ' + nPor(k) + ' hay goles marcados «Poco»: dependían de la marca'; },
      exp: 'Lo dicen ellos mismos con «¿Cuánto dependía de ti?». Estos goles no cuentan para sus objetivos técnicos, pero dicen mucho del trabajo de equipo.',
      foco: 'Revisar estos goles y sus notas con el entrenador del equipo.' },
    { id: 'segunda', tag: 'Momento del partido', min: 2,
      test: function (G) { var s = G.filter(function (x) { return x.parte === '2.ª parte'; }).length; return G.length >= MINP && s / G.length >= 0.6 ? s : 0; },
      titulo: function (k) { return 'En ' + nPor(k) + ' la mayoría de goles llegan en la segunda parte'; },
      exp: 'Puede tener que ver con el cansancio, los cambios o la concentración del equipo al final.',
      foco: 'Activación en el descanso y una rutina de concentración para los últimos minutos, para todo el grupo.' },
    { id: 'abajo', tag: 'Portería', min: 3,
      test: function (G) { return G.filter(function (x) { return x.porteria === 'bi' || x.porteria === 'bd'; }).length; },
      titulo: function (k) { return 'En ' + nPor(k) + ' se repite el balón raso a un palo'; },
      exp: 'Es un gesto que se trabaja bien en grupo, cada uno a su ritmo.',
      foco: 'Un bloque común de caída lateral baja al principio de las sesiones.' },
    { id: 'transicion', tag: 'Transiciones', min: 2,
      test: function (G) { return G.filter(function (x) { return x.llegada === SALIDA || x.llegada === 'Contraataque'; }).length; },
      titulo: function (k) { return 'En ' + nPor(k) + ' aparecen goles tras pérdidas o contraataques'; },
      exp: 'Las transiciones rápidas son sobre todo cosa del equipo: repliegue, vigilancias y apoyos.',
      foco: 'Trabajar con el equipo la salida de balón y el repliegue tras pérdida.' }
  ];
  function objG(g) { return db.objetivosGrupo[g.id] || (db.objetivosGrupo[g.id] = {}); }
  function patronesGrupo(g, ks) {
    var out = [];
    if (ks.length < 2) return out;
    GRUPO_PAT.forEach(function (d) {
      var who = ks.map(function (k) { var G = sinPen(gGoles(gPart(k, g))); return { k: k, x: d.test(G), n: G.length }; }).filter(function (w) { return w.x >= d.min; });
      if (who.length >= 2 || (objG(g)[d.id] && objG(g)[d.id].estado)) out.push({ d: d, who: who });
    });
    return out.filter(function (o) { return o.who.length >= 1; }).sort(function (a, b) { return b.who.length - a.who.length; });
  }
  function segGrupo(g, o, st) {
    return o.who.map(function (w) { var n = gPart(w.k, g).filter(function (p) { return p.fecha && p.fecha > st.desde; }).length; return { k: w.k, h: Math.min(n, NSEG) }; });
  }
  // ---- dibujos de la comparativa (porcentaje sobre los goles de cada portero) ----
  function cvGoal(G) {
    var n = G.length, c = countBy(G, 'porteria'), mx = Math.max.apply(null, [1].concat(Object.keys(c).map(function (k) { return c[k]; })));
    var h = '<svg class="cvsvg" viewBox="0 0 300 130" role="img" aria-label="Portería: por dónde entraron, en porcentaje"><rect x="4" y="4" width="292" height="122" fill="none" stroke="#fff" stroke-width="5"/>';
    ['a', 'm', 'b'].forEach(function (f, r) { ['i', 'c', 'd'].forEach(function (k, col) {
      var id = f + k, v = c[id] || 0, x = 10 + col * 94, y = 10 + r * 38, op = v ? 0.15 + 0.8 * v / mx : 0;
      h += '<rect x="' + x + '" y="' + y + '" width="90" height="34" rx="4" fill="#F5C518" fill-opacity="' + op.toFixed(2) + '" stroke="#ffffff30"><title>' + PORTERIA[id] + ': ' + v + '</title></rect><text x="' + (x + 45) + '" y="' + (y + 22) + '" text-anchor="middle"' + (op > 0.55 ? ' class="d"' : '') + '>' + (v ? pct(v, n) + ' %' : '·') + '</text>';
    }); });
    return h + '</svg>';
  }
  function cvPitch(G) {
    var n = G.length, c = countBy(G, 'zona'), mx = Math.max.apply(null, [1].concat(Object.keys(c).map(function (k) { return c[k]; })));
    var Z = [['fi', 'polygon', 'points="0,10 60,10 60,120 113,120 113,200 0,200"', 40, 165], ['fc', 'rect', 'x="113" y="120" width="114" height="80"', 170, 165], ['fd', 'polygon', 'points="340,10 280,10 280,120 227,120 227,200 340,200"', 300, 165],
      ['ai', 'rect', 'x="60" y="50" width="70" height="70"', 95, 90], ['ac', 'rect', 'x="130" y="50" width="80" height="70"', 170, 90], ['ad', 'rect', 'x="210" y="50" width="70" height="70"', 245, 90], ['pe', 'rect', 'x="60" y="10" width="220" height="40"', 170, 36]];
    var h = '<svg class="cvsvg" viewBox="0 0 340 205" role="img" aria-label="Campo: desde dónde se remató, en porcentaje">';
    Z.forEach(function (a) { var v = c[a[0]] || 0, op = v ? 0.15 + 0.8 * v / mx : 0.04;
      h += '<' + a[1] + ' ' + a[2] + ' fill="#F5C518" fill-opacity="' + op.toFixed(2) + '" stroke="#ffffff66" stroke-width="2"><title>' + ZONAS[a[0]] + ': ' + v + '</title></' + a[1] + '><text x="' + a[3] + '" y="' + a[4] + '" text-anchor="middle"' + (op > 0.55 ? ' class="d"' : '') + '>' + (v ? pct(v, n) + ' %' : '·') + '</text>'; });
    return h + '</svg>';
  }
  function cvBars(G) {
    var n = G.length, c = countBy(G, 'llegada');
    return '<div class="cvbars">' + OPT.llegada.filter(function (k) { return c[k]; }).sort(function (a, b) { return c[b] - c[a]; }).map(function (k) { var v = pct(c[k], n); return '<div class="cvbar"><span>' + esc(k) + '</span><b>' + v + ' %</b><span class="tr"><i style="width:' + v + '%"></i></span></div>'; }).join('') + '</div>';
  }
  function dots(h) { var d = ''; for (var i = 0; i < NSEG; i++) d += '<i class="' + (i < h ? 'on' : '') + '"></i>'; return '<span class="cvdots" aria-hidden="true">' + d + '</span>'; }
  // ---- render ----
  function renderEntrenador() {
    if (!isCoach()) { go('lista', { replace: true }); return; }
    var g = grupoAct(), h = toolHead('entrenador');
    h += '<div class="ohead"><div><h1>Vista del <em>entrenador</em></h1><p class="lead">Todos tus porteros del grupo en una pantalla: qué se repite en cada uno, qué comparten y en qué punto va cada objetivo. No es una clasificación: sirve para ayudar a cada portero a mejorar. Se puede perder 5-0 con una gran actuación bajo palos.</p></div></div>';
    var opts = grupoOrden().map(function (x) { return '<option value="' + esc(x.id) + '"' + (g && x.id === g.id ? ' selected' : '') + '>' + esc(x.nombre) + (grupoPasado(x) ? ' (historial)' : '') + '</option>'; }).join('');
    h += '<div class="cvbar-top"><label class="cvsel"><span>Grupo</span><select id="cvGrupo"' + (g ? '' : ' disabled') + '>' + (opts || '<option>Aún no tienes grupos</option>') + '</select></label>' +
      '<div class="cvacts"><button type="button" class="btn pri sm" id="cvNuevo">' + IC.plus + 'Nuevo grupo</button>' + (g && !soloLectura(g) ? '<button type="button" class="btn ghost sm" id="cvEditar">Editar grupo</button>' : '') + '</div>' +
      '<details class="cvshare"><summary>Cómo compartir</summary><p>Un grupo es el entrenador de porteros y sus porteros en un club y una temporada. Cada uno apunta sus goles y su nota, y el grupo comparte los datos.</p><p><b>Ahora, sin cuentas:</b> el portero pulsa «Exportar» en su móvil y te pasa el archivo; tú lo importas con «Importar». Se añaden sus partidos nuevos sin duplicar los que ya tienes. Nada pasa por internet.</p><p><b>Más adelante, con cuentas:</b> se sincronizará solo entre los miembros del grupo.</p></details></div>';
    if (!g) {
      h += '<div class="ag-card empty cvempty"><b>Crea tu primer grupo.</b> Elige un club y una temporada y marca qué porteros entrenas allí. Un portero puede estar en varios grupos a lo largo del tiempo.<div class="row"><button type="button" class="btn pri" id="cvNuevo2">' + IC.plus + 'Crear grupo</button><button type="button" class="btn ghost" id="cvDemo">Ver un ejemplo</button></div></div>';
      app.innerHTML = h; bindHead(); bindEnt(null); return;
    }
    var club = findC(g.clubId), ks = miembros(g), vis = visiblesG(g), ro = soloLectura(g);
    if (g.demo) h += '<div class="demo-banner">DATOS DE EJEMPLO · porteros y grupos inventados <button class="btn danger sm" type="button" id="cvBorrarDemo">Borrar ejemplo</button></div>';
    h += '<div class="cvgrupo">' + clubBadge(club, 48) + '<div class="cvg-b"><p class="lbl">Grupo seleccionado' + (grupoPasado(g) ? ' <span class="badge">Historial · temporada pasada</span>' : '') + '</p><h2>' + esc(g.nombre) + '</h2><div class="cvmem"><span class="mem coach">' + esc(db.perfil.nombre || 'Tú') + ' · entrenador/a de porteros</span>' + ks.map(function (k) { return '<button type="button" class="mem" data-cvoff="' + esc(k.id) + '" aria-pressed="' + !cvOff[k.id] + '" title="Mostrar u ocultar en esta vista">' + esc(gkName(k)) + '</button>'; }).join('') + '</div></div></div>';
    if (grupoPasado(g)) h += ro ? '<div class="msg cvro"><span><b>Solo consulta.</b> Es un grupo de una temporada pasada y se guarda como historial.</span><button type="button" class="btn ghost sm" id="cvReabrir">Reabrir para corregir</button></div>'
      : '<div class="msg cvro open"><span><b>Reabierto para corregir.</b> Puedes editar el grupo y sus objetivos.</span><button type="button" class="btn ghost sm" id="cvCerrar">Volver a cerrar</button></div>';
    // tarjetas
    h += '<h2 class="cvh">Tus porteros</h2>';
    if (!ks.length) h += '<div class="ag-card empty">Este grupo aún no tiene porteros. ' + (ro ? '' : 'Añádelos con «Editar grupo».') + '</div>';
    else if (!vis.length) h += '<div class="ag-card empty">Has ocultado a todos los porteros. Pulsa sus nombres arriba para verlos.</div>';
    else h += '<div class="cvcards">' + vis.map(function (k) {
      var ps = gPart(k, g), G = gGoles(ps), gc = G.length, cero = ps.filter(function (p) { return !p.goles.length; }).length, poco = G.filter(function (x) { return x.depende === 'Poco'; }).length;
      var pat = patronPrincipal(G), o = objActivo(k);
      return '<article class="cvcard"><div class="cvc-h">' + clubBadge(club, 46) + '<div><h3>' + esc(gkName(k)) + '</h3><small>' + esc(club ? club.nombre : '') + '</small></div></div>' +
        '<p class="cvseason">Temporada ' + tempLbl(g.temporada) + '</p>' +
        '<div class="cvstats"><div><b>' + ps.length + '</b><span>partidos</span></div><div><b>' + gc + '</b><span>goles en contra</span></div><div><b>' + rate(gc, ps.length) + '</b><span>goles por partido</span></div><div><b>' + cero + '</b><span>porterías a cero</span></div></div>' +
        '<p class="cvctx">Los goles en contra son del equipo entero: hay 10 jugadores más y no todos son parables.' + (gc ? ' <b>' + poco + ' de ' + gc + '</b> marcados «Poco».' : '') + '</p>' +
        '<div class="cvpat"><p class="lbl">Lo que más se repite</p>' + (pat ? '<p class="t">' + esc(pat) + '</p>' : '<p class="sin">Aún hay pocos goles para ver un patrón. Con ' + MINP + ' o más empezará a aparecer.</p>') + '</div>' +
        '<div class="cvobj"><p class="lbl">Objetivo en marcha</p>' + (o ? '<p class="t">' + esc(o.r.titulo) + '</p><p class="area">' + esc(o.r.area) + '</p><p class="cvprog">' + dots(o.seg.length) + o.seg.length + '/' + NSEG + (o.seg.length >= NSEG ? ' partidos · listo para revisar' : ' partidos de seguimiento') + '</p>' : '<p class="sin">Sin objetivo en marcha. Podéis elegir uno juntos en su pestaña Objetivos.</p>') + '</div>' +
        '<div class="cvc-a"><button type="button" class="btn pri block" data-cvopen="' + esc(k.id) + '">Abrir su panel</button></div></article>';
    }).join('') + '</div>';
    // comparativa
    h += '<h2 class="cvh">Dónde entran los goles</h2><p class="small cvsub">Porcentaje sobre los goles de cada portero, así se ve el reparto aunque cada uno haya jugado un número distinto de partidos. Izquierda y derecha vistas de frente, mirando hacia la portería.</p>' +
      '<div class="seg2 cvseg" role="group" aria-label="Qué comparar">' + [['porteria', 'Por dónde entró'], ['zona', 'Desde dónde se remató'], ['llegada', 'Cómo llegó']].map(function (v) { return '<button type="button" data-cvv="' + v[0] + '" aria-pressed="' + (cvVista === v[0]) + '">' + v[1] + '</button>'; }).join('') + '</div>';
    h += vis.length ? '<div class="cvheat">' + vis.map(function (k) {
      var G = gGoles(gPart(k, g)), body = !G.length ? '<p class="sin">Sin goles en contra en este grupo.</p>' : cvVista === 'porteria' ? cvGoal(G) : cvVista === 'zona' ? cvPitch(G) : cvBars(G);
      return '<div class="cvhcol"><div><h3>' + esc(gkName(k)) + '</h3><small>' + G.length + (G.length === 1 ? ' gol' : ' goles') + (G.length && G.length < MINP ? ' · muestra pequeña, tenlo en cuenta' : '') + '</small></div>' + body + '<p class="note">' + (cvVista === 'llegada' ? 'Incluye penaltis.' : 'Más intenso: más goles en esa zona para este portero.') + '</p></div>';
    }).join('') + '</div>' : '';
    // patrones del grupo
    var PG = patronesGrupo(g, vis), og = objG(g);
    h += '<h2 class="cvh">Patrones del grupo</h2><p class="small cvsub">Lo que se repite en dos o más porteros. Suele tener más que ver con el equipo que con un portero concreto, así que se plantea como trabajo de grupo. Puedes aceptarlo como objetivo de grupo y seguirlo durante ' + NSEG + ' partidos.</p>';
    if (vis.length < 2) h += '<div class="ag-card empty">Hacen falta al menos dos porteros visibles en el grupo para ver lo que comparten.</div>';
    else if (!PG.length) h += '<div class="ag-card empty">Ahora mismo no hay patrones compartidos. Cada portero tiene lo suyo: míralo en su tarjeta.</div>';
    else h += '<div class="cvcards cvpg">' + PG.map(function (o) {
      var st = og[o.d.id] || {}, est = st.estado || '', prog = '', acts = '', mn = 0, dis = ro ? ' disabled title="Grupo de solo consulta"' : '';
      if (est === 'ok' || est === 'fin') { var per = segGrupo(g, o, st); mn = per.length ? Math.min.apply(null, per.map(function (x) { return x.h; })) : 0;
        prog = '<p class="cvprog">' + dots(mn) + mn + '/' + NSEG + ' partidos · ' + per.map(function (x) { return esc(gkName(x.k)) + ' ' + x.h + '/' + NSEG; }).join(' · ') + '</p><p class="note">Cuentan los ' + NSEG + ' siguientes partidos registrados de cada portero desde el ' + fmtFecha(st.desde) + '.</p>'; }
      else prog = '<p class="note">' + (est === 'des' ? 'Descartado. Puedes recuperarlo cuando quieras.' : 'Si lo aceptas, se siguen los ' + NSEG + ' próximos partidos registrados de ' + joinY(o.who.map(function (w) { return esc(gkName(w.k)); })) + '.') + '</p>';
      if (!est) acts = '<button type="button" class="btn pri" data-cvg="' + o.d.id + '" data-a="ok"' + dis + '>Aceptar como objetivo</button><button type="button" class="btn ghost" data-cvg="' + o.d.id + '" data-a="des"' + dis + '>Descartar</button>';
      else if (est === 'ok') acts = '<button type="button" class="btn pri" data-cvg="' + o.d.id + '" data-a="fin"' + (ro ? dis : mn >= NSEG ? '' : ' disabled title="Disponible al llegar a ' + NSEG + '/' + NSEG + '"') + '>Conseguido</button><button type="button" class="btn ghost" data-cvg="' + o.d.id + '" data-a="des"' + dis + '>Descartar</button>';
      else acts = '<button type="button" class="btn ghost" data-cvg="' + o.d.id + '" data-a="' + (est === 'fin' ? 'reok' : 'rec') + '"' + dis + '>' + (est === 'fin' ? 'Volver a en marcha' : 'Recuperar') + '</button>';
      return '<article class="cvcard cvp' + (est === 'des' ? ' des' : '') + '"><div class="cvp-h"><span class="badge">' + o.d.tag + '</span>' + stPill(est ? { estado: est } : null) + '</div><h3>' + esc(o.d.titulo(o.who.length)) + '</h3><p class="cvexp">' + esc(o.d.exp) + '</p>' +
        '<div class="cvwho">' + o.who.map(function (w) { return '<span>' + esc(gkName(w.k)) + ': <b>' + w.x + '</b> de ' + w.n + '</span>'; }).join('') + '</div>' +
        '<div class="cvfoco"><p class="lbl">Objetivo de grupo</p>' + esc(o.d.foco) + '</div><div class="cvseg-p">' + prog + '</div><div class="cvc-a acts">' + acts + '</div></article>';
    }).join('') + '</div>';
    h += '<p class="note onote">Esta vista está para ayudar a mejorar, no para señalar a nadie. Un gol nunca depende solo del portero.</p>';
    app.innerHTML = h; bindHead(); bindEnt(g);
  }
  function bindEnt(g) {
    var $ = function (id) { return document.getElementById(id); };
    if ($('cvGrupo') && g) $('cvGrupo').onchange = function () { db.grupoActivo = this.value; cvOff = {}; save(); keepScroll(renderEntrenador); };
    [$('cvNuevo'), $('cvNuevo2')].forEach(function (b) { if (b) b.onclick = function () { grupoDlg(null); }; });
    if ($('cvEditar')) $('cvEditar').onclick = function () { grupoDlg(g); };
    if ($('cvDemo')) $('cvDemo').onclick = function () { loadCoachDemo(); keepScroll(renderEntrenador); toast('Ejemplo de entrenador cargado'); };
    if ($('cvBorrarDemo')) $('cvBorrarDemo').onclick = function () { borrarCoachDemo(); keepScroll(renderEntrenador); toast('Ejemplo borrado'); };
    if ($('cvReabrir')) $('cvReabrir').onclick = function () { g.reabierto = true; save(); keepScroll(renderEntrenador); toast('Grupo reabierto para corregir'); };
    if ($('cvCerrar')) $('cvCerrar').onclick = function () { g.reabierto = false; save(); keepScroll(renderEntrenador); toast('Grupo cerrado de nuevo: solo consulta'); };
    app.querySelectorAll('[data-cvoff]').forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-cvoff'); cvOff[id] = !cvOff[id]; keepScroll(renderEntrenador); }; });
    app.querySelectorAll('[data-cvv]').forEach(function (b) { b.onclick = function () { cvVista = b.getAttribute('data-cvv'); keepScroll(renderEntrenador); }; });
    app.querySelectorAll('[data-cvopen]').forEach(function (b) { b.onclick = function () {
      var k = findGK(b.getAttribute('data-cvopen')); if (!k) return;
      db.porteroActivo = k.id; save(); draftP = null; draftG = null;
      filt = { alcance: 'temporada', comp: '', sup: '', temp: g.temporada, club: g.clubId, sel: {} }; listFilt = { club: g.clubId, temp: g.temporada }; objFilt = { temp: g.temporada, club: g.clubId };
      dashTab = 'resumen'; go('patrones'); toast('Panel de ' + gkName(k));
    }; });
    app.querySelectorAll('[data-cvg]').forEach(function (b) { b.onclick = function () {
      if (!g || soloLectura(g)) return;
      var id = b.getAttribute('data-cvg'), a = b.getAttribute('data-a'), og = objG(g), st = og[id] || (og[id] = {});
      if (a === 'ok') { var m = ''; miembros(g).forEach(function (k) { gPart(k, g).forEach(function (p) { if (p.fecha && p.fecha > m) m = p.fecha; }); }); st.estado = 'ok'; st.desde = m || hoy(); toast('Objetivo de grupo en marcha. Se sigue en los próximos ' + NSEG + ' partidos de cada portero.'); }
      else if (a === 'fin') { st.estado = 'fin'; st.finFecha = hoy(); toast('Objetivo de grupo conseguido'); }
      else if (a === 'des') { st.estado = 'des'; toast('Descartado. Puedes recuperarlo.'); }
      else if (a === 'reok') { st.estado = 'ok'; }
      else if (a === 'rec') { if (st.desde) st.estado = 'ok'; else delete og[id]; toast('Recuperado'); }
      save(); keepScroll(renderEntrenador);
    }; });
  }
  function grupoDlg(g) {
    var old = document.getElementById('grpDlg'); if (old) old.remove();
    var y = +CUR.slice(0, 4), temps = [y + 1, y, y - 1, y - 2, y - 3].map(function (s) { return s + '-' + String((s + 1) % 100).padStart(2, '0'); });
    if (g && temps.indexOf(g.temporada) < 0) temps.push(g.temporada);
    var dl = document.createElement('dialog'); dl.id = 'grpDlg'; dl.className = 'ag-dlg cvdlg'; dl.setAttribute('aria-labelledby', 'grpT');
    dl.innerHTML = '<h2 id="grpT">' + (g ? 'Editar grupo' : 'Nuevo grupo') + '</h2><p>Un grupo es un club y una temporada. Los de temporadas pasadas se guardan como historial.</p>' +
      (db.clubes.filter(function (c) { return !c.demo || (g && g.demo); }).length || g ? '' : '<p class="msg">Primero añade un club en «Perfil y clubes».</p>') +
      '<div class="grid2"><div><label class="f" for="grClub">Club</label><select id="grClub">' + db.clubes.filter(function (c) { return !c.demo || (g && g.demo); }).map(function (c) { return '<option value="' + esc(c.id) + '"' + ((g ? g.clubId : db.clubActual) === c.id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="f" for="grTemp">Temporada</label><select id="grTemp">' + temps.map(function (t) { return '<option value="' + t + '"' + ((g ? g.temporada : CUR) === t ? ' selected' : '') + '>' + tempLbl(t) + '</option>'; }).join('') + '</select></div></div>' +
      '<label class="f" for="grNom">Nombre del grupo</label><input type="text" id="grNom" maxlength="80" value="' + esc(g ? g.nombre : '') + '" placeholder="Se rellena con el club y la temporada">' +
      '<p class="f">Porteros del grupo</p><div class="chips">' + db.porteros.filter(function (k) { return !k.demo || (g && g.demo); }).map(function (k) { return '<button type="button" class="chip" data-grm="' + esc(k.id) + '" aria-pressed="' + !!(g && g.miembros.indexOf(k.id) >= 0) + '">' + esc(gkName(k)) + '</button>'; }).join('') + '</div>' +
      '<p class="note">Un portero puede estar en varios grupos (por ejemplo, si cambia de club). Quitarlo de un grupo no borra sus partidos.</p>' +
      '<div class="dlg-a"><button type="button" class="btn pri" id="grOk">' + (g ? 'Guardar cambios' : 'Crear grupo') + '</button>' + (g ? '<button type="button" class="btn danger" id="grDel">Borrar grupo</button>' : '') + '<button type="button" class="lnk" id="grNo">Cancelar</button></div>';
    (document.querySelector('.ag') || document.body).appendChild(dl);
    var close = function () { dl.close(); dl.remove(); };
    dl.querySelectorAll('[data-grm]').forEach(function (b) { b.onclick = function () { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); }; });
    dl.querySelector('#grNo').onclick = close;
    dl.querySelector('#grOk').onclick = function () {
      var club = dl.querySelector('#grClub').value, t = dl.querySelector('#grTemp').value;
      if (!club) { toast('Primero añade un club en «Perfil y clubes»'); return; }
      if (db.grupos.some(function (x) { return x !== g && x.clubId === club && x.temporada === t; })) { toast('Ya tienes un grupo para ese club y esa temporada'); return; }
      var nom = dl.querySelector('#grNom').value.trim(), oldAuto = g && g.nombre === autoNombre(g.clubId, g.temporada);
      var m = Array.prototype.map.call(dl.querySelectorAll('[data-grm][aria-pressed="true"]'), function (b) { return b.getAttribute('data-grm'); });
      if (!nom || (oldAuto && nom === g.nombre)) nom = autoNombre(club, t);
      if (g) { g.clubId = club; g.temporada = t; g.nombre = nom; g.miembros = m; }
      else { g = { id: 'grp-' + uid(), nombre: nom, clubId: club, temporada: t, miembros: m, reabierto: false }; db.grupos.push(g); }
      db.grupoActivo = g.id; cvOff = {}; save(); close(); keepScroll(renderEntrenador); toast('Grupo guardado');
    };
    var del = dl.querySelector('#grDel');
    if (del) del.onclick = function () {
      if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = '¿Borrar «' + g.nombre + '»? Pulsa otra vez'; return; }
      db.grupos = db.grupos.filter(function (x) { return x !== g; }); delete db.objetivosGrupo[g.id]; db.grupoActivo = '';
      save(); close(); keepScroll(renderEntrenador); toast('Grupo borrado. Los partidos de los porteros siguen guardados.');
    };
    dl.addEventListener('cancel', function () { dl.remove(); });
    if (dl.showModal) dl.showModal(); else dl.setAttribute('open', '');
  }
  // ---- ejemplo de entrenador (porteros, partidos y grupos inventados) ----
  function loadCoachDemo() {
    borrarCoachDemo(true);
    var L = { E: 'Jugada elaborada', C: 'Contraataque', X: 'Centro lateral', K: 'Córner', F: 'Falta', P: 'Penalti', R: 'Rechace / segunda jugada', S: SALIDA };
    var RM = { D: 'Pie derecho', I: 'Pie izquierdo', H: 'Cabeza' }, PO = { B: 'Bien colocado', A: 'Adelantado' }, DP = { M: 'Mucho', E: 'En parte', P: 'Poco' };
    var CL = [{ id: 'demo-club-ib', nombre: 'Iberlanda', demo: true, logo: '', color: '#0E7C4A' }, { id: 'demo-club-ga', nombre: 'CD Galdakao', demo: true, logo: '', color: '#C8102E' }, { id: 'demo-club-ej', nombre: 'CD Ejemplo', demo: true, logo: '', color: '#B45309' }];
    CL.forEach(function (c) { if (!findC(c.id)) db.clubes.push(c); });
    var K = { iker: 'Iker', unai: 'Unai', mikel: 'Mikel', ander: 'Ander' }, gks = {};
    Object.keys(K).forEach(function (k) { var o = newGK(K[k]); o.id = 'demo-gk-' + k; o.demo = true; gks[k] = o; db.porteros.push(o); });
    var n = 0;
    function P(k, club, fecha, rival, gf, goles, notasE) {
      var id = 'demo-c' + (n++);
      gks[k].partidos.push({ id: id, demo: true, clubId: club, temporada: temporadaDe(fecha), fecha: fecha, rival: rival, lugar: '', gf: gf, gc: goles.length, superficie: 'Artificial', competicion: '2ª División Regional Bizkaia',
        goles: goles.map(function (t, j) { var a = t[0].split(' '); return { id: id + '-' + j, parte: a[0] === '1' ? '1.ª parte' : '2.ª parte', llegada: L[a[1]], zona: a[2], remate: RM[a[3]], porteria: a[4], posicion: PO[a[5]], decision: a[6] === 'M' ? 'Mejorable' : 'Correcta', depende: DP[a[7]], notaPortero: t[1] || '', notaEntrenador: (notasE || [])[j] || '', notaEntrenadorCompartida: /martes|Buen gesto/.test((notasE || [])[j] || '') }; }) });
    }
    var ib = 'demo-club-ib', ga = 'demo-club-ga', ej = 'demo-club-ej';
    P('iker', ib, '2026-09-13', 'CD San Antonio A', 0, [['2 E ai D bi B C M'], ['2 K pe H ac B C P', 'Nadie atacó el primer palo.']], ['', 'Revisar con el central quién ataca el primer palo.']);
    P('iker', ib, '2026-09-20', 'Ezkurdi KT B', 4, [['1 C ai D bi A M M', 'Salí tarde y me quedé a medias.'], ['2 E fc D mc B C E'], ['2 P pe D ad B C E']], ['Buena lectura; la línea iba muy adelantada.']);
    P('iker', ib, '2026-09-27', 'CD Ibarsusi', 1, [['1 X ac I bi B C M', 'Me caí tarde hacia mi izquierda.']]);
    P('iker', ib, '2026-10-04', 'CD Montefuerte A', 0, []);
    P('iker', ib, '2026-10-11', 'CD Galdakao B', 3, [['1 K pe H ai B C P', 'La defensa perdió su marca.'], ['2 E ad D bi A M M']], ['Marca perdida en el córner: hablarlo con el equipo.', 'Paso previo corto, lo trabajamos el martes.']);
    P('iker', ib, '2026-10-18', 'CD Orduña', 0, [['1 R pe D bc B C E'], ['2 K ac H ad B C P', 'Dos rivales solos en el segundo palo.']]);
    P('iker', ib, '2026-10-25', 'CD Ariz', 2, [['2 E ai D bi A C M']]);
    P('iker', ib, '2026-10-31', 'CD Abadiño', 1, []);
    P('iker', ga, '2026-03-07', 'CD Artibai', 1, [['1 E ai D bi B C M'], ['2 K pe H ai B C P', 'Remate en el primer palo sin marca.']]);
    P('iker', ga, '2026-03-14', 'CD Otxarkoaga', 2, [['2 C ac D bc A M M']]);
    P('iker', ga, '2026-03-21', 'Umore Ona', 0, [['1 X pe H ad B C P'], ['2 E ad D bi B C M']]);
    P('iker', ga, '2026-03-28', 'CD San Miguel', 3, []);
    P('ander', ga, '2026-03-07', 'CD Ariz', 0, [['2 K pe H ac B C P', 'Remate libre en el primer palo.'], ['1 E fc D mc B C E']]);
    P('ander', ga, '2026-03-14', 'CD Abadiño', 1, [['2 X ac H ad B C P'], ['2 S fc D bc B C M', 'Pase atrás con presión, buscaba al central.']], ['', 'Presión alta del rival: la opción larga también vale.']);
    P('ander', ga, '2026-03-21', 'CD Orduña', 2, [['2 K pe H ai B C P']]);
    P('ander', ga, '2026-03-28', 'CD Ibarsusi', 1, []);
    P('unai', ib, '2026-09-13', 'CD Ariz', 2, [['2 X pe H mc B C P', 'Centro desde la derecha, nadie saltó con él.']]);
    P('unai', ib, '2026-09-20', 'CD Artibai', 1, [['1 C ac D bd A M M', 'Salí pronto en el uno contra uno.'], ['2 K pe H ac B C P', 'Marca en zona sin nadie en el primer palo.']], ['', 'Córner con marca en zona; el remate llega libre.']);
    P('unai', ib, '2026-09-27', 'Umore Ona', 0, []);
    P('unai', ib, '2026-10-04', 'CD Otxarkoaga', 2, [['2 C ad D bd A M M'], ['2 E fc D ad B C E']]);
    P('unai', ib, '2026-10-11', 'CD San Miguel', 1, [['2 K ac H ai B C P', 'Bloqueo al defensa y remate libre.']]);
    P('unai', ib, '2026-10-18', 'CD Abadiño', 0, [['1 S fc D mi B C M', 'Pase corto con presión encima.'], ['2 C ac I bc A M M']]);
    P('unai', ib, '2026-10-25', 'CD Montefuerte A', 3, [['2 R pe D bi B C E']]);
    P('mikel', ej, '2026-09-19', 'CD Orduña', 2, []);
    P('mikel', ej, '2026-09-26', 'CD Ibarsusi', 1, [['2 K pe H ad B C P', 'Se lo dijimos al central en el descanso.']], ['Buen gesto. Gol de marca.']);
    P('mikel', ej, '2026-10-03', 'CD Galdakao C', 0, []);
    gks.iker.objetivos['caida-baja'] = { estado: 'ok', key: 'bi', temp: '2026-27', club: ib, hasta: '2026-10-11', aceptado: '2026-10-12', demo: true };
    gks.unai.objetivos['comunicacion-defensa'] = { estado: 'ok', key: null, temp: '2026-27', club: ib, hasta: '2026-10-18', aceptado: '2026-10-19', demo: true };
    db.grupos.push({ id: 'demo-grp-ib', nombre: 'Iberlanda · 2026/27', clubId: ib, temporada: '2026-27', miembros: ['demo-gk-iker', 'demo-gk-unai'], reabierto: false, demo: true },
      { id: 'demo-grp-ej', nombre: 'CD Ejemplo · 2026/27', clubId: ej, temporada: '2026-27', miembros: ['demo-gk-mikel'], reabierto: false, demo: true },
      { id: 'demo-grp-ga', nombre: 'CD Galdakao · 2025/26', clubId: ga, temporada: '2025-26', miembros: ['demo-gk-iker', 'demo-gk-ander'], reabierto: false, demo: true });
    db.objetivosGrupo['demo-grp-ib'] = { aereo: { estado: 'ok', desde: '2026-10-11' } };
    db.objetivosGrupo['demo-grp-ga'] = { aereo: { estado: 'fin', desde: '2026-03-01', finFecha: '2026-03-30' } };
    db.grupoActivo = 'demo-grp-ib'; save();
  }
  function borrarCoachDemo(silent) {
    db.porteros = db.porteros.filter(function (k) { return !k.demo; });
    if (!db.porteros.length) db.porteros.push(newGK('Portero 1'));
    if (!findGK(db.porteroActivo)) db.porteroActivo = db.porteros[0].id;
    db.grupos.filter(function (g) { return g.demo; }).forEach(function (g) { delete db.objetivosGrupo[g.id]; });
    db.grupos = db.grupos.filter(function (g) { return !g.demo; });
    var usados = {}; db.porteros.forEach(function (k) { k.partidos.forEach(function (p) { usados[p.clubId] = 1; }); });
    db.clubes = db.clubes.filter(function (c) { return !c.demo || usados[c.id]; });
    if (!findC(db.clubActual)) db.clubActual = (db.clubes[0] || {}).id || '';
    db.grupoActivo = ''; cvOff = {}; if (!silent) save();
  }
  window.AG_TEST = { db: function () { return db; }, loadCoachDemo: function () { loadCoachDemo(); render(); } };


  // ================= FASE 4: INFORME PDF (v16) =================
  // Datos reales para informe-pdf.js. Los objetivos salen de las reglas reales (accepted/verdict); nada inventado.
  function conPortero(id, fn) { var old = db.porteroActivo; db.porteroActivo = id; try { return fn(); } finally { db.porteroActivo = old; } }
  window.AG_INFORME = {
    datos: function () { return db; },
    coach: isCoach, nombre: function (k) { return gkName(k); },
    escudo: function (c) { if (!c) return null; if (c.logo) return c.logo; var cr = clubCrest(c); return cr ? crestSrc(cr) : null; },
    iniciales: function (n) { return initials(n || '?'); },
    // partidos que ve la herramienta para ese portero (ejemplo o reales, nunca mezclados)
    partidos: function (id) { return conPortero(id, function () { return srcPartidos().slice(); }); },
    objetivos: function (id) {
      return conPortero(id, function () {
        var ob = gk().objetivos || {};
        return Object.keys(ob).filter(function (k) { return ob[k] && ob[k].estado === 'ok' && ruleById(k); }).map(function (k) {
          var o = accepted(k); if (!o) return null;
          return { titulo: o.r.titulo, area: o.r.area, porque: o.porque, metrica: o.metrica, x: o.x, n: o.n, partidos: o.partidos,
            seg: o.seg.map(function (p, i) { return { fecha: p.fecha, rival: p.rival || 'Rival sin nombre', n: o.perSeg[i] }; }), nseg: NSEG, veredicto: verdict(o), comunicacion: o.r.tipo === 'comunicacion' };
        }).filter(Boolean);
      });
    },
    grupo: function (gid) {
      var g = db.grupos.filter(function (x) { return x.id === gid; })[0]; if (!g) return null;
      var ks = g.miembros.map(findGK).filter(Boolean);
      return { id: g.id, nombre: g.nombre, clubId: g.clubId, temporada: g.temporada, porteros: ks,
        partidos: function (k) { return gPart(k, g); },
        patrones: patronesGrupo(g, ks).filter(function (o) { return o.who.length >= 2; }).map(function (o) { return { titulo: o.d.titulo(o.who.length), exp: o.d.exp, foco: o.d.foco }; }) };
    }
  };
  var jspdfP = null;
  function cargarJsPDF() {
    if (window.jspdf) return Promise.resolve();
    if (!jspdfP) jspdfP = new Promise(function (ok, ko) { var sc = document.createElement('script'); sc.src = 'lib/jspdf.umd.min.js'; sc.onload = ok; sc.onerror = function () { jspdfP = null; ko(new Error('No se ha podido cargar el generador de PDF')); }; document.head.appendChild(sc); });
    return jspdfP;
  }
  function informeDlg() {
    var old = document.getElementById('pdfDlg'); if (old) old.remove();
    var coach = isCoach(), act = gk(), enEnt = view.name === 'entrenador', gr = enEnt ? grupoAct() : null;
    var src = srcPartidos(), temps = {}, clubs = {}; temps[CUR] = 1; src.forEach(function (p) { temps[p.temporada] = 1; clubs[p.clubId] = 1; });
    var tSel = temps[filt.temp] ? filt.temp : (Object.keys(temps).sort().reverse()[0] || CUR);
    var dl = document.createElement('dialog'); dl.id = 'pdfDlg'; dl.className = 'ag-dlg cvdlg pdfdlg'; dl.setAttribute('aria-labelledby', 'pdfT');
    dl.innerHTML = '<h2 id="pdfT">Descargar informe</h2><p>Un PDF con números, mapas, objetivos y partidos. Se crea en tu dispositivo: no se envía nada.</p>' +
      (coach ? '<p class="f">Portero/a</p><p class="pdfk">' + esc(gkName(act)) + '</p>' : '') +
      '<div class="grid2"><div><label class="f" for="pdClub">Club</label><select id="pdClub"><option value="">Todos</option>' + Object.keys(clubs).map(function (id) { var c = findC(id); return c ? '<option value="' + esc(id) + '"' + (filt.club === id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>' : ''; }).join('') + '</select></div>' +
      '<div><label class="f" for="pdTemp">Temporada</label><select id="pdTemp">' + Object.keys(temps).sort().reverse().map(function (t) { return '<option value="' + t + '"' + (t === tSel ? ' selected' : '') + '>' + tempLbl(t) + (t === CUR ? ' (actual)' : '') + '</option>'; }).join('') + '<option value="todas">Todas</option></select></div></div>' +
      '<p class="f">Periodo</p><div class="chips" id="pdPer"><button type="button" class="chip" data-n="0" aria-pressed="true">Temporada completa</button><button type="button" class="chip" data-n="5" aria-pressed="false">Últimos 5 partidos</button><button type="button" class="chip" data-n="10" aria-pressed="false">Últimos 10 partidos</button></div>' +
      (coach ? '<p class="f">¿Para quién es?</p><div class="pdrad"><label><input type="radio" name="pdVer" value="portero" checked><b>Informe para el portero</b><small>Sus notas y solo tus notas marcadas «Compartir con el portero».</small></label><label><input type="radio" name="pdVer" value="completo"><b>Informe completo</b><small>Todas las notas, también las que no compartes. Para ti.</small></label></div>' : '') +
      '<label class="pdchk"><input type="checkbox" id="pdNP" checked><span>Incluir las notas ' + (coach ? 'del portero' : 'que has escrito') + '<small>Los comentarios de cada gol.</small></span></label>' +
      '<p class="note">Los goles marcados «Poco» aparecen con su contexto (marca o defensa) y no cuentan para los objetivos técnicos.</p>' +
      '<div class="dlg-a"><button type="button" class="btn pri" id="pdGo">' + IC.down + 'Descargar PDF</button><button type="button" class="lnk" id="pdNo">Cancelar</button></div>' +
      (coach && gr ? '<div class="pdgrp"><h3>Grupo ' + esc(gr.nombre) + '</h3><p class="small">El resumen del grupo es una sola página. El informe de cada portero se descarga por separado, con las opciones de arriba.</p>' +
        '<button type="button" class="btn ghost sm" id="pdGrp">' + IC.down + 'Descargar resumen del grupo</button><ul class="pdlist">' +
        gr.miembros.map(findGK).filter(Boolean).map(function (k) { return '<li><span>' + esc(gkName(k)) + '</span><button type="button" class="btn ghost sm" data-pdk="' + esc(k.id) + '">Descargar informe</button></li>'; }).join('') + '</ul></div>' : '') +
      '<p class="pdmsg" id="pdMsg" role="status" aria-live="polite"></p>';
    (document.querySelector('.ag') || document.body).appendChild(dl);
    var ult = 0, msg = dl.querySelector('#pdMsg'), busy = false;
    dl.querySelectorAll('#pdPer [data-n]').forEach(function (b) { b.onclick = function () { ult = +b.dataset.n; dl.querySelectorAll('#pdPer [data-n]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
    var opts = function (id) { var v = dl.querySelector('[name=pdVer]:checked'); var t = dl.querySelector('#pdTemp').value;
      return { tipo: 'portero', gk: id || act.id, club: dl.querySelector('#pdClub').value, temp: t === 'todas' ? '' : t, ultimos: ult, version: coach && v ? v.value : 'portero', notasPortero: dl.querySelector('#pdNP').checked }; };
    var run = function (o) {
      if (busy) return; busy = true; msg.textContent = 'Preparando el PDF…';
      cargarJsPDF().then(function () { return window.InformePDF.descargar(o); })
        .then(function (n) { msg.textContent = 'Descargado: ' + n; }, function (e) { msg.textContent = (e && e.vacio) ? e.message : 'No se ha podido crear el PDF. ' + ((e && e.message) || ''); })
        .then(function () { busy = false; });
    };
    dl.querySelector('#pdGo').onclick = function () { run(opts()); };
    dl.querySelector('#pdNo').onclick = function () { dl.close(); dl.remove(); };
    var bg = dl.querySelector('#pdGrp'); if (bg) bg.onclick = function () { run({ tipo: 'grupo', grupo: gr.id }); };
    dl.querySelectorAll('[data-pdk]').forEach(function (b) { b.onclick = function () { run(opts(b.getAttribute('data-pdk'))); }; });
    dl.addEventListener('close', function () { dl.remove(); });
    dl.style.top = (window.scrollY + 16) + 'px';
    dl.showModal();
  }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-informe]')) informeDlg(); });

  if (!location.hash) history.replaceState(null, '', '#partidos');
  route();
})();
