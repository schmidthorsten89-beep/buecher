'use strict';

const SPEICHER_KEY = 'buecher.daten';
const STATUS = {
  wunsch: 'Will ich lesen',
  lese: 'Lese ich',
  gelesen: 'Gelesen',
  abgebrochen: 'Abgebrochen',
};
const FILTER = [['', 'Alle'], ['wunsch', 'Merkliste'], ['lese', 'Lese ich'], ['gelesen', 'Gelesen'], ['abgebrochen', 'Abgebrochen']];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const TITEL = { lese: 'Lese ich', bibliothek: 'Bibliothek', statistik: 'Statistik' };
const FORMATE = {
  buch: { name: 'Buch', mehrzahl: 'Bücher', symbol: '📖' },
  ebook: { name: 'E-Book', mehrzahl: 'E-Books', symbol: '📱' },
  hoerbuch: { name: 'Hörbuch', mehrzahl: 'Hörbücher', symbol: '🎧' },
};
const MAX_SEITEN = 20000;
// Eigene Cover-Fotos werden verkleinert als Daten-URL gespeichert.
const FOTO_MUSTER = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_FOTO = 200000;

const $ = (auswahl) => document.querySelector(auswahl);

const gespeichert = ladeJson(SPEICHER_KEY) || {};
const zustand = {
  buecher: bereinigeBuecher(gespeichert.buecher),
  ziele: bereinigeZiele(gespeichert.ziele),
  ansicht: 'lese',
  filter: '',
  suche: '',
  sortierung: 'neu',
  statJahr: new Date().getFullYear(),
  statMonat: null,
  detailId: null,
  bearbeiteId: null,
  fortschrittId: null,
  fertigId: null,
  fertigWert: 0,
  treffer: [],
};

/* ---------- Hilfen ---------- */

function ladeJson(schluessel) {
  try {
    return JSON.parse(localStorage.getItem(schluessel));
  } catch (fehler) {
    return null;
  }
}

function speichere() {
  try {
    localStorage.setItem(SPEICHER_KEY, JSON.stringify({ version: 1, ziele: zustand.ziele, buecher: zustand.buecher }));
  } catch (fehler) {
    zeigeStatus(fehler && fehler.name === 'QuotaExceededError'
      ? 'Der Speicher ist voll. Entferne ein paar eigene Cover-Fotos, sonst gehen Änderungen beim Schließen verloren.'
      : 'Speichern auf diesem Gerät nicht möglich. Änderungen gehen beim Schließen verloren.');
  }
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]));
}

function kuerze(wert, laenge) {
  return typeof wert === 'string' ? wert.trim().slice(0, laenge) : '';
}

function ganzzahl(wert, min, max) {
  const zahl = typeof wert === 'string' ? parseInt(wert, 10) : wert;
  return Number.isFinite(zahl) ? Math.min(max, Math.max(min, Math.round(zahl))) : 0;
}

function halbeSterne(wert) {
  const zahl = Number(wert);
  return Number.isFinite(zahl) ? Math.min(5, Math.max(0, Math.round(zahl * 2) / 2)) : 0;
}

function istDatum(wert) {
  return typeof wert === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(wert);
}

function heuteIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function datumText(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function tageZwischen(von, bis) {
  return Math.round((new Date(`${bis}T12:00:00`) - new Date(`${von}T12:00:00`)) / 864e5);
}

function zahlText(zahl) {
  return zahl.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

function mehrzahl(anzahl, eins, mehrere) {
  return `${zahlText(anzahl)} ${anzahl === 1 ? eins : mehrere}`;
}

function normIsbn(wert) {
  return typeof wert === 'string' ? wert.replace(/[^0-9Xx]/g, '').toUpperCase().slice(0, 13) : '';
}

function normAsin(wert) {
  const asin = typeof wert === 'string' ? wert.trim().toUpperCase() : '';
  return /^[A-Z0-9]{10}$/.test(asin) ? asin : '';
}

function istHttps(wert) {
  return typeof wert === 'string' && /^https:\/\/\S+$/i.test(wert);
}

function istFoto(wert) {
  return typeof wert === 'string' && wert.length <= MAX_FOTO && FOTO_MUSTER.test(wert);
}

// Amazon liefert unter dieser Adresse oft das Cover zur ASIN, sonst ein 1×1-Pixel (wird dann ausgeblendet).
function amazonCover(asin) {
  return `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`;
}

function buchLink(buch) {
  return buch.asin ? `https://www.amazon.de/dp/${buch.asin}` : buch.link;
}

function neueId() {
  return `b-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function farbton(text) {
  let summe = 0;
  for (const zeichen of text) summe = (summe * 31 + zeichen.codePointAt(0)) % 360;
  return summe;
}

function finde(id) {
  return zustand.buecher.find((b) => b.id === id);
}

let statusTimer = null;
function zeigeStatus(text) {
  const el = $('#status');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.hidden = true; }, 4500);
}

/* ---------- Daten prüfen (Speicher und Sicherungsdateien) ---------- */

function bereinigeBuch(b) {
  if (!b || typeof b !== 'object') return null;
  const titel = kuerze(b.titel, 200);
  if (!titel) return null;
  const cover = typeof b.cover === 'string' ? b.cover.trim() : '';
  const link = kuerze(b.link, 500);
  return {
    id: typeof b.id === 'string' && /^[a-z0-9-]{1,40}$/.test(b.id) ? b.id : neueId(),
    titel,
    autor: kuerze(b.autor, 200),
    format: FORMATE[b.format] ? b.format : 'buch',
    isbn: normIsbn(b.isbn),
    asin: normAsin(b.asin),
    link: istHttps(link) ? link : '',
    seiten: ganzzahl(b.seiten, 0, MAX_SEITEN),
    cover: (istHttps(cover) && cover.length <= 500) || istFoto(cover) ? cover : '',
    verlag: kuerze(b.verlag, 120),
    jahr: ganzzahl(b.jahr, 0, 2100),
    beschreibung: kuerze(b.beschreibung, 4000),
    status: STATUS[b.status] ? b.status : 'wunsch',
    aktuelleSeite: ganzzahl(b.aktuelleSeite, 0, MAX_SEITEN),
    start: istDatum(b.start) ? b.start : '',
    ende: istDatum(b.ende) ? b.ende : '',
    bewertung: halbeSterne(b.bewertung),
    notizen: typeof b.notizen === 'string' ? b.notizen.slice(0, 20000) : '',
    zitate: (Array.isArray(b.zitate) ? b.zitate : []).flatMap((z) => {
      const text = kuerze(z && z.text, 2000);
      return text ? [{ id: typeof z.id === 'string' ? z.id.slice(0, 40) : neueId(), text, seite: ganzzahl(z.seite, 0, MAX_SEITEN) }] : [];
    }).slice(0, 500),
    verlauf: (Array.isArray(b.verlauf) ? b.verlauf : [])
      .filter((v) => v && istDatum(v.datum))
      .map((v) => ({ datum: v.datum, seite: ganzzahl(v.seite, 0, MAX_SEITEN) }))
      .slice(-1000),
    hinzugefuegt: Number.isFinite(b.hinzugefuegt) ? b.hinzugefuegt : Date.now(),
  };
}

function bereinigeBuecher(liste) {
  if (!Array.isArray(liste)) return [];
  const ids = new Set();
  return liste.flatMap((roh) => {
    const buch = bereinigeBuch(roh);
    if (!buch) return [];
    if (ids.has(buch.id)) buch.id = neueId();
    ids.add(buch.id);
    return [buch];
  });
}

function bereinigeZiele(ziele) {
  if (!ziele || typeof ziele !== 'object' || Array.isArray(ziele)) return {};
  return Object.fromEntries(Object.entries(ziele)
    .filter(([jahr]) => /^\d{4}$/.test(jahr))
    .map(([jahr, ziel]) => [jahr, ganzzahl(ziel, 0, 999)]));
}

// Ein Ziel gilt weiter, bis für ein späteres Jahr ein neues festgelegt wird.
function zielFuer(jahr) {
  const jahre = Object.keys(zustand.ziele).map(Number).filter((j) => j <= jahr).sort((a, b) => b - a);
  return jahre.length ? zustand.ziele[jahre[0]] : 0;
}

/* ---------- Bausteine ---------- */

function coverHtml(buch, klasse = '', marke = '') {
  const bild = buch.cover ? `<img src="${esc(buch.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
  const format = FORMATE[buch.format] && buch.format !== 'buch'
    ? `<span class="format-marke">${FORMATE[buch.format].symbol}</span>` : '';
  return `<span class="cover ${klasse}" style="--farbton:${farbton(buch.titel)}" aria-hidden="true">
    <span class="cover-text">${esc(buch.titel)}</span>${bild}${format}${marke ? `<span class="status-marke">${esc(marke)}</span>` : ''}</span>`;
}

function bewertungText(wert) {
  return wert ? `${zahlText(wert)} von 5 Sternen` : 'Noch nicht bewertet';
}

function sterneHtml(wert) {
  return `<span class="sterne" style="--wert:${wert * 20}%" role="img" aria-label="${bewertungText(wert)}"></span>`;
}

function sterneWahlHtml(wert, ziel) {
  return `<div class="sterne-zeile">
    <span class="sterne waehlbar" role="slider" tabindex="0" aria-label="Bewertung" aria-valuemin="0" aria-valuemax="5"
      aria-valuenow="${wert}" aria-valuetext="${bewertungText(wert)}" data-sterne="${ziel}" style="--wert:${wert * 20}%"></span>
    <span class="sterne-zahl">${wert ? zahlText(wert) : ''}</span>
  </div>`;
}

function fortschritt(buch) {
  return buch.seiten ? Math.min(100, Math.round((buch.aktuelleSeite / buch.seiten) * 100)) : 0;
}

function standHtml(buch) {
  const prozent = fortschritt(buch);
  const seite = buch.seiten ? `Seite ${buch.aktuelleSeite} von ${buch.seiten}` : `Seite ${buch.aktuelleSeite}`;
  return `<div class="lese-stand"><span>${seite}</span><span>${buch.seiten ? `${prozent} %` : ''}</span></div>
    <div class="balken" role="progressbar" aria-label="Lesefortschritt" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${prozent}"><span style="--p:${prozent}%"></span></div>`;
}

function metaText(buch) {
  const format = FORMATE[buch.format] && buch.format !== 'buch' ? FORMATE[buch.format].name : '';
  return [format, buch.seiten ? `${buch.seiten} Seiten` : '', buch.verlag, buch.jahr || ''].filter(Boolean).join(' · ');
}

function gelesenImJahr(jahr) {
  return zustand.buecher.filter((b) => b.status === 'gelesen' && b.ende.startsWith(`${jahr}-`));
}

/* ---------- Lese ich ---------- */

function zuletztGelesen(buch) {
  const letzter = buch.verlauf[buch.verlauf.length - 1];
  return (letzter && letzter.datum) || buch.start || '';
}

function renderLese() {
  const jahr = new Date().getFullYear();
  const anzahl = gelesenImJahr(jahr).length;
  const ziel = zielFuer(jahr);
  $('#ziel-kurz').innerHTML = ziel
    ? `<strong>Leseziel ${jahr}: ${anzahl} von ${mehrzahl(ziel, 'Buch', 'Büchern')}</strong>
       <div class="balken"><span style="--p:${Math.min(100, Math.round((anzahl / ziel) * 100))}%"></span></div>`
    : `<strong>${mehrzahl(anzahl, 'Buch', 'Bücher')} in ${jahr} gelesen</strong> · Leseziel unter ⚙ festlegen`;

  const lese = zustand.buecher.filter((b) => b.status === 'lese')
    .sort((a, b) => zuletztGelesen(b).localeCompare(zuletztGelesen(a)) || b.hinzugefuegt - a.hinzugefuegt);
  const merkliste = zustand.buecher.filter((b) => b.status === 'wunsch').sort((a, b) => b.hinzugefuegt - a.hinzugefuegt);

  $('#lese-liste').innerHTML = lese.length
    ? lese.map((b) => `<div class="lese-karte">
        <button type="button" class="titel-knopf" data-buch="${b.id}" aria-label="${esc(b.titel)} öffnen">${coverHtml(b)}</button>
        <div class="lese-text">
          <button type="button" class="titel-knopf" data-buch="${b.id}">
            <span class="buch-titel">${esc(b.titel)}</span>
            <span class="buch-autor">${esc(b.autor)}</span>
          </button>
          ${standHtml(b)}
          <div class="lese-knoepfe">
            <button type="button" data-seite="${b.id}">Seite eintragen</button>
            <button type="button" data-fertig="${b.id}">✓ Fertig</button>
          </div>
        </div>
      </div>`).join('')
    : `<div class="leer">
        <p>Du liest gerade kein Buch.${merkliste.length ? '<br>Such dir eins von deiner Merkliste aus.' : ''}</p>
        <button class="haupt" type="button" data-neu>Buch hinzufügen</button>
      </div>`;

  $('#naechste').innerHTML = merkliste.length
    ? `<h3 class="abschnitt-titel">Als Nächstes</h3>
       <div class="reihe">${merkliste.slice(0, 15).map((b) => `<button type="button" data-buch="${b.id}">
         ${coverHtml(b)}<span class="klein-titel">${esc(b.titel)}</span></button>`).join('')}</div>`
    : '';
}

/* ---------- Bibliothek ---------- */

const SORTIERUNGEN = {
  neu: (a, b) => b.hinzugefuegt - a.hinzugefuegt,
  beendet: (a, b) => (b.ende || '').localeCompare(a.ende || '') || b.hinzugefuegt - a.hinzugefuegt,
  titel: (a, b) => a.titel.localeCompare(b.titel, 'de'),
  autor: (a, b) => (!a.autor - !b.autor) || a.autor.localeCompare(b.autor, 'de') || a.titel.localeCompare(b.titel, 'de'),
  bewertung: (a, b) => b.bewertung - a.bewertung || a.titel.localeCompare(b.titel, 'de'),
};

function renderBibliothek() {
  $('#filter').innerHTML = FILTER.map(([wert, name]) => {
    const anzahl = zustand.buecher.filter((b) => !wert || b.status === wert).length;
    return `<button type="button" data-filter="${wert}" class="${wert === zustand.filter ? 'aktiv' : ''}">${name}<small>${anzahl}</small></button>`;
  }).join('');

  const suche = zustand.suche.trim().toLocaleLowerCase('de');
  const liste = zustand.buecher
    .filter((b) => (!zustand.filter || b.status === zustand.filter)
      && (!suche || `${b.titel} ${b.autor} ${b.isbn} ${b.asin} ${FORMATE[b.format].name}`.toLocaleLowerCase('de').includes(suche)))
    .sort(SORTIERUNGEN[zustand.sortierung]);

  $('#bib-anzahl').textContent = mehrzahl(liste.length, 'Buch', 'Bücher');
  const ziel = $('#bib-liste');

  if (!zustand.buecher.length) {
    ziel.innerHTML = `<div class="leer">
      <p>Deine Bibliothek ist noch leer.</p>
      <button class="haupt" type="button" data-neu>Erstes Buch hinzufügen</button>
    </div>`;
    return;
  }
  if (!liste.length) {
    ziel.innerHTML = '<p class="leer">Keine passenden Bücher.</p>';
    return;
  }

  ziel.innerHTML = `<div class="regal">${liste.map((b) => {
    let marke = '';
    if (b.status === 'lese') marke = b.seiten ? `Lese ich · ${fortschritt(b)} %` : 'Lese ich';
    else if (!zustand.filter && b.status !== 'gelesen') marke = b.status === 'wunsch' ? 'Merkliste' : STATUS[b.status];
    return `<button type="button" class="regal-buch" data-buch="${b.id}">
      ${coverHtml(b, '', marke)}
      <span class="klein-titel">${esc(b.titel)}</span>
      <span class="klein-autor">${esc(b.autor) || '&nbsp;'}</span>
      ${b.bewertung ? sterneHtml(b.bewertung) : ''}
    </button>`;
  }).join('')}</div>`;
}

/* ---------- Statistik ---------- */

function ringHtml(anzahl, ziel) {
  const umfang = 2 * Math.PI * 45;
  const anteil = ziel ? Math.min(1, anzahl / ziel) : 0;
  return `<svg class="ring" viewBox="0 0 112 112" role="img" aria-label="${anzahl} von ${ziel} Büchern">
    <circle class="ring-spur" cx="56" cy="56" r="45"></circle>
    ${anteil ? `<circle class="ring-wert" cx="56" cy="56" r="45" stroke-dasharray="${(anteil * umfang).toFixed(1)} ${umfang.toFixed(1)}"></circle>` : ''}
    <text class="ring-zahl" x="56" y="60">${anzahl}</text>
    <text class="ring-ziel" x="56" y="78">von ${ziel}</text>
  </svg>`;
}

function zielHtml(jahr, anzahl) {
  const ziel = zielFuer(jahr);
  if (!ziel) {
    return `<div class="karte ziel-karte"><div class="ziel-text">
      <strong>${mehrzahl(anzahl, 'Buch', 'Bücher')} gelesen</strong>
      <span>Lege unter ⚙ ein Leseziel fest, um deinen Fortschritt zu sehen.</span>
    </div></div>`;
  }

  const jetzt = new Date();
  let haupt;
  let neben = '';
  let klasse = '';
  if (anzahl >= ziel) {
    haupt = 'Ziel erreicht! 🎉';
    klasse = 'vorne';
    neben = anzahl > ziel ? `${mehrzahl(anzahl - ziel, 'Buch', 'Bücher')} mehr als geplant.` : 'Genau geschafft.';
  } else if (jahr < jetzt.getFullYear()) {
    haupt = `${anzahl} von ${ziel} geschafft`;
    neben = `Es fehlten ${mehrzahl(ziel - anzahl, 'Buch', 'Bücher')}.`;
  } else {
    const jahresbeginn = new Date(jahr, 0, 1);
    const tageImJahr = tageZwischen(`${jahr}-01-01`, `${jahr + 1}-01-01`);
    const tag = Math.floor((jetzt - jahresbeginn) / 864e5) + 1;
    const soll = (ziel * tag) / tageImJahr;
    const rest = ziel - anzahl;
    const tageRest = tageImJahr - tag + 1;
    if (anzahl >= Math.floor(soll)) {
      haupt = anzahl > soll + 1 ? `${mehrzahl(Math.floor(anzahl - soll), 'Buch', 'Bücher')} voraus` : 'Du liegst im Plan';
      klasse = 'vorne';
    } else {
      haupt = `${mehrzahl(Math.ceil(soll - anzahl), 'Buch', 'Bücher')} hinter dem Plan`;
    }
    neben = `Noch ${mehrzahl(rest, 'Buch', 'Bücher')} in ${mehrzahl(tageRest, 'Tag', 'Tagen')} – etwa eins alle ${Math.max(1, Math.round(tageRest / rest))} Tage.`;
  }

  return `<div class="karte ziel-karte">
    ${ringHtml(anzahl, ziel)}
    <div class="ziel-text"><strong class="${klasse}">${haupt}</strong><span>${neben}</span></div>
  </div>`;
}

// Bücher pro Monat als schlichte Säulen; die Zahl steht direkt über der Säule statt einer Achse.
function monateHtml(jahr, liste) {
  const proMonat = MONATE.map((_, i) => liste.filter((b) => Number(b.ende.slice(5, 7)) === i + 1));
  const max = Math.max(1, ...proMonat.map((m) => m.length));
  const breite = 340;
  const oben = 18;
  const unten = 124;
  const spalte = breite / 12;
  const saeule = Math.min(18, spalte * 0.6);
  const jetzt = new Date();
  const aktMonat = jahr === jetzt.getFullYear() ? jetzt.getMonth() : -1;

  const teile = proMonat.map((buecher, i) => {
    const x = i * spalte + (spalte - saeule) / 2;
    const h = buecher.length ? Math.max(4, ((unten - oben) * buecher.length) / max) : 0;
    const y = unten - h;
    const r = Math.min(4, h);
    const pfad = h
      ? `<path class="saeule" d="M${x},${unten} V${y + r} Q${x},${y} ${x + r},${y} H${x + saeule - r} Q${x + saeule},${y} ${x + saeule},${y + r} V${unten} Z"></path>
         <text class="wert" x="${x + saeule / 2}" y="${y - 5}">${buecher.length}</text>`
      : '';
    const jetztKlasse = i === aktMonat ? ' jetzt' : '';
    return `<g data-monat="${i}"${zustand.statMonat === i ? ' class="gewaehlt"' : ''}>
      <rect class="treffer-flaeche" x="${i * spalte}" y="0" width="${spalte}" height="${unten + 20}"></rect>
      ${pfad}
      <text class="beschriftung${jetztKlasse}" x="${i * spalte + spalte / 2}" y="${unten + 16}">${MONATE[i][0]}</text>
    </g>`;
  }).join('');

  return `<div class="karte monate">
    <h3>Bücher pro Monat</h3>
    <svg viewBox="0 0 ${breite} ${unten + 20}" role="img" aria-label="Gelesene Bücher pro Monat in ${jahr}">
      <line class="achse" x1="0" x2="${breite}" y1="${unten}" y2="${unten}"></line>
      ${teile}
    </svg>
    <p class="monat-info" id="monat-info">${monatInfo(proMonat)}</p>
  </div>`;
}

function monatInfo(proMonat) {
  const i = zustand.statMonat;
  if (i === null) return 'Tippe auf einen Monat für Details.';
  const buecher = proMonat[i];
  if (!buecher.length) return `${MONATE[i]}: kein Buch beendet.`;
  const seiten = buecher.reduce((s, b) => s + b.seiten, 0);
  return `${MONATE[i]}: ${mehrzahl(buecher.length, 'Buch', 'Bücher')}${seiten ? ` · ${zahlText(seiten)} Seiten` : ''} – ${buecher.map((b) => esc(b.titel)).join(', ')}`;
}

function kennzahlenHtml(jahr, liste) {
  const seiten = liste.reduce((s, b) => s + b.seiten, 0);
  const bewertet = liste.filter((b) => b.bewertung);
  const schnitt = bewertet.length ? bewertet.reduce((s, b) => s + b.bewertung, 0) / bewertet.length : 0;
  const mitDauer = liste.filter((b) => b.start && b.start <= b.ende);
  const dauer = mitDauer.length ? mitDauer.reduce((s, b) => s + tageZwischen(b.start, b.ende) + 1, 0) / mitDauer.length : 0;
  const mitSeiten = liste.filter((b) => b.seiten);
  const abgebrochen = zustand.buecher.filter((b) => b.status === 'abgebrochen' && b.ende.startsWith(`${jahr}-`)).length;

  const kachel = (wert, text) => `<div class="kachel"><strong>${wert}</strong><span>${text}</span></div>`;
  return `<div class="kacheln">
    ${kachel(zahlText(liste.length), liste.length === 1 ? 'Buch gelesen' : 'Bücher gelesen')}
    ${kachel(zahlText(seiten), 'Seiten gelesen')}
    ${kachel(schnitt ? `${zahlText(Math.round(schnitt * 10) / 10)} ★` : '–', 'Ø Bewertung')}
    ${kachel(dauer ? zahlText(Math.round(dauer)) : '–', 'Ø Tage pro Buch')}
    ${kachel(mitSeiten.length ? zahlText(Math.round(mitSeiten.reduce((s, b) => s + b.seiten, 0) / mitSeiten.length)) : '–', 'Ø Seiten pro Buch')}
    ${kachel(zahlText(abgebrochen), 'abgebrochen')}
  </div>`;
}

function highlightsHtml(liste) {
  const zeilen = [];
  const mitSeiten = liste.filter((b) => b.seiten).sort((a, b) => b.seiten - a.seiten);
  if (mitSeiten.length) zeilen.push(['Längstes Buch', `${mitSeiten[0].titel} (${mitSeiten[0].seiten} S.)`]);
  const besten = liste.filter((b) => b.bewertung).sort((a, b) => b.bewertung - a.bewertung);
  if (besten.length) zeilen.push(['Bestes Buch', `${besten[0].titel} (${zahlText(besten[0].bewertung)} ★)`]);
  const schnell = liste.filter((b) => b.start && b.start <= b.ende)
    .map((b) => ({ b, tage: tageZwischen(b.start, b.ende) + 1 }))
    .sort((a, b) => a.tage - b.tage);
  if (schnell.length) zeilen.push(['Am schnellsten', `${schnell[0].b.titel} (${mehrzahl(schnell[0].tage, 'Tag', 'Tage')})`]);
  const autoren = new Map();
  for (const b of liste) {
    for (const autor of b.autor.split(',').map((a) => a.trim()).filter(Boolean)) autoren.set(autor, (autoren.get(autor) || 0) + 1);
  }
  const top = [...autoren].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] > 1) zeilen.push(['Lieblingsautor', `${top[0]} (${top[1]} Bücher)`]);
  const formate = Object.keys(FORMATE).map((f) => [f, liste.filter((b) => b.format === f).length]).filter(([, n]) => n);
  if (formate.length > 1) {
    zeilen.push(['Formate', formate.map(([f, n]) => `${FORMATE[f].symbol} ${n} ${n === 1 ? FORMATE[f].name : FORMATE[f].mehrzahl}`).join(' · ')]);
  }

  if (!zeilen.length) return '';
  return `<div class="karte"><h3>Highlights</h3><ul class="highlights">
    ${zeilen.map(([was, wert]) => `<li><span class="was">${was}</span><span>${esc(wert)}</span></li>`).join('')}
  </ul></div>`;
}

