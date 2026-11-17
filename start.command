#!/bin/zsh
cd "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  export PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
fi
if [ ! -d node_modules ]; then
  echo 'Сначала установите зависимости: npm install'
  read
  exit 1
fi
if [[ -z "$SHAWARMA_STAFF_PIN" && -r "$HOME/.config/shawarma-craft/staff-pin.txt" ]]; then
  export SHAWARMA_STAFF_PIN="$(<"$HOME/.config/shawarma-craft/staff-pin.txt")"
fi
(sleep 1; open http://localhost:5173) &
node node_modules/vite/bin/vite.js --host 0.0.0.0
