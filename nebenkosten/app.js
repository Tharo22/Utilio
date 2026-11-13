/* Nebenkosten – Web-App für Vermieter (Port der iPhone-App). Daten bleiben auf dem Gerät (localStorage, Belege in IndexedDB). */
(function () {
'use strict';
var KEY = 'nebenkosten-v1', BKEY = 'nebenkosten-belege';

/* ---------- Zustand ---------- */
var S = laden();
function leer() { return { v: 1, objekte: [], absender: { name: '', adresse: '', ort: '', iban: '', bank: '', email: '', zahlungsfrist: 14 }, jahr: new Date().getFullYear() - 1 }; }
function laden() {
  try { var d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.v === 1 && Array.isArray(d.objekte)) { d.absender = Object.assign(leer().absender, d.absender || {}); if (!d.jahr) d.jahr = new Date().getFullYear() - 1; return d; } } catch (e) {}
  return leer();
}
function sichern() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { alert('Speichern nicht möglich (Speicher voll?). Bitte ein Backup erstellen.'); } }
function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
var euro = NK.euro, datum = NK.datum, zahl = NK.zahl;
function num(v) { if (typeof v === 'number') return v; var s = String(v == null ? '' : v).trim().replace(/\s/g, ''); if (!s) return 0; if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); var x = parseFloat(s); return isNaN(x) ? 0 : x; }
function numIn(v) { return v === 0 || v ? String(v).replace('.', ',') : ''; }
function obj(id) { return S.objekte.filter(function (o) { return o.id === id; })[0]; }
function einheitOf(o, id) { return o && o.einheiten.filter(function (e) { return e.id === id; })[0]; }
function mieterOf(e, id) { return e && e.mieter.filter(function (m) { return m.id === id; })[0]; }
function ctxM(oid, eid, mid) { var o = obj(oid), e = einheitOf(o, eid), m = mieterOf(e, mid); return o && e && m ? { o: o, e: e, m: m } : null; }
var SCHL = [['wohnflaeche', 'Wohnfläche'], ['einheiten', 'Je Einheit'], ['personen', 'Personenzahl'], ['verbrauch', 'Verbrauch (Zähler)'], ['heizkosten', 'Heizkosten (HeizkostenV)']];
function schlName(k) { var x = SCHL.filter(function (s) { return s[0] === k; })[0]; return x ? x[1] : k; }
var KATALOG = [ /* Betriebskostenverordnung: Vorschlag umlagefähig ja/nein */
  [/grundsteuer|müll|abfall|straßenreinigung|schornstein|gebäudeversicherung|versicherung|hauswart|hausmeister|gartenpflege|beleuchtung|allgemeinstrom|aufzug|kabel|antenne|wasser|abwasser|entwässerung|heiz|warmwasser|wartung heiz|reinigung|treppenhaus/i, true],
  [/verwaltung|instandhaltung|reparatur|rücklage|rueckl|zinsen|bankgebühr|kontoführung|mietausfall|leerstand|sanierung|modernisierung/i, false]];
function katalogUml(b) { for (var i = 0; i < KATALOG.length; i++) if (KATALOG[i][0].test(b)) return KATALOG[i][1]; return null; }