function renderStatistik() {
  const jahr = zustand.statJahr;
  const jetzt = new Date().getFullYear();
  const jahre = zustand.buecher.filter((b) => b.status === 'gelesen' && b.ende).map((b) => Number(b.ende.slice(0, 4)));
  const erstes = Math.min(jetzt, ...jahre);
  $('#jahr-name').textContent = jahr;
  $('#jahr-zurueck').disabled = jahr <= erstes;
  $('#jahr-vor').disabled = jahr >= jetzt;

  const liste = gelesenImJahr(jahr).sort((a, b) => b.ende.localeCompare(a.ende));
  const gesamt = zustand.buecher.filter((b) => b.status === 'gelesen');
  const gesamtSeiten = gesamt.reduce((s, b) => s + b.seiten, 0);

  if (!liste.length) {
    $('#statistik').innerHTML = `${zielHtml(jahr, 0)}
      <p class="leer">In ${jahr} hast du noch kein Buch beendet.</p>`;
    return;
  }

  $('#statistik').innerHTML = `
    ${zielHtml(jahr, liste.length)}
    ${monateHtml(jahr, liste)}
    ${kennzahlenHtml(jahr, liste)}
    ${highlightsHtml(liste)}
    <div class="karte">
      <h3>Gelesen in ${jahr}</h3>
      <ul class="jahres-liste">${liste.map((b) => `<li><button type="button" data-buch="${b.id}">
        ${coverHtml(b, 'klein')}
        <span class="lese-text">
          <span class="buch-titel">${esc(b.titel)}</span>
          <span class="buch-autor">${esc(b.autor)}</span>
          <small>${datumText(b.ende)}</small>
        </span>
        ${b.bewertung ? sterneHtml(b.bewertung) : ''}
      </button></li>`).join('')}</ul>
    </div>
    <p class="hinweis" style="margin-top:16px">Insgesamt: ${mehrzahl(gesamt.length, 'Buch', 'Bücher')}${gesamtSeiten ? ` mit ${zahlText(gesamtSeiten)} Seiten` : ''}.</p>`;
}

