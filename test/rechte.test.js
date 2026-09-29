import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as R from '../rechte.js';

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

test('Freigabe-Karte schwärzt Geheimnisse und kürzt', () => {
  const text = R.kurzfassung({ apiKey: 'sk-geheim', url: 'https://x.de/' + 'a'.repeat(200) });
  assert.ok(!text.includes('sk-geheim') && text.includes('[geschwärzt]') && text.length <= 401);
});

test('/rechte zeigt, ändert und lehnt Unsinn ab', () => {
  const t = R.leer();
  assert.match(R.befehl(t, 'telegram', '').text, /🟢 exec/);
  const r = R.befehl(t, 'telegram', 'exec aus');
  assert.equal(R.stufe(r.neu, 'telegram', 'exec'), 'aus');
  assert.match(r.text, /exec: 🟢 frei → 🔴 aus/);
  const alle = R.befehl(t, 'telegram', '* web_fetch nachfragen');
  assert.equal(R.stufe(alle.neu, 'discord', 'web_fetch'), 'nachfragen');
  assert.throws(() => R.befehl(t, 'telegram', 'exec vielleicht'), /gibt es nicht/);
  assert.throws(() => R.befehl(t, 'telegram', 'ex;ec aus'), /ungültig/);
});

test('speichern ist atomar, kaputte Datei führt zum Fehler (der Einstieg sperrt dann)', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'rechte-'));
  const datei = join(ordner, 'tabelle.json');
  assert.deepEqual(R.laden(datei), R.leer());                 // fehlt = leer
  R.speichern(datei, R.setzen(R.leer(), 'telegram', 'exec', 'aus'));
  assert.equal(R.stufe(R.laden(datei), 'telegram', 'exec'), 'aus');
  assert.match(readFileSync(datei, 'utf8'), /"aus"/);
  writeFileSync(datei, '{ kaputt');
  assert.throws(() => R.laden(datei));
  writeFileSync(datei, JSON.stringify({ standard: 'vielleicht', kanaele: {} }));
  assert.throws(() => R.laden(datei), /gibt es nicht/);
});

test('Tasten schalten zur nächsten Stufe und führen einen sicheren /rechte-Befehl aus', () => {
  const t = R.setzen(R.leer(), 'telegram', 'read', 'nachfragen');
  const p = R.praesentation(t, 'telegram', 'telegram');
  const tasten = p.blocks.find((b) => b.type === 'buttons').buttons;
  const read = tasten.find((b) => b.label.endsWith(' read'));
  assert.equal(read.label, '🟡 read');
  assert.deepEqual(read.action, { type: 'command', command: '/rechte telegram read aus' });
  assert.equal(tasten.find((b) => b.label.endsWith(' exec')).action.command, '/rechte telegram exec nachfragen');
  for (const b of tasten) assert.match(b.action.command, /^\/rechte [\w*.:-]+ [\w.:-]+ (frei|nachfragen|aus)$/);
  const ansichten = p.blocks.at(-1).buttons.map((b) => b.label);
  assert.deepEqual(ansichten, ['● telegram', 'Alle Kanäle']);
  assert.equal(R.naechste('aus'), 'frei');
});

test('Befehl mit Kanal, „zeige“ und Rückmeldung mit neuer Übersicht', () => {
  const r = R.befehl(R.leer(), 'telegram', 'telegram read aus');
  assert.equal(r.kanal, 'telegram');
  assert.match(r.text, /read: 🟢 frei → 🔴 aus \(Kanal „telegram“\)/);
  assert.match(r.text, /🔴 read/);
  const z = R.befehl(r.neu, 'telegram', 'zeige *');
  assert.equal(z.kanal, '*');
  assert.match(z.text, /Rechte für alle Kanäle/);
  assert.equal(z.neu, undefined);
});
