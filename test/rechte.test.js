import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as R from '../rechte.js';

R.spracheSetzen('de');   // die meisten Tests prüfen die deutschen Texte; ein Test schaltet um

test('ohne Einstellung ist alles frei – niemand verliert etwas', () => {
  assert.equal(R.entscheiden(R.leer(), 'telegram', 'exec', {}), undefined);
});

test('aus blockiert mit Begründung, nachfragen fragt, Kanal gewinnt vor „alle Kanäle“', () => {
  let t = R.setzen(R.leer(), '*', 'exec', 'nachfragen');
  t = R.setzen(t, 'telegram', 'exec', 'aus');
  const block = R.entscheiden(t, 'telegram', 'exec', { command: 'rm -rf /tmp/x' });
  assert.equal(block.block, true);
  assert.match(block.blockReason, /ausgeschaltet/);
  const frage = R.entscheiden(t, 'webchat', 'exec', { command: 'ls' });
  assert.deepEqual(frage.requireApproval.allowedDecisions, ['allow-once', 'deny']);
  assert.match(frage.requireApproval.description, /command: ls/);
  assert.equal(R.entscheiden(t, 'webchat', 'read', {}), undefined);
});

test('Stufen gehen deutsch und englisch, gespeichert wird englisch', () => {
  const t = R.setzen(R.setzen(R.leer(), 'telegram', 'exec', 'aus'), 'telegram', 'read', 'ask');
  assert.equal(R.stufe(t, 'telegram', 'exec'), 'off');
  assert.equal(R.stufe(t, 'telegram', 'read'), 'ask');
  assert.equal(R.stufe(R.befehl(t, 'telegram', 'write ALLOW').neu, 'telegram', 'write'), 'allow');
  assert.throws(() => R.setzen(t, 'telegram', 'exec', 'next'), /gibt es nicht/);   // „weiter“ nur per Befehl/Taste
});

test('alte Tabelle mit deutschen Stufen wird beim Laden übersetzt', () => {
  const alt = R.pruefen({ standard: 'frei', kanaele: { telegram: { exec: 'aus', read: 'nachfragen' } } });
  assert.equal(alt.standard, 'allow');
  assert.deepEqual(alt.kanaele.telegram, { exec: 'off', read: 'ask' });
  assert.throws(() => R.pruefen({ standard: 'allow', kanaele: { telegram: { exec: 'vielleicht' } } }), /gibt es nicht/);
});

test('Freigabe-Karte schwärzt Geheimnisse und kürzt', () => {
  const text = R.kurzfassung({ apiKey: 'sk-geheim', url: 'https://x.de/' + 'a'.repeat(200) });
  assert.ok(!text.includes('sk-geheim') && text.includes('[geschwärzt]') && text.length <= 401);
});

test('/rechte zeigt, ändert und lehnt Unsinn ab', () => {
  const t = R.leer();
  assert.match(R.befehl(t, 'telegram', '').text, /🟢 exec/);
  const r = R.befehl(t, 'telegram', 'exec aus');
  assert.equal(R.stufe(r.neu, 'telegram', 'exec'), 'off');
  assert.match(r.text, /exec: 🟢 frei → 🔴 aus/);
  const alle = R.befehl(t, 'telegram', '* web_fetch nachfragen');
  assert.equal(R.stufe(alle.neu, 'discord', 'web_fetch'), 'ask');
  assert.throws(() => R.befehl(t, 'telegram', 'exec vielleicht'), /gibt es nicht/);
  assert.throws(() => R.befehl(t, 'telegram', 'ex;ec aus'), /ungültig/);
  assert.match(R.befehl(t, 'telegram', 'exec').text, /So geht's/);
});

test('speichern ist atomar, kaputte Datei führt zum Fehler (der Einstieg sperrt dann)', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'rechte-'));
  const datei = join(ordner, 'tabelle.json');
  assert.deepEqual(R.laden(datei), R.leer());                 // fehlt = leer
  R.speichern(datei, R.setzen(R.leer(), 'telegram', 'exec', 'aus'));
  assert.equal(R.stufe(R.laden(datei), 'telegram', 'exec'), 'off');
  assert.match(readFileSync(datei, 'utf8'), /"off"/);
  writeFileSync(datei, '{ kaputt');
  assert.throws(() => R.laden(datei));
  writeFileSync(datei, JSON.stringify({ standard: 'vielleicht', kanaele: {} }));
  assert.throws(() => R.laden(datei), /gibt es nicht/);
});

