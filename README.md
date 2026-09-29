# Rechte – eine Erweiterung für OpenClaw

*[English version: README.en.md](README.en.md)*

Eine Tabelle, die für jeden Kanal und jedes Werkzeug eine von drei Stufen kennt:

| Stufe | Bedeutung |
|---|---|
| 🟢 **frei** (`allow`) | läuft ohne Rückfrage (so, wie OpenClaw ohne diese Erweiterung) |
| 🟡 **nachfragen** (`ask`) | OpenClaw hält an und fragt im Chat (Tasten oder `/approve`) |
| 🔴 **aus** (`off`) | wird nicht ausgeführt – egal, was das Modell will |

Die Tabelle wird im Chat mit `/rights` (oder `/rechte`) gezeigt und mit Tasten umgeschaltet. Die Prüfung sitzt
**im Programm** (Eingriffspunkt `before_tool_call`), nicht im Prompt: Ein Werkzeug, das „aus“ ist, führt OpenClaw
nicht aus, auch wenn das Modell es versucht.

<img src="docs/tabelle-telegram.jpg" width="340" alt="Die Tabelle in Telegram: je Werkzeug eine Taste mit 🟢🟡🔴, unten „telegram“ und „Alle Kanäle“">

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
  "allow": ["rechte", "telegram", "ollama", "…alle anderen Plugins, die du nutzt…"],
  "entries": { "rechte": { "config": { "language": "de" } } }
}
```

   `plugins.allow` ist eine **ausschließliche** Liste: Steht sie drin, lädt OpenClaw nur die genannten Plugins.
   Also alle mit aufführen, die du brauchst (Kanäle, Modellanbieter, …).
   `language` bestimmt die Sprache der sichtbaren Texte (`en` ist Standard, `de` deutsch). Befehle und Stufen
   werden unabhängig davon in beiden Sprachen verstanden.
3. Gateway neu starten. Im Log erscheint `rechte` in der Plugin-Liste.

Getestet mit OpenClaw 2026.9.6, Node 24, Telegram-Kanal.

## Benutzen

`/rights` und `/rechte` tun dasselbe. Stufen gehen deutsch oder englisch: `frei`/`allow`, `nachfragen`/`ask`, `aus`/`off`.

| Eingabe | Wirkung |
|---|---|
| `/rechte` | Tabelle des aktuellen Kanals, mit Tasten |
| Taste antippen | eine Stufe weiter (🟢 → 🟡 → 🔴 → 🟢), dieselbe Nachricht wird geändert |
| Taste „Alle Kanäle“ | Tabelle für `*` (gilt für jeden Kanal ohne eigenen Eintrag) |
| `/rechte exec nachfragen` | im aktuellen Kanal setzen |
| `/rechte * web_fetch aus` | für alle Kanäle setzen |
| `/rechte zeige discord` | Tabelle eines anderen Kanals ansehen (englisch: `show`) |

Alles in Kleinbuchstaben tippen – manche Handys machen aus `/rechte` ein `/Rechte`, und das geht dann ans Modell
statt an den Befehl.

**Reihenfolge der Prüfung:** Eintrag im Kanal → Eintrag für alle Kanäle (`*`) → Standard (`frei`).

Werkzeuge, die das Modell zum ersten Mal benutzt, kommen automatisch in die Tabelle (Liste `bekannt`), damit man
sie beim nächsten `/rechte` sieht.

## Die Tabelle

Liegt unter `<state-dir>/rechte/tabelle.json` (Rechte 600), wird atomar geschrieben (erst `.neu`, dann umbenannt).
Gespeichert werden die englischen Stufen; eine ältere Tabelle mit `frei`/`nachfragen`/`aus` wird beim Laden übersetzt.

```json
{
  "standard": "allow",
  "kanaele": {
    "*":        { "exec": "ask" },
    "telegram": { "exec": "off", "write": "ask" }
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
- **Der Agent kann die Tabelle nicht selbst ändern.** Sie liegt außerhalb seines Werkzeugkastens; nur der Befehl
  schreibt sie.

## Grenzen (Stand 29.09.2026)

- Tasten sind für **Telegram** gebaut und dort geprüft. Andere Kanäle bekommen die Tabelle als Text und schalten
  per `/rights <werkzeug> <stufe>`; die Tasten-Anzeige (`presentation`) sollte auch anderswo erscheinen, ist
  aber nicht getestet.
- „nachfragen“ braucht einen Kanal, der Freigaben anzeigen kann. Über die Kommandozeile (`openclaw agent`) und in
  Läufen ohne Gegenüber (Heartbeat, Automationen) bricht ein solcher Aufruf mit Hinweis ab – sicher, aber ohne
  Frage. Das Modell bekommt dann einen Werkzeugfehler und antwortet je nach Modell merkwürdig; wer Heartbeats nutzt,
  sollte die dort nötigen Werkzeuge auf „frei“ lassen oder den Heartbeat abschalten (`heartbeat.every: "0m"`).
- Die Namen im Code (Dateien, Funktionen, Felder der Tabelle) sind deutsch. Die sichtbaren Texte sind zweisprachig.

## Aufbau und Tests

- `rechte.js` – die ganze Logik, ohne OpenClaw-Abhängigkeit (Tabelle, Entscheidung, Befehl, Tasten, Texte de/en).
- `index.js` – der Einstieg für OpenClaw (`before_tool_call`, `/rights` + `/rechte`, Tastendruck-Handler).
- `test/rechte.test.js` – 12 Tests, `npm test` (nur Node, keine weiteren Pakete).

Live geprüft am 29.09.2026 in Telegram: Tabelle anzeigen, alle drei Stufen (frei liest ohne Frage, nachfragen zeigt
die Freigabe-Tasten und liest nach „Erlauben“, aus wird im Programm abgefangen und dem Nutzer erklärt), Tasten
schalten in derselben Nachricht reihum, ohne dass das Modell antwortet.

## Lizenz

MIT – siehe `LICENSE`.
