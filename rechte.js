// Rechte-Tabelle für OpenClaw: je Kanal und Werkzeug eine von drei Stufen – frei, nachfragen, aus.
//
// Die Prüfung sitzt im Programm (Eingriffspunkt before_tool_call), nicht im Prompt: Was „aus“ ist, führt
// OpenClaw nicht aus – egal, was das Modell will. „nachfragen“ nutzt OpenClaws eigene Freigabe (Tasten im
// Chat oder /approve). Vorbild ist der Agent „Foxy“ (github.com/foxyforge, privat), dort seit Monaten im Alltag.
//
// Diese Datei hat keine Abhängigkeit von OpenClaw, damit sie sich ohne Gateway testen lässt (node --test).

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const STUFEN = ['frei', 'nachfragen', 'aus'];
export const ZEICHEN = { frei: '🟢', nachfragen: '🟡', aus: '🔴' };
export const ALLE_KANAELE = '*';

// Wer nichts einstellt, merkt keinen Unterschied: Standard ist „frei“ – so, wie OpenClaw ohne diese Erweiterung.
export function leer() {
  return { standard: 'frei', kanaele: {}, bekannt: [] };
}

// Häufige OpenClaw-Werkzeuge, damit /rechte schon vor dem ersten Aufruf etwas zeigt. Weitere kommen dazu,
// sobald das Modell sie zum ersten Mal benutzt (Liste „bekannt“).
export const GRUNDLISTE = ['exec', 'process', 'read', 'write', 'edit', 'apply_patch', 'browser', 'web_fetch',
  'web_search', 'message', 'cron', 'gateway', 'sessions_spawn', 'sessions_send'];

function istStufe(wert) {
  return STUFEN.includes(wert);
}

export function pruefen(roh) {
  const t = { ...leer(), ...(roh && typeof roh === 'object' ? roh : {}) };
  if (!istStufe(t.standard)) throw new Error(`Standard-Stufe „${t.standard}“ gibt es nicht (${STUFEN.join(', ')})`);
  if (typeof t.kanaele !== 'object' || t.kanaele === null || Array.isArray(t.kanaele)) throw new Error('„kanaele“ fehlt');
  for (const [kanal, werkzeuge] of Object.entries(t.kanaele)) {
    for (const [name, stufe] of Object.entries(werkzeuge ?? {})) {
      if (!istStufe(stufe)) throw new Error(`Stufe „${stufe}“ für ${name} in ${kanal} gibt es nicht`);
    }
  }
  t.bekannt = Array.isArray(t.bekannt) ? [...new Set(t.bekannt.filter((x) => typeof x === 'string'))] : [];
  return t;
}

// Fehlt die Datei, gilt die leere Tabelle. Ist sie kaputt, gibt es einen Fehler – der Aufrufer sperrt dann
// (lieber gesperrt als still alles erlaubt).
export function laden(datei) {
  try {
    return pruefen(JSON.parse(readFileSync(datei, 'utf8')));
  } catch (fehler) {
    if (fehler?.code === 'ENOENT') return leer();
    throw fehler;
  }
}

export function speichern(datei, tabelle) {
  mkdirSync(dirname(datei), { recursive: true });
  const neu = `${datei}.neu`;
  writeFileSync(neu, `${JSON.stringify(pruefen(tabelle), null, 2)}\n`, { mode: 0o600 });
  renameSync(neu, datei);   // atomar: nie eine halb geschriebene Tabelle
}

// Reihenfolge: eigener Eintrag im Kanal → Eintrag für alle Kanäle („*“) → Standard.
export function stufe(tabelle, kanal, werkzeug) {
  const eigen = tabelle.kanaele?.[kanal];
  if (eigen && Object.hasOwn(eigen, werkzeug)) return eigen[werkzeug];
  const alle = tabelle.kanaele?.[ALLE_KANAELE];
  if (alle && Object.hasOwn(alle, werkzeug)) return alle[werkzeug];
  return tabelle.standard;
}

export function setzen(tabelle, kanal, werkzeug, neu) {
  if (!istStufe(neu)) throw new Error(`Stufe „${neu}“ gibt es nicht – erlaubt: ${STUFEN.join(', ')}`);
  if (!werkzeug || !/^[\w.:-]{1,64}$/.test(werkzeug)) throw new Error(`Werkzeugname „${werkzeug}“ ist ungültig`);
  const t = pruefen(structuredClone(tabelle));
  t.kanaele[kanal] = { ...(t.kanaele[kanal] ?? {}), [werkzeug]: neu };
  return t;
}

// Kurzfassung der Parameter für die Freigabe-Karte: nur Schlüssel und gekürzte Werte, Geheimnisse geschwärzt.
const GEHEIM = /(key|token|secret|passw|password|auth|cookie)/i;
export function kurzfassung(params) {
  if (!params || typeof params !== 'object') return '';
  const teile = [];
  for (const [schluessel, wert] of Object.entries(params)) {
    let text = typeof wert === 'string' ? wert : JSON.stringify(wert);
    if (GEHEIM.test(schluessel)) text = '[geschwärzt]';
    text = String(text ?? '').replace(/\s+/g, ' ');
    teile.push(`${schluessel}: ${text.length > 80 ? `${text.slice(0, 80)}…` : text}`);
  }
  const alles = teile.join(' · ');
  return alles.length > 400 ? `${alles.slice(0, 400)}…` : alles;
}

