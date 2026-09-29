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

    // Tastendruck in Telegram: kommt direkt hierher (nicht ans Modell) und ändert dieselbe Nachricht.
    api.registerInteractiveHandler({
      channel: 'telegram',
      namespace: R.NAMENSRAUM,
      handler: async (ctx) => {
        const besitzer = (api.config?.commands?.ownerAllowFrom ?? []).map(String);
        if (!ctx.auth?.isAuthorizedSender || (besitzer.length > 0 && !besitzer.includes(`telegram:${ctx.senderId}`))) {
          return { handled: true };   // Fremde dürfen nichts umschalten – still ignorieren
        }
        try {
          const ergebnis = R.taste(R.laden(datei), ctx.callback?.payload);
          if (ergebnis.neu) R.speichern(datei, ergebnis.neu);
          const tabelle = ergebnis.neu ?? R.laden(datei);
          await ctx.respond.editMessage({ text: ergebnis.text, buttons: R.telegramTasten(tabelle, ergebnis.kanal, 'telegram') });
        } catch (fehler) {
          await ctx.respond.reply({ text: `Nicht geändert: ${fehler.message}` });
        }
        return { handled: true };
      },
    });

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
