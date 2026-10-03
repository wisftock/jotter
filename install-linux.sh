#!/usr/bin/env bash
#
# Installs WisfJS for the current user on Linux (AppImage based).
# No root required. Everything goes under your $HOME.
#
set -euo pipefail

APP_NAME="WisfJS"
BIN_NAME="wisfjs"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(grep -m1 '"version"' "$ROOT/package.json" | sed -E 's/.*"version": *"([^"]+)".*/\1/')"
APPIMAGE="$ROOT/release/${APP_NAME}-${VERSION}.AppImage"
ICON_SRC="$ROOT/build/icon.png"

if [[ ! -f "$APPIMAGE" ]]; then
  echo "==> No se encontró el AppImage; generándolo (npm run build:linux:appimage)…"
  (cd "$ROOT" && npm run build:linux:appimage)
fi

APP_DIR="$HOME/.local/opt/${BIN_NAME}"
BIN_DIR="$HOME/.local/bin"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
DESKTOP_DIR="$HOME/.local/share/applications"

mkdir -p "$APP_DIR" "$BIN_DIR" "$ICON_DIR" "$DESKTOP_DIR"

echo "==> Copiando AppImage a $APP_DIR"
install -m 0755 "$APPIMAGE" "$APP_DIR/${APP_NAME}.AppImage"

echo "==> Copiando icono"
if command -v magick >/dev/null 2>&1; then
  magick "$ICON_SRC" -resize 512x512 "$ICON_DIR/${BIN_NAME}.png"
elif command -v convert >/dev/null 2>&1; then
  convert "$ICON_SRC" -resize 512x512 "$ICON_DIR/${BIN_NAME}.png"
else
  cp "$ICON_SRC" "$ICON_DIR/${BIN_NAME}.png"
fi

echo "==> Creando lanzador en $BIN_DIR/${BIN_NAME}"
cat > "$BIN_DIR/${BIN_NAME}" <<EOF
#!/usr/bin/env bash
APP="$APP_DIR/${APP_NAME}.AppImage"
if ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
  exec "\$APP" "\$@"
else
  exec "\$APP" --appimage-extract-and-run "\$@"
fi
EOF
chmod 0755 "$BIN_DIR/${BIN_NAME}"

echo "==> Creando entrada de menú"
cat > "$DESKTOP_DIR/${BIN_NAME}.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=${APP_NAME}
Comment=JavaScript, TypeScript, JSX and TSX scratchpad
Exec=$BIN_DIR/${BIN_NAME} %U
Icon=${BIN_NAME}
Terminal=false
Categories=Development;
StartupWMClass=${APP_NAME}
EOF
chmod 0755 "$DESKTOP_DIR/${BIN_NAME}.desktop"

update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

echo
echo "==> Instalado:"
echo "    App:     $APP_DIR/${APP_NAME}.AppImage"
echo "    Comando: ${BIN_NAME}"
echo "    Menú:    ${APP_NAME}"
echo
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Nota: agrega '$BIN_DIR' a tu PATH para usar el comando '${BIN_NAME}'." ;;
esac
