#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Mova"
APP_ID="com.mova.app"
BIN_NAME="mova"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_DIR="$ROOT_DIR/src-tauri"
RELEASE_BIN="$TAURI_DIR/target/release/$BIN_NAME"
LOCAL_TOOLCHAIN_DIR="$ROOT_DIR/.linux-toolchain"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "install-local currently supports Linux user installs only." >&2
  exit 1
fi

cd "$ROOT_DIR"

if [[ -x "$LOCAL_TOOLCHAIN_DIR/cargo/bin/cargo" ]]; then
  export CARGO_HOME="$LOCAL_TOOLCHAIN_DIR/cargo"
  export RUSTUP_HOME="$LOCAL_TOOLCHAIN_DIR/rustup"
  export PATH="$LOCAL_TOOLCHAIN_DIR/cargo/bin:$PATH"
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo not found. Install Rust or keep the project .linux-toolchain directory available." >&2
  exit 1
fi

echo "Building $APP_NAME production release binary..."
# Use the Tauri CLI instead of a plain `cargo build`. The CLI sets the
# production build environment that makes Tauri embed `build.frontendDist`;
# a direct cargo build can leave the binary pointing at `build.devUrl`
# (http://localhost:5173), which breaks the installed desktop app.
pnpm tauri build --no-bundle

if [[ ! -x "$RELEASE_BIN" ]]; then
  echo "Release binary not found at $RELEASE_BIN" >&2
  exit 1
fi

INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/$BIN_NAME"
BIN_DIR="$HOME/.local/bin"
APPLICATIONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/128x128/apps"

mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$APPLICATIONS_DIR" "$ICON_DIR"

install -m 755 "$RELEASE_BIN" "$INSTALL_DIR/$BIN_NAME"
rm -f "$BIN_DIR/$BIN_NAME"
cat > "$BIN_DIR/$BIN_NAME" <<EOF
#!/usr/bin/env bash
export GDK_SCALE=1
if [[ -n "\${WAYLAND_DISPLAY:-}" ]]; then
  export WEBKIT_DISABLE_DMABUF_RENDERER="\${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"
fi
exec "$INSTALL_DIR/$BIN_NAME" "\$@"
EOF
chmod 755 "$BIN_DIR/$BIN_NAME"

cat > "$BIN_DIR/$BIN_NAME-fast" <<EOF
#!/usr/bin/env bash
export GDK_SCALE=1
export MOVA_ENABLE_LINUX_DMABUF=1
unset WEBKIT_DISABLE_DMABUF_RENDERER
unset WEBKIT_DISABLE_COMPOSITING_MODE
exec "$INSTALL_DIR/$BIN_NAME" "\$@"
EOF
chmod 755 "$BIN_DIR/$BIN_NAME-fast"

cat > "$BIN_DIR/$BIN_NAME-compat" <<EOF
#!/usr/bin/env bash
export GDK_SCALE=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
exec "$INSTALL_DIR/$BIN_NAME" "\$@"
EOF
chmod 755 "$BIN_DIR/$BIN_NAME-compat"

cat > "$BIN_DIR/$BIN_NAME-x11" <<EOF
#!/usr/bin/env bash
export GDK_SCALE=1
export GDK_BACKEND=x11
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
exec "$INSTALL_DIR/$BIN_NAME" "\$@"
EOF
chmod 755 "$BIN_DIR/$BIN_NAME-x11"

cat > "$BIN_DIR/$BIN_NAME-force-compositing" <<EOF
#!/usr/bin/env bash
export GDK_SCALE=1
unset WEBKIT_DISABLE_COMPOSITING_MODE
unset MOVA_ENABLE_LINUX_DMABUF
export WEBKIT_DISABLE_DMABUF_RENDERER=1
exec "$INSTALL_DIR/$BIN_NAME" "\$@"
EOF
chmod 755 "$BIN_DIR/$BIN_NAME-force-compositing"
install -m 644 "$TAURI_DIR/icons/128x128.png" "$ICON_DIR/$APP_ID.png"

cat > "$APPLICATIONS_DIR/$APP_ID.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$APP_NAME
Comment=AI-assisted 2D game character animation tool
Exec=$BIN_DIR/$BIN_NAME
Icon=$APP_ID
Terminal=false
Categories=Graphics;Development;
StartupNotify=true
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" >/dev/null 2>&1 || true
fi

echo "$APP_NAME installed/updated: $INSTALL_DIR/$BIN_NAME"
echo "Command entry: $BIN_DIR/$BIN_NAME"
echo "Fast-mode command entry: $BIN_DIR/$BIN_NAME-fast"
echo "Compatibility command entry: $BIN_DIR/$BIN_NAME-compat"
echo "X11 compatibility command entry: $BIN_DIR/$BIN_NAME-x11"
echo "Force-compositing command entry: $BIN_DIR/$BIN_NAME-force-compositing"
echo "Desktop entry: $APPLICATIONS_DIR/$APP_ID.desktop"
