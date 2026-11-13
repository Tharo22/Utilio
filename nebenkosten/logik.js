/* Nebenkosten: Rechenlogik ohne Oberfläche (Port der Swift-App "Vermieter").
   Alle Daten sind einfache Objekte; Daten sind ISO-Texte "JJJJ-MM-TT"; Zeiträume sind einschließlich beider Enden. */
(function (g) {
'use strict';
var NK = {};

/* ---------- Zahlen und Daten ---------- */
var r2 = NK.r2 = function (x) { var s = x < 0 ? -1 : 1; return s * Math.round((Math.abs(x) + 1e-9) * 100) / 100; };
var dn = NK.dn = function (iso) { var p = String(iso).split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); };
var iso = NK.iso = function (n) { var d = new Date(n * 86400000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };
NK.isDate = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); };
var FAR = '9999-12-31';
NK.FAR = FAR;
NK.jahrPeriode = function (j) { return { von: j + '-01-01', bis: j + '-12-31' }; };
var tage = NK.tage = function (z) { return dn(z.bis) - dn(z.von) + 1; };
var schnitt = NK.schnitt = function (a, b) {
  var von = dn(a.von) > dn(b.von) ? a.von : b.von, bis = dn(a.bis) < dn(b.bis) ? a.bis : b.bis;
  return dn(von) <= dn(bis) ? { von: von, bis: bis } : null;
};
NK.addMonate = function (isoDatum, n) {
  var p = isoDatum.split('-').map(Number), m = p[1] - 1 + n, y = p[0] + Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  var letzter = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(Math.min(p[2], letzter)).padStart(2, '0');
};
NK.monatsTage = function (y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
function jahrVon(s) { return +s.slice(0, 4); }
NK.jahrVon = jahrVon;

/* ---------- Zählerarten ---------- */
NK.STANDARDARTEN = ['Kaltwasser', 'Warmwasser', 'Heizung', 'Strom'];
var schluesselArt = NK.schluesselArt = function (n) {
  var k = String(n || '').toLowerCase().replace(/[^a-zäöüß]/g, '');
  if (k === 'wasser') return 'kaltwasser';
  if (k.indexOf('wasser') >= 0 && k.indexOf('warm') >= 0) return 'warmwasser';
  if (k.indexOf('wasser') >= 0 && k.indexOf('kalt') >= 0) return 'kaltwasser';
  return k;
};
NK.artGleich = function (a, b) { return schluesselArt(a) === schluesselArt(b); };
var anzeigename = NK.anzeigename = function (n) {
  var k = schluesselArt(n);
  var bek = { kaltwasser: 'Kaltwasser', warmwasser: 'Warmwasser', heizung: 'Heizung', strom: 'Strom' };
  return bek[k] || String(n).trim();
};
NK.eindeutigeArten = function (liste) {
  var gesehen = {}, aus = [];
  liste.forEach(function (n) { var k = schluesselArt(n); if (!k || gesehen[k]) return; gesehen[k] = 1; aus.push(anzeigename(n)); });
  return aus;
};

/* ---------- Verbrauch (mit Zählertausch) ---------- */
function sortAbl(a) {
  return a.slice().sort(function (x, y) { var d = dn(x.datum) - dn(y.datum); if (d) return d; return (x.neu ? 1 : 0) - (y.neu ? 1 : 0); });
}
NK.verbrauch = function (abl, z, tol) {
  var s = dn(z.von), e = dn(z.bis), fr = s - (tol == null ? 31 : tol), liste = sortAbl(abl);
  var iL = -1, iA = -1, i;
  for (i = 0; i < liste.length; i++) { var d = dn(liste[i].datum); if (d >= s && d <= e) iL = i; }
  if (iL < 0) return null;
  for (i = 0; i < liste.length; i++) { var d2 = dn(liste[i].datum); if (d2 >= fr && d2 <= s) iA = i; }
  if (iA < 0) for (i = 0; i < liste.length; i++) { var d3 = dn(liste[i].datum); if (d3 >= s && d3 <= e) { iA = i; break; } }
  if (iA < 0 || dn(liste[iA].datum) >= dn(liste[iL].datum)) return null;
  var abs = liste.slice(iA, iL + 1);
  if (!abs.some(function (a) { return a.neu; })) { var v = abs[abs.length - 1].wert - abs[0].wert; return v >= 0 ? v : null; }
  var summe = 0;
  for (i = 1; i < abs.length; i++) { if (abs[i].neu) continue; var dl = abs[i].wert - abs[i - 1].wert; if (dl < 0) return null; summe += dl; }
  return summe;
};
NK.verbrauchEinheit = function (einheit, art, z, tol) {
  return NK.verbrauch((einheit.staende || []).filter(function (s) { return NK.artGleich(s.art, art); }), z, tol);
};

/* ---------- Personentage ---------- */
NK.personentage = function (start, aend, miet, periode) {
  var bew = schnitt(miet, periode); if (!bew) return 0;
  var akt = start, ab = bew.von, summe = 0;
  aend.slice().sort(function (a, b) { return dn(a.ab) - dn(b.ab); }).forEach(function (a) {
    var t = dn(a.ab);
    if (t <= dn(bew.von)) { akt = a.anzahl; return; }
    if (t > dn(bew.bis)) return;
    summe += akt * tage({ von: ab, bis: iso(t - 1) });
    ab = a.ab; akt = a.anzahl;
  });
  return summe + akt * tage({ von: ab, bis: bew.bis });
};
NK.mieterPersonentage = function (m, periode) {
  return NK.personentage(+m.personen || 0, m.personenAend || [], { von: m.von, bis: m.bis || FAR }, periode);
};

/* ---------- Mietverlauf ---------- */
NK.stufen = function (m) {
  var basis = { ab: m.von, kalt: +m.kalt || 0, vz: +m.vz || 0, bem: 'Bei Einzug' };
  var proTag = {};
  (m.aenderungen || []).forEach(function (a) { if (dn(a.ab) > dn(m.von)) proTag[a.ab] = { ab: a.ab, kalt: +a.kalt || 0, vz: +a.vz || 0, bem: a.bem || '' }; });
  return [basis].concat(Object.keys(proTag).sort().map(function (k) { return proTag[k]; }));
};
NK.standAm = function (stufen, tag) {
  var t = dn(tag), best = stufen[0];
  stufen.forEach(function (s) { if (dn(s.ab) <= t) best = s; });
  return best;
};
NK.aktuell = function (m, heute) {
  var t = heute || NK.heute(); if (m.bis && dn(m.bis) < dn(t)) t = m.bis;
  return NK.standAm(NK.stufen(m), t);
};
NK.heute = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/* Monatssumme tagesgenau über die Stufen: feld = 'vz' oder 'kalt' */
function monatsSummen(m, jahr, feld) {
  var bew = schnitt({ von: m.von, bis: m.bis || FAR }, NK.jahrPeriode(jahr)), st = NK.stufen(m), aus = [];
  if (!bew) return aus;
  for (var mo = 1; mo <= 12; mo++) {
    var n = NK.monatsTage(jahr, mo), mz = { von: jahr + '-' + String(mo).padStart(2, '0') + '-01', bis: jahr + '-' + String(mo).padStart(2, '0') + '-' + String(n).padStart(2, '0') };
    var b = schnitt(mz, bew); if (!b) continue;
    var s = 0, t = dn(b.von), te = dn(b.bis);
    for (; t <= te; t++) s += NK.standAm(st, iso(t))[feld];
    aus.push({ monat: mz.von, wert: r2(s / n) });
  }
  return aus;
}
NK.sollMonate = function (m, jahr) { return monatsSummen(m, jahr, 'vz'); };
NK.sollSumme = function (m, jahr) { return NK.sollMonate(m, jahr).reduce(function (a, x) { return a + x.wert; }, 0); };
NK.kaltmieteSumme = function (m, jahr) { return r2(monatsSummen(m, jahr, 'kalt').reduce(function (a, x) { return a + x.wert; }, 0)); };
NK.istVorauszahlungen = function (m, periode) {
  var s = 0; (m.zahlungen || []).forEach(function (z) { var mo = z.monat; if (dn(mo) >= dn(periode.von) && dn(mo) <= dn(periode.bis)) s += +z.betrag || 0; });
  return r2(s);
};

/* ---------- Heizkosten und CO2 ---------- */
var heizBegrenzt = NK.heizBegrenzt = function (p) { var w = p == null || p === '' ? 70 : +p; return Math.min(70, Math.max(50, w)); };
var CO2_STUFEN = [[0, 100], [12, 90], [17, 80], [22, 70], [27, 60], [32, 50], [37, 40], [42, 30], [47, 20], [52, 5]];
NK.co2Einstufung = function (kg) { var t = { stufe: 1, mieter: 100 }; CO2_STUFEN.forEach(function (s, i) { if (kg >= s[0]) t = { stufe: i + 1, mieter: s[1] }; }); return t; };
NK.co2Aufteilung = function (kosten, einheiten, ein) {
  var rel = kosten.filter(function (k) { return k.schluessel === 'heizkosten' && (+k.co2Kosten || 0) > 0; });
  if (!rel.length) return null;
  var kg = rel.reduce(function (a, k) { return a + (+k.co2Kg || 0); }, 0);
  var ges = einheiten.reduce(function (a, e) { return a + e.flaeche; }, 0);
  var gew = einheiten.filter(function (e) { return e.gewerblich; }).reduce(function (a, e) { return a + e.flaeche; }, 0);
  var bezug = (ein && +ein.bezugsflaeche) || ges;
  var nwg = ges > 0 && gew / ges >= 0.5;
  if (!nwg && !(kg > 0 && bezug > 0)) return null;
  var kgQm = bezug > 0 ? kg / bezug : 0, gesamt = rel.reduce(function (a, k) { return a + (+k.co2Kosten); }, 0), v, modell, stufe = null, ausn = 0;
  if (nwg) { modell = 'nichtwohn'; v = 50; }
  else {
    var es = NK.co2Einstufung(kgQm); modell = 'stufen'; stufe = es.stufe; v = 100 - es.mieter; ausn = (ein && +ein.ausnahme) || 0;
    if (ausn === 1) v /= 2; else if (ausn === 2) v = 0;
  }
  var abzug = rel.reduce(function (a, k) { return a + r2(+k.co2Kosten * v / 100); }, 0);
  return { modell: modell, stufe: stufe, emissionKg: kg, bezug: bezug, kgProQm: kgQm, vermieterProzent: v, ausnahme: ausn,
    co2Gesamt: gesamt, vermieterBetrag: abzug, mieterBetrag: gesamt - abzug, mieterAnteilEinheit: 0 };
};

/* ---------- Abrechnung ---------- */
function gewicht(e, p) {
  switch (p.schluessel) {
    case 'wohnflaeche': return e.flaeche;
    case 'personen': return e.personen;
    case 'einheiten': return 1;
    case 'verbrauch': return e.verbrauch[schluesselArt(p.art)] || 0;
    case 'heizkosten': return e.flaeche;
  }
  return 0;
}
/* bel: {einheitId, name, zeitraum, vzMonat, stufen, eigenerVerbrauch, personen, personentage, ist}
   einheiten: [{id, name, flaeche, personen, gewerblich, verbrauch:{artKey:wert}, personentage: Zahl oder null}]
   kosten: [{bez, betrag, schluessel, art, verbrauchsanteil, co2Kosten, co2Kg}] */
NK.abrechnen = function (bel, einheiten, kosten, periode, co2Ein) {
  var einheit = einheiten.filter(function (e) { return e.id === bel.einheitId; })[0];
  var bew = schnitt(bel.zeitraum, periode), pt = tage(periode);
  if (!einheit || !bew || pt <= 0) return null;
  var zf = tage(bew) / pt, teilweise = tage(bew) < pt, hin = [];

  var co2 = NK.co2Aufteilung(kosten, einheiten, co2Ein), ber = kosten;
  if (kosten.some(function (k) { return k.schluessel === 'heizkosten' && (+k.co2Kosten || 0) > 0; })) {
    if (co2) ber = kosten.map(function (k) { if (k.schluessel !== 'heizkosten' || !(+k.co2Kosten > 0)) return k; var n = Object.assign({}, k); n.betrag = k.betrag - r2(+k.co2Kosten * co2.vermieterProzent / 100); return n; });
    else hin.push('CO₂-Aufteilung nicht berechnet: Für die Heizkosten fehlt der CO₂-Ausstoß in kg (oder die Bezugsfläche). Ohne Einstufung darf der Mieter seinen Heizkostenanteil um 3 % kürzen (§ 7 Abs. 4 CO2KostAufG).');
  }

  var teil = [];
  ber.forEach(function (k) {
    if (k.schluessel !== 'heizkosten') { teil.push({ p: k, heiz: false }); return; }
    var pr = heizBegrenzt(k.verbrauchsanteil);
    if (k.verbrauchsanteil != null && k.verbrauchsanteil !== '' && +k.verbrauchsanteil !== pr) hin.push('„' + k.bez + '“: Verbrauchsanteil ' + k.verbrauchsanteil + ' % auf ' + pr + ' % begrenzt (§ 7 HeizkostenV: 50–70 %).');
    var verb = r2(k.betrag * pr / 100), grund = k.betrag - verb;
    teil.push({ p: { bez: k.bez + ' – Grundkosten (' + (100 - pr) + ' % nach Fläche)', betrag: grund, schluessel: 'wohnflaeche' }, heiz: true });
    teil.push({ p: { bez: k.bez + ' – Verbrauchskosten (' + pr + ' %)', betrag: verb, schluessel: 'verbrauch', art: k.art }, heiz: true });
  });

  function ptEff(e) { return e.personentage != null ? e.personentage : e.personen * pt; }
  var eigenPT = bel.personentage != null ? bel.personentage : (bel.personen != null ? bel.personen : einheit.personen) * tage(bew);
  var allePT = einheiten.reduce(function (a, e) { return a + ptEff(e); }, 0);

  var zeilen = teil.map(function (t) {
    var p = t.p, gg = einheiten.reduce(function (a, e) { return a + gewicht(e, p); }, 0), q = gg > 0 ? gewicht(einheit, p) / gg : 0, f = zf;
    if (p.schluessel === 'personen') {
      if (allePT > 0) q = eigenPT / allePT; else { q = 0; hin.push('„' + p.bez + '“: Keine Personen erfasst – Kosten können nicht nach Personenzahl verteilt werden.'); }
      f = 1;
    }
    if (p.schluessel === 'verbrauch') {
      var art = p.art || '';
      if (!art) hin.push('„' + p.bez + '“: Keine Zählerart gewählt – Verbrauch kann nicht verteilt werden.');
      else if (gg <= 0) hin.push('Zähler „' + art + '“: Kein Verbrauch erfasst – Kosten können nicht verteilt werden (je Einheit mindestens zwei Ablesungen nötig).');
      else {
        einheiten.forEach(function (e) { if (gewicht(e, p) <= 0) hin.push('Zähler „' + art + '“: Für ' + (e.name || 'eine Einheit') + ' fehlt der Verbrauch.'); });
        var eig = bel.eigenerVerbrauch && bel.eigenerVerbrauch[schluesselArt(art)];
        if (eig != null) { q = eig / gg; f = 1; }
        else if (teilweise) hin.push('Zähler „' + art + '“: Mieterwechsel ohne Zwischenablesung – Verbrauch wurde zeitanteilig verteilt (§ 9b HeizkostenV).');
      }
    }
    return { bez: p.bez, gesamt: p.betrag, schluessel: p.schluessel, quote: q, betrag: r2(p.betrag * q * f) };
  });

  if (co2) {
    var hs = 0, hg = 0;
    teil.forEach(function (t, i) { if (t.heiz) { hs += zeilen[i].betrag; hg += t.p.betrag; } });
    if (hg > 0) co2.mieterAnteilEinheit = r2(co2.mieterBetrag * hs / hg);
  }

  var gesehen = {}; hin = hin.filter(function (h) { if (gesehen[h]) return false; gesehen[h] = 1; return true; });
  var soll = NK.sollBel(bel, periode), ist = bel.ist;
  var summe = zeilen.reduce(function (a, z) { return a + z.betrag; }, 0), vz = ist != null ? ist : soll;
  return { mieter: bel.name, periode: periode, tageBewohnt: tage(bew), zeilen: zeilen, summeKosten: r2(summe), vorauszahlungen: r2(vz),
    vzSoll: soll, vzIst: ist, saldo: r2(summe - vz), co2: co2, personentage: eigenPT, hinweise: hin };
};
NK.sollBel = function (bel, periode) {
  var m = { von: bel.zeitraum.von, bis: bel.zeitraum.bis === FAR ? '' : bel.zeitraum.bis, kalt: 0, vz: bel.vzMonat, aenderungen: (bel.stufen || []) };
  return r2(NK.sollSumme(m, jahrVon(periode.von)));
};

/* ---------- Brücke: Daten des Objekts → Rechner ---------- */
NK.umlagefaehige = function (obj, jahr) { return (obj.kosten || []).filter(function (k) { return +k.jahr === jahr && k.umlagefaehig !== false; }); };
NK.kostenPosten = function (k) {
  return { bez: k.bez, betrag: +k.betrag || 0, schluessel: k.schluessel, art: k.art || '', verbrauchsanteil: k.verbrauchsanteil, co2Kosten: +k.co2Kosten || 0, co2Kg: +k.co2Kg || 0 };
};
NK.einheitInfos = function (obj, posten, periode) {
  var arten = NK.eindeutigeArten(posten.map(function (p) { return p.art; }).filter(Boolean));
  return obj.einheiten.map(function (e) {
    var v = {}; arten.forEach(function (a) { var w = NK.verbrauchEinheit(e, a, periode, 31); v[schluesselArt(a)] = w == null ? 0 : w; });
    var pt = e.mieter.length ? e.mieter.reduce(function (a, m) { return a + NK.mieterPersonentage(m, periode); }, 0) : null;
    return { id: e.id, name: e.name, flaeche: +e.flaeche || 0, personen: +e.personen || 0, gewerblich: !!e.gewerblich, verbrauch: v, personentage: pt };
  });
};
NK.abrechnungFuer = function (obj, einheit, m, jahr) {
  var periode = NK.jahrPeriode(jahr), pos = NK.umlagefaehige(obj, jahr), posten = pos.map(NK.kostenPosten);
  var infos = NK.einheitInfos(obj, posten, periode), miet = { von: m.von, bis: m.bis || FAR };
  var eig = null, bew = schnitt(miet, periode);
  if (bew && tage(bew) < tage(periode)) {
    var arten = NK.eindeutigeArten(posten.map(function (p) { return p.art; }).filter(Boolean)), w = {}, n = 0;
    arten.forEach(function (a) { var x = NK.verbrauchEinheit(einheit, a, bew, 1); if (x != null) { w[schluesselArt(a)] = x; n++; } });
    if (n) eig = w;
  }
  var bel = { einheitId: einheit.id, name: m.name, zeitraum: miet, vzMonat: +m.vz || 0, stufen: (m.aenderungen || []).map(function (a) { return { ab: a.ab, vz: a.vz, kalt: a.kalt }; }),
    eigenerVerbrauch: eig, personen: +m.personen || 0, personentage: NK.mieterPersonentage(m, periode),
    ist: m.basis === 'ist' ? NK.istVorauszahlungen(m, periode) : null };
  var erg = NK.abrechnen(bel, infos, posten, periode, { ausnahme: obj.co2Ausnahme, bezugsflaeche: obj.bezugsflaeche });
  if (!erg) return null;
  var vorl = pos.filter(function (k) { return k.vorlaeufig; }).length;
  erg.vorlaeufigeKosten = vorl; erg.vorlaeufig = vorl > 0;
  if (vorl) erg.hinweise.push(vorl + ' Kostenposition(en) sind vorläufig (Planwerte). Das Ergebnis ist nur eine Vorschau. Für die Abrechnung an den Mieter die tatsächlichen Kosten eintragen und „Vorläufig“ ausschalten.');
  var heiz = pos.filter(function (k) { return k.schluessel === 'heizkosten'; });
  if (!obj.keineCO2 && heiz.length && !heiz.some(function (k) { return (+k.co2Kosten || 0) > 0; }))
    erg.hinweise.push('Bei den Heizkosten sind keine CO₂-Kosten erfasst. Brennstoffrechnung prüfen: Fallen CO₂-Kosten an, müssen Einstufung und Mieteranteil ausgewiesen werden, sonst darf der Mieter seinen Heizkostenanteil um 3 % kürzen (§ 7 Abs. 4 CO2KostAufG).');
  if ((m.basis || 'soll') === 'soll') {
    var ist = NK.istVorauszahlungen(m, periode);
    if ((m.zahlungen || []).length && Math.abs(ist - erg.vzSoll) > 0.004) erg.hinweise.push('Gezahlt wurden ' + NK.euro(ist) + ', laut Vertrag fällig waren ' + NK.euro(erg.vzSoll) + '. Die Abrechnung nutzt das Soll – unter „Zahlungen“ auf „Tatsächlich gezahlt“ umstellen, wenn die Differenz berücksichtigt werden soll.');
  } else if (!(m.zahlungen || []).length) erg.hinweise.push('Abrechnung mit tatsächlich gezahlten Vorauszahlungen, aber es sind keine Zahlungen erfasst.');
  return erg;
};
NK.euro = function (x) { return (+x || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); };
NK.zahl = function (x, d) { return (+x || 0).toLocaleString('de-DE', { maximumFractionDigits: d == null ? 2 : d }); };
NK.datum = function (s) { return NK.isDate(s) ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; };

/* ---------- Fristen § 556 BGB ---------- */
NK.fristStatus = function (jahr, zugang, heute) {
  heute = heute || NK.heute();
  var ende = jahr + '-12-31', frist = NK.addMonate(ende, 12), bis = dn(frist) - dn(heute);
  if (zugang) { var verspaetet = dn(zugang) > dn(frist); return { frist: frist, zugang: zugang, einwendung: NK.addMonate(zugang, 12), verspaetet: verspaetet, tageBis: bis, stufe: verspaetet ? 'abgelaufen' : 'erledigt' }; }
  return { frist: frist, zugang: null, einwendung: null, verspaetet: false, tageBis: bis, stufe: bis < 0 ? 'abgelaufen' : bis <= 30 ? 'dringend' : bis <= 90 ? 'bald' : 'ok' };
};

/* ---------- Vorauszahlung anpassen (§ 560 Abs. 4 BGB) ---------- */
NK.vzVorschlag = function (summeKosten, tageBewohnt, periodenTage, bisher, zuschlag) {
  if (!(tageBewohnt > 0 && periodenTage > 0 && summeKosten > 0)) return null;
  var hoch = tageBewohnt < periodenTage, jahr = hoch ? summeKosten * periodenTage / tageBewohnt : summeKosten, z = 1 + Math.max(0, zuschlag || 0) / 100;
  var neu = Math.ceil(jahr * z / 12 - 1e-9);
  return { jahreskosten: r2(jahr), neu: neu, bisher: bisher, zuschlag: Math.max(0, zuschlag || 0), hochgerechnet: hoch, diff: neu - bisher, sinnvoll: Math.abs(neu - bisher) >= 5 };
};
NK.fruehesterTermin = function (heute) { var h = heute || NK.heute(); return NK.addMonate(h.slice(0, 8) + '01', 2); };

/* ---------- Leerstand ---------- */
NK.belegteTage = function (zr, periode) {
  var a = zr.map(function (z) { return schnitt(z, periode); }).filter(Boolean).map(function (z) { return [dn(z.von), dn(z.bis)]; }).sort(function (x, y) { return x[0] - y[0]; });
  var summe = 0, cur = null;
  a.forEach(function (z) { if (cur && z[0] <= cur[1] + 1) { if (z[1] > cur[1]) cur[1] = z[1]; } else { if (cur) summe += cur[1] - cur[0] + 1; cur = [z[0], z[1]]; } });
  if (cur) summe += cur[1] - cur[0] + 1;
  return Math.min(summe, tage(periode));
};
NK.leerstand = function (obj, einheit, jahr) {
  var per = NK.jahrPeriode(jahr), belegt = NK.belegteTage(einheit.mieter.map(function (m) { return { von: m.von, bis: m.bis || FAR }; }), per), leer = tage(per) - belegt;
  var aus = { jahr: jahr, tage: leer, periodenTage: tage(per), kosten: 0, vorlaeufig: false };
  if (leer <= 0) return aus;
  var pos = NK.umlagefaehige(obj, jahr); if (!pos.length) return aus;
  var posten = pos.map(NK.kostenPosten), infos = NK.einheitInfos(obj, posten, per);
  var voll = NK.abrechnen({ einheitId: einheit.id, name: 'Leerstand', zeitraum: per, vzMonat: 0, stufen: [], eigenerVerbrauch: null, personen: null, personentage: null, ist: null }, infos, posten, per, { ausnahme: obj.co2Ausnahme, bezugsflaeche: obj.bezugsflaeche });
  var gesamt = voll ? voll.summeKosten : 0;
  var mieter = einheit.mieter.map(function (m) { var e = NK.abrechnungFuer(obj, einheit, m, jahr); return e ? e.summeKosten : 0; }).reduce(function (a, b) { return a + b; }, 0);
  aus.kosten = Math.max(0, r2(gesamt - mieter)); aus.vorlaeufig = pos.some(function (k) { return k.vorlaeufig; });
  return aus;
};

/* ---------- Mieterwechsel und Kaution ---------- */
NK.kaution = function (kaution, zinsen, saldo, einbehalt) {
  var g = Math.max(0, kaution) + Math.max(0, zinsen), f = Math.max(0, saldo), v = Math.min(f, g), gew = Math.min(Math.max(0, einbehalt == null ? v : einbehalt), g);
  var nk = saldo < 0 ? -saldo : 0;
  return { kaution: Math.max(0, kaution), zinsen: Math.max(0, zinsen), forderung: f, einbehalt: gew, nkGuthaben: nk, guthaben: g, auszahlung: r2(g - gew), gesamt: r2(g - gew + nk), rest: Math.max(0, r2(f - gew)) };
};
NK.mieterwechsel = function (e) {
  var L = [], S = function (art, titel, status, detail) { L.push({ art: art, titel: titel, status: status, detail: detail }); };
  S('auszug', 'Auszug eintragen', e.auszug ? 'erledigt' : 'offen', e.auszug ? 'Auszug am ' + NK.datum(e.auszug) + '.' : 'Noch kein Auszugsdatum. Beim Mieter eintragen, damit die Abrechnung nur die Mietzeit umfasst.');
  if (!e.auszug) { ['Zählerstände zum Auszug', 'Abrechnung bis Auszug', 'Abrechnung zustellen', 'Kaution abrechnen'].forEach(function (t, i) { S(['zaehler', 'abrechnung', 'zustellung', 'kaution'][i], t, 'offen', 'Erst nach dem Auszugsdatum.'); }); return L; }
  var fehl = (e.erforderlich || []).filter(function (a) { return !(e.mitStand || []).some(function (b) { return NK.artGleich(a, b); }); });
  if (!(e.erforderlich || []).length) S('zaehler', 'Zählerstände zum Auszug', 'entfaellt', 'Keine Zähler erfasst.');
  else if (!fehl.length) S('zaehler', 'Zählerstände zum Auszug', 'erledigt', 'Alle Zähler sind zum Auszug abgelesen.');
  else S('zaehler', 'Zählerstände zum Auszug', 'offen', 'Es fehlt: ' + fehl.join(', ') + '. Ohne Zwischenablesung wird der Verbrauch nur zeitanteilig verteilt (§ 9b HeizkostenV).');
  var fertig = e.abrechnung && !e.vorlaeufig;
  S('abrechnung', 'Abrechnung bis Auszug', fertig ? 'erledigt' : 'offen', !e.abrechnung ? 'Noch keine Abrechnung möglich. Kosten des Jahres erfassen.' : e.vorlaeufig ? 'Die Abrechnung beruht noch auf Planwerten.' : 'Abrechnung liegt vor.' + (e.saldo ? (e.saldo > 0 ? ' Nachzahlung ' + NK.euro(e.saldo) + '.' : ' Guthaben ' + NK.euro(-e.saldo) + '.') : ''));
  S('zustellung', 'Abrechnung zustellen', e.zugestellt ? 'erledigt' : 'offen', e.zugestellt ? 'Zugang ist eingetragen.' : fertig ? 'Abrechnung versenden und den Zugang eintragen. Frist: zwölf Monate nach Ende des Abrechnungszeitraums.' : 'Erst nach der fertigen Abrechnung.');
  if (!(e.kaution > 0)) S('kaution', 'Kaution abrechnen', 'entfaellt', 'Keine Kaution erfasst.');
  else if (e.kautionZurueck) S('kaution', 'Kaution abrechnen', 'erledigt', 'Kaution ist zurückgezahlt.');
  else S('kaution', 'Kaution abrechnen', 'offen', e.zugestellt ? 'Abrechnung ist zugegangen. Kaution samt Zinsen abzüglich berechtigter Forderungen zurückzahlen.' : 'Ein Teil darf bis zur Abrechnung einbehalten werden, wenn eine Nachzahlung zu erwarten ist. Üblich sind einige Monate Prüffrist.');
  return L;
};

/* ---------- Anlage V ---------- */
NK.anlageV = function (obj, jahr) {
  var per = NK.jahrPeriode(jahr);
  var einheiten = obj.einheiten.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'de'); }).map(function (e) {
    return { name: e.name, gewerblich: !!e.gewerblich,
      kalt: r2(e.mieter.reduce(function (a, m) { return a + NK.kaltmieteSumme(m, jahr); }, 0)),
      umlagen: r2(e.mieter.reduce(function (a, m) { return a + NK.istVorauszahlungen(m, per); }, 0)) };
  });
  var kosten = (obj.kosten || []).filter(function (k) { return +k.jahr === jahr; }).sort(function (a, b) { return String(a.bez).localeCompare(String(b.bez), 'de'); })
    .map(function (k) { return { bez: k.bez, betrag: +k.betrag || 0, umlagefaehig: k.umlagefaehig !== false, vorlaeufig: !!k.vorlaeufig }; });
  var sum = function (a, f) { return r2(a.reduce(function (s, x) { return s + f(x); }, 0)); };
  var r = { objekt: obj.name, jahr: jahr, einheiten: einheiten, kosten: kosten };
  r.kalt = sum(einheiten, function (e) { return e.kalt; }); r.umlagen = sum(einheiten, function (e) { return e.umlagen; });
  r.einnahmen = r2(r.kalt + r.umlagen); r.werbung = sum(kosten, function (k) { return k.betrag; });
  r.ueberschuss = r2(r.einnahmen - r.werbung);
  return r;
};

