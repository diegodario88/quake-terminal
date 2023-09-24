#!/bin/bash

# Set the ID of your GNOME extension
EXTENSION_ID="quake-terminal@diegodario88.github.io"

# Set the name of your packed extension file
PACKED_EXTENSION_FILE="$EXTENSION_ID.shell-extension.zip"

echo "Packing the extension..."

# Remove the old zip if it exists
if [ -f "$PACKED_EXTENSION_FILE" ]; then
  rm -v "$PACKED_EXTENSION_FILE"
fi

gnome-extensions pack --extra-source='quake-mode.js' --extra-source='util.js' "$EXTENSION_ID"

echo "Uninstalling old extension..."
gnome-extensions uninstall "$EXTENSION_ID"
rm -rfv ~/.local/share/gnome-shell/extensions/"$EXTENSION_ID"

echo "Installing the extension..."
gnome-extensions install "$PACKED_EXTENSION_FILE"

echo "Done! Now restart your session."
