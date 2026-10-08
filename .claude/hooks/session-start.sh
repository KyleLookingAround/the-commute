#!/bin/bash
# Runs when a session starts: sets the commit author, then (in web sessions) installs the check tools so `npm run check`
# works straight away.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

# every commit in this repo is the owner's, whichever machine or session makes it
git config user.name KyleLookingAround
git config user.email KyleMck10@hotmail.com

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then exit 0; fi

npm install --no-audit --no-fund

# Playwright is pinned to the version whose Chromium the web image already has. If the image moves on, point the
# checks at whichever Chromium it has rather than downloading one.
if ! node -e "const {chromium}=require('playwright');process.exit(require('fs').existsSync(chromium.executablePath())?0:1)"; then
  if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo 'export CHROMIUM_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
  else
    npx playwright install chromium || echo "session-start: no Chromium for the checks; set CHROMIUM_PATH" >&2
  fi
fi
