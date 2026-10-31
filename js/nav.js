/* Menú desplegable: hover (CSS), toque y teclado (aria-expanded) */
(function () {
  var items = document.querySelectorAll('.sn-nav li.has-m');
  function closeAll(except) { items.forEach(function (li) { if (li !== except) { li.classList.remove('open'); var b = li.querySelector('.sn-dd'); if (b) b.setAttribute('aria-expanded', 'false'); } }); }
  items.forEach(function (li) {
    var b = li.querySelector('.sn-dd'), m = li.querySelector('.sn-m');
    b.addEventListener('click', function (e) {
      e.stopPropagation(); var open = !li.classList.contains('open'); closeAll(li);
      li.classList.toggle('open', open); b.setAttribute('aria-expanded', String(open));
      if (open && e.detail === 0) { var f = m.querySelector('a'); if (f) setTimeout(function () { f.focus(); }, 40); }
    });
    li.addEventListener('mouseenter', function () { if (matchMedia('(hover:hover) and (min-width:801px)').matches) b.setAttribute('aria-expanded', 'true'); });
    li.addEventListener('mouseleave', function () { if (!li.classList.contains('open')) b.setAttribute('aria-expanded', 'false'); });
    li.addEventListener('keydown', function (e) {
      var links = Array.prototype.slice.call(m.querySelectorAll('a')), i = links.indexOf(document.activeElement);
      if (e.key === 'Escape') { closeAll(); li.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); b.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (!li.classList.contains('open')) b.click(); else links[(i + 1) % links.length].focus(); }
      else if (e.key === 'ArrowUp' && i >= 0) { e.preventDefault(); links[(i - 1 + links.length) % links.length].focus(); }
    });
    li.addEventListener('focusout', function (e) { if (!li.contains(e.relatedTarget)) { li.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); } });
    // Al elegir una opción el menú se cierra aunque el ratón siga encima; vuelve a abrirse al salir y entrar de nuevo
    m.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { cerrar(li); }); });
    li.addEventListener('mouseleave', function () { li.classList.remove('cerrado'); });
  });
  function cerrar(li) {
    closeAll(); li.classList.remove('open'); li.classList.add('cerrado');
    var b = li.querySelector('.sn-dd'); if (b) b.setAttribute('aria-expanded', 'false');
    if (document.activeElement && li.contains(document.activeElement)) document.activeElement.blur();
    if (!matchMedia('(hover:hover)').matches) setTimeout(function () { li.classList.remove('cerrado'); }, 400);
  }
  window.addEventListener('hashchange', function () { items.forEach(function (li) { if (li.classList.contains('open') || li.matches(':hover') || li.contains(document.activeElement)) cerrar(li); }); });
  items.forEach(function (li) { var b = li.querySelector('.sn-dd'); b.addEventListener('click', function () { li.classList.remove('cerrado'); }, true); });
  document.addEventListener('click', function () { closeAll(); });
})();