// Die eigentliche Entscheidung für before_tool_call. Rückgabe im Format von OpenClaw.
export function entscheiden(tabelle, kanal, werkzeug, params) {
  const s = stufe(tabelle, kanal, werkzeug);
  if (s === 'aus') {
    return {
      block: true,
      blockReason: `Das Werkzeug „${werkzeug}“ ist im Kanal „${kanal}“ ausgeschaltet (Rechte-Tabelle). ` +
        'Versuche es nicht auf anderem Weg. Sag dem Nutzer, dass er es mit /rechte freischalten kann.',
    };
  }
  if (s === 'nachfragen') {
    return {
      requireApproval: {
        title: `${werkzeug} ausführen?`.slice(0, 80),
        description: (`Kanal ${kanal}. ${kurzfassung(params)}`).slice(0, 512),
        severity: 'warning',
        allowedDecisions: ['allow-once', 'deny'],   // „immer erlauben“ ginge an der Tabelle vorbei
      },
    };
  }
  return undefined;   // frei: keine Entscheidung, OpenClaw macht normal weiter
}

export function naechste(stufe) {
  return STUFEN[(STUFEN.indexOf(stufe) + 1) % STUFEN.length];
}

function werkzeugliste(tabelle, kanal) {
  return [...new Set([...GRUNDLISTE, ...tabelle.bekannt,
    ...Object.keys(tabelle.kanaele[kanal] ?? {}), ...Object.keys(tabelle.kanaele[ALLE_KANAELE] ?? {})])].sort();
}

function kanalname(kanal) {
  return kanal === ALLE_KANAELE ? 'alle Kanäle' : `Kanal „${kanal}“`;
}

export function uebersicht(tabelle, kanal) {
  const zeilen = werkzeugliste(tabelle, kanal).map((n) => `${ZEICHEN[stufe(tabelle, kanal, n)]} ${n}`);
  return `Rechte für ${kanalname(kanal)} (Standard: ${ZEICHEN[tabelle.standard]} ${tabelle.standard})\n${zeilen.join('\n')}\n\n` +
    'Tippen schaltet weiter: 🟢 frei → 🟡 nachfragen → 🔴 aus. ' +
    'Ohne Tasten: /rechte <werkzeug> <frei|nachfragen|aus> · alle Kanäle: /rechte * <werkzeug> <stufe>';
}

// Tasten für Kanäle, die sie können (Telegram, Discord …): Jede Taste führt einen /rechte-Befehl aus – mit der
// nächsten Stufe. So muss niemand tippen, und die Handy-Autokorrektur kann nichts verderben.
export function praesentation(tabelle, kanal, aktuellerKanal) {
  const tasten = werkzeugliste(tabelle, kanal).map((n) => {
    const s = stufe(tabelle, kanal, n);
    return { label: `${ZEICHEN[s]} ${n}`, action: { type: 'command', command: `/rechte ${kanal} ${n} ${naechste(s)}` }, reusable: true };
  });
  const ansichten = [...new Set([aktuellerKanal, ALLE_KANAELE])].map((k) => ({
    label: `${k === kanal ? '● ' : ''}${k === ALLE_KANAELE ? 'Alle Kanäle' : k}`,
    action: { type: 'command', command: `/rechte zeige ${k}` },
    reusable: true,
  }));
  return {
    title: `Rechte für ${kanalname(kanal)}`,
    blocks: [
      { type: 'text', text: `Tippen schaltet weiter: 🟢 frei → 🟡 nachfragen → 🔴 aus (Standard: ${tabelle.standard}).` },
      { type: 'buttons', buttons: tasten },
      { type: 'buttons', buttons: ansichten },
    ],
  };
}

// /rechte                               → Übersicht des aktuellen Kanals
// /rechte zeige <kanal|*>               → Übersicht eines anderen Kanals
// /rechte <werkzeug> <stufe>            → im aktuellen Kanal setzen
// /rechte <kanal|*> <werkzeug> <stufe>  → in einem bestimmten Kanal setzen
// Rückgabe: { kanal (angezeigt), text, neu? (geänderte Tabelle) }
export function befehl(tabelle, kanal, args) {
  const teile = String(args ?? '').trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return { kanal, text: uebersicht(tabelle, kanal) };
  if (teile[0].toLowerCase() === 'zeige') {
    const ziel = teile[1] ?? kanal;
    return { kanal: ziel, text: uebersicht(tabelle, ziel) };
  }
  let [zielKanal, werkzeug, neu] = teile.length >= 3 ? teile : [kanal, ...teile];
  if (!neu) return { kanal, text: 'So geht\'s: /rechte <werkzeug> <frei|nachfragen|aus> – zum Beispiel /rechte exec nachfragen' };
  neu = neu.toLowerCase();
  const alt = stufe(tabelle, zielKanal, werkzeug);
  const neueTabelle = setzen(tabelle, zielKanal, werkzeug, neu);
  return {
    kanal: zielKanal,
    text: `${werkzeug}: ${ZEICHEN[alt]} ${alt} → ${ZEICHEN[neu]} ${neu} (${kanalname(zielKanal)})\n\n${uebersicht(neueTabelle, zielKanal)}`,
    neu: neueTabelle,
  };
}