/* ---------- Mailtext ---------- */
NK.mailText = function (name, jahr, saldo, abs) {
  var z = [name ? 'Guten Tag ' + name + ',' : 'Guten Tag,', '', 'anbei erhalten Sie die Nebenkostenabrechnung für das Jahr ' + jahr + ' als PDF.', ''];
  if (saldo > 0) z.push('Es ergibt sich eine Nachzahlung von ' + NK.euro(saldo) + '. Bitte überweisen Sie den Betrag innerhalb von ' + (abs.zahlungsfrist || 14) + ' Tagen' + (abs.iban ? ' auf das Konto IBAN ' + abs.iban + (abs.bank ? ' (' + abs.bank + ')' : '') + '.' : '.'));
  else if (saldo < 0) z.push('Es ergibt sich ein Guthaben von ' + NK.euro(-saldo) + ' zu Ihren Gunsten. Ich überweise es Ihnen. Bitte teilen Sie mir mit, falls sich Ihre Bankverbindung geändert hat.');
  else z.push('Die Abrechnung ist ausgeglichen. Es entsteht weder eine Nachzahlung noch ein Guthaben.');
  z.push('', 'Einwendungen gegen die Abrechnung können Sie innerhalb von zwölf Monaten nach Zugang erheben (§ 556 Abs. 3 BGB). Die zugrunde liegenden Belege können Sie nach Absprache einsehen.', '', 'Bitte bestätigen Sie mir kurz den Empfang dieser E-Mail.', '', 'Mit freundlichen Grüßen', abs.name || 'Ihr Vermieter');
  return z.join('\n');
};

g.NK = NK;
if (typeof module !== 'undefined') module.exports = NK;
})(typeof window !== 'undefined' ? window : globalThis);
