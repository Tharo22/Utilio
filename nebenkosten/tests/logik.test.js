/* Ausführen: node nebenkosten/tests/logik.test.js */
const NK = require('../logik.js'), assert = require('assert');
let n = 0; const t = (name, f) => { try { f(); n++; } catch (e) { console.error('FEHLER:', name, '\n ', e.message); process.exitCode = 1; } };
const J = NK.jahrPeriode(2025);

/* Zählertausch */
t('Tausch addiert beide Zähler', () => assert.strictEqual(NK.verbrauch([
  { datum: '2024-12-31', wert: 1000 }, { datum: '2025-06-01', wert: 1400 }, { datum: '2025-06-01', wert: 0, neu: true }, { datum: '2025-12-31', wert: 250 }], J, 31), 650));
t('Reihenfolge egal', () => assert.strictEqual(NK.verbrauch([
  { datum: '2025-12-31', wert: 250 }, { datum: '2025-06-01', wert: 0, neu: true }, { datum: '2024-12-31', wert: 1000 }, { datum: '2025-06-01', wert: 1400 }], J, 31), 650));
t('sinkender Stand ohne Tausch = null', () => assert.strictEqual(NK.verbrauch([{ datum: '2024-12-31', wert: 1000 }, { datum: '2025-12-31', wert: 10 }], J, 31), null));
t('Tausch am Jahresende', () => {
  const a = [{ datum: '2024-12-31', wert: 100 }, { datum: '2025-12-31', wert: 180 }, { datum: '2025-12-31', wert: 0, neu: true }];
  assert.strictEqual(NK.verbrauch(a, J, 31), 80);
  assert.strictEqual(NK.verbrauch(a.concat([{ datum: '2026-12-31', wert: 90 }]), NK.jahrPeriode(2026), 31), 90);
});

/* Mietverlauf / Soll */
const M = (o) => Object.assign({ von: '2025-01-01', bis: '', kalt: 800, vz: 100, personen: 1, aenderungen: [], zahlungen: [], personenAend: [] }, o);
t('Soll ohne Stufen', () => assert.strictEqual(NK.sollSumme(M({}), 2025), 1200));
t('Soll mit Stufe zum Monatsersten', () => { const mo = NK.sollMonate(M({ aenderungen: [{ ab: '2025-07-01', vz: 130, kalt: 800 }] }), 2025); assert.strictEqual(mo[5].wert, 100); assert.strictEqual(mo[6].wert, 130); });
t('Soll Stufe mitten im Monat', () => assert.strictEqual(NK.sollMonate(M({ aenderungen: [{ ab: '2025-06-16', vz: 200, kalt: 800 }] }), 2025)[5].wert, 150));
t('Kaltmiete mit Stufe', () => assert.strictEqual(NK.kaltmieteSumme(M({ von: '2024-01-01', aenderungen: [{ ab: '2025-07-01', vz: 100, kalt: 850 }] }), 2025), 6 * 800 + 6 * 850));
t('Kaltmiete Einzug Mitte März', () => assert.strictEqual(NK.kaltmieteSumme(M({ von: '2025-03-16', kalt: 620 }), 2025), NK.r2(620 * 16 / 31 + 620 * 9)));
t('Kaltmiete nach Auszug 0', () => assert.strictEqual(NK.kaltmieteSumme(M({ von: '2023-01-01', bis: '2024-12-31' }), 2025), 0));

/* Abrechnung */
const obj = (extra) => Object.assign({ id: 'o', name: 'Haus', keineCO2: true, einheiten: [
  { id: 'e1', name: 'EG', flaeche: 60, personen: 2, mieter: [], staende: [] },
  { id: 'e2', name: 'OG', flaeche: 40, personen: 1, mieter: [], staende: [] }], kosten: [] }, extra);