/* ---------- Ablauf ---------- */

function render() {
  for (const name of Object.keys(TITEL)) {
    $(`#ansicht-${name}`).hidden = name !== zustand.ansicht;
  }
  document.querySelectorAll('.navi [data-ansicht]').forEach((k) => {
    k.classList.toggle('aktiv', k.dataset.ansicht === zustand.ansicht);
  });
  $('#titel').textContent = TITEL[zustand.ansicht];

  if (zustand.ansicht === 'lese') renderLese();
  if (zustand.ansicht === 'bibliothek') renderBibliothek();
  if (zustand.ansicht === 'statistik') renderStatistik();
  if ($('#dlg-buch').open) renderDetail();
}

function wechsleAnsicht(name) {
  if (name === 'statistik' && zustand.ansicht !== 'statistik') {
    zustand.statJahr = new Date().getFullYear();
    zustand.statMonat = null;
  }
  zustand.ansicht = name;
  render();
  window.scrollTo(0, 0);
}

/* ---------- Status, Fortschritt, Fertig ---------- */

function trageSeiteEin(buch, seite) {
  buch.aktuelleSeite = seite;
  const datum = heuteIso();
  const letzter = buch.verlauf[buch.verlauf.length - 1];
  if (letzter && letzter.datum === datum) letzter.seite = seite;
  else buch.verlauf.push({ datum, seite });
  if (buch.verlauf.length > 1000) buch.verlauf.shift();
}

function setzeStatus(buch, status) {
  if (status === buch.status) return;
  if (status === 'gelesen') { oeffneFertig(buch.id); return; }
  const heute = heuteIso();
  if (status === 'lese') {
    // Ein beendetes Buch noch einmal anfangen = neuer Durchgang.
    if (buch.status === 'gelesen' || buch.status === 'abgebrochen') {
      buch.start = heute;
      buch.aktuelleSeite = 0;
    }
    buch.start = buch.start || heute;
    buch.ende = '';
  } else if (status === 'abgebrochen') {
    buch.ende = heute;
  } else if (status === 'wunsch') {
    buch.start = '';
    buch.ende = '';
    buch.aktuelleSeite = 0;
  }
  buch.status = status;
  speichere();
  render();
  zeigeStatus(`„${buch.titel}": ${STATUS[status]}`);
}

function oeffneFortschritt(id) {
  const buch = finde(id);
  if (!buch) return;
  zustand.fortschrittId = id;
  const form = $('#form-fortschritt');
  form.elements.seite.value = buch.aktuelleSeite || '';
  form.elements.seiten.value = buch.seiten || '';
  $('#fortschritt-gesamt').hidden = Boolean(buch.seiten);
  $('#fortschritt-buch').textContent = buch.seiten ? `${buch.titel} · ${buch.seiten} Seiten` : buch.titel;
  $('#dlg-fortschritt').showModal();
  form.elements.seite.focus();
  form.elements.seite.select();
}

function uebernimmGesamtseiten(buch) {
  const form = $('#form-fortschritt');
  if (!$('#fortschritt-gesamt').hidden) buch.seiten = ganzzahl(form.elements.seiten.value, 0, MAX_SEITEN);
}

function speichereFortschritt() {
  const buch = finde(zustand.fortschrittId);
  if (!buch) return;
  uebernimmGesamtseiten(buch);
  const form = $('#form-fortschritt');
  const seite = ganzzahl(form.elements.seite.value, 0, buch.seiten || MAX_SEITEN);
  trageSeiteEin(buch, seite);
  if (buch.status !== 'lese') {
    buch.status = 'lese';
    buch.start = buch.start || heuteIso();
    buch.ende = '';
  }
  speichere();
  $('#dlg-fortschritt').close();
  if (buch.seiten && seite >= buch.seiten) {
    oeffneFertig(buch.id);
    return;
  }
  render();
  zeigeStatus(buch.seiten ? `Seite ${seite} gespeichert – ${fortschritt(buch)} % geschafft.` : `Seite ${seite} gespeichert.`);
}

function oeffneFertig(id, neu = false) {
  const buch = finde(id);
  if (!buch) return;
  zustand.fertigId = id;
  zustand.fertigGlueckwunsch = neu || buch.status !== 'gelesen';
  zustand.fertigWert = buch.bewertung;
  $('#fertig-buch').textContent = buch.titel;
  $('#fertig-sterne').innerHTML = sterneWahlHtml(buch.bewertung, 'fertig');
  $('#form-fertig').elements.ende.value = (buch.status === 'gelesen' && buch.ende) || heuteIso();
  $('#dlg-fertig').showModal();
}

function speichereFertig() {
  const buch = finde(zustand.fertigId);
  if (!buch) return;
  const ende = $('#form-fertig').elements.ende.value;
  buch.status = 'gelesen';
  buch.ende = istDatum(ende) ? ende : heuteIso();
  if (buch.start > buch.ende) buch.start = buch.ende;
  buch.bewertung = zustand.fertigWert;
  if (buch.seiten && buch.aktuelleSeite < buch.seiten) trageSeiteEin(buch, buch.seiten);
  speichere();
  $('#dlg-fertig').close();
  render();
  const jahr = buch.ende.slice(0, 4);
  const nummer = gelesenImJahr(jahr).length;
  zeigeStatus(zustand.fertigGlueckwunsch ? `Glückwunsch! Das ist dein ${nummer}. Buch in ${jahr}.` : 'Gespeichert.');
}

/* ---------- Detail ---------- */

let notizTimer = null;
function speichereNotizen() {
  clearTimeout(notizTimer);
  notizTimer = null;
  const feld = $('#notizen');
  const buch = feld && finde(feld.dataset.id);
  if (!buch || buch.notizen === feld.value) return;
  buch.notizen = feld.value.slice(0, 20000);
  speichere();
}

function oeffneDetail(id) {
  if (!finde(id)) return;
  if ($('#dlg-buch').open) speichereNotizen();
  zustand.detailId = id;
  renderDetail();
  const dialog = $('#dlg-buch');
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}

