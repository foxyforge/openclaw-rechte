// Rechte-Tabelle für OpenClaw: je Kanal und Werkzeug eine von drei Stufen – allow (frei), ask (nachfragen), off (aus).
//
// Die Prüfung sitzt im Programm (Eingriffspunkt before_tool_call), nicht im Prompt: Was „off“ ist, führt
// OpenClaw nicht aus – egal, was das Modell will. „ask“ nutzt OpenClaws eigene Freigabe (Tasten im Chat oder
// /approve). Vorbild ist der Agent „Foxy“ (github.com/foxyforge, privat), dort seit Monaten im Alltag.
//
// Gespeichert und intern gerechnet wird englisch (allow/ask/off). Eingaben gehen deutsch oder englisch
// (frei/nachfragen/aus, next/weiter); die sichtbaren Texte richten sich nach spracheSetzen('de'|'en').
// Diese Datei hat keine Abhängigkeit von OpenClaw, damit sie sich ohne Gateway testen lässt (node --test).

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const STUFEN = ['allow', 'ask', 'off'];
export const ZEICHEN = { allow: '🟢', ask: '🟡', off: '🔴' };
export const ALLE_KANAELE = '*';

// Eingabe-Namen → gespeicherte Stufe. „next“/„weiter“ = eine Stufe weiter (nur für Befehl und Taste).
const STUFEN_NAMEN = {
  allow: 'allow', frei: 'allow',
  ask: 'ask', nachfragen: 'ask',
  off: 'off', aus: 'off',
  next: 'next', weiter: 'next',
};

// ---------- Sprache der sichtbaren Texte ----------

const TEXTE = {
  en: {
    stufe: { allow: 'allow', ask: 'ask', off: 'off' },
    befehl: '/rights',
    alleKanaele: 'all channels',
    alleKanaeleTaste: 'All channels',
    kanal: (k) => `channel “${k}”`,
    titel: (kn) => `Rights for ${kn}`,
    kopf: (kn, std) => `Rights for ${kn} (default: ${std})`,
    legende: 'Tap to cycle: 🟢 allow → 🟡 ask → 🔴 off.',
    hilfe: 'Without buttons: /rights <tool> <allow|ask|off> · all channels: /rights * <tool> <level> · unknown tools: /rights default <level>',
    standardText: 'Default (tools without an entry)',
    hilfeKurz: 'Usage: /rights <tool> <allow|ask|off> – for example /rights exec ask',
    gesperrt: (w, k) => `The tool “${w}” is switched off in channel “${k}” (rights table). ` +
      'Do not try another way. Tell the user they can enable it with /rights.',
    frage: (w) => `Run ${w}?`,
    frageKanal: (k) => `Channel ${k}.`,
    geschwaerzt: '[redacted]',
    unbekannteTaste: (p) => `Unknown button “${p}”`,
    stufeFehlt: (s) => `Level “${s}” does not exist – allowed: allow, ask, off`,
    nameUngueltig: (n) => `Tool name “${n}” is invalid`,
    standardFehlt: (s) => `Default level “${s}” does not exist`,
    kanaeleFehlt: '“kanaele” is missing',
    stufeInKanalFehlt: (s, n, k) => `Level “${s}” for ${n} in ${k} does not exist`,
    tabelleUnlesbar: (m) => `Rights table unreadable (${m}) – locked for safety.`,
    nurBesitzer: 'Only the owner may change the rights.',
    nichtGeaendert: (m) => `Not changed: ${m}`,
    befehlBeschreibung: 'Rights per tool: table with buttons (tap to cycle) · /rights <tool> <allow|ask|off>',
    codeModeOffen: 'Code Mode runs without the QuickJS sandbox (tools.codeMode.executor ≠ "quickjs") – asking instead of allowing.',
  },
  de: {
    stufe: { allow: 'frei', ask: 'nachfragen', off: 'aus' },
    befehl: '/rechte',
    alleKanaele: 'alle Kanäle',
    alleKanaeleTaste: 'Alle Kanäle',
    kanal: (k) => `Kanal „${k}“`,
    titel: (kn) => `Rechte für ${kn}`,
    kopf: (kn, std) => `Rechte für ${kn} (Standard: ${std})`,
    legende: 'Tippen schaltet weiter: 🟢 frei → 🟡 nachfragen → 🔴 aus.',
    hilfe: 'Ohne Tasten: /rechte <werkzeug> <frei|nachfragen|aus> · alle Kanäle: /rechte * <werkzeug> <stufe> · unbekannte Werkzeuge: /rechte standard <stufe>',
    standardText: 'Standard (Werkzeuge ohne Eintrag)',
    hilfeKurz: 'So geht\'s: /rechte <werkzeug> <frei|nachfragen|aus> – zum Beispiel /rechte exec nachfragen',
    gesperrt: (w, k) => `Das Werkzeug „${w}“ ist im Kanal „${k}“ ausgeschaltet (Rechte-Tabelle). ` +
      'Versuche es nicht auf anderem Weg. Sag dem Nutzer, dass er es mit /rechte freischalten kann.',
    frage: (w) => `${w} ausführen?`,
    frageKanal: (k) => `Kanal ${k}.`,
    geschwaerzt: '[geschwärzt]',
    unbekannteTaste: (p) => `Unbekannte Taste „${p}“`,
    stufeFehlt: (s) => `Stufe „${s}“ gibt es nicht – erlaubt: frei, nachfragen, aus`,
    nameUngueltig: (n) => `Werkzeugname „${n}“ ist ungültig`,
    standardFehlt: (s) => `Standard-Stufe „${s}“ gibt es nicht`,
    kanaeleFehlt: '„kanaele“ fehlt',
    stufeInKanalFehlt: (s, n, k) => `Stufe „${s}“ für ${n} in ${k} gibt es nicht`,
    tabelleUnlesbar: (m) => `Rechte-Tabelle nicht lesbar (${m}) – zur Sicherheit gesperrt.`,
    nurBesitzer: 'Nur der Besitzer darf die Rechte ändern.',
    nichtGeaendert: (m) => `Nicht geändert: ${m}`,
    befehlBeschreibung: 'Rechte je Werkzeug: Tabelle mit Tasten (tippen schaltet weiter) · /rechte <werkzeug> <frei|nachfragen|aus>',
    codeModeOffen: 'Code Mode läuft ohne QuickJS-Abschottung (tools.codeMode.executor ≠ "quickjs") – deshalb Rückfrage statt frei.',
  },
};