test('Tasten tragen „rechte:…“ und landen im eigenen Namensraum – nie als Text beim Modell', () => {
  const t = R.setzen(R.leer(), 'telegram', 'read', 'nachfragen');
  const p = R.praesentation(t, 'telegram', 'telegram');
  const tasten = p.blocks.find((b) => b.type === 'buttons').buttons;
  const read = tasten.find((b) => b.label.endsWith(' read'));
  assert.deepEqual(read, { label: '🟡 read', value: 'rechte:w:telegram:read' });
  for (const b of tasten) {
    assert.match(b.value, /^rechte:w:[\w*.:-]+:[\w.-]+$/);
    assert.ok(Buffer.byteLength(b.value) <= 64, 'Telegram erlaubt höchstens 64 Byte');
  }
  assert.deepEqual(p.blocks.at(-1).buttons.map((b) => [b.label, b.value]),
    [['● telegram', 'rechte:z:telegram'], ['Alle Kanäle', 'rechte:z:*']]);
  const zeilen = R.telegramTasten(t, 'telegram', 'telegram');
  assert.ok(zeilen.slice(0, -1).every((z) => z.length <= 2));
  assert.deepEqual(zeilen.flat().find((b) => b.text.endsWith(' read')), { text: '🟡 read', callback_data: 'rechte:w:telegram:read' });
});

test('dieselbe Taste mehrmals: nachfragen → aus → frei → nachfragen; Ansicht wechseln; Unsinn abgelehnt', () => {
  let t = R.setzen(R.leer(), 'telegram', 'read', 'nachfragen');
  const folge = [];
  for (let i = 0; i < 3; i += 1) {
    const r = R.taste(t, 'w:telegram:read');
    t = r.neu;
    folge.push(R.stufe(t, 'telegram', 'read'));
  }
  assert.deepEqual(folge, ['off', 'allow', 'ask']);
  const ansicht = R.taste(t, 'z:*');
  assert.equal(ansicht.kanal, '*');
  assert.equal(ansicht.neu, undefined);
  assert.throws(() => R.taste(t, 'x:irgendwas'), /Unbekannte Taste/);
  assert.throws(() => R.taste(t, 'w:telegram:ex;ec'), /ungültig/);
});

test('Befehl mit Kanal, „zeige“/„show“ und Rückmeldung mit neuer Übersicht', () => {
  const r = R.befehl(R.leer(), 'telegram', 'telegram read aus');
  assert.equal(r.kanal, 'telegram');
  assert.match(r.text, /read: 🟢 frei → 🔴 aus \(Kanal „telegram“\)/);
  assert.match(r.text, /🔴 read/);
  for (const wort of ['zeige', 'show']) {
    const z = R.befehl(r.neu, 'telegram', `${wort} *`);
    assert.equal(z.kanal, '*');
    assert.match(z.text, /Rechte für alle Kanäle/);
    assert.equal(z.neu, undefined);
  }
});

test('umschalten darf nur der Besitzer; ohne Besitzerliste genügt die Zulassung durch OpenClaw', () => {
  assert.equal(R.darfSchalten(['telegram:1'], 'telegram', '1', true), true);
  assert.equal(R.darfSchalten(['telegram:1'], 'telegram', '2', true), false);
  assert.equal(R.darfSchalten(['telegram:1'], 'discord', '1', true), false);
  assert.equal(R.darfSchalten(['telegram:1'], 'telegram', '1', false), false);
  assert.equal(R.darfSchalten([], 'telegram', '9', true), true);
  assert.equal(R.darfSchalten(undefined, 'telegram', '9', false), false);
});

test('Sprache: englisch ist Standard, Texte wechseln, Eingaben gehen in beiden Sprachen', () => {
  assert.equal(R.spracheSetzen('xx'), 'en');   // unbekannt → englisch
  const t = R.setzen(R.leer(), 'telegram', 'exec', 'aus');
  assert.match(R.uebersicht(t, 'telegram'), /Rights for channel “telegram” \(default: 🟢 allow\)/);
  assert.match(R.uebersicht(t, '*'), /all channels/);
  assert.match(R.entscheiden(t, 'telegram', 'exec', {}).blockReason, /switched off .* \/rights/);
  assert.match(R.befehl(t, 'telegram', 'read nachfragen').text, /read: 🟢 allow → 🟡 ask/);
  assert.equal(R.praesentation(t, 'telegram', 'telegram').blocks.at(-1).buttons.at(-1).label, 'All channels');
  assert.throws(() => R.befehl(t, 'telegram', 'exec maybe'), /does not exist/);
  assert.equal(R.spracheSetzen('de'), 'de');
  assert.match(R.uebersicht(t, 'telegram'), /Rechte für Kanal „telegram“/);
});

