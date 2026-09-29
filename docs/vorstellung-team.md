# Vorstellung beim OpenClaw-Team – Textentwurf

Chris postet selbst. Vorher: Repo auf GitHub anlegen (z. B. `foxyforge/openclaw-rechte`), pushen, Link unten eintragen.
Zwei Fassungen: lang für eine GitHub-Discussion („Show and tell“) oder ein Issue, kurz für Discord/Chat.

---

## Lang (GitHub Discussion / Issue)

**Title:** Plugin: per-channel tool rights table (allow / ask / off), switchable from the chat

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