let T = TEXTE.en;

export function spracheSetzen(sprache) {
  T = TEXTE[sprache] ?? TEXTE.en;
  return T === TEXTE.de ? 'de' : 'en';
}

export function texte() {
  return T;
}

// Wer nichts einstellt, merkt keinen Unterschied: Standard ist „allow“ – so, wie OpenClaw ohne diese Erweiterung.
export function leer() {
  return { standard: 'allow', kanaele: {}, bekannt: [] };
}

// Häufige OpenClaw-Werkzeuge, damit die Tabelle schon vor dem ersten Aufruf etwas zeigt. Weitere kommen dazu,
// sobald das Modell sie zum ersten Mal benutzt (Liste „bekannt“).
export const GRUNDLISTE = ['exec', 'process', 'read', 'write', 'edit', 'apply_patch', 'browser', 'web_fetch',
  'web_search', 'message', 'cron', 'gateway', 'sessions_spawn', 'sessions_send', 'code_mode'];

// Deutsch oder englisch → gespeicherte Stufe; undefined, wenn es die Stufe nicht gibt.
export function stufeName(wert) {
  const s = STUFEN_NAMEN[String(wert ?? '').toLowerCase()];
  return s && s !== 'next' ? s : undefined;
}

export function pruefen(roh) {
  const t = { ...leer(), ...(roh && typeof roh === 'object' ? roh : {}) };
  const standard = stufeName(t.standard);
  if (!standard) throw new Error(T.standardFehlt(t.standard));
  t.standard = standard;
  if (typeof t.kanaele !== 'object' || t.kanaele === null || Array.isArray(t.kanaele)) throw new Error(T.kanaeleFehlt);
  const kanaele = {};
  for (const [kanal, werkzeuge] of Object.entries(t.kanaele)) {
    kanaele[kanal] = {};
    for (const [name, stufe] of Object.entries(werkzeuge ?? {})) {
      const s = stufeName(stufe);   // alte Tabellen (frei/nachfragen/aus) werden beim Laden übersetzt
      if (!s) throw new Error(T.stufeInKanalFehlt(stufe, name, kanal));
      kanaele[kanal][name] = s;
    }
  }
  t.kanaele = kanaele;
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
  const s = stufeName(neu);
  if (!s) throw new Error(T.stufeFehlt(neu));
  if (!werkzeug || !/^[\w.:-]{1,64}$/.test(werkzeug)) throw new Error(T.nameUngueltig(werkzeug));
  const t = pruefen(structuredClone(tabelle));
  t.kanaele[kanal] = { ...(t.kanaele[kanal] ?? {}), [werkzeug]: s };
  return t;
}

