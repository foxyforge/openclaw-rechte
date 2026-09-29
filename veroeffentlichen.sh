#!/bin/sh
# Neue Version der Rechte-Erweiterung auf ClawHub bringen – immer gleich, damit ClawHub und GitHub zusammenpassen:
# sauberer Stand → nach GitHub → Tests → Plugin-Prüfung → npm-Paket → Upload mit Quelle (Repo + Commit).
# Voraussetzung: `clawhub login` (einmalig) und eine neue Versionsnummer in package.json.
set -e
cd "$(dirname "$0")"
[ -z "$(git status --porcelain)" ] || { echo "Erst alles committen – ClawHub soll genau einen Commit abbilden."; exit 1; }
git push -q origin master
npm test --silent
clawhub package validate . >/dev/null && echo "Plugin-Prüfung: bestanden"
version=$(node -p "require('./package.json').version")
datei=$(npm pack --silent)
echo "Lade @foxyforge/openclaw-rechte@$version hoch (Commit $(git rev-parse --short HEAD)) …"
clawhub package publish "./$datei" --family code-plugin \
  --source-repo https://github.com/foxyforge/openclaw-rechte --source-commit "$(git rev-parse HEAD)"