/* ---------- Belege in IndexedDB ---------- */
var db = null;
function dbOpen() {
  return new Promise(function (res, rej) {
    if (db) return res(db);
    var r = indexedDB.open(BKEY, 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('b', { keyPath: 'id' }); };
    r.onsuccess = function () { db = r.result; res(db); }; r.onerror = function () { rej(r.error); };
  });
}
function dbOp(mode, f) { return dbOpen().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction('b', mode), s = t.objectStore('b'), q = f(s); t.oncomplete = function () { res(q && q.result); }; t.onerror = function () { rej(t.error); }; }); }); }
var Belege = {
  alle: function () { return dbOp('readonly', function (s) { return s.getAll(); }).then(function (a) { return a || []; }).catch(function () { return []; }); },
  put: function (b) { return dbOp('readwrite', function (s) { return s.put(b); }); },
  del: function (id) { return dbOp('readwrite', function (s) { return s.delete(id); }); },
  clear: function () { return dbOp('readwrite', function (s) { return s.clear(); }); }
};
function bildKomprimieren(file) {
  return new Promise(function (res) {
    if (!/^image\//.test(file.type)) return res(file);
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var m = 2000, k = Math.min(1, m / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(function (b) { res(b || file); }, 'image/jpeg', 0.72);
    };
    img.onerror = function () { URL.revokeObjectURL(url); res(file); }; img.src = url;
  });
}
function belegHinzufuegen(files, oid, jahr) {
  var jobs = Array.prototype.map.call(files, function (f) {
    if (f.size > 30 * 1048576) return Promise.resolve(null);
    return bildKomprimieren(f).then(function (blob) {
      var typ = /pdf/i.test(f.type) || /\.pdf$/i.test(f.name) ? 'pdf' : 'bild', id = uid();
      return Belege.put({ id: id, oid: oid, jahr: jahr, titel: f.name.replace(/\.[^.]+$/, '') || 'Beleg', typ: typ, blob: blob, am: NK.heute() }).then(function () { return id; });
    });
  });
  return Promise.all(jobs).then(function (ids) { return ids.filter(Boolean); });
}

/* ---------- Dateien und Druck ---------- */
function dateiSpeichern(name, mime, text) {
  var blob = new Blob([text], { type: mime });
  function dl() { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  try { var f = new File([blob], name, { type: mime }); if (navigator.canShare && navigator.canShare({ files: [f] })) return navigator.share({ files: [f], title: name }).catch(function (e) { if (!e || e.name !== 'AbortError') dl(); }); } catch (e) {}
  dl(); return Promise.resolve();
}
function drucken(html, titel) {
  var p = document.getElementById('print'), alt = document.title;
  p.innerHTML = '<div class="seite">' + html + '</div>'; document.title = titel || alt;
  var imgs = Array.prototype.slice.call(p.querySelectorAll('img')), ok = Promise.all(imgs.map(function (i) { return i.complete ? 1 : new Promise(function (r) { i.onload = i.onerror = r; }); }));
  ok.then(function () { setTimeout(function () { window.print(); }, 60); });
  window.onafterprint = function () { document.title = alt; p.innerHTML = ''; };
}

/* ---------- Dialoge ---------- */
function overlay(inner, onClose) {
  var ov = document.createElement('div'); ov.className = 'ov'; ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + inner + '</div>';
  ov.addEventListener('click', function (e) { if (e.target === ov) schliessen(); });
  document.body.appendChild(ov);
  function schliessen() { ov.remove(); if (onClose) onClose(); }
  return { el: ov, close: schliessen };
}
/* felder: [{k,l,t:'text|num|date|select|check|area|email',opts:[[v,l]],h:'Hinweis',show:function(v){}}] */
function formular(titel, felder, werte, speichern, extra) {
  var w = Object.assign({}, werte);
  var html = '<h3>' + esc(titel) + '</h3>' + (extra && extra.kopf ? extra.kopf : '') + felder.map(function (f, i) {
    var v = w[f.k], id = 'f' + i, h = f.h ? '<div class="h">' + esc(f.h) + '</div>' : '', a = ' data-k="' + f.k + '" id="' + id + '"';
    if (f.t === 'check') return '<label class="fld chk" data-w="' + i + '"><input type="checkbox"' + a + (v ? ' checked' : '') + '><span>' + esc(f.l) + '</span></label>' + (f.h ? '<div class="note" data-w="' + i + '">' + esc(f.h) + '</div>' : '');
    if (f.t === 'select') return '<label class="fld" data-w="' + i + '">' + esc(f.l) + '<select' + a + '>' + f.opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(v) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' + h + '</label>';
    if (f.t === 'area') return '<label class="fld" data-w="' + i + '">' + esc(f.l) + '<textarea rows="3"' + a + '>' + esc(v || '') + '</textarea>' + h + '</label>';
    var typ = f.t === 'date' ? 'date' : f.t === 'email' ? 'email' : 'text', im = f.t === 'num' ? ' inputmode="decimal"' : '';
    return '<label class="fld" data-w="' + i + '">' + esc(f.l) + '<input type="' + typ + '"' + im + a + ' value="' + esc(f.t === 'num' ? numIn(v) : v == null ? '' : v) + '" autocomplete="off">' + h + '</label>';
  }).join('') + '<div class="row-actions"><button class="btn primary" data-s="ok">Sichern</button><button class="btn" data-s="x">Abbrechen</button>' + (extra && extra.loeschen ? '<button class="btn danger" data-s="del">Löschen</button>' : '') + '</div>';
  var o = overlay(html);
  function lies() { felder.forEach(function (f) { var el = o.el.querySelector('[data-k="' + f.k + '"]'); w[f.k] = f.t === 'check' ? el.checked : f.t === 'num' ? num(el.value) : el.value; }); }
  function sicht() { lies(); felder.forEach(function (f, i) { if (!f.show) return; var s = !!f.show(w); Array.prototype.forEach.call(o.el.querySelectorAll('[data-w="' + i + '"]'), function (x) { x.style.display = s ? '' : 'none'; }); }); }
  o.el.addEventListener('input', sicht); o.el.addEventListener('change', sicht); sicht();
  o.el.addEventListener('click', function (e) {
    var b = e.target.closest('[data-s]'); if (!b) return;
    if (b.dataset.s === 'x') return o.close();
    if (b.dataset.s === 'del') { if (confirm('Wirklich löschen?')) { o.close(); extra.loeschen(); } return; }
    lies(); var fehler = speichern(w); if (fehler) { alert(fehler); return; } o.close();
  });
  return o;
}
function hinweisBlatt(titel, html) { var o = overlay('<h3>' + esc(titel) + '</h3>' + html + '<div class="row-actions"><button class="btn primary" data-s="x">Schließen</button></div>'); o.el.addEventListener('click', function (e) { if (e.target.closest('[data-s="x"]')) o.close(); }); return o; }

/* ---------- Router ---------- */
function route() { var p = (location.hash || '#/').slice(2).split('/').map(decodeURIComponent); return { teile: p, v: p[0] || '' }; }
function go(h) { location.hash = h; }
var acts = {};
function render() {
  var r = route(), html = '';
  try {
    if (r.v === 'o') html = ansichtObjekt(r.teile[1], r.teile[2] || 'einheiten');
    else if (r.v === 'm') html = ansichtMieter(r.teile[1], r.teile[2], r.teile[3]);
    else if (r.v === 'a') html = ansichtAbrechnung(r.teile[1], r.teile[2], r.teile[3], +r.teile[4]);
    else if (r.v === 'mehr') html = ansichtMehr();
    else if (r.v === 'fristen') html = ansichtFristen();
    else html = ansichtStart();
  } catch (e) { html = '<div class="warn">Anzeigefehler: ' + esc(e.message) + '</div>'; if (window.console) console.error(e); }
  document.getElementById('app').innerHTML = html;
  var tabs = [['', 'Übersicht', 'M3 12l9-8 9 8v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'], ['fristen', 'Fristen', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5v5l3 2'], ['objekte', 'Objekte', 'M4 21V7l8-4 8 4v14M9 21v-6h6v6M8 10h2M14 10h2'], ['mehr', 'Mehr', 'M5 12h.01M12 12h.01M19 12h.01']];
  var akt = r.v === 'o' || r.v === 'm' || r.v === 'a' ? 'objekte' : r.v;
  document.getElementById('tabs').innerHTML = tabs.map(function (t) { return '<a href="#/' + t[0] + '"' + (akt === t[0] ? ' aria-current="page"' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + t[2] + '"/></svg>' + t[1] + '</a>'; }).join('');
  window.scrollTo(0, 0);
}
document.addEventListener('click', function (e) {
  var a = e.target.closest('[data-act]'); if (!a) return;
  var f = acts[a.dataset.act]; if (f) { e.preventDefault(); f(a.dataset, a); }
});
window.addEventListener('hashchange', render);
function neu() { sichern(); render(); }
function kopf(titel, sub, zurueck, rechts) { return '<div class="bar">' + (zurueck ? '<a class="back" href="' + zurueck + '" aria-label="Zurück">‹</a>' : '') + '<h1>' + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + esc(titel) + '</h1>' + (rechts || '') + '</div><main>'; }
function jahrWahl() {
  var y = new Date().getFullYear(), o = '';
  for (var j = y + 1; j >= y - 8; j--) o += '<option value="' + j + '"' + (j === S.jahr ? ' selected' : '') + '>' + j + '</option>';
  return '<select class="sel" data-chg="jahr" aria-label="Abrechnungsjahr">' + o + '</select>';
}
document.addEventListener('change', function (e) { var s = e.target.closest('[data-chg="jahr"]'); if (s) { S.jahr = +s.value; neu(); } });
function kpi(l, v, s, cls) { return '<div class="kpi"><div class="l">' + esc(l) + '</div><div class="v ' + (cls || '') + '">' + v + '</div>' + (s ? '<div class="s">' + esc(s) + '</div>' : '') + '</div>'; }
function pille(t, k) { return '<span class="pill p-' + k + '">' + esc(t) + '</span>'; }
function stufePille(s) { var m = { erledigt: ['Zugestellt', 'good'], abgelaufen: ['Abgelaufen', 'bad'], dringend: ['Dringend', 'bad'], bald: ['Bald fällig', 'mid'], ok: ['Offen', 'none'] }[s.stufe]; if (s.stufe === 'erledigt' && s.verspaetet) m = ['Verspätet', 'bad']; return pille(m[0], m[1]); }

/* ---------- Hilfen für Auswertungen ---------- */
function allePaare() { var l = []; S.objekte.forEach(function (o) { o.einheiten.forEach(function (e) { e.mieter.forEach(function (m) { l.push({ o: o, e: e, m: m }); }); }); }); return l; }
function offeneFristen() {
  var heute = NK.heute(), aktJahr = +heute.slice(0, 4), aus = [];
  allePaare().forEach(function (p) {
    for (var j = NK.jahrVon(p.m.von); j <= Math.min(aktJahr, p.m.bis ? NK.jahrVon(p.m.bis) : aktJahr); j++) {
      if (j + '-12-31' >= heute) continue;
      var z = (p.m.zugaenge || []).filter(function (x) { return +x.jahr === j; })[0];
      if (z) continue;
      var st = NK.fristStatus(j, null, heute); if (st.tageBis < -365) continue;
      aus.push({ o: p.o, e: p.e, m: p.m, jahr: j, st: st });
    }
  });
  return aus.sort(function (a, b) { return a.st.tageBis - b.st.tageBis; });
}
function fristZeile(f) {
  var t = f.st.tageBis < 0 ? 'seit ' + (-f.st.tageBis) + ' Tagen überfällig' : 'noch ' + f.st.tageBis + ' Tage bis ' + datum(f.st.frist);
  return '<a class="li" href="#/a/' + f.o.id + '/' + f.e.id + '/' + f.m.id + '/' + f.jahr + '"><span class="t">' + esc(f.m.name) + ' · ' + f.jahr + '</span><span class="s">' + esc(f.o.name) + ', ' + esc(f.e.name) + ' · ' + t + '</span><span class="r">' + stufePille(f.st) + '</span></a>';
}
function kostenSumme(o, jahr, uml) { return (o.kosten || []).filter(function (k) { return +k.jahr === jahr && (k.umlagefaehig !== false) === uml; }).reduce(function (a, k) { return a + (+k.betrag || 0); }, 0); }

/* ---------- Start ---------- */
function ansichtStart() {
  var h = kopf('Nebenkosten', 'Vermieter', '', jahrWahl());
  if (!S.objekte.length) {
    return h + '<div class="empty"><b>Willkommen</b>Lege dein erstes Objekt an: Haus oder Wohnung, dann Einheiten, Mieter, Kosten und Zähler. Die Abrechnung entsteht daraus.<div class="row-actions"><button class="btn primary" data-act="objektNeu">Objekt anlegen</button><button class="btn" data-act="importWahl">Backup einspielen</button></div></div>' +
      '<p class="note">Alle Daten bleiben auf diesem Gerät. Erstelle regelmäßig ein Backup unter „Mehr“.</p></main>';
  }
  var f = offeneFristen(), dr = f.filter(function (x) { return x.st.stufe !== 'ok'; });
  h += '<h2>Fristen § 556 BGB</h2>';
  h += f.length ? '<div class="card list">' + f.slice(0, 4).map(fristZeile).join('') + '</div>' + (f.length > 4 ? '<p class="note"><a href="#/fristen">Alle ' + f.length + ' anzeigen</a></p>' : '') : '<div class="info">Keine offenen Abrechnungen. Alles zugestellt oder noch im laufenden Jahr.</div>';
  h += '<h2>Objekte · ' + S.jahr + '</h2><div class="cards">';
  S.objekte.forEach(function (o) {
    var lv = o.einheiten.map(function (e) { return NK.leerstand(o, e, S.jahr); }).filter(function (l) { return l.tage > 0; });
    var lk = lv.reduce(function (a, l) { return a + l.kosten; }, 0), vorl = (o.kosten || []).some(function (k) { return +k.jahr === S.jahr && k.vorlaeufig; });
    h += '<a class="card pad" style="text-decoration:none;color:inherit;display:block" href="#/o/' + o.id + '/einheiten"><b>' + esc(o.name) + '</b><div class="note" style="margin:2px 0 8px">' + esc(o.adresse || '') + '</div><div class="kpis" style="margin:0">' +
      kpi('Umlagefähige Kosten', euro(kostenSumme(o, S.jahr, true)), vorl ? 'enthält Planwerte' : '') + kpi('Einheiten', o.einheiten.length, o.einheiten.reduce(function (a, e) { return a + e.mieter.length; }, 0) + ' Mietverhältnisse') +
      (lv.length ? kpi('Leerstand', euro(lk), 'trägt der Vermieter') : '') + '</div></a>';
  });
  return h + '</div><div class="row-actions" style="margin-top:12px"><button class="btn" data-act="objektNeu">+ Objekt</button></div></main>';
}
function ansichtFristen() {
  var f = offeneFristen(), h = kopf('Fristen', 'Abrechnung', '');
  h += '<div class="info">Die Abrechnung muss dem Mieter spätestens zwölf Monate nach Ende des Abrechnungszeitraums zugehen (§ 556 Abs. 3 BGB). Danach ist eine Nachzahlung ausgeschlossen, wenn du die Verspätung zu vertreten hast.</div>';
  h += f.length ? '<div class="card list">' + f.map(fristZeile).join('') + '</div>' : '<div class="empty"><b>Alles erledigt</b>Es gibt keine offenen Abrechnungen.</div>';
  return h + '</main>';
}

/* ---------- Objekt ---------- */
function objektFelder() { return [
  { k: 'name', l: 'Name', t: 'text' }, { k: 'adresse', l: 'Adresse', t: 'text' },
  { k: 'keineCO2', l: 'Keine CO₂-Kosten (z. B. Strom, Fernwärme ohne Angabe)', t: 'check' },
  { k: 'co2Ausnahme', l: 'Beschränkung nach § 9 CO2KostAufG', t: 'select', opts: [[0, 'Keine Beschränkung'], [1, 'Eine Maßnahme verhindert (Vermieteranteil halbiert)'], [2, 'Beide Maßnahmen verhindert (Mieter trägt 100 %)']] },
  { k: 'bezugsflaeche', l: 'Bezugsfläche für CO₂ in m² (leer = Summe der Einheiten)', t: 'num' }]; }
acts.objektNeu = function () {
  formular('Neues Objekt', objektFelder(), { co2Ausnahme: 0 }, function (w) {
    if (!w.name.trim()) return 'Bitte einen Namen eingeben.';
    var o = { id: uid(), name: w.name.trim(), adresse: w.adresse, keineCO2: !!w.keineCO2, co2Ausnahme: +w.co2Ausnahme, bezugsflaeche: w.bezugsflaeche || null, einheiten: [], kosten: [] };
    S.objekte.push(o); sichern(); go('#/o/' + o.id + '/einheiten');
  });
};
acts.objektEdit = function (d) {
  var o = obj(d.id);
  formular('Objekt bearbeiten', objektFelder(), o, function (w) {
    if (!w.name.trim()) return 'Bitte einen Namen eingeben.';
    o.name = w.name.trim(); o.adresse = w.adresse; o.keineCO2 = !!w.keineCO2; o.co2Ausnahme = +w.co2Ausnahme; o.bezugsflaeche = w.bezugsflaeche || null; neu();
  }, { loeschen: function () { S.objekte = S.objekte.filter(function (x) { return x !== o; }); Belege.alle().then(function (a) { a.filter(function (b) { return b.oid === o.id; }).forEach(function (b) { Belege.del(b.id); }); }); sichern(); go('#/objekte'); } });
};
function ansichtObjekte() {
  var h = kopf('Objekte', 'Vermieter', '', '<button class="btn small" data-act="objektNeu">+ Objekt</button>');
  h += S.objekte.length ? '<div class="card list">' + S.objekte.map(function (o) { return '<a class="li" href="#/o/' + o.id + '/einheiten"><span class="t">' + esc(o.name) + '</span><span class="s">' + esc(o.adresse || '') + ' · ' + o.einheiten.length + ' Einheiten</span></a>'; }).join('') + '</div>' : '<div class="empty"><b>Noch kein Objekt</b><div class="row-actions"><button class="btn primary" data-act="objektNeu">Objekt anlegen</button></div></div>';
  return h + '</main>';
}
function objektTabs(oid, akt) {
  var t = [['einheiten', 'Einheiten'], ['kosten', 'Kosten'], ['zaehler', 'Zähler'], ['belege', 'Belege'], ['steuer', 'Steuer']];
  return '<nav class="seg">' + t.map(function (x) { return '<a href="#/o/' + oid + '/' + x[0] + '"' + (akt === x[0] ? ' aria-current="page"' : '') + '>' + x[1] + '</a>'; }).join('') + '</nav>';
}
function ansichtObjekt(oid, tab) {
  if (oid === 'liste' || !oid) return ansichtObjekte();
  var o = obj(oid); if (!o) return kopf('Nicht gefunden', '', '#/objekte') + '<p class="note">Dieses Objekt gibt es nicht mehr.</p></main>';
  var h = kopf(o.name, 'Objekt', '#/objekte', '<button class="btn small" data-act="objektEdit" data-id="' + o.id + '">Bearbeiten</button>') + objektTabs(o.id, tab);
  if (tab === 'kosten') return h + tabKosten(o) + '</main>';
  if (tab === 'zaehler') return h + tabZaehler(o) + '</main>';
  if (tab === 'belege') return h + tabBelege(o) + '</main>';
  if (tab === 'steuer') return h + tabSteuer(o) + '</main>';
  return h + tabEinheiten(o) + '</main>';
}
/* Route #/objekte statt #/o/liste */
var _route = route; route = function () { var r = _route(); if (r.v === 'objekte') { r.v = 'o'; r.teile = ['o', 'liste']; } return r; };

/* ---------- Einheiten ---------- */
function tabEinheiten(o) {
  var h = '<div class="row-actions"><button class="btn primary" data-act="einheitNeu" data-o="' + o.id + '">+ Einheit</button></div>';
  if (!o.einheiten.length) return h + '<div class="empty"><b>Noch keine Einheit</b>Lege Wohnungen oder Gewerbe an. Die Fläche braucht die Verteilung nach Wohnfläche.</div>';
  o.einheiten.forEach(function (e) {
    var lv = NK.leerstand(o, e, S.jahr);
    h += '<h2>' + esc(e.name) + ' · ' + zahl(e.flaeche, 1) + ' m² · ' + e.personen + ' Pers.' + (e.gewerblich ? ' · Gewerbe' : '') + '</h2><div class="card list">';
    e.mieter.slice().sort(function (a, b) { return a.von < b.von ? 1 : -1; }).forEach(function (m) {
      var k = NK.aktuell(m);
      h += '<a class="li" href="#/m/' + o.id + '/' + e.id + '/' + m.id + '"><span class="t">' + esc(m.name) + '</span><span class="s">' + datum(m.von) + ' – ' + (m.bis ? datum(m.bis) : 'laufend') + ' · Kalt ' + euro(k.kalt) + ' · NK ' + euro(k.vz) + '</span></a>';
    });
    h += '<div class="li nolink"><span><button class="btn small" data-act="mieterNeu" data-o="' + o.id + '" data-e="' + e.id + '">+ Mieter</button> <button class="btn small" data-act="einheitEdit" data-o="' + o.id + '" data-e="' + e.id + '">Einheit bearbeiten</button></span></div></div>';
    if (lv.tage > 0) h += '<p class="note"><b>Leerstand ' + S.jahr + ':</b> ' + lv.tage + ' von ' + lv.periodenTage + ' Tagen. Kosten beim Vermieter: <b>' + euro(lv.kosten) + '</b>' + (lv.vorlaeufig ? ' (vorläufig)' : '') + '. Diese Kosten dürfen nicht auf andere Mieter umgelegt werden.</p>';
  });
  return h;
}
function einheitFelder() { return [{ k: 'name', l: 'Bezeichnung', t: 'text' }, { k: 'flaeche', l: 'Wohn-/Nutzfläche in m²', t: 'num' }, { k: 'personen', l: 'Personen (gilt ohne Mieter, z. B. Eigennutzung)', t: 'num' }, { k: 'gewerblich', l: 'Gewerblich genutzt', t: 'check' }]; }
acts.einheitNeu = function (d) {
  var o = obj(d.o);
  formular('Neue Einheit', einheitFelder(), { personen: 1 }, function (w) { if (!w.name.trim()) return 'Bitte eine Bezeichnung eingeben.'; o.einheiten.push({ id: uid(), name: w.name.trim(), flaeche: w.flaeche, personen: Math.round(w.personen), gewerblich: !!w.gewerblich, staende: [], mieter: [] }); neu(); });
};
acts.einheitEdit = function (d) {
  var o = obj(d.o), e = einheitOf(o, d.e);
  formular('Einheit bearbeiten', einheitFelder(), e, function (w) { if (!w.name.trim()) return 'Bitte eine Bezeichnung eingeben.'; e.name = w.name.trim(); e.flaeche = w.flaeche; e.personen = Math.round(w.personen); e.gewerblich = !!w.gewerblich; neu(); },
    { loeschen: function () { o.einheiten = o.einheiten.filter(function (x) { return x !== e; }); neu(); } });
};
function mieterFelder() { return [
  { k: 'name', l: 'Name', t: 'text' }, { k: 'von', l: 'Einzug', t: 'date' }, { k: 'hatBis', l: 'Auszug eintragen', t: 'check' }, { k: 'bis', l: 'Auszug', t: 'date', show: function (w) { return w.hatBis; } },
  { k: 'kalt', l: 'Kaltmiete pro Monat bei Einzug (€)', t: 'num' }, { k: 'vz', l: 'Nebenkosten-Vorauszahlung pro Monat bei Einzug (€)', t: 'num' },
  { k: 'personen', l: 'Personen bei Einzug', t: 'num' }, { k: 'email', l: 'E-Mail (für den Versand)', t: 'email' }, { k: 'anschrift', l: 'Anschrift für Schreiben (leer = Anschrift des Objekts)', t: 'area' }]; }
acts.mieterNeu = function (d) {
  var o = obj(d.o), e = einheitOf(o, d.e);
  formular('Neuer Mieter', mieterFelder(), { von: NK.heute(), personen: 1 }, function (w) {
    if (!w.name.trim()) return 'Bitte einen Namen eingeben.'; if (!NK.isDate(w.von)) return 'Bitte das Einzugsdatum eingeben.';
    if (w.hatBis && (!NK.isDate(w.bis) || w.bis < w.von)) return 'Das Auszugsdatum muss nach dem Einzug liegen.';
    var m = { id: uid(), name: w.name.trim(), von: w.von, bis: w.hatBis ? w.bis : '', kalt: w.kalt, vz: w.vz, personen: Math.max(1, Math.round(w.personen)), email: w.email.trim(), anschrift: w.anschrift, basis: 'soll', kaution: 0, kautionEingang: '', kautionZinsen: 0, kautionEinbehalt: null, kautionZurueck: '', aenderungen: [], personenAend: [], zahlungen: [], zugaenge: [] };
    e.mieter.push(m); sichern(); go('#/m/' + o.id + '/' + e.id + '/' + m.id);
  });
};
acts.mieterEdit = function (d) {
  var c = ctxM(d.o, d.e, d.m), m = c.m, w0 = Object.assign({}, m, { hatBis: !!m.bis });
  formular('Mieter bearbeiten', mieterFelder(), w0, function (w) {
    if (!w.name.trim()) return 'Bitte einen Namen eingeben.'; if (!NK.isDate(w.von)) return 'Bitte das Einzugsdatum eingeben.';
    if (w.hatBis && (!NK.isDate(w.bis) || w.bis < w.von)) return 'Das Auszugsdatum muss nach dem Einzug liegen.';
    m.name = w.name.trim(); m.von = w.von; m.bis = w.hatBis ? w.bis : ''; m.kalt = w.kalt; m.vz = w.vz; m.personen = Math.max(1, Math.round(w.personen)); m.email = w.email.trim(); m.anschrift = w.anschrift; neu();
  }, { loeschen: function () { c.e.mieter = c.e.mieter.filter(function (x) { return x !== m; }); sichern(); go('#/o/' + c.o.id + '/einheiten'); } });
};

/* ---------- Kosten ---------- */
function alleArten(o, jahr) {
  var l = NK.STANDARDARTEN.slice();
  o.einheiten.forEach(function (e) { (e.staende || []).forEach(function (s) { l.push(s.art); }); });
  (o.kosten || []).forEach(function (k) { if (k.art && (jahr == null || +k.jahr === jahr)) l.push(k.art); });
  return NK.eindeutigeArten(l);
}
function tabKosten(o) {
  var j = S.jahr, pos = (o.kosten || []).filter(function (k) { return +k.jahr === j; });
  var h = '<div class="row-actions">' + jahrWahl() + '<button class="btn primary" data-act="kostenNeu" data-o="' + o.id + '">+ Kosten</button></div>';
  h += '<div class="kpis">' + kpi('Umlagefähig ' + j, euro(kostenSumme(o, j, true)), pos.some(function (k) { return k.vorlaeufig && k.umlagefaehig !== false; }) ? 'enthält Planwerte' : '') + kpi('Nicht umlagefähig', euro(kostenSumme(o, j, false)), 'wird nicht abgerechnet') + '</div>';
  if (!pos.length) h += '<div class="empty"><b>Noch keine Kosten für ' + j + '</b>Trage Positionen aus der WEG-Abrechnung oder dem Wirtschaftsplan ein. Planwerte markierst du als „vorläufig“.</div>';
  else h += '<div class="card list">' + pos.map(function (k) {
    var tags = [schlName(k.schluessel)]; if (k.art) tags.push(k.art); if (k.umlagefaehig === false) tags.push('nicht umlagefähig'); if (k.vorlaeufig) tags.push('Plan'); if ((k.belege || []).length) tags.push('📎 ' + k.belege.length);
    return '<button class="li" data-act="kostenEdit" data-o="' + o.id + '" data-k="' + k.id + '"><span class="t">' + esc(k.bez) + '</span><span class="s">' + esc(tags.join(' · ')) + '</span><span class="r">' + euro(k.betrag) + '</span></button>';
  }).join('') + '</div>';
  var vor = (o.kosten || []).filter(function (k) { return +k.jahr === j - 1; });
  h += '<div class="row-actions" style="margin-top:12px">' + (vor.length && !pos.length ? '<button class="btn" data-act="kostenVorjahr" data-o="' + o.id + '">Kosten aus ' + (j - 1) + ' übernehmen</button>' : '') + '</div>';
  return h;
}
function kostenFelder(o, jahr) {
  var arten = alleArten(o, jahr);
  return [
    { k: 'bez', l: 'Bezeichnung', t: 'text' }, { k: 'betrag', l: 'Betrag in € (Gesamtbetrag des Hauses)', t: 'num' },
    { k: 'schluessel', l: 'Verteilung', t: 'select', opts: SCHL },
    { k: 'art', l: 'Zählerart', t: 'select', opts: arten.map(function (a) { return [a, a]; }).concat([['__neu', 'Andere …']]), show: function (w) { return w.schluessel === 'verbrauch' || w.schluessel === 'heizkosten'; } },
    { k: 'artNeu', l: 'Name der Zählerart', t: 'text', show: function (w) { return (w.schluessel === 'verbrauch' || w.schluessel === 'heizkosten') && w.art === '__neu'; } },
    { k: 'verbrauchsanteil', l: 'Verbrauchsanteil in % (50–70, Standard 70)', t: 'num', show: function (w) { return w.schluessel === 'heizkosten'; } },
    { k: 'co2Kosten', l: 'Darin enthaltene CO₂-Kosten in €', t: 'num', show: function (w) { return w.schluessel === 'heizkosten' && !o.keineCO2; } },
    { k: 'co2Kg', l: 'CO₂-Ausstoß in kg (laut Brennstoffrechnung)', t: 'num', show: function (w) { return w.schluessel === 'heizkosten' && !o.keineCO2; } },
    { k: 'umlagefaehig', l: 'Umlagefähig (nach Betriebskostenverordnung)', t: 'check', h: 'Nicht umlagefähige Kosten, etwa Verwaltung oder Instandhaltung, erscheinen nicht in der Abrechnung.' },
    { k: 'vorlaeufig', l: 'Vorläufig (Planwert)', t: 'check', show: function (w) { return w.umlagefaehig; }, h: 'Solange eine Position vorläufig ist, bleibt die Abrechnung eine Vorschau.' }];
}
function kostenSpeichern(o, k, w, jahr) {
  if (!w.bez.trim()) return 'Bitte eine Bezeichnung eingeben.';
  var art = w.art === '__neu' ? w.artNeu.trim() : w.art, brauchtArt = w.schluessel === 'verbrauch' || w.schluessel === 'heizkosten';
  if (brauchtArt && !art) return 'Bitte eine Zählerart wählen.';
  var d = { bez: w.bez.trim(), betrag: w.betrag, jahr: jahr, schluessel: w.schluessel, art: brauchtArt ? NK.anzeigename(art) : '', umlagefaehig: !!w.umlagefaehig, vorlaeufig: !!w.umlagefaehig && !!w.vorlaeufig,
    verbrauchsanteil: w.schluessel === 'heizkosten' && w.verbrauchsanteil ? w.verbrauchsanteil : null, co2Kosten: w.schluessel === 'heizkosten' ? w.co2Kosten : 0, co2Kg: w.schluessel === 'heizkosten' ? w.co2Kg : 0 };
  if (k) Object.assign(k, d); else { d.id = uid(); d.belege = []; o.kosten.push(d); }
  neu();
}
acts.kostenNeu = function (d) {
  var o = obj(d.o), j = S.jahr, arten = alleArten(o, j);
  var f = kostenFelder(o, j), w = { schluessel: 'wohnflaeche', umlagefaehig: true, vorlaeufig: false, art: arten[0] };
  var o2 = formular('Kosten ' + j, f, w, function (x) { return kostenSpeichern(o, null, x, j); });
  /* Umlagefähigkeit aus dem Katalog vorschlagen, solange der Name getippt wird */
  var nameEl = o2.el.querySelector('[data-k="bez"]'), umEl = o2.el.querySelector('[data-k="umlagefaehig"]'), berührt = false;
  umEl.addEventListener('change', function () { berührt = true; });
  nameEl.addEventListener('input', function () { var v = katalogUml(nameEl.value); if (v != null && !berührt) { umEl.checked = v; umEl.dispatchEvent(new Event('input', { bubbles: true })); } });
};
acts.kostenEdit = function (d) {
  var o = obj(d.o), k = o.kosten.filter(function (x) { return x.id === d.k; })[0], w = Object.assign({}, k, { art: k.art || alleArten(o, +k.jahr)[0], umlagefaehig: k.umlagefaehig !== false });
  var kopfHtml = '<div class="row-actions"><button class="btn small" data-act="belegZuKosten" data-o="' + o.id + '" data-k="' + k.id + '">📎 Beleg hinzufügen (' + (k.belege || []).length + ')</button></div>';
  formular('Kosten bearbeiten', kostenFelder(o, +k.jahr), w, function (x) { return kostenSpeichern(o, k, x, +k.jahr); }, { loeschen: function () { o.kosten = o.kosten.filter(function (y) { return y !== k; }); neu(); }, kopf: kopfHtml });
};
acts.kostenVorjahr = function (d) {
  var o = obj(d.o), j = S.jahr;
  if (!confirm('Die Positionen aus ' + (j - 1) + ' werden für ' + j + ' als vorläufig (Planwert) kopiert. Danach die Beträge anpassen.')) return;
  o.kosten.filter(function (k) { return +k.jahr === j - 1; }).slice().forEach(function (k) { o.kosten.push(Object.assign({}, k, { id: uid(), jahr: j, vorlaeufig: k.umlagefaehig !== false, belege: [] })); });
  neu();
};
acts.belegZuKosten = function (d) {
  var o = obj(d.o), k = o.kosten.filter(function (x) { return x.id === d.k; })[0];
  dateiWahl('image/*,application/pdf', true, function (files) {
    belegHinzufuegen(files, o.id, +k.jahr).then(function (ids) { k.belege = (k.belege || []).concat(ids); sichern(); alert(ids.length + ' Beleg(e) abgelegt und zugeordnet.'); render(); });
  });
};
function dateiWahl(accept, multiple, cb) { var i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = !!multiple; i.style.display = 'none'; document.body.appendChild(i); i.onchange = function () { if (i.files && i.files.length) cb(i.files); i.remove(); }; i.click(); }

/* ---------- Zähler ---------- */
function tabZaehler(o) {
  var j = S.jahr, h = '<div class="row-actions">' + jahrWahl() + '</div><div class="info">Zähler stehen je Einheit. Der Verbrauch eines Jahres ergibt sich aus dem Stand zum Jahresanfang (zum Beispiel 31.12. des Vorjahres) und dem Stand zum Jahresende.</div>';
  if (!o.einheiten.length) return h + '<div class="empty">Lege zuerst eine Einheit an.</div>';
  o.einheiten.forEach(function (e) {
    var arten = NK.eindeutigeArten(NK.STANDARDARTEN.concat((e.staende || []).map(function (s) { return s.art; }), (o.kosten || []).filter(function (k) { return +k.jahr === j && k.art; }).map(function (k) { return k.art; })));
    h += '<h2>' + esc(e.name) + '</h2><div class="row-actions"><button class="btn small" data-act="uebergabe" data-o="' + o.id + '" data-e="' + e.id + '">Alle Zähler ablesen (Übergabe)</button></div><div class="cards">';
    arten.forEach(function (a) {
      var st = (e.staende || []).filter(function (s) { return NK.artGleich(s.art, a); }).sort(function (x, y) { return x.datum === y.datum ? (y.neu ? 1 : 0) - (x.neu ? 1 : 0) : (x.datum < y.datum ? 1 : -1); });
      var v = NK.verbrauchEinheit(e, a, NK.jahrPeriode(j), 31);
      h += '<div class="card"><div class="pad" style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><b>' + esc(a) + '</b><div class="note" style="margin:2px 0 0">' + (v == null ? 'Verbrauch ' + j + ': noch nicht berechenbar' : 'Verbrauch ' + j + ': ' + zahl(v, 3)) + '</div></div><button class="btn small" data-act="standNeu" data-o="' + o.id + '" data-e="' + e.id + '" data-a="' + esc(a) + '">+ Stand</button></div>';
      if (st.length) h += '<div class="list">' + st.map(function (s) { return '<button class="li" data-act="standEdit" data-o="' + o.id + '" data-e="' + e.id + '" data-s="' + s.id + '"><span class="t">' + datum(s.datum) + (s.neu ? ' · neuer Zähler' : '') + '</span><span class="r">' + zahl(s.wert, 3) + '</span></button>'; }).join('') + '</div>';
      h += '</div>';
    });
    h += '</div>';
  });
  return h;
}
function standFelder(arten, mitTausch) {
  var f = [{ k: 'art', l: 'Zählerart', t: 'select', opts: arten.map(function (a) { return [a, a]; }).concat([['__neu', 'Andere …']]) }, { k: 'artNeu', l: 'Name der Zählerart', t: 'text', show: function (w) { return w.art === '__neu'; } },
    { k: 'datum', l: 'Ablesedatum', t: 'date' }, { k: 'wert', l: 'Zählerstand', t: 'num' }];
  if (mitTausch) f.push({ k: 'getauscht', l: 'Zähler wurde getauscht', t: 'check', h: 'Dann trägst du zusätzlich den Endstand des alten Zählers ein. „Zählerstand“ ist der Anfangsstand des neuen.' }, { k: 'alt', l: 'Endstand des alten Zählers', t: 'num', show: function (w) { return w.getauscht; } });
  return f;
}
acts.standNeu = function (d) {
  var o = obj(d.o), e = einheitOf(o, d.e), arten = alleArten(o);
  formular('Zählerstand', standFelder(arten, true), { art: d.a || arten[0], datum: NK.heute() }, function (w) {
    var art = w.art === '__neu' ? NK.anzeigename(w.artNeu.trim()) : w.art; if (!art) return 'Bitte eine Zählerart angeben.'; if (!NK.isDate(w.datum)) return 'Bitte das Datum eingeben.';
    if (w.getauscht) e.staende.push({ id: uid(), art: art, datum: w.datum, wert: w.alt, neu: false });
    e.staende.push({ id: uid(), art: art, datum: w.datum, wert: w.wert, neu: !!w.getauscht }); neu();
  });
};
acts.standEdit = function (d) {
  var o = obj(d.o), e = einheitOf(o, d.e), s = e.staende.filter(function (x) { return x.id === d.s; })[0];
  formular('Zählerstand bearbeiten', [{ k: 'datum', l: 'Ablesedatum', t: 'date' }, { k: 'wert', l: 'Zählerstand', t: 'num' }, { k: 'neu', l: 'Erster Stand eines neuen Zählers (Tausch)', t: 'check' }], s,
    function (w) { if (!NK.isDate(w.datum)) return 'Bitte das Datum eingeben.'; s.datum = w.datum; s.wert = w.wert; s.neu = !!w.neu; neu(); }, { loeschen: function () { e.staende = e.staende.filter(function (x) { return x !== s; }); neu(); } });
};
acts.uebergabe = function (d) {
  var o = obj(d.o), e = einheitOf(o, d.e), arten = NK.eindeutigeArten(NK.STANDARDARTEN.concat((e.staende || []).map(function (s) { return s.art; }), alleArten(o, S.jahr)));
  var felder = [{ k: 'datum', l: 'Datum (Einzug, Auszug oder Jahreswechsel)', t: 'date' }].concat(arten.map(function (a, i) { return { k: 'z' + i, l: a + ' (leer lassen, wenn nicht abgelesen)', t: 'num' }; }));
  var ov = formular('Alle Zähler ablesen', felder, { datum: NK.heute() }, function (w) {
    if (!NK.isDate(w.datum)) return 'Bitte das Datum eingeben.'; var n = 0;
    arten.forEach(function (a, i) { var el = ov.el.querySelector('[data-k="z' + i + '"]'); if (el && el.value.trim() !== '') { e.staende.push({ id: uid(), art: a, datum: w.datum, wert: num(el.value), neu: false }); n++; } });
    if (!n) return 'Bitte mindestens einen Zählerstand eingeben.'; neu();
  });
};

/* ---------- Belege ---------- */
function tabBelege(o) {
  var h = '<div class="row-actions">' + jahrWahl() + '<button class="btn primary" data-act="belegNeu" data-o="' + o.id + '">+ Beleg</button></div><div class="info">Fotos und PDFs bleiben auf diesem Gerät. Der Mieter darf die Belege einsehen. Daraus entsteht der Beleg-Auszug unter der Abrechnung.</div><div id="belegListe"><p class="note">Lädt …</p></div>';
  Belege.alle().then(function (a) {
    var el = document.getElementById('belegListe'); if (!el) return;
    var l = a.filter(function (b) { return b.oid === o.id && +b.jahr === S.jahr; }).sort(function (x, y) { return x.am < y.am ? 1 : -1; });
    el.innerHTML = l.length ? '<div class="card list">' + l.map(function (b) {
      var z = (o.kosten || []).filter(function (k) { return (k.belege || []).indexOf(b.id) >= 0; }).map(function (k) { return k.bez; });
      return '<button class="li" data-act="belegAnsehen" data-o="' + o.id + '" data-b="' + b.id + '"><span class="t">' + (b.typ === 'pdf' ? '📄 ' : '🖼️ ') + esc(b.titel) + '</span><span class="s">' + datum(b.am) + ' · ' + (z.length ? 'zu: ' + esc(z.join(', ')) : 'keiner Position zugeordnet') + '</span></button>';
    }).join('') + '</div>' : '<div class="empty"><b>Keine Belege für ' + S.jahr + '</b></div>';
  });
  return h;
}
acts.belegNeu = function (d) { var o = obj(d.o); dateiWahl('image/*,application/pdf', true, function (files) { belegHinzufuegen(files, o.id, S.jahr).then(function (ids) { alert(ids.length + ' Beleg(e) abgelegt.'); render(); }); }); };
acts.belegAnsehen = function (d) {
  var o = obj(d.o);
  Belege.alle().then(function (a) {
    var b = a.filter(function (x) { return x.id === d.b; })[0]; if (!b) return;
    var url = URL.createObjectURL(b.blob), pos = (o.kosten || []).filter(function (k) { return +k.jahr === +b.jahr; });
    var opts = '<option value="">Keiner Position zugeordnet</option>' + pos.map(function (k) { return '<option value="' + k.id + '"' + ((k.belege || []).indexOf(b.id) >= 0 ? ' selected' : '') + '>' + esc(k.bez) + '</option>'; }).join('');
    var ov = overlay('<h3>' + esc(b.titel) + '</h3>' + (b.typ === 'bild' ? '<img src="' + url + '" alt="" style="max-width:100%;border-radius:10px">' : '<p><a class="btn" href="' + url + '" target="_blank" rel="noopener">PDF öffnen</a></p>') +
      '<label class="fld">Zu Kostenposition<select data-z="1">' + opts + '</select></label><div class="row-actions"><button class="btn primary" data-s="ok">Zuordnung sichern</button><button class="btn danger" data-s="del">Löschen</button><button class="btn" data-s="x">Schließen</button></div>', function () { URL.revokeObjectURL(url); });
    ov.el.addEventListener('click', function (e) {
      var s = e.target.closest('[data-s]'); if (!s) return;
      if (s.dataset.s === 'x') return ov.close();
      if (s.dataset.s === 'ok') { var id = ov.el.querySelector('[data-z]').value; pos.concat(o.kosten).forEach(function (k) { k.belege = (k.belege || []).filter(function (x) { return x !== b.id; }); }); if (id) { var k = o.kosten.filter(function (x) { return x.id === id; })[0]; k.belege.push(b.id); } sichern(); ov.close(); render(); }
      if (s.dataset.s === 'del' && confirm('Beleg löschen?')) { o.kosten.forEach(function (k) { k.belege = (k.belege || []).filter(function (x) { return x !== b.id; }); }); Belege.del(b.id).then(function () { sichern(); ov.close(); render(); }); }
    });
  });
};

/* ---------- Steuer (Anlage V) ---------- */
function tabSteuer(o) {
  var a = NK.anlageV(o, S.jahr), h = '<div class="row-actions">' + jahrWahl() + '<button class="btn" data-act="avDruck" data-o="' + o.id + '">PDF / Drucken</button><button class="btn" data-act="avCsv" data-o="' + o.id + '">Tabelle (CSV)</button></div>';
  h += '<h2>Einnahmen ' + a.jahr + '</h2><div class="card"><table class="tb"><thead><tr><th>Einheit</th><th class="n">Kalt</th><th class="n">Umlagen</th></tr></thead><tbody>' + a.einheiten.map(function (e) { return '<tr><td>' + esc(e.name) + '</td><td class="n">' + euro(e.kalt) + '</td><td class="n">' + euro(e.umlagen) + '</td></tr>'; }).join('') + '</tbody><tfoot><tr><td>Summe</td><td class="n">' + euro(a.kalt) + '</td><td class="n">' + euro(a.umlagen) + '</td></tr></tfoot></table></div>';
  h += '<h2>Werbungskosten</h2><div class="card"><table class="tb"><tbody>' + (a.kosten.length ? a.kosten.map(function (k) { return '<tr><td>' + esc(k.bez) + '<div class="note" style="margin:0">' + (k.umlagefaehig ? 'umlagefähig' : 'nicht umlagefähig') + (k.vorlaeufig ? ' · Plan' : '') + '</div></td><td class="n">' + euro(k.betrag) + '</td></tr>'; }).join('') : '<tr><td>Keine Kosten erfasst.</td><td></td></tr>') + '</tbody><tfoot><tr><td>Summe</td><td class="n">' + euro(a.werbung) + '</td></tr></tfoot></table></div>';
  h += '<div class="kpis" style="margin-top:12px">' + kpi('Einnahmen', euro(a.einnahmen)) + kpi('Überschuss vor AfA und Zinsen', euro(a.ueberschuss), '', a.ueberschuss < 0 ? 't-bad' : '') + '</div>';
  h += '<p class="note">Kaltmiete ist das Soll laut Mietverlauf, Umlagen sind die erfassten Zahlungen. Nicht enthalten: AfA, Schuldzinsen, verteilte Erhaltungsaufwendungen. Die Anlage V folgt dem Zu- und Abflussprinzip, die Kosten hier sind nach Abrechnungsjahr erfasst. Bitte mit dem Steuerberater abstimmen.</p>';
  return h;
}
acts.avDruck = function (d) { var o = obj(d.o), a = NK.anlageV(o, S.jahr); drucken(docAnlageV(a), 'Steuerübersicht ' + a.jahr + ' ' + o.name); };
acts.avCsv = function (d) {
  var o = obj(d.o), a = NK.anlageV(o, S.jahr), z = function (x) { return String(x).replace('.', ','); }, f = function (t) { return '"' + String(t).replace(/"/g, '""') + '"'; };
  var l = ['Objekt;' + f(a.objekt), 'Jahr;' + a.jahr, '', 'Einnahmen;Kaltmiete;Umlagen;Summe'];
  a.einheiten.forEach(function (e) { l.push(f(e.name) + ';' + z(e.kalt) + ';' + z(e.umlagen) + ';' + z(NK.r2(e.kalt + e.umlagen))); });
  l.push('Summe;' + z(a.kalt) + ';' + z(a.umlagen) + ';' + z(a.einnahmen), '', 'Werbungskosten;Betrag;Umlagefähig');
  a.kosten.forEach(function (k) { l.push(f(k.bez) + ';' + z(k.betrag) + ';' + (k.umlagefaehig ? 'ja' : 'nein')); });
  l.push('Summe;' + z(a.werbung) + ';', '', 'Überschuss vor AfA und Schuldzinsen;' + z(a.ueberschuss));
  dateiSpeichern('AnlageV_' + a.jahr + '_' + a.objekt.replace(/[^\wäöüÄÖÜß-]+/g, '_') + '.csv', 'text/csv', '﻿' + l.join('\n'));
};

/* ---------- Mieter ---------- */
var MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
function ansichtMieter(oid, eid, mid) {
  var c = ctxM(oid, eid, mid); if (!c) return kopf('Nicht gefunden', '', '#/objekte') + '<p class="note">Dieser Mieter existiert nicht mehr.</p></main>';
  var m = c.m, k = NK.aktuell(m), key = 'data-o="' + c.o.id + '" data-e="' + c.e.id + '" data-m="' + m.id + '"', j = S.jahr;
  var h = kopf(m.name, c.e.name + ' · ' + c.o.name, '#/o/' + c.o.id + '/einheiten', '<button class="btn small" data-act="mieterEdit" ' + key + '>Bearbeiten</button>');
  h += '<div class="card pad"><div class="note" style="margin:0">' + datum(m.von) + ' – ' + (m.bis ? datum(m.bis) : 'laufend') + ' · ' + m.personen + ' Person(en)' + (m.email ? ' · ' + esc(m.email) : '') + '</div></div>';

  /* Miete */
  h += '<h2>Miete</h2><div class="kpis">' + kpi('Kaltmiete', euro(k.kalt)) + kpi('Warmmiete', euro(k.kalt + k.vz), 'inkl. ' + euro(k.vz) + ' NK') + '</div><div class="card list">';
  NK.stufen(m).forEach(function (s) { h += '<div class="li nolink"><span class="t">' + (s.bem === 'Bei Einzug' ? 'Bei Einzug' : 'ab ' + datum(s.ab)) + '</span><span class="s">' + (s.bem && s.bem !== 'Bei Einzug' ? esc(s.bem) : '') + '</span><span class="r">Kalt ' + euro(s.kalt) + '<br><span class="s">NK ' + euro(s.vz) + '</span></span></div>'; });
  h += '</div><div class="row-actions" style="margin-top:8px"><button class="btn small" data-act="mieteAendern" ' + key + '>Miete ändern</button>' + ((m.aenderungen || []).length ? '<button class="btn small danger" data-act="mieteLetzte" ' + key + '>Letzte Änderung löschen</button>' : '') + '<button class="btn small" data-act="personenAendern" ' + key + '>Personenzahl ändern</button></div>';
  if ((m.personenAend || []).length) h += '<p class="note">Personen: ' + m.personenAend.slice().sort(function (a, b) { return a.ab < b.ab ? -1 : 1; }).map(function (p) { return 'ab ' + datum(p.ab) + ': ' + p.anzahl; }).join(' · ') + '</p>';

  /* Zahlungen */
  var soll = NK.sollMonate(m, j), ist = NK.istVorauszahlungen(m, NK.jahrPeriode(j)), sollSum = soll.reduce(function (a, x) { return a + x.wert; }, 0);
  h += '<h2>Vorauszahlungen ' + j + '</h2><div class="row-actions">' + jahrWahl() + '<select class="sel" data-chg="basis" ' + key + ' aria-label="Abrechnungsbasis"><option value="soll"' + (m.basis !== 'ist' ? ' selected' : '') + '>Abrechnen mit Soll</option><option value="ist"' + (m.basis === 'ist' ? ' selected' : '') + '>Abrechnen mit tatsächlich gezahlt</option></select></div>';
  h += '<div class="kpis">' + kpi('Soll laut Vertrag', euro(sollSum)) + kpi('Tatsächlich gezahlt', euro(ist), ist < sollSum - 0.004 ? 'Differenz ' + euro(ist - sollSum) : '', ist < sollSum - 0.004 ? 't-mid' : '') + '</div>';
  var monate = {}; soll.forEach(function (x) { monate[x.monat] = { soll: x.wert, ist: 0 }; });
  (m.zahlungen || []).forEach(function (z) { if (z.monat.slice(0, 4) === String(j)) { (monate[z.monat] = monate[z.monat] || { soll: 0, ist: 0 }).ist += +z.betrag || 0; } });
  var keys = Object.keys(monate).sort();
  h += keys.length ? '<div class="card list">' + keys.map(function (mo) { var x = monate[mo], diff = NK.r2(x.ist - x.soll); return '<button class="li" data-act="zahlung" ' + key + ' data-mo="' + mo + '"><span class="t">' + MONATE[+mo.slice(5, 7) - 1] + '</span><span class="s">Soll ' + euro(x.soll) + (diff < -0.004 ? ' · fehlt ' + euro(-diff) : diff > 0.004 ? ' · mehr ' + euro(diff) : '') + '</span><span class="r ' + (x.ist <= 0 ? 't-bad' : diff < -0.004 ? 't-mid' : 't-good') + '">' + euro(x.ist) + '</span></button>'; }).join('') + '</div>' : '<p class="note">In ' + j + ' bestand kein Mietverhältnis.</p>';
  h += '<div class="row-actions" style="margin-top:8px"><button class="btn small" data-act="sollBuchen" ' + key + '>Fehlende Monate als gezahlt buchen (Soll)</button></div><p class="note">Tippe auf einen Monat, um den tatsächlich gezahlten Betrag einzutragen.</p>';

  /* Abrechnungen */
  var heute = NK.heute(), aktJ = +heute.slice(0, 4), von = NK.jahrVon(m.von), bis = Math.min(aktJ, m.bis ? NK.jahrVon(m.bis) : aktJ), zeilen = '';
  for (var y = bis; y >= von; y--) {
    var z = (m.zugaenge || []).filter(function (q) { return +q.jahr === y; })[0], st = NK.fristStatus(y, z && z.datum, heute), erg = NK.abrechnungFuer(c.o, c.e, m, y);
    zeilen += '<a class="li" href="#/a/' + c.o.id + '/' + c.e.id + '/' + m.id + '/' + y + '"><span class="t">Abrechnung ' + y + '</span><span class="s">' + (erg ? (erg.vorlaeufig ? 'Vorschau (Planwerte) · ' : '') + (erg.saldo > 0 ? 'Nachzahlung ' + euro(erg.saldo) : erg.saldo < 0 ? 'Guthaben ' + euro(-erg.saldo) : 'ausgeglichen') : 'noch nicht berechenbar') + '</span><span class="r">' + (y + '-12-31' >= heute ? pille('läuft', 'none') : stufePille(st)) + '</span></a>';
  }
  h += '<h2>Abrechnungen</h2><div class="card list">' + zeilen + '</div>';

  /* Mieterwechsel */
  var we = wechselEingabe(c), sch = NK.mieterwechsel(we), fertig = sch.filter(function (s) { return s.status === 'erledigt'; }).length, rel = sch.filter(function (s) { return s.status !== 'entfaellt'; }).length;
  h += '<h2>Mieterwechsel und Kaution</h2><div class="card pad">' + (m.bis ? '<div class="note" style="margin:0 0 8px">' + fertig + ' von ' + rel + ' Schritten erledigt</div>' : '') + sch.map(function (s) { return '<div style="display:flex;gap:10px;margin:8px 0"><span class="' + (s.status === 'erledigt' ? 't-good' : s.status === 'offen' ? 't-mid' : '') + '" style="width:22px;font-size:18px">' + (s.status === 'erledigt' ? '✓' : s.status === 'offen' ? '○' : '–') + '</span><div><b style="font-size:14px">' + esc(s.titel) + '</b><div class="note" style="margin:2px 0 0">' + esc(s.detail) + '</div></div></div>'; }).join('') +
    '<div class="row-actions" style="margin:10px 0 0">' + (m.bis ? '<button class="btn small" data-act="uebergabe" data-o="' + c.o.id + '" data-e="' + c.e.id + '">Zähler ablesen</button>' : '') + '<button class="btn small" data-act="kaution" ' + key + '>' + (m.kaution > 0 ? 'Kaution bearbeiten' : 'Kaution erfassen') + '</button></div></div>';
  return h + '</main>';
}
function wechselEingabe(c) {
  var m = c.m, heute = NK.heute(), jahr = NK.jahrVon(m.bis || heute), erg = NK.abrechnungFuer(c.o, c.e, m, jahr);
  var arten = NK.eindeutigeArten((c.e.staende || []).map(function (s) { return s.art; }).concat((c.o.kosten || []).filter(function (k) { return +k.jahr === jahr && k.art && k.umlagefaehig !== false; }).map(function (k) { return k.art; })));
  var mit = m.bis ? (c.e.staende || []).filter(function (s) { return Math.abs(NK.dn(s.datum) - NK.dn(m.bis)) <= 1; }).map(function (s) { return s.art; }) : [];
  return { auszug: m.bis || '', erforderlich: arten, mitStand: mit, abrechnung: !!erg, vorlaeufig: !!(erg && erg.vorlaeufig), zugestellt: (m.zugaenge || []).some(function (z) { return +z.jahr === jahr; }), saldo: erg ? erg.saldo : null, kaution: +m.kaution || 0, kautionZurueck: !!m.kautionZurueck };
}
acts.mieteAendern = function (d) {
  var c = ctxM(d.o, d.e, d.m), k = NK.aktuell(c.m);
  formular('Miete ändern', [{ k: 'ab', l: 'Gilt ab', t: 'date' }, { k: 'kalt', l: 'Kaltmiete pro Monat (€)', t: 'num' }, { k: 'vz', l: 'Nebenkosten-Vorauszahlung pro Monat (€)', t: 'num' }, { k: 'bem', l: 'Bemerkung (optional)', t: 'text' }],
    { ab: d.ab || NK.heute(), kalt: d.kalt != null && d.kalt !== '' ? +d.kalt : k.kalt, vz: d.vz != null && d.vz !== '' ? +d.vz : k.vz, bem: d.bem || '' }, function (w) {
      if (!NK.isDate(w.ab) || NK.dn(w.ab) <= NK.dn(c.m.von)) return 'Das Datum muss nach dem Einzug (' + datum(c.m.von) + ') liegen. Die Werte bei Einzug änderst du unter „Bearbeiten“.';
      c.m.aenderungen = (c.m.aenderungen || []).filter(function (a) { return a.ab !== w.ab; }); c.m.aenderungen.push({ ab: w.ab, kalt: w.kalt, vz: w.vz, bem: w.bem }); neu();
    });
};
acts.mieteLetzte = function (d) { var c = ctxM(d.o, d.e, d.m); if (!confirm('Letzte Änderung löschen?')) return; c.m.aenderungen.sort(function (a, b) { return a.ab < b.ab ? -1 : 1; }); c.m.aenderungen.pop(); neu(); };
acts.personenAendern = function (d) {
  var c = ctxM(d.o, d.e, d.m);
  formular('Personenzahl ändern', [{ k: 'ab', l: 'Gilt ab', t: 'date' }, { k: 'anzahl', l: 'Personen', t: 'num' }], { ab: NK.heute(), anzahl: c.m.personen }, function (w) { if (!NK.isDate(w.ab)) return 'Bitte ein Datum eingeben.'; if (w.anzahl < 1) return 'Mindestens eine Person.'; c.m.personenAend = (c.m.personenAend || []).filter(function (p) { return p.ab !== w.ab; }); c.m.personenAend.push({ ab: w.ab, anzahl: Math.round(w.anzahl) }); neu(); });
};
acts.zahlung = function (d) {
  var c = ctxM(d.o, d.e, d.m), m = c.m, mo = d.mo, vorher = (m.zahlungen || []).filter(function (z) { return z.monat === mo; }).reduce(function (a, z) { return a + (+z.betrag || 0); }, 0), soll = NK.sollMonate(m, +mo.slice(0, 4)).filter(function (x) { return x.monat === mo; })[0];
  formular(MONATE[+mo.slice(5, 7) - 1] + ' ' + mo.slice(0, 4), [{ k: 'betrag', l: 'Tatsächlich gezahlt (€)', t: 'num', h: 'Soll: ' + euro(soll ? soll.wert : 0) + '. Mit 0 entfernst du die Zahlung.' }], { betrag: vorher || (soll ? soll.wert : 0) }, function (w) {
    m.zahlungen = (m.zahlungen || []).filter(function (z) { return z.monat !== mo; }); if (w.betrag > 0) m.zahlungen.push({ id: uid(), monat: mo, datum: mo, betrag: w.betrag }); neu();
  });
};
acts.sollBuchen = function (d) {
  var c = ctxM(d.o, d.e, d.m), m = c.m, vorh = {}; (m.zahlungen || []).forEach(function (z) { vorh[z.monat] = 1; });
  var n = 0; NK.sollMonate(m, S.jahr).forEach(function (x) { if (!vorh[x.monat] && x.wert > 0) { m.zahlungen.push({ id: uid(), monat: x.monat, datum: x.monat, betrag: x.wert }); n++; } });
  alert(n ? n + ' Monat(e) als gezahlt gebucht. Weicht ein Monat ab, tippe ihn an und korrigiere den Betrag.' : 'Es fehlen keine Monate.'); neu();
};
document.addEventListener('change', function (e) {
  var b = e.target.closest('[data-chg="basis"]'); if (!b) return;
  var c = ctxM(b.dataset.o, b.dataset.e, b.dataset.m); if (c) { c.m.basis = b.value; neu(); }
});
acts.kaution = function (d) {
  var c = ctxM(d.o, d.e, d.m), m = c.m, jahr = NK.jahrVon(m.bis || NK.heute()), erg = NK.abrechnungFuer(c.o, c.e, m, jahr), saldo = erg ? erg.saldo : 0;
  var felder = [{ k: 'kaution', l: 'Höhe der Kaution (€)', t: 'num' }, { k: 'eingang', l: 'Eingang am (optional)', t: 'date' }, { k: 'zinsen', l: 'Aufgelaufene Zinsen (€)', t: 'num' },
    { k: 'manuell', l: 'Einbehalt selbst festlegen', t: 'check', h: 'Sonst behältst du so viel ein wie die Nachzahlung aus der Abrechnung ' + jahr + ' (höchstens Kaution samt Zinsen).' }, { k: 'einbehalt', l: 'Einbehalt (€)', t: 'num', show: function (w) { return w.manuell; } },
    { k: 'istZurueck', l: 'Kaution zurückgezahlt', t: 'check' }, { k: 'zurueck', l: 'Zurückgezahlt am', t: 'date', show: function (w) { return w.istZurueck; } }];
  var ov = formular('Kaution', felder, { kaution: m.kaution, eingang: m.kautionEingang, zinsen: m.kautionZinsen, manuell: m.kautionEinbehalt != null, einbehalt: m.kautionEinbehalt || 0, istZurueck: !!m.kautionZurueck, zurueck: m.kautionZurueck || NK.heute() }, function (w) {
    m.kaution = w.kaution; m.kautionEingang = w.eingang; m.kautionZinsen = w.zinsen; m.kautionEinbehalt = w.manuell ? w.einbehalt : null; m.kautionZurueck = w.kaution > 0 && w.istZurueck ? w.zurueck : ''; neu();
  });
  var box = document.createElement('div'); box.className = 'info'; ov.el.querySelector('h3').after(box);
  function rechne() { var kf = num(ov.el.querySelector('[data-k="kaution"]').value), zf = num(ov.el.querySelector('[data-k="zinsen"]').value), man = ov.el.querySelector('[data-k="manuell"]').checked, eb = num(ov.el.querySelector('[data-k="einbehalt"]').value), r = NK.kaution(kf, zf, saldo, man ? eb : null);
    box.innerHTML = kf > 0 ? 'Kaution samt Zinsen: <b>' + euro(r.guthaben) + '</b><br>Forderung aus der Abrechnung: ' + euro(r.forderung) + '<br>Einbehalt: ' + euro(r.einbehalt) + '<br><b>Kaution zurück: ' + euro(r.auszahlung) + '</b>' + (r.nkGuthaben > 0 ? '<br>Dazu Nebenkosten-Guthaben: ' + euro(r.nkGuthaben) + ' (insgesamt ' + euro(r.gesamt) + ')' : '') + (r.rest > 0 ? '<br><b class="t-bad">Offen bleibt eine Forderung von ' + euro(r.rest) + '.</b>' : '') + '<div class="note" style="margin:6px 0 0">Die Kaution muss getrennt vom eigenen Vermögen verzinslich angelegt sein, die Zinsen gehören dem Mieter (§ 551 BGB). Einbehalten darfst du nur berechtigte Forderungen. Rechenhilfe, keine Rechtsberatung.</div>' : 'Gib die Höhe der Kaution ein, dann erscheint die Abrechnung.'; }
  ov.el.addEventListener('input', rechne); ov.el.addEventListener('change', rechne); rechne();
};

/* ---------- Abrechnung ---------- */
var vzZuschlag = 0, vzAb = '';
function ansichtAbrechnung(oid, eid, mid, jahr) {
  var c = ctxM(oid, eid, mid); if (!c) return kopf('Nicht gefunden', '', '#/objekte') + '</main>';
  var m = c.m, erg = NK.abrechnungFuer(c.o, c.e, m, jahr), key = 'data-o="' + c.o.id + '" data-e="' + c.e.id + '" data-m="' + m.id + '" data-j="' + jahr + '"';
  var h = kopf('Abrechnung ' + jahr, m.name + ' · ' + c.e.name, '#/m/' + oid + '/' + eid + '/' + mid);
  if (!erg) return h + '<div class="empty"><b>Keine Abrechnung möglich</b>Für ' + jahr + ' bestand kein Mietverhältnis in dieser Einheit.</div></main>';
  if (erg.vorlaeufig) h += '<div class="warn"><b>Vorläufige Berechnung.</b> ' + erg.vorlaeufigeKosten + ' Kostenposition(en) sind Planwerte. Du siehst eine Vorschau. Versand und Zugang sind gesperrt, bis die tatsächlichen Kosten eingetragen sind (Objekt → Kosten → Position öffnen → „Vorläufig“ ausschalten).</div>';
  h += '<div class="kpis">' + kpi('Kosten (Mieteranteil)', euro(erg.summeKosten), erg.tageBewohnt + ' Tage bewohnt') + kpi('Vorauszahlungen', euro(erg.vorauszahlungen), erg.vzIst != null ? 'tatsächlich gezahlt' : 'Soll laut Vertrag') +
    kpi(erg.saldo > 0 ? 'Nachzahlung' : erg.saldo < 0 ? 'Guthaben' : 'Ergebnis', euro(Math.abs(erg.saldo)), erg.saldo === 0 ? 'ausgeglichen' : '', erg.saldo > 0 ? 't-bad' : erg.saldo < 0 ? 't-good' : '') + '</div>';
  h += '<div class="card"><table class="tb"><thead><tr><th>Kostenart</th><th class="n">Gesamt</th><th class="n">Anteil</th></tr></thead><tbody>' + erg.zeilen.map(function (z) { return '<tr><td>' + esc(z.bez) + '<div class="note" style="margin:0">' + schlName(z.schluessel) + ' · ' + zahl(z.quote * 100, 2) + ' %</div></td><td class="n">' + euro(z.gesamt) + '</td><td class="n">' + euro(z.betrag) + '</td></tr>'; }).join('') + '</tbody><tfoot><tr><td colspan="2">Summe</td><td class="n">' + euro(erg.summeKosten) + '</td></tr></tfoot></table></div>';
  if (erg.co2) h += '<div class="info" style="margin-top:10px"><b>CO₂-Kostenaufteilung:</b> ' + (erg.co2.modell === 'stufen' ? 'Stufe ' + erg.co2.stufe + ' von 10 (' + zahl(erg.co2.kgProQm, 1) + ' kg/m²)' : 'Nichtwohngebäude (50 / 50)') + '. Vermieteranteil ' + zahl(erg.co2.vermieterProzent, 1) + ' % = ' + euro(erg.co2.vermieterBetrag) + ' (von den Heizkosten abgezogen). Dein Mieter trägt davon ' + euro(erg.co2.mieterAnteilEinheit) + '.</div>';
  erg.hinweise.forEach(function (x) { h += '<div class="warn" style="margin-top:10px">' + esc(x) + '</div>'; });

  h += '<h2>Dokument</h2><div class="row-actions"><button class="btn primary" data-act="abDruck" ' + key + '>' + (erg.vorlaeufig ? 'Vorschau (PDF)' : 'PDF / Drucken') + '</button><button class="btn" data-act="abBelege" ' + key + '>Beleg-Auszug (PDF)</button></div>';
  if (!S.absender.name) h += '<p class="note">Tipp: Unter „Mehr“ trägst du deinen Absender ein. Er erscheint auf den Schreiben.</p>';

  /* Frist */
  var z = (m.zugaenge || []).filter(function (q) { return +q.jahr === jahr; })[0], st = NK.fristStatus(jahr, z && z.datum);
  h += '<h2>Frist § 556 BGB</h2><div class="card pad"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><b>' + (z ? (st.verspaetet ? 'Verspätet zugegangen' : 'Zugegangen am ' + datum(z.datum)) : st.tageBis < 0 ? 'Frist abgelaufen' : 'Frist bis ' + datum(st.frist)) + '</b><div class="note" style="margin:2px 0 0">' + (z ? 'Einwendungen des Mieters bis ' + datum(st.einwendung) : st.tageBis < 0 ? 'seit ' + (-st.tageBis) + ' Tagen' : 'noch ' + st.tageBis + ' Tage') + '</div></div>' + stufePille(st) + '</div>';
  if (z) { h += '<p class="note">' + esc(z.art === 'email' ? 'E-Mail' : z.art) + (z.bem ? ' · ' + esc(z.bem) : '') + '</p>' + (st.verspaetet ? '<div class="warn">' + (erg.saldo > 0 ? 'Eine Nachzahlung von ' + euro(erg.saldo) + ' kann nur gefordert werden, wenn du die Verspätung nicht zu vertreten hast (§ 556 Abs. 3 BGB).' : 'Ein Guthaben des Mieters bleibt auch bei verspäteter Abrechnung bestehen.') + '</div>' : '') + '<button class="btn small danger" data-act="zugangWeg" ' + key + '>Zugang entfernen</button>'; }
  else if (erg.vorlaeufig) h += '<p class="note">Zugang erst eintragen, wenn die Abrechnung auf tatsächlichen Kosten beruht.</p>';
  else h += '<div class="row-actions" style="margin:10px 0 0"><button class="btn small primary" data-act="zugangNeu" ' + key + '>Zugang eintragen</button></div><p class="note">Entscheidend ist der Zugang beim Mieter, nicht das Absendedatum. Das Datum startet auch die zwölf Monate, in denen der Mieter Einwendungen erheben kann.</p>';
  h += '</div>';

  /* Versand */
  if (!erg.vorlaeufig) {
    h += '<h2>Versand per E-Mail</h2><div class="card pad">' + (m.email ? '<div class="note" style="margin:0 0 8px">An: ' + esc(m.email) + '</div>' : '<div class="note" style="margin:0 0 8px">Beim Mieter ist keine E-Mail-Adresse eingetragen (Mieter bearbeiten).</div>') +
      '<ol style="margin:0 0 8px;padding-left:20px;font-size:13.5px"><li>„PDF / Drucken“ → „Als PDF sichern“ oder „In Dateien sichern“</li><li>Mail öffnen und das PDF anhängen</li><li>Nach dem Senden den Zugang eintragen</li></ol><div class="row-actions" style="margin:0"><button class="btn small primary" data-act="mailOeffnen" ' + key + '>Mail vorbereiten</button><button class="btn small" data-act="mailText" ' + key + '>Text kopieren</button>' + (z ? '' : '<button class="btn small" data-act="zugangMail" ' + key + '>Zugang heute per E-Mail eintragen</button>') + '</div><p class="note">Eine E-Mail gilt erst als zugegangen, wenn sie im Postfach des Mieters abrufbar ist. Das Absendedatum allein reicht nicht. Für den sicheren Nachweis eignen sich Lesebestätigung, Antwort des Mieters oder Einschreiben.</p></div>';
  }

  /* Vorauszahlung anpassen */
  if (!erg.vorlaeufig && (!m.bis || m.bis >= NK.heute())) {
    var bisher = NK.aktuell(m).vz, v = NK.vzVorschlag(erg.summeKosten, erg.tageBewohnt, NK.tage(erg.periode), bisher, vzZuschlag); if (!vzAb) vzAb = NK.fruehesterTermin();
    if (v) {
      h += '<h2>Vorauszahlung anpassen (§ 560 Abs. 4 BGB)</h2><div class="card pad"><div class="kpis"><div class="kpi"><div class="l">Bisher</div><div class="v">' + euro(v.bisher) + '</div></div><div class="kpi"><div class="l">Vorschlag</div><div class="v">' + euro(v.neu) + '</div></div></div>' +
        '<p class="note" style="margin:0 0 8px">Betriebskosten ' + jahr + ': ' + euro(v.jahreskosten) + (v.hochgerechnet ? ' (auf ein volles Jahr hochgerechnet)' : '') + ', geteilt durch 12' + (v.zuschlag ? ' plus ' + v.zuschlag + ' % Zuschlag' : '') + ', aufgerundet auf volle Euro.</p>' +
        '<div class="row-actions"><select class="sel" data-chg="vzz" aria-label="Zuschlag">' + [0, 5, 10].map(function (x) { return '<option value="' + x + '"' + (x === vzZuschlag ? ' selected' : '') + '>Zuschlag ' + x + ' %</option>'; }).join('') + '</select><input class="sel" type="date" data-chg="vzab" value="' + vzAb + '" aria-label="Gilt ab"></div>' +
        (v.sinnvoll ? '<div class="row-actions" style="margin:0"><button class="btn small primary" data-act="vzBrief" ' + key + '>Anschreiben (PDF)</button><button class="btn small" data-act="vzEintragen" ' + key + ' data-neu="' + v.neu + '">In Mietverlauf eintragen</button></div>' : '<p class="note" style="margin:0">Der Unterschied ist klein. Eine Anpassung lohnt sich kaum.</p>') +
        '<p class="note">Nach einer Abrechnung kann jede Seite per Erklärung in Textform eine Anpassung auf eine angemessene Höhe verlangen. Das Schreiben ist ein Entwurf und keine Rechtsberatung. Wähle „Gilt ab“ so, dass das Schreiben vorher zugeht.</p></div>';
    }
  }
  return h + '</main>';
}
document.addEventListener('change', function (e) {
  var z = e.target.closest('[data-chg="vzz"]'); if (z) { vzZuschlag = +z.value; render(); }
  var a = e.target.closest('[data-chg="vzab"]'); if (a && NK.isDate(a.value)) { vzAb = a.value; render(); }
});
function ctxJ(d) { var c = ctxM(d.o, d.e, d.m), j = +d.j; return { c: c, j: j, erg: NK.abrechnungFuer(c.o, c.e, c.m, j) }; }
acts.zugangNeu = function (d) {
  var x = ctxJ(d);
  formular('Zugang eintragen', [{ k: 'datum', l: 'Zugegangen am', t: 'date' }, { k: 'art', l: 'Zustellart', t: 'select', opts: [['Briefkasten (mit Zeugen)', 'Briefkasten (mit Zeugen)'], ['Persönliche Übergabe (Quittung)', 'Persönliche Übergabe (Quittung)'], ['Einschreiben', 'Einschreiben'], ['Normaler Brief', 'Normaler Brief'], ['email', 'E-Mail']] }, { k: 'bem', l: 'Bemerkung (z. B. Zeuge, Sendungsnummer)', t: 'text' }], { datum: NK.heute(), art: 'Briefkasten (mit Zeugen)' },
    function (w) { if (!NK.isDate(w.datum)) return 'Bitte ein Datum eingeben.'; x.c.m.zugaenge = (x.c.m.zugaenge || []).filter(function (q) { return +q.jahr !== x.j; }); x.c.m.zugaenge.push({ jahr: x.j, datum: w.datum, art: w.art, bem: w.bem }); neu(); });
};
acts.zugangWeg = function (d) { var x = ctxJ(d); if (confirm('Zugang entfernen?')) { x.c.m.zugaenge = x.c.m.zugaenge.filter(function (q) { return +q.jahr !== x.j; }); neu(); } };
acts.zugangMail = function (d) {
  var x = ctxJ(d); if (!confirm('Den Zugang heute (' + datum(NK.heute()) + ') per E-Mail eintragen? Tu das nur, wenn die Mail im Postfach des Mieters angekommen sein dürfte. Das Datum startet die Einwendungsfrist.')) return;
  x.c.m.zugaenge = (x.c.m.zugaenge || []).filter(function (q) { return +q.jahr !== x.j; }); x.c.m.zugaenge.push({ jahr: x.j, datum: NK.heute(), art: 'email', bem: 'Versand per E-Mail' + (x.c.m.email ? ' an ' + x.c.m.email : '') + ' am ' + datum(NK.heute()) }); neu();
};
function mailTeile(x) { return { betreff: 'Nebenkostenabrechnung ' + x.j + ' – ' + x.c.o.name + ', ' + x.c.e.name, text: NK.mailText(x.erg.mieter, x.j, x.erg.saldo, S.absender) }; }
acts.mailOeffnen = function (d) { var x = ctxJ(d), t = mailTeile(x); location.href = 'mailto:' + encodeURIComponent(x.c.m.email || '') + '?subject=' + encodeURIComponent(t.betreff) + '&body=' + encodeURIComponent(t.text); };
acts.mailText = function (d) { var t = mailTeile(ctxJ(d)).text; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { alert('Mailtext kopiert.'); }, function () { hinweisBlatt('Mailtext', '<textarea rows="12" style="width:100%">' + esc(t) + '</textarea>'); }); };
acts.abDruck = function (d) { var x = ctxJ(d); drucken(docAbrechnung(x.c, x.erg, x.j), 'Nebenkostenabrechnung ' + x.j + ' ' + x.c.m.name); };
acts.vzBrief = function (d) {
  var x = ctxJ(d), bisher = NK.aktuell(x.c.m).vz, v = NK.vzVorschlag(x.erg.summeKosten, x.erg.tageBewohnt, NK.tage(x.erg.periode), bisher, vzZuschlag), kalt = NK.standAm(NK.stufen(x.c.m), vzAb).kalt;
  drucken(docVZ(x.c, x.j, v, vzAb, kalt, x.erg), 'Anpassung Vorauszahlung ' + x.c.m.name);
};
acts.vzEintragen = function (d) {
  var x = ctxJ(d), neuVz = +d.neu, ab = vzAb;
  if (NK.dn(ab) <= NK.dn(x.c.m.von)) { alert('Das Datum „Gilt ab“ muss nach dem Einzug liegen.'); return; }
  if (!confirm('Vorauszahlung ab ' + datum(ab) + ' auf ' + euro(neuVz) + ' im Mietverlauf eintragen?')) return;
  var kalt = NK.standAm(NK.stufen(x.c.m), ab).kalt; x.c.m.aenderungen = (x.c.m.aenderungen || []).filter(function (a) { return a.ab !== ab; }); x.c.m.aenderungen.push({ ab: ab, kalt: kalt, vz: neuVz, bem: 'Anpassung nach Abrechnung ' + x.j }); neu();
};
acts.abBelege = function (d) {
  var x = ctxJ(d), o = x.c.o;
  Belege.alle().then(function (alle) {
    var urls = [], pos = NK.umlagefaehige(o, x.j).slice().sort(function (a, b) { return String(a.bez).localeCompare(String(b.bez), 'de'); }).map(function (k) {
      var bl = (k.belege || []).map(function (id) { return alle.filter(function (b) { return b.id === id; })[0]; }).filter(Boolean).map(function (b) { var u = b.typ === 'bild' ? URL.createObjectURL(b.blob) : ''; if (u) urls.push(u); return { titel: b.titel, typ: b.typ, url: u }; });
      return { bez: k.bez, betrag: +k.betrag || 0, belege: bl };
    });
    drucken(docBelege(x.c, x.j, pos), 'Belegeinsicht ' + x.j + ' ' + o.name);
    setTimeout(function () { urls.forEach(function (u) { URL.revokeObjectURL(u); }); }, 120000);
  });
};

/* ---------- Dokumente (Druck/PDF) ---------- */
function absenderBlock() { var a = S.absender; return '<div class="kopf"><div><b style="font-size:16px">' + esc(a.name || 'Vermieter') + '</b><br>' + esc(a.adresse || '').replace(/\n/g, '<br>') + (a.email ? '<br>' + esc(a.email) : '') + '</div><div style="text-align:right">' + esc([a.ort, datum(NK.heute())].filter(Boolean).join(', ')) + '</div></div>'; }
function empfaenger(c) { var l = [c.m.name].concat(String(c.m.anschrift || c.o.adresse || '').split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean)); return '<p style="margin:14px 0">' + l.map(esc).join('<br>') + '</p>'; }
function docAbrechnung(c, e, j) {
  var h = absenderBlock() + empfaenger(c) + '<h1>Nebenkostenabrechnung ' + j + '</h1><p>' + esc(c.o.name) + ', ' + esc(c.e.name) + ' · Abrechnungszeitraum ' + datum(e.periode.von) + ' bis ' + datum(e.periode.bis) + ' · Nutzungszeitraum ' + e.tageBewohnt + ' Tage</p>';
  if (e.vorlaeufig) h += '<div class="box" style="border-color:#B3302F;color:#B3302F"><b>VORLÄUFIGE BERECHNUNG.</b> Teile der Kosten sind Planwerte. Dies ist keine Abrechnung im Sinne des § 556 BGB.</div>';
  h += '<table class="tb" style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;border-bottom:1px solid #000">Kostenart</th><th style="text-align:left;border-bottom:1px solid #000">Verteilung</th><th style="text-align:right;border-bottom:1px solid #000">Gesamtkosten</th><th style="text-align:right;border-bottom:1px solid #000">Ihr Anteil</th></tr></thead><tbody>' +
    e.zeilen.map(function (z) { return '<tr><td>' + esc(z.bez) + '</td><td>' + schlName(z.schluessel) + ' (' + zahl(z.quote * 100, 2) + ' %)</td><td style="text-align:right">' + euro(z.gesamt) + '</td><td style="text-align:right">' + euro(z.betrag) + '</td></tr>'; }).join('') + '</tbody></table>';
  h += '<table style="width:60%;margin-left:auto;margin-top:12px;border-collapse:collapse"><tr><td>Ihr Anteil an den Kosten</td><td style="text-align:right">' + euro(e.summeKosten) + '</td></tr><tr><td>Geleistete Vorauszahlungen' + (e.vzIst != null ? '' : ' (laut Vertrag)') + '</td><td style="text-align:right">− ' + euro(e.vorauszahlungen) + '</td></tr><tr><td><b>' + (e.saldo > 0 ? 'Nachzahlung' : e.saldo < 0 ? 'Guthaben' : 'Ergebnis') + '</b></td><td style="text-align:right"><b>' + euro(Math.abs(e.saldo)) + '</b></td></tr></table>';
  if (e.co2) h += '<div class="box"><b>CO₂-Kosten (§ 7 CO2KostAufG):</b> ' + (e.co2.modell === 'stufen' ? 'Einstufung Stufe ' + e.co2.stufe + ' von 10, ' + zahl(e.co2.kgProQm, 1) + ' kg CO₂ je m² und Jahr' : 'Nichtwohngebäude, Aufteilung 50 / 50') + '. CO₂-Kosten insgesamt ' + euro(e.co2.co2Gesamt) + ', davon trägt der Vermieter ' + zahl(e.co2.vermieterProzent, 1) + ' % (' + euro(e.co2.vermieterBetrag) + '). Auf Sie entfallen ' + euro(e.co2.mieterAnteilEinheit) + '.</div>';
  var a = S.absender;
  if (e.saldo > 0) h += '<p>Bitte überweisen Sie die Nachzahlung innerhalb von ' + (a.zahlungsfrist || 14) + ' Tagen' + (a.iban ? ' auf das Konto IBAN ' + esc(a.iban) + (a.bank ? ' (' + esc(a.bank) + ')' : '') : '') + '.</p>';
  else if (e.saldo < 0) h += '<p>Das Guthaben wird Ihnen erstattet.</p>';
  return h + '<p style="font-size:11px">Einwendungen gegen die Abrechnung können innerhalb von zwölf Monaten nach Zugang erhoben werden (§ 556 Abs. 3 BGB). Die Belege können nach Absprache eingesehen werden.</p>';
}
function docVZ(c, j, v, ab, kalt, e) {
  var h = absenderBlock() + empfaenger(c) + '<h1>Anpassung der Nebenkosten-Vorauszahlung</h1><p>Sehr geehrte Damen und Herren,</p><p>mit der Nebenkostenabrechnung für das Jahr ' + j + ' wurden Ihnen Betriebskosten von ' + euro(v.jahreskosten) + ' für die Wohnung ' + esc(c.e.name) + ' berechnet. Auf dieser Grundlage passe ich die monatliche Vorauszahlung nach § 560 Abs. 4 BGB auf eine angemessene Höhe an.</p>' +
    '<table style="width:100%;border-collapse:collapse;margin:10px 0"><tr><td style="border-bottom:1px solid #999">Bisherige Vorauszahlung</td><td style="text-align:right;border-bottom:1px solid #999">' + euro(v.bisher) + '</td></tr><tr><td style="border-bottom:1px solid #999"><b>Neue Vorauszahlung ab ' + datum(ab) + '</b></td><td style="text-align:right;border-bottom:1px solid #999"><b>' + euro(v.neu) + '</b></td></tr><tr><td>' + (v.diff >= 0 ? 'Erhöhung' : 'Senkung') + '</td><td style="text-align:right">' + euro(Math.abs(v.diff)) + '</td></tr></table>';
  if (kalt > 0) h += '<p>Ab dem ' + datum(ab) + ' setzt sich Ihre monatliche Zahlung so zusammen: Kaltmiete ' + euro(kalt) + ' plus Vorauszahlung ' + euro(v.neu) + ', zusammen ' + euro(kalt + v.neu) + '.</p>';
  var a = S.absender; h += '<p>Bitte passen Sie Ihren Dauerauftrag entsprechend an.' + (a.iban ? ' Die Zahlung erfolgt wie bisher auf das Konto IBAN ' + esc(a.iban) + (a.bank ? ' (' + esc(a.bank) + ')' : '') + '.' : '') + '</p><p>Mit freundlichen Grüßen<br><br>' + esc(a.name || '') + '</p><p style="font-size:11px">Diese Erklärung ergeht in Textform (§ 126b BGB) und ist ohne Unterschrift gültig.</p>';
  return h;
}
function docBelege(c, j, pos) {
  var anz = pos.reduce(function (a, p) { return a + p.belege.length; }, 0), ohne = pos.filter(function (p) { return !p.belege.length; });
  var h = absenderBlock() + '<h1>Belegeinsicht ' + j + '</h1><p>' + esc(c.o.name) + ' · für ' + esc(c.m.name) + ' · ' + anz + ' Beleg(e)</p><p style="font-size:12px">Dieser Auszug enthält die Belege zu den umgelegten Betriebskosten. Die Originale können nach Absprache eingesehen werden.</p>' +
    '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;border-bottom:1px solid #000">Kostenart</th><th style="text-align:right;border-bottom:1px solid #000">Gesamtkosten</th><th style="text-align:right;border-bottom:1px solid #000">Belege</th></tr></thead><tbody>' + pos.map(function (p) { return '<tr><td>' + esc(p.bez) + '</td><td style="text-align:right">' + euro(p.betrag) + '</td><td style="text-align:right">' + (p.belege.length || 'fehlt') + '</td></tr>'; }).join('') + '</tbody></table>';
  if (ohne.length) h += '<div class="box" style="border-color:#B3302F">Zu diesen Kostenarten ist kein Beleg abgelegt: ' + ohne.map(function (p) { return esc(p.bez); }).join(', ') + '</div>';
  pos.forEach(function (p) { if (!p.belege.length) return; h += '<h2 style="page-break-before:auto">' + esc(p.bez) + ' · ' + euro(p.betrag) + '</h2>'; p.belege.forEach(function (b) { h += '<p style="font-size:11px;margin:8px 0 2px">' + esc(b.titel) + '</p>' + (b.url ? '<img src="' + b.url + '" alt="">' : '<p style="font-size:11px"><i>PDF-Datei „' + esc(b.titel) + '“ liegt separat vor und wird beigefügt.</i></p>'); }); });
  return h;
}
function docAnlageV(a) {
  var td = 'style="padding:3px 6px;border-bottom:1px solid #ccc"', tr = 'style="padding:3px 6px;border-bottom:1px solid #ccc;text-align:right"';
  return absenderBlock() + '<h1>Steuerübersicht (Anlage V) ' + a.jahr + '</h1><p>' + esc(a.objekt) + '</p><h2>Einnahmen</h2><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Einheit</th><th style="text-align:right">Kaltmiete</th><th style="text-align:right">Umlagen</th><th style="text-align:right">Summe</th></tr></thead><tbody>' +
    a.einheiten.map(function (e) { return '<tr><td ' + td + '>' + esc(e.name) + (e.gewerblich ? ' (gewerblich)' : '') + '</td><td ' + tr + '>' + euro(e.kalt) + '</td><td ' + tr + '>' + euro(e.umlagen) + '</td><td ' + tr + '>' + euro(e.kalt + e.umlagen) + '</td></tr>'; }).join('') + '<tr><td><b>Summe</b></td><td style="text-align:right"><b>' + euro(a.kalt) + '</b></td><td style="text-align:right"><b>' + euro(a.umlagen) + '</b></td><td style="text-align:right"><b>' + euro(a.einnahmen) + '</b></td></tr></tbody></table>' +
    '<h2>Werbungskosten</h2><table style="width:100%;border-collapse:collapse"><tbody>' + a.kosten.map(function (k) { return '<tr><td ' + td + '>' + esc(k.bez) + (k.vorlaeufig ? ' (Plan)' : '') + ' <span style="color:#666">· ' + (k.umlagefaehig ? 'umlagefähig' : 'nicht umlagefähig') + '</span></td><td ' + tr + '>' + euro(k.betrag) + '</td></tr>'; }).join('') + '<tr><td><b>Summe</b></td><td style="text-align:right"><b>' + euro(a.werbung) + '</b></td></tr></tbody></table>' +
    '<p class="gross">Überschuss vor AfA und Schuldzinsen: ' + euro(a.ueberschuss) + '</p><div class="box">Nicht enthalten: Abschreibung (AfA), Schuldzinsen, Finanzierungskosten und größere Erhaltungsaufwendungen, die auf mehrere Jahre verteilt werden. Die Anlage V folgt dem Zu- und Abflussprinzip. Die Kosten hier sind nach Abrechnungsjahr erfasst. Kaltmiete = Soll laut Mietverlauf, Umlagen = erfasste Zahlungen. Bitte mit dem Steuerberater abstimmen.</div>';
}

/* ---------- Mehr: Absender, Backup, Info ---------- */
function ansichtMehr() {
  var a = S.absender, n = S.objekte.length;
  return kopf('Mehr', 'Absender, Backup, Info') +
    '<h2>Absender</h2><div class="card pad"><div><b>' + esc(a.name || 'Noch nicht eingetragen') + '</b></div><div class="note" style="margin:2px 0 8px">Erscheint auf Abrechnung, Anschreiben und E-Mail-Text.</div><button class="btn small" data-act="absender">Bearbeiten</button></div>' +
    '<h2>Backup</h2><div class="card pad"><p class="note" style="margin-top:0">Alle Daten liegen nur in diesem Browser auf diesem Gerät. Wer Browserdaten löscht oder das Gerät wechselt, verliert sie. Sichere deshalb regelmäßig ein Backup (inklusive Belege) in „Dateien“ oder iCloud.</p><div class="row-actions" style="margin:0"><button class="btn primary small" data-act="backupExport">Backup erstellen</button><button class="btn small" data-act="importWahl">Backup einspielen</button></div></div>' +
    '<h2>Daten</h2><div class="card pad"><div class="note" style="margin:0 0 8px">' + n + ' Objekt(e) gespeichert.</div><button class="btn small danger" data-act="alleLoeschen">Alle Daten löschen</button></div>' +
    '<h2>Info</h2><div class="card pad"><p class="note" style="margin-top:0">Web-Version der Vermieter-App. Sie funktioniert offline, sobald sie einmal geöffnet wurde. Zum Installieren: Safari → Teilen → „Zum Home-Bildschirm“.</p><p class="note">Gegenüber der iPhone-App gibt es keine Face-ID-Sperre, keine Zähler- und Beleg-Texterkennung und kein automatisches Backup. PDFs entstehen über „Drucken → Als PDF sichern“.</p><p class="note" style="margin-bottom:0">Die Berechnungen sind eine Hilfe und keine Rechts- oder Steuerberatung.</p></div></main>';
}
acts.absender = function () {
  formular('Absender', [{ k: 'name', l: 'Name', t: 'text' }, { k: 'adresse', l: 'Adresse (mehrzeilig)', t: 'area' }, { k: 'ort', l: 'Ort (für das Datum im Briefkopf)', t: 'text' }, { k: 'email', l: 'E-Mail', t: 'email' }, { k: 'iban', l: 'IBAN', t: 'text' }, { k: 'bank', l: 'Bank', t: 'text' }, { k: 'zahlungsfrist', l: 'Zahlungsfrist Nachzahlung (Tage)', t: 'num' }], S.absender,
    function (w) { S.absender = Object.assign(S.absender, w, { zahlungsfrist: w.zahlungsfrist || 14 }); neu(); });
};
function blobZuDataUrl(b) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { res(''); }; r.readAsDataURL(b); }); }
acts.backupExport = function () {
  Belege.alle().then(function (alle) {
    return Promise.all(alle.map(function (b) { return blobZuDataUrl(b.blob).then(function (u) { var c = Object.assign({}, b); delete c.blob; c.data = u; c.mime = b.blob.type; return c; }); }));
  }).then(function (belege) {
    dateiSpeichern('Vermieter-Backup-' + NK.heute() + '.json', 'application/json', JSON.stringify({ app: 'nebenkosten', v: 1, state: S, belege: belege }));
  });
};
acts.importWahl = function () {
  var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = function () {
    var f = inp.files[0]; if (!f) return; var r = new FileReader();
    r.onload = function () {
      var d; try { d = JSON.parse(r.result); } catch (e) { alert('Die Datei ist kein gültiges Backup.'); return; }
      if (!d || d.app !== 'nebenkosten' || !d.state || !Array.isArray(d.state.objekte)) { alert('Die Datei ist kein Vermieter-Backup.'); return; }
      if (!confirm('Backup einspielen? Alle aktuellen Daten auf diesem Gerät werden ersetzt (' + d.state.objekte.length + ' Objekt(e) im Backup).')) return;
      Belege.clear().then(function () {
        return Promise.all((d.belege || []).map(function (b) { return fetch(b.data).then(function (x) { return x.blob(); }).then(function (blob) { var c = Object.assign({}, b); delete c.data; delete c.mime; c.blob = blob; return Belege.put(c); }); }));
      }).then(function () { S = Object.assign(leer(), d.state); S.absender = Object.assign(leer().absender, S.absender || {}); neu(); alert('Backup eingespielt.'); }, function () { alert('Einspielen fehlgeschlagen.'); });
    };
    r.readAsText(f);
  };
  inp.click();
};
acts.alleLoeschen = function () {
  if (!confirm('Wirklich ALLE Daten und Belege auf diesem Gerät löschen? Das lässt sich nicht rückgängig machen.')) return;
  if (!confirm('Letzte Rückfrage: Hast du ein Backup erstellt?')) return;
  Belege.clear().then(function () { S = leer(); neu(); go('#/'); });
};

render();
})();