// Welcher Kanal hat den Zug ausgelöst? OpenClaw liefert `requester` nur, wenn es den Absender belegen kann – mit der
// Codex-Laufzeit (GPT-Modelle über das ChatGPT-Abo) fehlt er. Dann gilt `channelId` aus dem Werkzeug-Kontext; fehlt
// auch der, ist der Kanal „unknown“ und es gelten die Einträge für alle Kanäle (streng statt offen).
export function kanalVon(ctx) {
  const roh = ctx?.requester?.channel ?? ctx?.channelId;
  const kanal = typeof roh === 'string' ? roh.split(':')[0].trim() : '';
  return kanal || 'unknown';
}

// Code Mode: Das Modell schreibt ein kleines JavaScript, das die eigentlichen Werkzeuge aufruft. OpenClaw meldet diesen
// Rahmen als „exec“ mit toolKind „code_mode_exec“ – das ist KEIN Shell-Befehl. Er bekommt deshalb einen eigenen Eintrag
// („code_mode“); jedes Werkzeug, das der Code darin aufruft, prüft diese Erweiterung trotzdem einzeln.
export const CODE_MODE = 'code_mode';
export function werkzeugName(event, ctx) {
  const art = event?.toolKind ?? ctx?.toolKind;
  if (art === 'code_mode_exec') return CODE_MODE;
  return event?.toolName ?? event?.name ?? ctx?.toolName;
}

// Nur der QuickJS-Ausführer schottet den Code ab (kein Dateisystem, kein Netz, keine Prozesse). Der Standard-Ausführer
// (node:vm) ist laut OpenClaw-Doku keine Sicherheitsgrenze – dann wird aus „frei“ für code_mode eine Rückfrage.
export function codeModeIsoliert(config) {
  const cm = config?.tools?.codeMode;
  return Boolean(cm && typeof cm === 'object' && cm.executor === 'quickjs');
}

// Kurzfassung der Parameter für die Freigabe-Karte: nur Schlüssel und gekürzte Werte, Geheimnisse geschwärzt.
const GEHEIM = /(key|token|secret|passw|password|auth|cookie)/i;
export function kurzfassung(params) {
  if (!params || typeof params !== 'object') return '';
  const teile = [];
  for (const [schluessel, wert] of Object.entries(params)) {
    if (schluessel === 'command' && params.code !== undefined && wert === params.code) continue;   // Code-Mode-Alias
    let text = typeof wert === 'string' ? wert : JSON.stringify(wert);
    if (GEHEIM.test(schluessel)) text = T.geschwaerzt;
    text = String(text ?? '').replace(/\s+/g, ' ');
    teile.push(`${schluessel}: ${text.length > 80 ? `${text.slice(0, 80)}…` : text}`);
  }
  const alles = teile.join(' · ');
  return alles.length > 400 ? `${alles.slice(0, 400)}…` : alles;
}