function renderDetail() {
  const buch = finde(zustand.detailId);
  const dialog = $('#dlg-buch');
  if (!buch) { if (dialog.open) dialog.close(); return; }
  speichereNotizen();
  const position = dialog.scrollTop;
  const meta = metaText(buch);
  const link = buchLink(buch);
  const endeName = buch.status === 'abgebrochen' ? 'Abgebrochen am' : 'Beendet am';

  $('#buch-detail').innerHTML = `
    <div class="detail-kopf">
      ${coverHtml(buch, 'gross')}
      <div>
        <h2>${esc(buch.titel)}</h2>
        <span class="buch-autor">${esc(buch.autor)}</span>
        ${meta ? `<div class="detail-meta">${esc(meta)}</div>` : ''}
        ${buch.isbn ? `<div class="detail-meta">ISBN ${esc(buch.isbn)}</div>` : ''}
        ${buch.asin ? `<div class="detail-meta">ASIN ${esc(buch.asin)}</div>` : ''}
        ${link ? `<a class="link-knopf" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${/amazon\.|amzn\.|\/\/a\.co\//i.test(link) ? 'Bei Amazon ansehen' : 'Link öffnen'} ↗</a>` : ''}
      </div>
    </div>

    <div class="status-wahl" role="group" aria-label="Status">
      ${Object.entries(STATUS).map(([wert, name]) => `<button type="button" data-status="${wert}"
        class="${wert === buch.status ? 'aktiv' : ''}" aria-pressed="${wert === buch.status}">${name}</button>`).join('')}
    </div>

    ${buch.status === 'lese' ? `<div class="fortschritt-block">${standHtml(buch)}
      <button type="button" data-seite="${buch.id}">Seite eintragen</button></div>` : ''}

    ${buch.status !== 'wunsch' ? `
      <h3>Bewertung</h3>
      ${sterneWahlHtml(buch.bewertung, 'detail')}
      <div class="zeile daten">
        <label>Begonnen am <input type="date" data-datum="start" value="${buch.start}"></label>
        ${buch.status === 'gelesen' || buch.status === 'abgebrochen'
          ? `<label>${endeName} <input type="date" data-datum="ende" value="${buch.ende}"></label>` : ''}
      </div>` : ''}

    <h3>Notizen</h3>
    <textarea id="notizen" data-id="${buch.id}" rows="4" maxlength="20000" placeholder="Gedanken, Eindrücke, Lieblingsfiguren …" aria-label="Notizen">${esc(buch.notizen)}</textarea>

    <h3>Zitate${buch.zitate.length ? ` (${buch.zitate.length})` : ''}</h3>
    ${buch.zitate.map((z) => `<blockquote class="zitat"><span class="zitat-text">${esc(z.text)}</span>${z.seite ? `<small>Seite ${z.seite}</small>` : ''}<button type="button" data-zitat-loeschen="${esc(z.id)}" aria-label="Zitat löschen">×</button></blockquote>`).join('')}
    <form id="form-zitat" class="zitat-neu" novalidate>
      <label>Neues Zitat <textarea name="text" rows="2" maxlength="2000"></textarea></label>
      <div class="zeile">
        <label class="seite-feld">Seite <input name="seite" type="number" inputmode="numeric" min="0" max="${MAX_SEITEN}"></label>
        <button type="submit">Zitat speichern</button>
      </div>
    </form>

    ${buch.beschreibung ? `<details class="beschreibung"><summary>Beschreibung</summary><p>${esc(buch.beschreibung)}</p></details>` : ''}
    <p class="hinweis" style="margin-top:16px">Hinzugefügt am ${new Date(buch.hinzugefuegt).toLocaleDateString('de-DE')}</p>`;

  dialog.scrollTop = position;
}

function loescheBuch() {
  const buch = finde(zustand.detailId);
  if (!buch || !confirm(`„${buch.titel}" mit allen Notizen und Zitaten löschen?`)) return;
  clearTimeout(notizTimer);
  notizTimer = null;
  zustand.buecher = zustand.buecher.filter((b) => b.id !== buch.id);
  speichere();
  $('#dlg-buch').close();
  render();
  zeigeStatus(`„${buch.titel}" gelöscht.`);
}

/* ---------- Anlegen und Bearbeiten ---------- */

function legeAn(daten, status) {
  const buch = bereinigeBuch({ ...daten, id: neueId(), status: 'wunsch', hinzugefuegt: Date.now() });
  if (!buch) return null;
  const heute = heuteIso();
  if (status === 'lese') { buch.status = 'lese'; buch.start = heute; }
  if (status === 'gelesen') { buch.status = 'gelesen'; buch.ende = heute; }
  zustand.buecher.push(buch);
  speichere();
  return buch;
}

function nachAnlegen(buch, status) {
  if (status === 'wunsch') {
    render();
    zeigeStatus(`„${buch.titel}" steht auf deiner Merkliste.`);
  } else if (status === 'lese') {
    $('#dlg-hinzufuegen').close();
    wechsleAnsicht('lese');
    zeigeStatus(`Viel Spaß mit „${buch.titel}"!`);
  } else {
    $('#dlg-hinzufuegen').close();
    render();
    oeffneFertig(buch.id, true);
  }
}

const FORMULAR_FELDER = ['titel', 'autor', 'format', 'seiten', 'verlag', 'jahr', 'isbn', 'asin', 'link', 'cover'];
// Ein eigenes Cover-Foto passt nicht ins Adressfeld und wird hier gehalten, bis gespeichert wird.
let formularFoto = '';

function oeffneFormular(id, vorgabe = {}, hinweis = '') {
  const buch = id ? finde(id) : null;
  zustand.bearbeiteId = buch ? id : null;
  const quelle = buch || vorgabe;
  const form = $('#form-buch');
  form.reset();
  $('#formular-titel').textContent = buch ? 'Buch bearbeiten' : 'Buch eintragen';
  for (const feld of FORMULAR_FELDER) form.elements[feld].value = quelle[feld] || '';
  form.elements.format.value = FORMATE[quelle.format] ? quelle.format : 'buch';
  formularFoto = istFoto(quelle.cover) ? quelle.cover : '';
  if (formularFoto) form.elements.cover.value = '';
  $('#formular-hinweis').textContent = hinweis;
  $('#formular-hinweis').hidden = !hinweis;
  $('#formular-suchen').hidden = !hinweis || !quelle.titel;
  $('#formular-status').hidden = Boolean(buch);
  form.elements.status.value = 'wunsch';
  form.querySelector('.fehler').hidden = true;
  zeigeFormularCover();
  $('#dlg-formular').showModal();
  if (!hinweis) form.elements.titel.focus();
}

function zeigeFormularCover() {
  const form = $('#form-buch');
  const adresse = form.elements.cover.value.trim();
  const quelle = istHttps(adresse) ? adresse : formularFoto;
  $('#cover-vorschau').innerHTML = quelle
    ? coverHtml({ titel: form.elements.titel.value.trim() || 'Cover', cover: quelle, format: 'buch' }, 'klein') : '';
  $('#cover-foto-hinweis').hidden = !formularFoto || Boolean(adresse);
  $('#cover-entfernen').hidden = !quelle;
}

// Verkleinert ein Foto oder einen Screenshot auf Cover-Größe, damit es in den Speicher passt.
async function verkleinereBild(datei) {
  const bild = await createImageBitmap(datei);
  const faktor = Math.min(1, 240 / bild.width, 360 / bild.height);
  const leinwand = document.createElement('canvas');
  leinwand.width = Math.max(1, Math.round(bild.width * faktor));
  leinwand.height = Math.max(1, Math.round(bild.height * faktor));
  leinwand.getContext('2d').drawImage(bild, 0, 0, leinwand.width, leinwand.height);
  if (bild.close) bild.close();
  return leinwand.toDataURL('image/jpeg', 0.75);
}

function speichereFormular() {
  const form = $('#form-buch');
  const fehler = form.querySelector('.fehler');
  const werte = Object.fromEntries(FORMULAR_FELDER.map((f) => [f, form.elements[f].value.trim()]));
  const melde = (text, feld) => {
    fehler.textContent = text;
    fehler.hidden = false;
    form.elements[feld].focus();
  };
  if (!werte.titel) { melde('Bitte gib einen Titel ein.', 'titel'); return; }
  if (werte.asin && !normAsin(werte.asin)) { melde('Die ASIN hat 10 Zeichen, z. B. B0C1234XYZ.', 'asin'); return; }
  if (werte.link && !istHttps(werte.link)) { melde('Der Link muss mit https:// beginnen.', 'link'); return; }
  if (werte.cover && !istHttps(werte.cover)) { melde('Die Cover-Adresse muss mit https:// beginnen.', 'cover'); return; }
  const asin = normAsin(werte.asin);
  werte.cover = werte.cover || formularFoto || (asin ? amazonCover(asin) : '');

  const alt = finde(zustand.bearbeiteId);
  if (alt) {
    const neu = bereinigeBuch({ ...alt, ...werte });
    if (neu.seiten && neu.aktuelleSeite > neu.seiten) neu.aktuelleSeite = neu.seiten;
    zustand.buecher = zustand.buecher.map((b) => (b.id === alt.id ? neu : b));
    speichere();
    $('#dlg-formular').close();
    render();
    zeigeStatus('Gespeichert.');
    return;
  }

  const status = form.elements.status.value;
  const buch = legeAn(werte, status);
  $('#dlg-formular').close();
  nachAnlegen(buch, status);
}

/* ---------- Suche ---------- */

function olCover(isbn) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
}