t('Wohnfläche ganzes Jahr', () => {
  const o = obj({ kosten: [{ bez: 'Grundsteuer', betrag: 1000, jahr: 2025, schluessel: 'wohnflaeche', umlagefaehig: true }] });
  o.einheiten[0].mieter.push(M({ vz: 50 }));
  const e = NK.abrechnungFuer(o, o.einheiten[0], o.einheiten[0].mieter[0], 2025);
  assert.strictEqual(e.summeKosten, 600); assert.strictEqual(e.vorauszahlungen, 600); assert.strictEqual(e.saldo, 0);
});
t('Teiljahr zeitanteilig', () => {
  const o = obj({ kosten: [{ bez: 'Grundsteuer', betrag: 3650, jahr: 2025, schluessel: 'einheiten', umlagefaehig: true }] });
  o.einheiten[0].mieter.push(M({ von: '2025-07-01' }));
  const e = NK.abrechnungFuer(o, o.einheiten[0], o.einheiten[0].mieter[0], 2025);
  assert.strictEqual(e.summeKosten, NK.r2(3650 * 0.5 * 184 / 365));
});
t('nicht umlagefähig ausgeschlossen, vorläufig markiert', () => {
  const o = obj({ kosten: [{ bez: 'A', betrag: 1000, jahr: 2025, schluessel: 'wohnflaeche', umlagefaehig: true, vorlaeufig: true }, { bez: 'B', betrag: 500, jahr: 2025, schluessel: 'wohnflaeche', umlagefaehig: false }] });
  o.einheiten[0].mieter.push(M({}));
  const e = NK.abrechnungFuer(o, o.einheiten[0], o.einheiten[0].mieter[0], 2025);
  assert.strictEqual(e.summeKosten, 600); assert.strictEqual(e.vorlaeufig, true);
});
t('Verbrauch verteilt', () => {
  const o = obj({ kosten: [{ bez: 'Wasser', betrag: 300, jahr: 2025, schluessel: 'verbrauch', art: 'Kaltwasser', umlagefaehig: true }] });
  o.einheiten[0].staende = [{ art: 'Kaltwasser', datum: '2024-12-31', wert: 0 }, { art: 'Kaltwasser', datum: '2025-12-31', wert: 30 }];
  o.einheiten[1].staende = [{ art: 'Wasser', datum: '2024-12-31', wert: 0 }, { art: 'Wasser', datum: '2025-12-31', wert: 10 }];
  o.einheiten[0].mieter.push(M({}));
  assert.strictEqual(NK.abrechnungFuer(o, o.einheiten[0], o.einheiten[0].mieter[0], 2025).summeKosten, 225);
});
t('Personentage', () => {
  const o = obj({ kosten: [{ bez: 'Müll', betrag: 300, jahr: 2025, schluessel: 'personen', umlagefaehig: true }] });
  o.einheiten[0].mieter.push(M({ personen: 2 })); o.einheiten[1].mieter.push(M({ personen: 1 }));
  assert.strictEqual(NK.abrechnungFuer(o, o.einheiten[0], o.einheiten[0].mieter[0], 2025).summeKosten, 200);
});
t('Heizkosten 70/30', () => {
  const o = obj({ kosten: [{ bez: 'Heizung', betrag: 1000, jahr: 2025, schluessel: 'heizkosten', art: 'Heizung', umlagefaehig: true }] });
  o.einheiten[0].staende = [{ art: 'Heizung', datum: '2024-12-31', wert: 0 }, { art: 'Heizung', datum: '2025-12-31', wert: 50 }];
  o.einheiten[1].staende = [{ art: 'Heizung', datum: '2024-12-31', wert: 0 }, { art: 'Heizung', datum: '2025-12-31', wert: 50 }];
  o.einheiten[0].mieter.push(M({}));
  const e = NK.abrechnungFuer(o, o.einheiten[0], o.einheiten[0].mieter[0], 2025);
  assert.strictEqual(e.zeilen.length, 2); assert.strictEqual(e.summeKosten, NK.r2(300 * 0.6 + 700 * 0.5));
});
t('CO2 Stufenmodell', () => {
  const k = [{ bez: 'Gas', betrag: 1000, schluessel: 'heizkosten', co2Kosten: 100, co2Kg: 3500 }], e = [{ id: 'a', flaeche: 100, gewerblich: false }];
  const c = NK.co2Aufteilung(k, e, {}); assert.strictEqual(c.stufe, 6); assert.strictEqual(c.vermieterProzent, 50); assert.strictEqual(c.vermieterBetrag, 50);
});
t('CO2 Nichtwohngebäude 50/50', () => {
  const c = NK.co2Aufteilung([{ bez: 'Gas', betrag: 1000, schluessel: 'heizkosten', co2Kosten: 100 }], [{ id: 'a', flaeche: 100, gewerblich: true }], {});
  assert.strictEqual(c.vermieterProzent, 50);
});

/* Vorauszahlung */
t('VZ-Vorschlag aufrunden', () => { const v = NK.vzVorschlag(1900, 365, 365, 120, 0); assert.strictEqual(v.neu, 159); assert.strictEqual(v.diff, 39); assert.ok(v.sinnvoll); });
t('VZ mit Zuschlag', () => assert.strictEqual(NK.vzVorschlag(1200, 365, 365, 100, 10).neu, 110));
t('VZ Teiljahr hochgerechnet', () => { const v = NK.vzVorschlag(300, 73, 365, 100, 0); assert.strictEqual(v.jahreskosten, 1500); assert.strictEqual(v.neu, 125); assert.ok(v.hochgerechnet); });
t('VZ kleiner Unterschied', () => assert.strictEqual(NK.vzVorschlag(1200, 365, 365, 98, 0).sinnvoll, false));
t('VZ ohne Daten', () => assert.strictEqual(NK.vzVorschlag(0, 365, 365, 100, 0), null));
t('Frühester Termin', () => { assert.strictEqual(NK.fruehesterTermin('2026-11-11'), '2027-01-01'); assert.strictEqual(NK.fruehesterTermin('2026-12-31'), '2027-02-01'); });