// Die eigentliche Entscheidung für before_tool_call. Rückgabe im Format von OpenClaw.
export function entscheiden(tabelle, kanal, werkzeug, params, { codeModeIsoliert: isoliert = true } = {}) {
  let s = stufe(tabelle, kanal, werkzeug);
  let hinweis = '';
  if (werkzeug === CODE_MODE && s === 'allow' && !isoliert) { s = 'ask'; hinweis = `${T.codeModeOffen} `; }
  if (s === 'off') {
    return { block: true, blockReason: T.gesperrt(werkzeug, kanal) };
  }
  if (s === 'ask') {
    return {
      requireApproval: {
        title: T.frage(werkzeug).slice(0, 80),
        description: (`${hinweis}${T.frageKanal(kanal)} ${kurzfassung(params)}`).slice(0, 512),
        severity: 'warning',
        allowedDecisions: ['allow-once', 'deny'],   // „immer erlauben“ ginge an der Tabelle vorbei
      },
    };
  }
  return undefined;   // allow: keine Entscheidung, OpenClaw macht normal weiter
}

// Nur der Besitzer schaltet um. ownerAllowFrom ist OpenClaws Besitzerliste (z. B. "telegram:123"); ist sie leer,
// genügt ein von OpenClaw zugelassener Absender. Fremde werden still ignoriert (kein Hinweis, dass es Tasten gibt).
export function darfSchalten(ownerAllowFrom, kanal, senderId, zugelassen) {
  if (!zugelassen) return false;
  const besitzer = (Array.isArray(ownerAllowFrom) ? ownerAllowFrom : []).map(String);
  return besitzer.length === 0 || besitzer.includes(`${kanal}:${senderId}`);
}

export function naechste(stufe) {
  return STUFEN[(STUFEN.indexOf(stufe) + 1) % STUFEN.length];
}

function werkzeugliste(tabelle, kanal) {
  return [...new Set([...GRUNDLISTE, ...tabelle.bekannt,
    ...Object.keys(tabelle.kanaele[kanal] ?? {}), ...Object.keys(tabelle.kanaele[ALLE_KANAELE] ?? {})])].sort();
}

function kanalname(kanal) {
  return kanal === ALLE_KANAELE ? T.alleKanaele : T.kanal(kanal);
}

function stufeText(s) {
  return `${ZEICHEN[s]} ${T.stufe[s]}`;
}

export function uebersicht(tabelle, kanal) {
  const zeilen = werkzeugliste(tabelle, kanal).map((n) => `${ZEICHEN[stufe(tabelle, kanal, n)]} ${n}`);
  return `${T.kopf(kanalname(kanal), stufeText(tabelle.standard))}\n${zeilen.join('\n')}\n\n${T.legende} ${T.hilfe}`;
}

// Tasten: Jede trägt „rechte:…“. OpenClaw leitet den Druck direkt an diese Erweiterung (registerInteractiveHandler,
// Namensraum „rechte“) – nicht ans Modell. Die Erweiterung ändert dann dieselbe Nachricht (neue Tabelle, neue Tasten).
//   rechte:w:<kanal>:<werkzeug>  → eine Stufe weiter (vom aktuellen Stand aus gerechnet)
//   rechte:z:<kanal>             → Tabelle eines Kanals zeigen
export const NAMENSRAUM = 'rechte';

function tastenListe(tabelle, kanal, aktuellerKanal) {
  const werkzeuge = werkzeugliste(tabelle, kanal).map((n) => ({
    text: `${ZEICHEN[stufe(tabelle, kanal, n)]} ${n}`,
    daten: `${NAMENSRAUM}:w:${kanal}:${n}`,
  }));
  const ansichten = [...new Set([aktuellerKanal, ALLE_KANAELE])].map((k) => ({
    text: `${k === kanal ? '● ' : ''}${k === ALLE_KANAELE ? T.alleKanaeleTaste : k}`,
    daten: `${NAMENSRAUM}:z:${k}`,
  }));
  return { werkzeuge, ansichten };
}

