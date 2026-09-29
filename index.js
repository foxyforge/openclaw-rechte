// Rechte – OpenClaw-Einstieg. Die Logik steht in rechte.js (ohne OpenClaw testbar).
import { join } from 'node:path';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import * as R from './rechte.js';

export default definePluginEntry({
  id: 'rechte',
  name: 'Rechte',
  description: 'Rights table: per channel and tool allow, ask or off. Switch with /rights (alias /rechte).',
  register(api) {
    const datei = join(api.runtime.state.resolveStateDir(), 'rechte', 'tabelle.json');
    R.spracheSetzen(api.pluginConfig?.language);   // 'de' oder 'en' (Standard); nur die sichtbaren Texte
    const T = R.texte();

    api.on('before_tool_call', (event, ctx) => {
      const werkzeug = R.werkzeugName(event, ctx);
      if (!werkzeug) return undefined;
      const kanal = R.kanalVon(ctx);
      let tabelle;
      try {
        tabelle = R.laden(datei);
      } catch (fehler) {
        return { block: true, blockReason: T.tabelleUnlesbar(fehler.message) };
      }
      if (!tabelle.bekannt.includes(werkzeug)) {   // neue Werkzeuge merken, damit die Tabelle sie zeigt
        tabelle.bekannt.push(werkzeug);
        try { R.speichern(datei, tabelle); } catch (fehler) { api.logger?.warn?.(`rechte: ${fehler.message}`); }
      }
      return R.entscheiden(tabelle, kanal, werkzeug, event?.params, { codeModeIsoliert: R.codeModeIsoliert(api.config) });
    }, { priority: 100 });

    // Tastendruck in Telegram: kommt direkt hierher (nicht ans Modell) und ändert dieselbe Nachricht.
    api.registerInteractiveHandler({
      channel: 'telegram',
      namespace: R.NAMENSRAUM,
      handler: async (ctx) => {
        if (!R.darfSchalten(api.config?.commands?.ownerAllowFrom, 'telegram', ctx.senderId, ctx.auth?.isAuthorizedSender)) {
          return { handled: true };   // Fremde dürfen nichts umschalten – still ignorieren
        }
        try {
          const ergebnis = R.taste(R.laden(datei), ctx.callback?.payload);
          if (ergebnis.neu) R.speichern(datei, ergebnis.neu);
          const tabelle = ergebnis.neu ?? R.laden(datei);
          await ctx.respond.editMessage({ text: ergebnis.text, buttons: R.telegramTasten(tabelle, ergebnis.kanal, 'telegram') });
        } catch (fehler) {
          await ctx.respond.reply({ text: T.nichtGeaendert(fehler.message) });
        }
        return { handled: true };
      },
    });

    // /rights ist der Hauptbefehl, /rechte der deutsche Alias – beide tun dasselbe.
    const befehl = async (ctx) => {
      if (ctx.senderIsOwner === false) return { text: T.nurBesitzer };
      try {
        const kanal = ctx.channel ?? 'unknown';
        const ergebnis = R.befehl(R.laden(datei), kanal, ctx.args);
        if (ergebnis.neu) R.speichern(datei, ergebnis.neu);
        // Text für Kanäle ohne Tasten, Tasten für alle anderen (OpenClaw wählt je Kanal).
        return {
          text: ergebnis.text,
          presentation: R.praesentation(ergebnis.neu ?? R.laden(datei), ergebnis.kanal, kanal),
          presentationTextMode: 'fallback',
        };
      } catch (fehler) {
        return { text: T.nichtGeaendert(fehler.message) };
      }
    };
    for (const name of ['rights', 'rechte']) {
      api.registerCommand({ name, description: T.befehlBeschreibung, acceptsArgs: true, requireAuth: true, handler: befehl });
    }
  },
});