async function sucheGoogle(anfrage) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(anfrage)}&maxResults=20&printType=books`;
  const antwort = await fetch(url);
  if (!antwort.ok) throw new Error(`Google ${antwort.status}`);
  const daten = await antwort.json();
  return (daten.items || []).map((eintrag) => {
    const v = eintrag.volumeInfo || {};
    const nummern = v.industryIdentifiers || [];
    const nummer = nummern.find((n) => n.type === 'ISBN_13') || nummern.find((n) => n.type === 'ISBN_10');
    const isbn = normIsbn(nummer && nummer.identifier);
    const bild = v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
    return bereinigeBuch({
      titel: v.title,
      autor: (v.authors || []).join(', '),
      seiten: v.pageCount,
      verlag: v.publisher,
      jahr: parseInt(v.publishedDate, 10),
      isbn,
      beschreibung: v.description,
      cover: bild ? bild.replace(/^http:/, 'https:').replace('&edge=curl', '') : (isbn ? olCover(isbn) : ''),
    });
  }).filter(Boolean);
}

async function sucheOpenLibrary({ q, isbn }) {
  const parameter = new URLSearchParams({
    fields: 'title,author_name,number_of_pages_median,isbn,cover_i,first_publish_year,publisher',
    limit: '20',
    lang: 'de',
  });
  if (isbn) parameter.set('isbn', isbn);
  else parameter.set('q', q);
  const antwort = await fetch(`https://openlibrary.org/search.json?${parameter}`);
  if (!antwort.ok) throw new Error(`Open Library ${antwort.status}`);
  const daten = await antwort.json();
  return (daten.docs || []).map((d) => {
    const nummern = Array.isArray(d.isbn) ? d.isbn : [];
    const eigene = isbn || normIsbn(nummern.find((n) => n.length === 13) || nummern[0]);
    return bereinigeBuch({
      titel: d.title,
      autor: (d.author_name || []).slice(0, 3).join(', '),
      seiten: d.number_of_pages_median,
      verlag: (d.publisher || [])[0],
      jahr: d.first_publish_year,
      isbn: eigene,
      cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : (eigene ? olCover(eigene) : ''),
    });
  }).filter(Boolean);
}

function ohneDoppelte(liste) {
  const gesehen = new Set();
  return liste.filter((b) => {
    const schluessel = b.isbn || `${b.titel}|${b.autor}`.toLocaleLowerCase('de');
    if (gesehen.has(schluessel)) return false;
    gesehen.add(schluessel);
    return true;
  });
}

function findeVorhanden(treffer) {
  const name = `${treffer.titel}|${treffer.autor}`.toLocaleLowerCase('de');
  return zustand.buecher.find((b) => (treffer.isbn && b.isbn === treffer.isbn)
    || (treffer.asin && b.asin === treffer.asin)
    || `${b.titel}|${b.autor}`.toLocaleLowerCase('de') === name);
}

let sucheNummer = 0;
async function suche(text) {
  const anfrage = text.trim();
  if (!anfrage) return;
  const nummer = ++sucheNummer;
  const isbn = normIsbn(anfrage);
  const istIsbn = /^[\d\s-]+[Xx]?$/.test(anfrage) && (isbn.length === 10 || isbn.length === 13);
  $('#treffer').innerHTML = '<p class="lade">Suche läuft …</p>';

  let liste = [];
  let fehlschlaege = 0;
  try {
    liste = await sucheGoogle(istIsbn ? `isbn:${isbn}` : anfrage);
  } catch (fehler) {
    fehlschlaege += 1;
  }
  if (!liste.length) {
    try {
      liste = await sucheOpenLibrary(istIsbn ? { isbn } : { q: anfrage });
    } catch (fehler) {
      fehlschlaege += 1;
    }
  }
  if (nummer !== sucheNummer) return;

  zustand.treffer = ohneDoppelte(liste);
  zustand.letzteSuche = { anfrage, istIsbn, isbn, offline: fehlschlaege === 2 };
  renderTreffer();
}

function renderTreffer() {
  const { anfrage, istIsbn, offline } = zustand.letzteSuche || {};
  const ziel = $('#treffer');
  if (!zustand.treffer.length) {
    const text = offline
      ? 'Die Suche hat gerade nicht geklappt. Bist du online?'
      : `Zu „${esc(anfrage)}" wurde nichts gefunden.`;
    ziel.innerHTML = `<div class="leer"><p>${text}</p>
      <button type="button" data-manuell>${istIsbn ? 'Mit dieser ISBN von Hand eintragen' : 'Von Hand eintragen'}</button></div>`;
    return;
  }

  ziel.innerHTML = `<p class="treffer-info">${mehrzahl(zustand.treffer.length, 'Treffer', 'Treffer')}</p>
    ${zustand.treffer.map((t, i) => {
      const vorhanden = findeVorhanden(t);
      const meta = metaText(t);
      const aktion = vorhanden
        ? `<button type="button" class="titel-knopf schon-da" data-buch="${vorhanden.id}">✓ In deiner Bibliothek – ansehen</button>`
        : `<div class="treffer-knoepfe">
            <button type="button" data-treffer="${i}" data-als="wunsch">+ Merken</button>
            <button type="button" data-treffer="${i}" data-als="lese">Lese ich</button>
            <button type="button" data-treffer="${i}" data-als="gelesen">Gelesen</button>
          </div>`;
      return `<div class="treffer">
        ${coverHtml(t, 'klein')}
        <div class="lese-text">
          <span class="buch-titel">${esc(t.titel)}</span>
          <span class="buch-autor">${esc(t.autor)}</span>
          ${meta ? `<small>${esc(meta)}</small>` : ''}
          ${aktion}
        </div>
      </div>`;
    }).join('')}`;
}

function uebernimmTreffer(index, status) {
  const treffer = zustand.treffer[index];
  if (!treffer) return;
  const buch = legeAn(treffer, status);
  if (status === 'wunsch') renderTreffer();
  nachAnlegen(buch, status);
}

/* ---------- Barcode-Scanner ---------- */

const kannScannen = 'BarcodeDetector' in window && Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
let scanStrom = null;
let scanAktiv = false;