// Für die Antwort auf /rights (OpenClaw baut daraus die Tasten des jeweiligen Kanals).
export function praesentation(tabelle, kanal, aktuellerKanal) {
  const { werkzeuge, ansichten } = tastenListe(tabelle, kanal, aktuellerKanal);
  const taste = (b) => ({ label: b.text, value: b.daten });   // roher Rückrufwert → landet im Namensraum „rechte“
  return {
    title: T.titel(kanalname(kanal)),
    blocks: [
      { type: 'text', text: `${T.legende} (${T.stufe[tabelle.standard]})` },
      { type: 'buttons', buttons: werkzeuge.map(taste) },
      { type: 'buttons', buttons: ansichten.map(taste) },
    ],
  };
}

// Für das Ändern der Nachricht nach einem Tastendruck (Telegram: Zeilen zu je zwei Tasten).
export function telegramTasten(tabelle, kanal, aktuellerKanal) {
  const { werkzeuge, ansichten } = tastenListe(tabelle, kanal, aktuellerKanal);
  const zeilen = [];
  for (let i = 0; i < werkzeuge.length; i += 2) {
    zeilen.push(werkzeuge.slice(i, i + 2).map((b) => ({ text: b.text, callback_data: b.daten })));
  }
  zeilen.push(ansichten.map((b) => ({ text: b.text, callback_data: b.daten })));
  return zeilen;
}

// Tastendruck auswerten. payload = alles nach „rechte:“. Rückgabe wie befehl(): { kanal, text, neu? }
export function taste(tabelle, payload) {
  const [art, kanal, werkzeug] = String(payload ?? '').split(':');
  if (art === 'z' && kanal) return { kanal, text: uebersicht(tabelle, kanal) };
  if (art === 'w' && kanal && werkzeug) return befehl(tabelle, kanal, `${kanal} ${werkzeug} next`);
  throw new Error(T.unbekannteTaste(payload));
}

// /rights                               → Übersicht des aktuellen Kanals
// /rights show <kanal|*>                → Übersicht eines anderen Kanals (deutsch: zeige)
// /rights default <stufe>               → Standard für Werkzeuge ohne Eintrag (deutsch: standard)
// /rights <werkzeug> <stufe>            → im aktuellen Kanal setzen
// /rights <kanal|*> <werkzeug> <stufe>  → in einem bestimmten Kanal setzen (Stufe „next“/„weiter“ = nächste Stufe)
// Stufen deutsch oder englisch. Rückgabe: { kanal (angezeigt), text, neu? (geänderte Tabelle) }
export function befehl(tabelle, kanal, args) {
  const teile = String(args ?? '').trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return { kanal, text: uebersicht(tabelle, kanal) };
  if (['show', 'zeige'].includes(teile[0].toLowerCase())) {
    const ziel = teile[1] ?? kanal;
    return { kanal: ziel, text: uebersicht(tabelle, ziel) };
  }
  if (['default', 'standard'].includes(teile[0].toLowerCase()) && teile[1]) {   // gilt für alles ohne eigenen Eintrag
    const s = stufeName(teile[1]);
    if (!s) throw new Error(T.stufeFehlt(teile[1]));
    const neueTabelle = pruefen({ ...structuredClone(tabelle), standard: s });
    return { kanal, text: `${T.standardText}: ${stufeText(tabelle.standard)} → ${stufeText(s)}\n\n${uebersicht(neueTabelle, kanal)}`, neu: neueTabelle };
  }
  const [zielKanal, werkzeug, gewuenscht] = teile.length >= 3 ? teile : [kanal, ...teile];
  if (!gewuenscht) return { kanal, text: T.hilfeKurz };
  const alt = stufe(tabelle, zielKanal, werkzeug);
  const neu = STUFEN_NAMEN[gewuenscht.toLowerCase()] === 'next' ? naechste(alt) : gewuenscht;   // Taste: eine Stufe weiter
  const neueTabelle = setzen(tabelle, zielKanal, werkzeug, neu);
  const jetzt = stufe(neueTabelle, zielKanal, werkzeug);
  return {
    kanal: zielKanal,
    text: `${werkzeug}: ${stufeText(alt)} → ${stufeText(jetzt)} (${kanalname(zielKanal)})\n\n${uebersicht(neueTabelle, zielKanal)}`,
    neu: neueTabelle,
  };
}
