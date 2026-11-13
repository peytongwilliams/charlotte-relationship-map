/* Audience & Relationship Map */
(function () {
  'use strict';

  var DATA = (window.AUDIENCE_MAP && window.AUDIENCE_MAP.records) || [];
  var META = (window.AUDIENCE_MAP && window.AUDIENCE_MAP.meta) || {};

  var CATS = [
    { id: 'builder', label: 'Builders', one: 'Builder', color: '#c9571a' },
    { id: 'cpa', label: 'CPAs', one: 'CPA firm', color: '#0f7a72' },
    { id: 'estate', label: 'Estate attorneys', one: 'Estate attorney', color: '#3a4c9b' },
    { id: 'community', label: 'Communities', one: 'Community', color: '#a82f5c' }
  ];
  var CAT = {};
  CATS.forEach(function (c) { CAT[c.id] = c; });

  var METRO_BOUNDS = [[-81.36, 34.82], [-80.42, 35.68]];

  var state = { q: '', cats: { builder: true, cpa: true, estate: true, community: true }, area: 'all', selected: null, visible: [] };

  var $ = function (id) { return document.getElementById(id); };
  var el = { q: $('q'), chips: $('chips'), area: $('area'), count: $('count'), results: $('results'), detail: $('detail'), legend: $('legend'), about: $('about'), aboutBody: $('aboutBody') };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function host(u) {
    return String(u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  }
  function tel(p) { return 'tel:+1' + String(p).replace(/\D/g, ''); }

  DATA.forEach(function (r, i) {
    r._i = i;
    r._hay = norm([r.lead, r.name, r.sub, r.city, r.area, r.description, r.building, r.recognition, r.why, r.address,
      (r.people || []).map(function (p) { return p.name + ' ' + p.title + ' ' + (p.focus || ''); }).join(' ')].join(' '));
  });
  DATA.sort(function (a, b) { return norm(a.name).localeCompare(norm(b.name)); });

  /* Builders are people first: listed by name, grouped by the kind of thing they are building. */
  var KINDS = META.builder_kinds || [];
  var KIND_LABEL = {
    'Founder': 'Founders', 'Business owner': 'Business owners', 'Executive': 'Executives',
    'Educator': 'Educators', 'Nonprofit & civic leader': 'Nonprofit & civic leaders', 'Arts & hospitality': 'Arts & hospitality'
  };
  function isBuilder(r) { return r.cat === 'builder'; }
  function title(r) { return isBuilder(r) && r.lead ? r.lead : r.name; }
  function firstTitle(r) {
    var p = (r.people || [])[0];
    return p && p.title ? p.title.split(';')[0].trim() : '';
  }
  function lastName(r) {
    var p = (r.people || [])[0];
    var parts = String(p ? p.name : title(r)).trim().split(/\s+/);
    while (parts.length > 1 && /^(jr|sr|ii|iii|iv)\.?$/i.test(parts[parts.length - 1])) parts.pop();
    return norm(parts[parts.length - 1] + ' ' + parts[0]);
  }
  function ordered(rows) {
    var out = [];
    CATS.forEach(function (c) {
      var mine = rows.filter(function (r) { return r.cat === c.id; });
      if (c.id !== 'builder') { out = out.concat(mine); return; }
      mine.sort(function (a, b) {
        var k = KINDS.indexOf(a.sub) - KINDS.indexOf(b.sub);
        return k || lastName(a).localeCompare(lastName(b));
      });
      out = out.concat(mine);
    });
    return out;
  }

  /* ---------- Controls ---------- */

  function buildControls() {
    el.chips.innerHTML = CATS.map(function (c) {
      var n = DATA.filter(function (r) { return r.cat === c.id; }).length;
      return '<button class="chip" type="button" data-cat="' + c.id + '" aria-pressed="true">' +
        '<span class="dot"></span><span>' + c.label + '</span><span class="n">' + n + '</span></button>';
    }).join('');

    var order = META.areas || [];
    var counts = {};
    DATA.forEach(function (r) { counts[r.area] = (counts[r.area] || 0) + 1; });
    el.area.innerHTML = '<option value="all">All areas</option>' + order.filter(function (a) { return counts[a]; }).map(function (a) {
      return '<option value="' + esc(a) + '">' + esc(a) + ' (' + counts[a] + ')</option>';
    }).join('');

    el.legend.innerHTML = CATS.map(function (c) {
      return '<span data-cat="' + c.id + '"><i class="dot"></i>' + c.label + '</span>';
    }).join('');

    el.chips.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      var id = b.getAttribute('data-cat');
      var on = Object.keys(state.cats).filter(function (k) { return state.cats[k]; });
      // First click on a full set isolates that category; later clicks toggle.
      if (on.length === CATS.length) {
        CATS.forEach(function (c) { state.cats[c.id] = c.id === id; });
      } else if (on.length === 1 && on[0] === id) {
        CATS.forEach(function (c) { state.cats[c.id] = true; });
      } else {
        state.cats[id] = !state.cats[id];
      }
      syncChips();
      apply(true);
    });

    var t;
    el.q.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () { state.q = el.q.value.trim(); apply(true); }, 90);
    });
    el.area.addEventListener('change', function () { state.area = el.area.value; apply(true); });

    $('resetBtn').addEventListener('click', function () { fitTo(state.visible, true); });
    $('aboutBtn').addEventListener('click', function () { el.about.showModal(); });
    el.about.addEventListener('click', function (e) { if (e.target === el.about) el.about.close(); });
    $('csvBtn').addEventListener('click', downloadCsv);
  }

  function syncChips() {
    Array.prototype.forEach.call(el.chips.children, function (b) {
      b.setAttribute('aria-pressed', String(!!state.cats[b.getAttribute('data-cat')]));
    });
  }

  function resetFilters() {
    state.q = ''; el.q.value = '';
    state.area = 'all'; el.area.value = 'all';
    CATS.forEach(function (c) { state.cats[c.id] = true; });
    syncChips();
    apply(true);
  }

  /* ---------- Filtering and list ---------- */

  function matches(r) {
    if (!state.cats[r.cat]) return false;
    if (state.area !== 'all' && r.area !== state.area) return false;
    if (state.q) {
      var terms = norm(state.q).split(/\s+/);
      for (var i = 0; i < terms.length; i++) if (r._hay.indexOf(terms[i]) === -1) return false;
    }
    return true;
  }

  function hi(text) {
    var out = esc(text);
    if (!state.q) return out;
    var terms = state.q.split(/\s+/).filter(function (t) { return t.length > 1; }).map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    if (!terms.length) return out;
    return out.replace(new RegExp('(' + terms.join('|') + ')', 'ig'), '<mark>$1</mark>');
  }

  function rowMeta(r) {
    var q = norm(state.q);
    var people = r.people || [];
    if (isBuilder(r)) { var t = firstTitle(r); return r.name + (t ? ' \u00b7 ' + t : ''); }
    if (q) {
      for (var i = 0; i < people.length; i++) {
        if (norm(people[i].name + ' ' + people[i].title).indexOf(q.split(/\s+/)[0]) !== -1) return people[i].name + (people[i].title ? ', ' + people[i].title : '');
      }
    }
    if (people.length) return people.map(function (p) { return p.name; }).slice(0, 3).join(' · ');
    return r.sub || '';
  }

  function apply(refit) {
    state.visible = ordered(DATA.filter(matches));
    var total = state.visible.length;
    el.count.textContent = total === DATA.length ? total + ' on the map' : total + ' of ' + DATA.length;

    if (!total) {
      el.results.innerHTML = '<div class="empty"><h3>Nobody here yet</h3><p>Nothing on the map matches that search. Try a town, a firm or a last name, or clear the filters.</p><button class="btn btn-solid" type="button" id="clearBtn">Clear filters</button></div>';
      $('clearBtn').addEventListener('click', resetFilters);
    } else {
      var html = '';
      CATS.forEach(function (c) {
        var rows = state.visible.filter(function (r) { return r.cat === c.id; });
        if (!rows.length) return;
        html += '<div class="group-head" data-cat="' + c.id + '"><span>' + c.label + '</span><span class="n">' + rows.length + '</span></div>';
        var kind = null;
        html += rows.map(function (r) {
          var sub = '';
          if (c.id === 'builder' && r.sub !== kind) {
            kind = r.sub;
            var n = rows.filter(function (x) { return x.sub === kind; }).length;
            sub = '<div class="sub-head"><span>' + esc(KIND_LABEL[kind] || kind) + '</span><span class="n">' + n + '</span></div>';
          }
          return sub + '<button class="row" type="button" data-id="' + r.id + '" data-cat="' + r.cat + '">' +
            '<span class="dot"></span><span class="row-name">' + hi(title(r)) + '</span>' +
            '<span class="row-place">' + esc(r.lat == null && (r.cat === 'community' || !r.city) ? 'Metro-wide' : r.city) + '</span>' +
            '<span class="row-meta">' + hi(rowMeta(r)) + '</span></button>';
        }).join('');
      });
      el.results.innerHTML = html;
    }
    el.results.scrollTop = 0;
    updateMapFilter();
    if (refit) fitTo(state.visible, false);
  }

  el.results.addEventListener('click', function (e) {
    var b = e.target.closest('.row');
    if (b) select(b.getAttribute('data-id'), true);
  });
  el.results.addEventListener('mouseover', function (e) {
    var b = e.target.closest('.row');
    if (b) hover(b.getAttribute('data-id'));
  });
  el.results.addEventListener('mouseleave', function () { hover(null); });

  /* ---------- Detail ---------- */

  function byId(id) {
    for (var i = 0; i < DATA.length; i++) if (DATA[i].id === id) return DATA[i];
    return null;
  }

  function link(url, text) {
    if (!/^https?:\/\//i.test(String(url || ''))) return esc(text);
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(text) + '</a>';
  }

  function renderDetail(r) {
    var c = CAT[r.cat];
    var idx = state.visible.indexOf(r);
    var facts = '';
    if (r.address && !r.approx) {
      facts += '<dt>Where</dt><dd>' + esc(r.address) + (r.lat != null ? '<br>' + link('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(r.name + ', ' + r.address), 'Directions') : '') + '</dd>';
    } else if (r.approx) {
      facts += '<dt>Where</dt><dd>' + esc(r.address || r.city) + '<br><span class="muted">Pin shows the town; no street address published</span></dd>';
    } else if (r.cat === 'community') {
      facts += '<dt>Where</dt><dd>No fixed office; active across the metro</dd>';
    } else {
      facts += '<dt>Where</dt><dd>' + (r.city ? esc(r.city) + '<br>' : '') + '<span class="muted">No street address published</span></dd>';
    }
    if (r.recognition) facts = '<dt>Recognized</dt><dd>' + esc(r.recognition).replace(/ \u00b7 /g, '<br>') + '</dd>' + facts;
    if (r.phone) facts += '<dt>Phone</dt><dd><a href="' + tel(r.phone) + '">' + esc(r.phone) + '</a></dd>';
    if (r.email) facts += '<dt>Email</dt><dd><a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a></dd>';
    if (r.website) facts += '<dt>Web</dt><dd>' + link(r.website, host(r.website)) + '</dd>';

    var people = (r.people || []).map(function (p) {
      var contact = '';
      if (p.email) contact += '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>';
      if (p.phone) contact += '<a href="' + tel(p.phone) + '">' + esc(p.phone) + '</a>';
      if (p.url) contact += link(p.url, 'Profile');
      return '<li class="person"><div class="person-name">' + esc(p.name) + '</div>' +
        (p.title ? '<div class="person-title">' + esc(p.title) + '</div>' : '') +
        (p.focus ? '<div class="person-focus">' + esc(p.focus) + '</div>' : '') +
        (contact ? '<div class="person-contact">' + contact + '</div>' : '') + '</li>';
    }).join('');

    var sources = (r.sources || []).map(function (s) { return '<li>' + link(s.url, s.label) + '</li>'; }).join('');

    el.detail.setAttribute('data-cat', r.cat);
    el.detail.innerHTML =
      '<div class="detail-bar">' +
        '<button class="back" type="button" id="backBtn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>List</button>' +
        '<div class="stepper"><span>' + (idx + 1) + ' of ' + state.visible.length + '</span>' +
          '<button class="icon-btn" type="button" id="prevBtn" aria-label="Previous" title="Previous"' + (idx <= 0 ? ' disabled' : '') + '><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg></button>' +
          '<button class="icon-btn" type="button" id="nextBtn" aria-label="Next" title="Next"' + (idx < 0 || idx >= state.visible.length - 1 ? ' disabled' : '') + '><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>' +
        '</div>' +
      '</div>' +
      '<div class="detail-body">' +
        '<p class="kicker"><span class="dot"></span>' + esc(c.one) + (r.sub ? ' <em>/ ' + esc(r.sub) + '</em>' : '') + '</p>' +
        '<h2>' + esc(title(r)) + '</h2>' +
        (isBuilder(r) ? '<p class="byline">' + (firstTitle(r) ? esc(firstTitle(r)) + ', ' : '') + '<b>' + esc(r.name) + '</b></p>' : '') +
        (isBuilder(r) && r.building ? '<div class="why"><b>What they are building</b>' + esc(r.building) + '</div>' : '') +
        (r.description && !isBuilder(r) ? '<p class="lede">' + esc(r.description) + '</p>' : '') +
        (r.lat == null ? '<span class="nopin">Not pinned: ' + (r.cat === 'community' ? 'no fixed address' : 'no street address published') + '</span>' : '') +
        (r.why ? '<div class="why"><b>Why it is here</b>' + esc(r.why) + '</div>' : '') +
        (facts ? '<dl class="facts">' + facts + '</dl>' : '') +
        (people ? '<h3 class="section-h">' + (isBuilder(r) ? 'Who is building it' : 'Who to know') + '</h3><ul class="people">' + people + '</ul>' : '') +
        (r.description && isBuilder(r) ? '<h3 class="section-h">About ' + esc(r.name) + '</h3><p class="lede">' + esc(r.description) + '</p>' : '') +
        (r.entry ? '<h3 class="section-h">How people get involved</h3><p class="lede">' + esc(r.entry) + '</p>' : '') +
        (sources ? '<h3 class="section-h">Sources</h3><ul class="sources">' + sources + '</ul>' : '') +
      '</div>';

    $('backBtn').addEventListener('click', function () { select(null); });
    $('prevBtn').addEventListener('click', function () { if (idx > 0) select(state.visible[idx - 1].id, true); });
    $('nextBtn').addEventListener('click', function () { if (idx < state.visible.length - 1) select(state.visible[idx + 1].id, true); });
  }

  function select(id, fly) {
    var r = id ? byId(id) : null;
    state.selected = r;
    if (!r) {
      el.detail.hidden = true;
      el.detail.innerHTML = '';
      setSelectedOnMap(null);
      return;
    }
    renderDetail(r);
    // restart the entrance animation when stepping between records
    el.detail.hidden = true;
    void el.detail.offsetWidth;
    el.detail.hidden = false;
    el.detail.scrollTop = 0;
    $('backBtn').focus({ preventScroll: true });
    setSelectedOnMap(r, fly);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected && !el.about.open) select(null);
  });

  /* ---------- CSV ---------- */

  function downloadCsv() {
    var cols = ['Category', 'Type', 'Lead', 'Name', 'Area', 'City', 'Address', 'Phone', 'Email', 'Website', 'What they are building', 'Recognition', 'Why it is here', 'Description', 'How people get involved'];
    for (var k = 1; k <= 4; k++) cols.push('Person ' + k, 'Person ' + k + ' title', 'Person ' + k + ' email', 'Person ' + k + ' phone', 'Person ' + k + ' focus', 'Person ' + k + ' source');
    cols.push('Latitude', 'Longitude', 'Pin', 'Sources');
    var cell = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [cols.join(',')];
    var rows = state.visible.length ? state.visible : DATA;
    CATS.forEach(function (c) {
      rows.filter(function (r) { return r.cat === c.id; }).forEach(function (r) {
        var row = [c.label, r.sub, r.lead, r.name, r.area, r.city, r.address, r.phone, r.email, r.website, r.building, r.recognition, r.why, r.description, r.entry];
        for (var i = 0; i < 4; i++) {
          var p = (r.people || [])[i] || {};
          row.push(p.name, p.title, p.email, p.phone, p.focus, p.url);
        }
        row.push(r.lat, r.lng, r.approx ? 'Town-level' : (r.lat != null ? 'Exact address' : 'Not pinned'), (r.sources || []).map(function (s) { return s.url; }).join(' | '));
        lines.push(row.map(cell).join(','));
      });
    });
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'charlotte-audience-relationship-map.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    var lab = $('csvLabel');
    lab.textContent = rows.length + ' rows saved';
    setTimeout(function () { lab.textContent = 'Download CSV'; }, 2200);
  }

  /* ---------- Map ---------- */

  var map = null, mapReady = false, popup = null, hoverId = null;

  function features() {
    return DATA.filter(function (r) { return r.lat != null; }).map(function (r) {
      return { type: 'Feature', id: r._i, geometry: { type: 'Point', coordinates: [r.lng, r.lat] }, properties: { id: r.id, cat: r.cat, name: title(r), sub: r.sub || '' } };
    });
  }

  function colorExpr() {
    var ex = ['match', ['get', 'cat']];
    CATS.forEach(function (c) { ex.push(c.id, c.color); });
    ex.push('#333');
    return ex;
  }

  function initMap() {
    if (!window.maplibregl) { $('mapFallback').hidden = false; return; }
    try {
      map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/positron',
        bounds: METRO_BOUNDS,
        fitBoundsOptions: { padding: 30 },
        minZoom: 7.5,
        maxZoom: 17,
        maxBounds: [[-83.2, 33.6], [-78.6, 36.9]],
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false
      });
    } catch (err) { $('mapFallback').hidden = false; return; }

    map.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.touchZoomRotate.disableRotation();

    map.on('load', function () {
      // Warm the basemap toward the paper palette.
      var tint = [['background', 'background-color', '#eeebe2'], ['water', 'fill-color', '#bfd0d2'], ['park', 'fill-color', '#dfe4d3']];
      tint.forEach(function (t) { try { if (map.getLayer(t[0])) map.setPaintProperty(t[0], t[1], t[2]); } catch (e) {} });

      map.addSource('people', { type: 'geojson', data: { type: 'FeatureCollection', features: features() } });

      map.addLayer({
        id: 'pins-halo', type: 'circle', source: 'people',
        paint: {
          'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 19, ['boolean', ['feature-state', 'hover'], false], 13, 0],
          'circle-color': colorExpr(), 'circle-opacity': 0.2
        }
      });
      map.addLayer({
        id: 'pins', type: 'circle', source: 'people',
        layout: { 'circle-sort-key': ['case', ['==', ['get', 'cat'], 'community'], 1, 2] },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4.5, 11, 6.5, 14, 9],
          'circle-color': colorExpr(),
          'circle-stroke-color': '#fffdf8',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 13, 2]
        }
      });
      map.addLayer({
        id: 'pin-labels', type: 'symbol', source: 'people', minzoom: 11.2,
        layout: {
          'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 11.5,
          'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 0.85, 'text-justify': 'auto',
          'text-max-width': 9, 'text-optional': true, 'text-padding': 3
        },
        paint: { 'text-color': '#1f2e30', 'text-halo-color': 'rgba(255,253,248,0.95)', 'text-halo-width': 1.6 }
      });

      mapReady = true;
      updateMapFilter();
      if (state.selected) setSelectedOnMap(state.selected, true);

      map.on('mousemove', 'pins', function (e) {
        map.getCanvas().style.cursor = 'pointer';
        var f = e.features && e.features[0];
        if (f) hover(f.properties.id, true);
      });
      map.on('mouseleave', 'pins', function () { map.getCanvas().style.cursor = ''; hover(null); });
      map.on('click', 'pins', function (e) {
        // Where pins overlap, take the one closest to the pointer.
        var best = null, bd = Infinity;
        (e.features || []).forEach(function (f) {
          var p = map.project(f.geometry.coordinates);
          var d = Math.pow(p.x - e.point.x, 2) + Math.pow(p.y - e.point.y, 2);
          if (d < bd) { bd = d; best = f; }
        });
        if (best) select(best.properties.id, true);
      });
    });

    map.on('error', function (e) {
      if (!mapReady && e && e.error && /style|Failed to fetch/i.test(String(e.error.message || ''))) $('mapFallback').hidden = false;
    });
  }

  function updateMapFilter() {
    if (!mapReady) return;
    var ids = state.visible.filter(function (r) { return r.lat != null; }).map(function (r) { return r.id; });
    var filter = ['in', ['get', 'id'], ['literal', ids]];
    ['pins', 'pins-halo', 'pin-labels'].forEach(function (l) { map.setFilter(l, filter); });
  }

  function padding() {
    return window.innerWidth <= 860 ? { top: 56, bottom: 30, left: 30, right: 30 } : { top: 70, bottom: 70, left: 70, right: 70 };
  }

  function fitTo(rows, animate) {
    if (!mapReady) return;
    var pts = rows.filter(function (r) { return r.lat != null; });
    if (!pts.length || pts.length === DATA.filter(function (r) { return r.lat != null; }).length) {
      map.fitBounds(METRO_BOUNDS, { padding: 30, duration: animate === false ? 600 : 900 });
      return;
    }
    if (pts.length === 1) { map.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: 13.5, duration: 900 }); return; }
    var b = new maplibregl.LngLatBounds();
    pts.forEach(function (r) { b.extend([r.lng, r.lat]); });
    map.fitBounds(b, { padding: padding(), maxZoom: 13.5, duration: 900 });
  }

  function showPopup(r) {
    if (!mapReady) return;
    if (!popup) popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: '260px' });
    popup.setLngLat([r.lng, r.lat]).setHTML('<b>' + esc(title(r)) + '</b><small>' + esc((isBuilder(r) ? r.name : CAT[r.cat].one) + (r.city ? ' \u00b7 ' + r.city : '')) + '</small>').addTo(map);
  }

  function hover(id, fromMap) {
    if (!mapReady) return;
    var r = id ? byId(id) : null;
    if (hoverId != null) map.setFeatureState({ source: 'people', id: hoverId }, { hover: false });
    hoverId = null;
    if (r && r.lat != null) {
      hoverId = r._i;
      map.setFeatureState({ source: 'people', id: hoverId }, { hover: true });
      showPopup(r);
    } else if (state.selected && state.selected.lat != null) {
      showPopup(state.selected);
    } else if (popup) {
      popup.remove();
    }
  }

  var selectedFid = null;
  function setSelectedOnMap(r, fly) {
    if (!mapReady) return;
    if (selectedFid != null) map.setFeatureState({ source: 'people', id: selectedFid }, { selected: false });
    selectedFid = null;
    if (!r || r.lat == null) { if (popup) popup.remove(); return; }
    selectedFid = r._i;
    map.setFeatureState({ source: 'people', id: selectedFid }, { selected: true });
    showPopup(r);
    if (fly) map.flyTo({ center: [r.lng, r.lat], zoom: Math.max(map.getZoom(), 14), duration: 1100, essential: true });
  }

  /* ---------- About ---------- */

  function buildAbout() {
    var n = {};
    CATS.forEach(function (c) { n[c.id] = DATA.filter(function (r) { return r.cat === c.id; }).length; });
    var lists = (META.lists || []).map(function (s) { return '<li>' + link(s.url, s.label) + '</li>'; }).join('');
    el.aboutBody.innerHTML =
      '<h3>What this is</h3>' +
      '<p>A working picture of who we want to be in real conversation with around Charlotte: the people building something meaningful here, the CPAs and estate attorneys they already trust, and the rooms where all of them gather. It is a starting list, not a finished roster.</p>' +
      '<h3>The four groups</h3>' +
      '<dl>' +
        '<dt data-cat="builder"><i class="dot"></i>Builders (' + n.builder + ')</dt><dd>People actively creating, growing or improving something meaningful: founders, business owners, executives, educators, nonprofit and civic leaders, chefs and arts leaders. Each is listed by name, with what they are building and where they have been recognized for it. These are the people the Conversations With Builders series is about.</dd>' +
        '<dt data-cat="cpa"><i class="dot"></i>CPAs (' + n.cpa + ')</dt><dd>Firms and named partners whose work is tax, closely held business and private-client planning.</dd>' +
        '<dt data-cat="estate"><i class="dot"></i>Estate attorneys (' + n.estate + ')</dt><dd>Trusts and estates practices and the attorneys recognized for that work, from the large Uptown firms to single-office practices in the surrounding counties.</dd>' +
        '<dt data-cat="community"><i class="dot"></i>Communities (' + n.community + ')</dt><dd>Peer groups, professional councils, chambers, founder programs, forums and clubs where these people already spend time.</dd>' +
      '</dl>' +
      '<h3>What the details are</h3>' +
      '<p>Every address, phone number and email here is published business contact information, taken from the organization\u2019s own website or a public business listing. An email appears only where the person or firm publishes one. Each record lists its sources. Titles and roles change, so confirm before reaching out.</p>' +
      '<h3>How we use it</h3>' +
      '<p>This map supports relationships, not mass outreach. Anything we send or publish from it follows our firm\u2019s policies, supervision, advertising review and recordkeeping. Interviews, events and other third-party involvement are reviewed before they happen. It holds no client information and is not a source for moving client or contact data anywhere.</p>' +
      (lists ? '<h3>Lists we drew from</h3><ul>' + lists + '</ul>' : '') +
      (META.updated ? '<h3>Current as of</h3><p>' + esc(META.updated) + '</p>' : '');
  }

  /* ---------- Go ---------- */

  buildControls();
  buildAbout();
  apply(false);
  initMap();
  window.__audienceMap = { state: state, select: select, getMap: function () { return map; } };
})();
