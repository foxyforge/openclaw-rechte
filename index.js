// Rechte – OpenClaw-Einstieg. Die Logik steht in rechte.js (ohne OpenClaw testbar).
import { join } from 'node:path';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import * as R from './rechte.js';

export default definePluginEntry({
  id: 'rechte',
  name: 'Rechte',
  description: 'Rechte-Tabelle: je Kanal und Werkzeug frei, nachfragen oder aus. Umschalten mit /rechte.',
  register(api) {
    const datei = join(api.runtime.state.resolveStateDir(), 'rechte', 'tabelle.json');

    api.on('before_tool_call', (event, ctx) => {
      const werkzeug = event?.toolName ?? event?.name;
      if (!werkzeug) return undefined;
      let tabelle;
      try {
        tabelle = R.laden(datei);
      } catch (fehler) {
        return { block: true, blockReason: `Rechte-Tabelle nicht lesbar (${fehler.message}) – zur Sicherheit gesperrt.` };
      }
      if (!tabelle.bekannt.includes(werkzeug)) {   // neue Werkzeuge merken, damit /rechte sie zeigt
        tabelle.bekannt.push(werkzeug);
        try { R.speichern(datei, tabelle); } catch (fehler) { api.logger?.warn?.(`rechte: ${fehler.message}`); }
      }
      return R.entscheiden(tabelle, ctx?.requester?.channel ?? 'unbekannt', werkzeug, event?.params);
    }, { priority: 100 });

    api.registerCommand({
      name: 'rechte',
      description: 'Rechte je Werkzeug: Tabelle mit Tasten (tippen schaltet weiter) · /rechte <werkzeug> <frei|nachfragen|aus>',
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => {
        if (ctx.senderIsOwner === false) return { text: 'Nur der Besitzer darf die Rechte ändern.' };
        try {
          const kanal = ctx.channel ?? 'unbekannt';
          const ergebnis = R.befehl(R.laden(datei), kanal, ctx.args);
          if (ergebnis.neu) R.speichern(datei, ergebnis.neu);
          // Text für Kanäle ohne Tasten, Tasten für alle anderen (OpenClaw wählt je Kanal).
          return {
            text: ergebnis.text,
            presentation: R.praesentation(ergebnis.neu ?? R.laden(datei), ergebnis.kanal, kanal),
            presentationTextMode: 'fallback',
          };
        } catch (fehler) {
          return { text: `Nicht geändert: ${fehler.message}` };
        }
      },
    });
  },
});
