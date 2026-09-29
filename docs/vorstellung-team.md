# Vorstellung beim OpenClaw-Team – Textentwurf

Chris postet selbst. Repo: https://github.com/foxyforge/openclaw-rechte

**Wo:** Das OpenClaw-Repo hat keine Discussions und keine freien Issues. Laut CONTRIBUTING.md gehen neue Ideen als
**Feature request** (Formular) oder zuerst in den Discord (https://discord.gg/clawd). Kein Fork nötig – ein Fork wäre
nur für einen Pull Request in OpenClaws eigenen Code.

Formular: https://github.com/openclaw/openclaw/issues/new?template=feature_request.yml – Feld für Feld aus dem
Abschnitt „GitHub-Issue“ unten kopieren. Für Discord die kurze Fassung ganz unten.

---

## GitHub-Issue (Feature request), Feld für Feld

**Title:** `[Feature]: Per-channel tool rights table (allow / ask / off), switchable from the chat – available as a plugin`

**Summary**
```
A per-channel × per-tool rights table with three levels (allow / ask / off), shown as buttons in the chat (/rights)
and enforced in code via before_tool_call. Built and tested as an external plugin; sharing it in case the idea (or
the plugin) is useful for OpenClaw.
```

**Problem to solve**
```
OpenClaw already has tools.allow/deny, sandboxing and exec approvals, but there is no single simple place where a
user can say, per channel, "this tool is fine, ask me for that one, never do this" – and change it from the phone
without editing config or restarting. In practice the phone/Telegram channel should get fewer rights than the desk,
and "ask" is the level people use most. Today "ask" for arbitrary tools is only reachable through a plugin, and the
per-channel view does not exist at all.
```

**Proposed solution**
```
One table: channel × tool → allow / ask / off. Lookup order: channel entry → "*" entry → default (allow, so nothing
changes for users who do not configure it).

- /rights shows the table for the current channel as buttons; tapping a button cycles allow → ask → off, the same
  message is edited in place. /rights <tool> <level>, /rights * <tool> <level>, /rights default <level> as text.
- before_tool_call: "off" returns block with a reason the model can relay ("switched off in channel X, tell the user
  they can enable it with /rights"); "ask" returns requireApproval with allow-once/deny only (an "allow always" would
  bypass the table); "allow" returns nothing.
- Button presses use callback data "rechte:…" and registerInteractiveHandler, so they go straight to the plugin and
  the model never sees them. Only the owner (commands.ownerAllowFrom) can switch.
- Tools the model uses for the first time are added to the table automatically. Corrupt table → every tool call
  blocked (fail closed). Approval card shows shortened parameters with token/key/password redacted.

All of this exists and runs today as an external plugin (link below). If the project prefers it in core or in a
different shape, I would rather adapt it than keep a separate plugin.
```

**Alternatives considered**
```
- tools.allow/deny: hard on/off only, global or per agent, config file + restart, no "ask", no per-channel view.
- Exec approvals: only cover exec, not arbitrary tools.
- Prompt rules ("never write files from Telegram"): not enforced; the model can ignore them.
```

**Impact**
```
Affected: anyone running one agent on several channels (phone + desk), especially non-technical users.
Severity: medium – without it, either everything is allowed on every channel or the user edits config and restarts.
Frequency: daily – "ask" is the level used most in practice.
Consequence: risky tools run from the phone without a question, or users give up on restricting them.
```

**Evidence/examples**
```
Plugin repo (README in English and German, screenshots, 13 tests, no dependencies, MIT):
https://github.com/foxyforge/openclaw-rechte
Verified live on OpenClaw 2026.9.6 with the Telegram channel: all three levels, approval buttons, in-place cycling
with no model reply. Prior art: a private agent ("Foxy") where the same table has been in daily use for months.
```

**Do you plan to open a PR for this?** → `Maybe, with maintainer guidance`

**Additional information**
```
Buttons are Telegram-only so far (other channels get text commands). "ask" needs a surface that can show approvals;
CLI and heartbeat/automation runs fail closed. Visible strings are English by default with a German option;
identifiers in the code are German – renaming is mechanical if wanted.
```

---

## Lang (falls doch mal eine Discussion oder ein freies Textfeld)

---


Hi all,

I built a small plugin and have been running it against 2026.9.6 with the Telegram channel. Sharing it in case it
is useful for others or for the project itself.

**What it does.** One table: per channel × per tool, one of three levels – 🟢 allow, 🟡 ask, 🔴 off. `/rights`
shows the table as buttons in the chat; tapping a button cycles the level. Enforcement is in code via
`before_tool_call`: "off" returns `block` with a reason the model can relay, "ask" returns `requireApproval`
(allow-once / deny only), "allow" does nothing. Default is allow, so enabling the plugin changes nothing until you
set something.

**Why.** OpenClaw already has `tools.allow/deny`, sandboxing and exec approvals. What I was missing as a user is
the *one simple place* where I can say, per channel, "this is fine, ask me for that, never do this" – from my phone,
without editing config or restarting. Phone/Telegram gets fewer rights than my desk. "ask" turned out to be the
level I use most. The idea comes from a private agent I have been running for months with exactly this table.

**How the buttons work.** Callback data `rechte:w:<channel>:<tool>` handled by
`registerInteractiveHandler({ channel: 'telegram', namespace: 'rechte' })`. The press goes straight to the plugin,
the same message is edited in place, the model never sees it. Only the owner (`commands.ownerAllowFrom`) can switch.

**Details that were deliberate.**
- "ask" allows only `allow-once` and `deny` – an "allow always" would bypass the table.
- The approval card shows the parameters shortened, keys like `token`/`key`/`password` redacted.
- Corrupt table file → every tool call is blocked with a message (fail closed).
- Tools the model uses for the first time are added to the table automatically.
- The agent has no tool to change the table; only the command writes it.

**State.** Verified live in Telegram: all three levels, approval buttons, in-place cycling with no model reply.
Logic is framework-free (`rechte.js`, 13 tests with `node --test`, no dependencies). Buttons are Telegram-only so far;
other channels get text + `/rights <tool> <level>`. Visible strings are English by default, German via a
`language` setting; identifiers in the code are German (I'm German, happy to rename if that matters).

Repo: **https://github.com/foxyforge/openclaw-rechte** – README in English and German, MIT.

I'm not attached to the shape. If something like this belongs in core, or should look different to fit, I'd rather
adapt it than keep a separate plugin. Feedback welcome.

---

## Kurz (Discord)

Built a small plugin for 2026.9.6: a per-channel × per-tool rights table (🟢 allow / 🟡 ask / 🔴 off), shown as
buttons via `/rights`, tap to cycle, enforced in code through `before_tool_call` (block / requireApproval). Button
presses go straight to the plugin via `registerInteractiveHandler`, so the model never sees them. Default allow, so
it changes nothing until you set something. Tested live in Telegram, 13 tests, no deps, MIT.
Repo: https://github.com/foxyforge/openclaw-rechte – feedback welcome, happy to adapt it if the project wants it in a different shape.