async function starteScan() {
  try {
    const formate = await BarcodeDetector.getSupportedFormats();
    if (!formate.includes('ean_13')) throw new Error('ean_13 fehlt');
    scanStrom = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (fehler) {
    stoppeScan();
    zeigeStatus(fehler && fehler.name === 'NotAllowedError'
      ? 'Bitte erlaube den Kamerazugriff, um Strichcodes zu scannen.'
      : 'Die Kamera konnte nicht gestartet werden. Gib die ISBN ins Suchfeld ein.');
    return;
  }

  const video = $('#video');
  video.srcObject = scanStrom;
  $('#scanner').hidden = false;
  $('#scannen').hidden = true;
  $('#treffer').innerHTML = '';
  await video.play().catch(() => {});

  const erkenner = new BarcodeDetector({ formats: ['ean_13'] });
  scanAktiv = true;
  const runde = async () => {
    if (!scanAktiv) return;
    try {
      if (video.readyState >= 2) {
        const codes = await erkenner.detect(video);
        const isbn = codes.map((c) => c.rawValue).find((w) => /^97[89]\d{10}$/.test(w));
        if (isbn && scanAktiv) {
          stoppeScan();
          if (navigator.vibrate) navigator.vibrate(80);
          $('#form-suche').elements.q.value = isbn;
          suche(isbn);
          return;
        }
      }
    } catch (fehler) {
      // Einzelne Bilder dürfen fehlschlagen; einfach weiter versuchen.
    }
    setTimeout(runde, 150);
  };
  runde();
}

function stoppeScan() {
  scanAktiv = false;
  if (scanStrom) scanStrom.getTracks().forEach((spur) => spur.stop());
  scanStrom = null;
  $('#video').srcObject = null;
  $('#scanner').hidden = true;
  $('#scannen').hidden = !kannScannen;
}

function oeffneHinzufuegen() {
  const form = $('#form-suche');
  form.reset();
  zustand.treffer = [];
  $('#treffer').innerHTML = kannScannen
    ? '<p class="hinweis" style="margin-top:12px">Suche nach Titel, Autor oder ISBN – oder scanne den Strichcode auf der Buchrückseite.</p>'
    : '<p class="hinweis" style="margin-top:12px">Suche nach Titel, Autor oder ISBN (die Nummer über dem Strichcode).</p>';
  $('#scannen').hidden = !kannScannen;
  $('#dlg-hinzufuegen').showModal();
}

/* ---------- Teilen aus Amazon, Kindle und Co. ---------- */

// "Müller, Anna" → "Anna Müller"; mehrere Autoren bleiben unverändert.
function dreheName(name) {
  const teile = name.split(',').map((t) => t.trim()).filter(Boolean);
  return teile.length === 2 && !/\s(und|and|&)\s/.test(name) ? `${teile[1]} ${teile[0]}` : name.trim();
}

function saeubereTitel(titel) {
  return titel
    .replace(/\s*\((German|English|Deutsche?) Edition\)/gi, '')
    .replace(/\s*\((Kindle[^)]*|eBook[^)]*|Hörbuch[^)]*|Audible[^)]*)\)/gi, '')
    .replace(/\s*[:.–-]\s*(Roman|Thriller|Krimi|Kriminalroman|Novelle|Erzählung|A Novel)\s*$/i, '')
    .replace(/\s*[-–:|]?\s*(eBook|Kindle(-Ausgabe| Edition)?)\s*$/i, '')
    .replace(/^[„"“»«'\s]+|[“”"«»'\s]+$/g, '')
    .trim();
}

// Geteilte Texte sind uneinheitlich; wir nehmen, was sich sicher erkennen lässt, den Rest prüft der Mensch.
function werteGeteiltesAus({ title, text, url }) {
  const alles = [title, text, url].filter(Boolean).join('\n');
  const links = alles.match(/https?:\/\/[^\s"'<>]+/g) || [];
  const link = [url, ...links].find((l) => istHttps(l)) || '';
  const asinTreffer = alles.match(/\/(?:dp|gp\/product|gp\/aw\/d|ebook\/dp)\/([A-Z0-9]{10})(?=[/?#&\s]|$)/i)
    || alles.match(/[?&]asin=([A-Z0-9]{10})(?=[&#\s]|$)/i);
  const rest = [title, text].filter(Boolean).join('\n').replace(/https?:\/\/\S+/g, '').trim();

  let titel = '';
  let autor = '';
  // „Titel" von Autor  /  "Title" by Author
  let m = rest.match(/[„"“»]([^"“”«]{2,200})["“”«]\s+(?:von|by)\s+([^\n!?]{2,160})/i);
  if (m) {
    titel = m[1];
    autor = m[2];
  } else {
    // Amazon-Seitentitel: "Titel eBook : Müller, Anna: Amazon.de: Kindle-Shop"
    m = rest.match(/^(.+?)\s*(?:eBook|Kindle(?:-Ausgabe| Edition)?|Taschenbuch|Gebundene Ausgabe|Hörbuch[^:]*|Audible[^:]*)\s*:\s*([^:\n]+?)\s*:\s*Amazon/im);
    if (m) {
      titel = m[1];
      autor = dreheName(m[2]);
    } else {
      titel = (rest.split('\n').map((z) => z.trim()).filter(Boolean)[0] || '')
        .replace(/^(Schau dir (das|dies(es)?)( hier)?( Produkt)? (auf|bei) Amazon an|Sieh dir .{0,40}? an|Check (this|it) out( on Amazon)?|Ich lese gerade|I'm reading)\s*[:!]?\s*/i, '')
        .replace(/\s*[:|]\s*Amazon\.[a-z.]+.*$/i, '');
    }
  }

  const asin = asinTreffer ? asinTreffer[1].toUpperCase() : '';
  let format = 'buch';
  if (/hörbuch|audible|audiobook/i.test(alles)) format = 'hoerbuch';
  else if (/kindle|e-?book|read\.amazon|Ich lese gerade|I'm reading/i.test(alles) || asin.startsWith('B0')) format = 'ebook';

  return {
    titel: saeubereTitel(titel).slice(0, 200),
    autor: autor
      .replace(/\s+(on|auf|bei|in|im)\s+(Kindle|Amazon|Audible)\b.*$/i, '')
      .replace(/[,.]?\s+(und dachte|and thought|weil|because).*$/i, '')
      .replace(/[\s.,;:]+$/, '')
      .slice(0, 200),
    asin,
    link,
    format,
  };
}

function pruefeGeteiltes() {
  const parameter = new URLSearchParams(location.search);
  const geteilt = { title: parameter.get('title') || '', text: parameter.get('text') || '', url: parameter.get('url') || '' };
  if (!geteilt.title && !geteilt.text && !geteilt.url) return;
  history.replaceState(null, '', location.pathname);

  const daten = werteGeteiltesAus(geteilt);
  const vorhanden = (daten.titel || daten.asin) && findeVorhanden(daten);
  if (vorhanden) {
    oeffneDetail(vorhanden.id);
    zeigeStatus('Dieses Buch ist schon in deiner Bibliothek.');
    return;
  }
  oeffneFormular(null, daten, 'Aus dem geteilten Link übernommen. Bitte prüfe Titel und Autor und ergänze die Seitenzahl.');
}

/* ---------- Sterne ---------- */

function setzeSterne(el, wert) {
  el.style.setProperty('--wert', `${wert * 20}%`);
  el.setAttribute('aria-valuenow', wert);
  el.setAttribute('aria-valuetext', bewertungText(wert));
  el.nextElementSibling.textContent = wert ? zahlText(wert) : '';

  if (el.dataset.sterne === 'fertig') {
    zustand.fertigWert = wert;
    return;
  }
  const buch = finde(zustand.detailId);
  if (!buch) return;
  buch.bewertung = wert;
  speichere();
  if (zustand.ansicht === 'bibliothek') renderBibliothek();
  if (zustand.ansicht === 'statistik') renderStatistik();
}

/* ---------- Sicherung ---------- */

function ladeHerunter(inhalt, typ, name) {
  const blob = new Blob([inhalt], { type: typ });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function exportiere() {
  const daten = { app: 'buecher', version: 1, ziele: zustand.ziele, buecher: zustand.buecher };
  ladeHerunter(JSON.stringify(daten, null, 2), 'application/json', `buecher-sicherung-${heuteIso()}.json`);
}

function exportiereCsv() {
  const spalten = [
    ['Titel', (b) => b.titel], ['Autor', (b) => b.autor], ['Format', (b) => FORMATE[b.format].name], ['Status', (b) => STATUS[b.status]],
    ['Seiten', (b) => b.seiten || ''], ['Begonnen', (b) => b.start], ['Beendet', (b) => b.ende],
    ['Bewertung', (b) => (b.bewertung ? String(b.bewertung).replace('.', ',') : '')],
    ['ISBN', (b) => b.isbn], ['ASIN', (b) => b.asin], ['Link', (b) => buchLink(b)], ['Verlag', (b) => b.verlag], ['Erscheinungsjahr', (b) => b.jahr || ''],
    ['Notizen', (b) => b.notizen], ['Zitate', (b) => b.zitate.map((z) => z.text).join(' | ')],
  ];
  const zelle = (wert) => `"${String(wert).replace(/"/g, '""')}"`;
  const zeilen = [spalten.map(([name]) => zelle(name)).join(';'),
    ...zustand.buecher.map((b) => spalten.map(([, wert]) => zelle(wert(b))).join(';'))];
  // BOM, damit Excel die Umlaute richtig liest.
  ladeHerunter(`﻿${zeilen.join('\r\n')}`, 'text/csv;charset=utf-8', `buecher-${heuteIso()}.csv`);
}

async function importiere(datei) {
  let daten;
  try {
    daten = JSON.parse(await datei.text());
  } catch (fehler) {
    zeigeStatus('Die Datei konnte nicht gelesen werden.');
    return;
  }
  if (!daten || daten.app !== 'buecher' || !Array.isArray(daten.buecher)) {
    zeigeStatus('Das ist keine Sicherung der Bücher-App.');
    return;
  }
  if (zustand.buecher.length && !confirm('Die Sicherung ersetzt alle Bücher auf diesem Handy. Fortfahren?')) return;
  zustand.buecher = bereinigeBuecher(daten.buecher);
  zustand.ziele = bereinigeZiele(daten.ziele);
  speichere();
  $('#dlg-einstellungen').close();
  render();
  zeigeStatus(`Sicherung geladen: ${mehrzahl(zustand.buecher.length, 'Buch', 'Bücher')}.`);
}

/* ---------- Ereignisse ---------- */

document.addEventListener('click', (e) => {
  const sterne = e.target.closest('[data-sterne]');
  if (sterne) {
    const r = sterne.getBoundingClientRect();
    let wert = Math.min(5, Math.max(0.5, Math.ceil(((e.clientX - r.left) / r.width) * 10) / 2));
    if (wert === Number(sterne.getAttribute('aria-valuenow'))) wert = 0;
    setzeSterne(sterne, wert);
    return;
  }

  const ansicht = e.target.closest('[data-ansicht]');
  if (ansicht) { wechsleAnsicht(ansicht.dataset.ansicht); return; }

  if (e.target.closest('[data-neu]')) { oeffneHinzufuegen(); return; }

  const seite = e.target.closest('[data-seite]');
  if (seite) { oeffneFortschritt(seite.dataset.seite); return; }

  const fertig = e.target.closest('[data-fertig]');
  if (fertig) { oeffneFertig(fertig.dataset.fertig); return; }

  const treffer = e.target.closest('[data-treffer]');
  if (treffer) { uebernimmTreffer(Number(treffer.dataset.treffer), treffer.dataset.als); return; }

  if (e.target.closest('[data-manuell]')) {
    const { anfrage = '', istIsbn, isbn } = zustand.letzteSuche || {};
    oeffneFormular(null, istIsbn ? { isbn } : { titel: anfrage });
    return;
  }

  const buch = e.target.closest('[data-buch]');
  if (buch) { oeffneDetail(buch.dataset.buch); return; }

  const filter = e.target.closest('[data-filter]');
  if (filter) { zustand.filter = filter.dataset.filter; renderBibliothek(); return; }

  const monat = e.target.closest('[data-monat]');
  if (monat) {
    const i = Number(monat.dataset.monat);
    zustand.statMonat = zustand.statMonat === i ? null : i;
    renderStatistik();
  }
});

// Sterne mit der Tastatur
document.addEventListener('keydown', (e) => {
  const sterne = e.target.closest && e.target.closest('[data-sterne]');
  if (!sterne) return;
  const schritt = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 }[e.key];
  if (!schritt) return;
  e.preventDefault();
  setzeSterne(sterne, halbeSterne(Number(sterne.getAttribute('aria-valuenow')) + schritt));
});

// Fehlende Cover: das Bild entfernen, die farbige Fläche mit Titel bleibt stehen.
document.addEventListener('error', (e) => {
  const bild = e.target;
  if (bild.tagName === 'IMG' && bild.parentElement && bild.parentElement.classList.contains('cover')) bild.remove();
}, true);

// Winzige Platzhalterbilder (z. B. 1×1 Pixel) ebenfalls entfernen.
document.addEventListener('load', (e) => {
  const bild = e.target;
  if (bild.tagName === 'IMG' && bild.parentElement && bild.parentElement.classList.contains('cover') && bild.naturalWidth < 10) bild.remove();
}, true);

$('#neu').addEventListener('click', oeffneHinzufuegen);

$('#suche').addEventListener('input', (e) => {
  zustand.suche = e.target.value;
  renderBibliothek();
});

$('#sortierung').addEventListener('change', (e) => {
  zustand.sortierung = e.target.value;
  renderBibliothek();
});

$('#jahr-zurueck').addEventListener('click', () => { zustand.statJahr -= 1; zustand.statMonat = null; renderStatistik(); });
$('#jahr-vor').addEventListener('click', () => { zustand.statJahr += 1; zustand.statMonat = null; renderStatistik(); });

// Hinzufügen
$('#form-suche').addEventListener('submit', (e) => {
  e.preventDefault();
  stoppeScan();
  const feld = e.target.elements.q;
  feld.blur();
  suche(feld.value);
});
$('#scannen').addEventListener('click', starteScan);
$('#scan-stopp').addEventListener('click', stoppeScan);
$('#manuell').addEventListener('click', () => oeffneFormular(null, { titel: $('#form-suche').elements.q.value.trim() }));
$('#dlg-hinzufuegen').addEventListener('close', () => { stoppeScan(); sucheNummer += 1; });

// Detail
$('#buch-detail').addEventListener('click', (e) => {
  const status = e.target.closest('[data-status]');
  const buch = finde(zustand.detailId);
  if (status && buch) { setzeStatus(buch, status.dataset.status); return; }

  const loeschen = e.target.closest('[data-zitat-loeschen]');
  if (loeschen && buch && confirm('Zitat löschen?')) {
    buch.zitate = buch.zitate.filter((z) => z.id !== loeschen.dataset.zitatLoeschen);
    speichere();
    renderDetail();
  }
});

$('#buch-detail').addEventListener('change', (e) => {
  const buch = finde(zustand.detailId);
  if (!buch) return;
  if (e.target.matches('[data-datum]')) {
    buch[e.target.dataset.datum] = istDatum(e.target.value) ? e.target.value : '';
    speichere();
    render();
  }
  if (e.target.id === 'notizen') speichereNotizen();
});

$('#buch-detail').addEventListener('input', (e) => {
  if (e.target.id !== 'notizen') return;
  clearTimeout(notizTimer);
  notizTimer = setTimeout(speichereNotizen, 500);
});

$('#buch-detail').addEventListener('submit', (e) => {
  if (e.target.id !== 'form-zitat') return;
  e.preventDefault();
  const buch = finde(zustand.detailId);
  const text = kuerze(e.target.elements.text.value, 2000);
  if (!buch || !text) { e.target.elements.text.focus(); return; }
  buch.zitate.push({ id: neueId(), text, seite: ganzzahl(e.target.elements.seite.value, 0, MAX_SEITEN) });
  speichere();
  renderDetail();
  zeigeStatus('Zitat gespeichert.');
});

$('#dlg-buch').addEventListener('close', speichereNotizen);
$('#buch-bearbeiten').addEventListener('click', () => oeffneFormular(zustand.detailId));
$('#buch-loeschen').addEventListener('click', loescheBuch);

// Formular
$('#form-buch').addEventListener('submit', (e) => {
  e.preventDefault();
  speichereFormular();
});

$('#form-buch').elements.cover.addEventListener('input', zeigeFormularCover);
$('#cover-foto').addEventListener('click', () => $('#cover-datei').click());
$('#cover-datei').addEventListener('change', async (e) => {
  const datei = e.target.files[0];
  e.target.value = '';
  if (!datei) return;
  try {
    formularFoto = await verkleinereBild(datei);
  } catch (fehler) {
    zeigeStatus('Das Bild konnte nicht gelesen werden.');
    return;
  }
  $('#form-buch').elements.cover.value = '';
  zeigeFormularCover();
});
$('#cover-entfernen').addEventListener('click', () => {
  formularFoto = '';
  $('#form-buch').elements.cover.value = '';
  zeigeFormularCover();
});

$('#formular-suchen').addEventListener('click', () => {
  const form = $('#form-buch');
  const anfrage = `${form.elements.titel.value} ${form.elements.autor.value}`.trim();
  $('#dlg-formular').close();
  oeffneHinzufuegen();
  $('#form-suche').elements.q.value = anfrage;
  suche(anfrage);
});

// Fortschritt
$('#form-fortschritt').addEventListener('click', (e) => {
  const knopf = e.target.closest('[data-schritt]');
  if (!knopf) return;
  const buch = finde(zustand.fortschrittId);
  const feld = $('#form-fortschritt').elements.seite;
  const gesamt = (buch && buch.seiten) || ganzzahl($('#form-fortschritt').elements.seiten.value, 0, MAX_SEITEN) || MAX_SEITEN;
  feld.value = ganzzahl((parseInt(feld.value, 10) || 0) + Number(knopf.dataset.schritt), 0, gesamt);
});

$('#form-fortschritt').addEventListener('submit', (e) => {
  e.preventDefault();
  speichereFortschritt();
});

$('#fortschritt-fertig').addEventListener('click', () => {
  const buch = finde(zustand.fortschrittId);
  if (!buch) return;
  uebernimmGesamtseiten(buch);
  speichere();
  $('#dlg-fortschritt').close();
  oeffneFertig(buch.id);
});

// Fertig
$('#form-fertig').addEventListener('submit', (e) => {
  e.preventDefault();
  speichereFertig();
});

// Einstellungen
$('#einstellungen').addEventListener('click', () => {
  const jahr = new Date().getFullYear();
  const feld = $('#jahresziel');
  feld.previousSibling.textContent = `Leseziel ${jahr} (Bücher) `;
  feld.value = zielFuer(jahr) || '';
  $('#dlg-einstellungen').showModal();
});

$('#jahresziel').addEventListener('change', (e) => {
  zustand.ziele[new Date().getFullYear()] = ganzzahl(e.target.value, 0, 999);
  speichere();
  render();
});

$('#exportieren').addEventListener('click', exportiere);
$('#csv').addEventListener('click', exportiereCsv);
$('#importieren').addEventListener('click', () => $('#import-datei').click());
$('#import-datei').addEventListener('change', (e) => {
  const datei = e.target.files[0];
  e.target.value = '';
  if (datei) importiere(datei);
});

document.querySelectorAll('[data-schliessen]').forEach((knopf) => {
  knopf.addEventListener('click', () => knopf.closest('dialog').close());
});

// Tipp neben den Dialog (auf den abgedunkelten Hintergrund) schließt ihn.
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const draussen = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (draussen) dialog.close();
  });
});

render();
pruefeGeteiltes();

// Chrome soll die Daten nicht bei Speicherknappheit wegräumen.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