/* Leerstand */
t('belegte Tage', () => {
  assert.strictEqual(NK.belegteTage([{ von: '2025-01-01', bis: '2025-03-31' }, { von: '2025-07-01', bis: NK.FAR }], J), 90 + 184);
  assert.strictEqual(NK.belegteTage([{ von: '2025-01-01', bis: '2025-06-30' }, { von: '2025-06-01', bis: '2025-06-30' }], J), 181);
  assert.strictEqual(NK.belegteTage([{ von: '2025-01-01', bis: '2025-05-31' }, { von: '2025-06-01', bis: NK.FAR }], J), 365);
  assert.strictEqual(NK.belegteTage([], J), 0);
});
t('Leerstand einer Einheit', () => {
  const o = { name: 'Haus', keineCO2: true, einheiten: [{ id: 'e', name: 'EG', flaeche: 100, personen: 2, mieter: [M({ von: '2025-07-01', vz: 0 })], staende: [] }], kosten: [{ bez: 'Grundsteuer', betrag: 3650, jahr: 2025, schluessel: 'wohnflaeche', umlagefaehig: true }] };
  const l = NK.leerstand(o, o.einheiten[0], 2025); assert.strictEqual(l.tage, 181); assert.strictEqual(l.kosten, 1810);
});

/* Mieterwechsel, Kaution */
t('Kaution mit Nachzahlung', () => { const k = NK.kaution(1500, 30, 200); assert.strictEqual(k.einbehalt, 200); assert.strictEqual(k.auszahlung, 1330); });
t('Kaution mit Guthaben', () => { const k = NK.kaution(1500, 0, -80); assert.strictEqual(k.auszahlung, 1500); assert.strictEqual(k.gesamt, 1580); });
t('Nachzahlung größer als Kaution', () => { const k = NK.kaution(500, 0, 800); assert.strictEqual(k.auszahlung, 0); assert.strictEqual(k.rest, 300); });
t('Einbehalt begrenzt', () => { assert.strictEqual(NK.kaution(1000, 0, 0, 5000).einbehalt, 1000); assert.strictEqual(NK.kaution(1000, 0, 300, 100).einbehalt, 100); });
t('Mieterwechsel ohne Auszug', () => { const s = NK.mieterwechsel({}); assert.strictEqual(s.length, 5); assert.ok(s.every(x => x.status === 'offen')); });
t('Mieterwechsel komplett', () => { const s = NK.mieterwechsel({ auszug: '2025-06-30', erforderlich: ['Kaltwasser'], mitStand: ['Wasser'], abrechnung: true, zugestellt: true, kaution: 1500, kautionZurueck: true }); assert.ok(s.every(x => x.status === 'erledigt')); });
t('Fehlende Zähler genannt', () => { const s = NK.mieterwechsel({ auszug: '2025-06-30', erforderlich: ['Kaltwasser', 'Heizung'], mitStand: ['Wasser'] }); assert.ok(s[1].detail.includes('Heizung') && !s[1].detail.includes('Kaltwasser')); });

/* Fristen */
t('Frist 556', () => { const f = NK.fristStatus(2025, null, '2026-12-10'); assert.strictEqual(f.frist, '2026-12-31'); assert.strictEqual(f.stufe, 'dringend'); assert.strictEqual(NK.fristStatus(2025, null, '2026-11-11').stufe, 'bald'); assert.strictEqual(NK.fristStatus(2025, '2027-01-02', '2027-02-01').verspaetet, true); });

/* Anlage V */
t('Anlage V', () => {
  const o = { name: 'Haus', einheiten: [{ name: 'EG', mieter: [M({ von: '2024-01-01', kalt: 800, zahlungen: [{ monat: '2025-01-01', betrag: 100 }, { monat: '2025-02-01', betrag: 100 }] })] }], kosten: [{ bez: 'X', betrag: 900, jahr: 2025, umlagefaehig: true }, { bez: 'Y', betrag: 400, jahr: 2025, umlagefaehig: false }] };
  const a = NK.anlageV(o, 2025); assert.strictEqual(a.kalt, 9600); assert.strictEqual(a.umlagen, 200); assert.strictEqual(a.werbung, 1300); assert.strictEqual(a.ueberschuss, 8500);
});
t('Mailtext', () => { const x = NK.mailText('Eva', 2025, 120, { name: 'Tami', iban: 'DE00', zahlungsfrist: 14 }); assert.ok(x.includes('Nachzahlung') && x.includes('14 Tagen') && x.includes('§ 556') && x.endsWith('Tami')); });

console.log(n + ' Tests ok');
