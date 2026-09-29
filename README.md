# Rechte – eine Erweiterung für OpenClaw

*[English version: README.en.md](README.en.md)*

Eine Tabelle, die für jeden Kanal und jedes Werkzeug eine von drei Stufen kennt:

| Stufe | Bedeutung |
|---|---|
| 🟢 **frei** | läuft ohne Rückfrage (so, wie OpenClaw ohne diese Erweiterung) |
| 🟡 **nachfragen** | OpenClaw hält an und fragt im Chat (Tasten oder `/approve`) |
| 🔴 **aus** | wird nicht ausgeführt – egal, was das Modell will |

Die Tabelle wird im Chat mit `/rechte` gezeigt und mit Tasten umgeschaltet. Die Prüfung sitzt **im Programm**
(Eingriffspunkt `before_tool_call`), nicht im Prompt: Ein Werkzeug, das „aus“ ist, führt OpenClaw nicht aus, auch
wenn das Modell es versucht.

```
Rechte für Kanal „telegram“ (Standard: 🟢 frei)
🟡 exec
🟢 read
🔴 write
…
Tippen schaltet weiter: 🟢 frei → 🟡 nachfragen → 🔴 aus.
```

## Warum

OpenClaw kann schon viel: `tools.allow`/`tools.deny`, Sandbox, Exec-Freigaben. Was fehlt, ist die **eine einfache
Stelle**, an der man je Kanal sagt „das darf er, da soll er fragen, das nie“ – und die man vom Handy aus umschalten
kann, ohne Konfigdatei und ohne Neustart. Genau das ist diese Erweiterung. Vorbild ist ein privater Agent („Foxy“),
bei dem sich diese Tabelle seit Monaten im Alltag bewährt: Telegram bekommt weniger Rechte als der Rechner zu Hause,
und „nachfragen“ ist die Stufe, die man am häufigsten nutzt.

Wer die Erweiterung einschaltet und nichts einstellt, merkt keinen Unterschied: Standard ist **frei**.

## Einbauen

1. Ordner irgendwohin legen (z. B. `~/projekte/openclaw-rechte`) – keine Abhängigkeiten, kein Build.
2. In `openclaw.json` (bzw. der Profil-Konfig) eintragen:

```json
"plugins": {
  "load": { "paths": ["/pfad/zu/openclaw-rechte"] },
  "allow": ["rechte", "telegram", "ollama", "…alle anderen Plugins, die du nutzt…"]
}
```

   `plugins.allow` ist eine **ausschließliche** Liste: Steht sie drin, lädt OpenClaw nur die genannten Plugins.
   Also alle mit aufführen, die du brauchst (Kanäle, Modellanbieter, …).
3. Gateway neu starten. Im Log erscheint `rechte` in der Plugin-Liste.

Getestet mit OpenClaw 2026.9.6, Node 24, Telegram-Kanal.

## Benutzen

| Eingabe | Wirkung |
|---|---|
| `/rechte` | Tabelle des aktuellen Kanals, mit Tasten |
| Taste antippen | eine Stufe weiter (🟢 → 🟡 → 🔴 → 🟢), dieselbe Nachricht wird geändert |
| Taste „Alle Kanäle“ | Tabelle für `*` (gilt für jeden Kanal ohne eigenen Eintrag) |
| `/rechte exec nachfragen` | im aktuellen Kanal setzen |
| `/rechte * web_fetch aus` | für alle Kanäle setzen |
| `/rechte zeige discord` | Tabelle eines anderen Kanals ansehen |

Alles in Kleinbuchstaben tippen – manche Handys machen aus `/rechte` ein `/Rechte`, und das geht dann ans Modell
statt an den Befehl.

**Reihenfolge der Prüfung:** Eintrag im Kanal → Eintrag für alle Kanäle (`*`) → Standard (`frei`).

Werkzeuge, die das Modell zum ersten Mal benutzt, kommen automatisch in die Tabelle (Liste `bekannt`), damit man
sie beim nächsten `/rechte` sieht.

## Die Tabelle

Liegt unter `<state-dir>/rechte/tabelle.json` (Rechte 600), wird atomar geschrieben (erst `.neu`, dann umbenannt).

```json
{
  "standard": "frei",
  "kanaele": {
    "*":        { "exec": "nachfragen" },
    "telegram": { "exec": "aus", "write": "nachfragen" }
  },
  "bekannt": ["read", "exec", "web_search"]
}
```

Ist die Datei kaputt, **sperrt** die Erweiterung jeden Werkzeugaufruf mit Hinweis – lieber gesperrt als still alles
erlaubt.

## Was die Erweiterung bewusst tut

- **„aus“ gibt dem Modell eine Begründung** („… ist im Kanal telegram ausgeschaltet. Versuche es nicht auf anderem
  Weg. Sag dem Nutzer, dass er es mit /rechte freischalten kann.“) – so erklärt der Bot die Sperre, statt zu raten.
- **„nachfragen“ erlaubt nur `allow-once` und `deny`.** Ein „immer erlauben“ würde an der Tabelle vorbeigehen; wer
  dauerhaft frei will, schaltet die Stufe um.
- **Die Freigabe-Karte zeigt die Parameter gekürzt**, Schlüssel wie `token`, `key`, `password` geschwärzt.
- **Umschalten darf nur der Besitzer** (`commands.ownerAllowFrom`). Tastendrücke von Fremden werden still ignoriert.
- **Tastendrücke gehen direkt an die Erweiterung**, nicht ans Modell (`registerInteractiveHandler`, Namensraum
  `rechte`). Das Modell sieht davon nichts und kann nichts dazu sagen.
- **Der Agent kann die Tabelle nicht selbst ändern.** Sie liegt außerhalb seines Werkzeugkastens; nur `/rechte`
  schreibt sie.

## Grenzen (Stand 29.09.2026)

- Tasten sind für **Telegram** gebaut und dort geprüft. Andere Kanäle bekommen die Tabelle als Text und schalten
  per `/rechte <werkzeug> <stufe>`; die Tasten-Anzeige (`presentation`) sollte auch anderswo erscheinen, ist
  aber nicht getestet.
- „nachfragen“ braucht einen Kanal, der Freigaben anzeigen kann. Über die Kommandozeile (`openclaw agent`) bricht
  ein solcher Aufruf mit Hinweis ab – sicher, aber ohne Frage.
- Befehl und Stufen sind deutsch (`/rechte`, `frei`/`nachfragen`/`aus`). Für eine Übernahme ins Projekt wäre eine
  englische Fassung der sichtbaren Texte der nächste Schritt; die Logik ist davon unabhängig.

## Aufbau und Tests

- `rechte.js` – die ganze Logik, ohne OpenClaw-Abhängigkeit (Tabelle, Entscheidung, Befehl, Tasten).
- `index.js` – der Einstieg für OpenClaw (`before_tool_call`, `/rechte`, Tastendruck-Handler).
- `test/rechte.test.js` – 9 Tests, `npm test` (nur Node, keine weiteren Pakete).

Live geprüft am 29.09.2026 in Telegram: Tabelle anzeigen, alle drei Stufen (frei liest ohne Frage, nachfragen zeigt
die Freigabe-Tasten und liest nach „Erlauben“, aus wird im Programm abgefangen und dem Nutzer erklärt), Tasten
schalten in derselben Nachricht reihum, ohne dass das Modell antwortet.

## Lizenz

MIT – siehe `LICENSE`.