test('Standard umstellen: gilt für Werkzeuge ohne Eintrag, in beiden Sprachen', () => {
  const r = R.befehl(R.leer(), 'telegram', 'standard nachfragen');
  assert.equal(r.neu.standard, 'ask');
  assert.match(r.text, /Standard \(Werkzeuge ohne Eintrag\): 🟢 frei → 🟡 nachfragen/);
  assert.deepEqual(R.entscheiden(r.neu, 'discord', 'irgendwas_neues', {}).requireApproval.allowedDecisions, ['allow-once', 'deny']);
  assert.equal(R.befehl(r.neu, 'telegram', 'default off').neu.standard, 'off');
  assert.throws(() => R.befehl(R.leer(), 'telegram', 'standard vielleicht'), /gibt es nicht/);
  assert.equal(R.befehl(R.leer(), 'telegram', 'standard').text.includes('So geht'), true);   // ohne Stufe: Hilfe
});

test('Kanal: requester vor channelId, „telegram:…“ wird gekürzt, sonst unknown', () => {
  assert.equal(R.kanalVon({ requester: { channel: 'telegram' }, channelId: 'discord' }), 'telegram');
  assert.equal(R.kanalVon({ channelId: 'telegram' }), 'telegram');
  assert.equal(R.kanalVon({ channelId: 'telegram:8911601751' }), 'telegram');
  assert.equal(R.kanalVon({}), 'unknown');
  assert.equal(R.kanalVon(undefined), 'unknown');
});

test('Code Mode ist kein Shell-exec: eigener Eintrag, frei nur mit QuickJS', () => {
  assert.equal(R.werkzeugName({ toolName: 'exec', toolKind: 'code_mode_exec' }, {}), 'code_mode');
  assert.equal(R.werkzeugName({ toolName: 'exec' }, { toolKind: 'code_mode_exec' }), 'code_mode');
  assert.equal(R.werkzeugName({ toolName: 'exec' }, {}), 'exec');
  const t = R.setzen(R.leer(), 'telegram', 'code_mode', 'frei');
  assert.equal(R.entscheiden(t, 'telegram', 'code_mode', { code: 'x' }, { codeModeIsoliert: true }), undefined);
  const frage = R.entscheiden(t, 'telegram', 'code_mode', { code: 'x', command: 'x' }, { codeModeIsoliert: false });
  assert.match(frage.requireApproval.description, /QuickJS/);
  assert.ok(!frage.requireApproval.description.includes('command:'), 'command-Alias nicht doppelt');
  assert.equal(R.codeModeIsoliert({ tools: { codeMode: { enabled: 'auto', executor: 'quickjs' } } }), true);
  assert.equal(R.codeModeIsoliert({ tools: { codeMode: { executor: 'node' } } }), false);
  assert.equal(R.codeModeIsoliert({}), false);
  // shell-exec bleibt, wie er in der Tabelle steht
  assert.equal(R.entscheiden(R.setzen(t, 'telegram', 'exec', 'aus'), 'telegram', 'exec', {}).block, true);
});

test('geschützte Dateien: aus blockt, nachfragen fragt, gilt vor „frei“, nur für Schreibwerkzeuge', () => {
  const schutz = { aus: ['SOUL.md', 'skills'], nachfragen: ['USER.md'] };
  const basis = '/ws';
  const t = R.setzen(R.setzen(R.leer(), 'telegram', 'write', 'frei'), 'telegram', 'edit', 'frei');
  const g1 = R.schutzTreffer('write', R.pfadeAus({ path: 'SOUL.md' }), schutz, basis);
  assert.deepEqual(g1, { stufe: 'off', pfad: '/ws/SOUL.md' });
  assert.match(R.entscheiden(t, 'telegram', 'write', { path: 'SOUL.md' }, { geschuetzt: g1 }).blockReason, /geschützt/);
  const g2 = R.schutzTreffer('edit', R.pfadeAus({ file_path: '/ws/skills/x/SKILL.md' }), schutz, basis);
  assert.equal(g2.stufe, 'off');
  const g3 = R.schutzTreffer('edit', R.pfadeAus({ path: './USER.md' }), schutz, basis);
  assert.match(R.entscheiden(t, 'telegram', 'edit', {}, { geschuetzt: g3 }).requireApproval.description, /Geschützte Datei/);
  assert.equal(R.schutzTreffer('write', R.pfadeAus({ path: 'memory/projekte/x.md' }), schutz, basis), undefined);
  assert.equal(R.schutzTreffer('write', R.pfadeAus({ path: 'memory/../SOUL.md' }), schutz, basis).stufe, 'off');
  assert.equal(R.schutzTreffer('read', R.pfadeAus({ path: 'SOUL.md' }), schutz, basis), undefined);   // lesen bleibt frei
  assert.equal(R.schutzTreffer('write', ['SOUL.md.bak'], schutz, basis), undefined);                  // kein Präfix-Irrtum
  assert.equal(R.schutzTreffer('write', ['SOUL.md'], undefined, basis), undefined);                   // ohne Einstellung nichts
});
