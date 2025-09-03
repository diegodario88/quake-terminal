NAME=quake-terminal
DOMAIN=diegodario88.github.io
EXTENSION_ID=$(NAME)@$(DOMAIN)
PACKED_EXTENSION_FILE=$(EXTENSION_ID).shell-extension.zip

.PHONY: compile pack uninstall install

compile:
	@glib-compile-schemas src/schemas
	@echo "Compiled schemas"

pack: compile
	@echo "Packing $(NAME) extension ..."
	@if [ -f "$(PACKED_EXTENSION_FILE)" ]; then \
	rm -v "$(PACKED_EXTENSION_FILE)"; \
	fi
	@gnome-extensions pack --podir=po --extra-source='quake-mode.js' src
	@FILE_SIZE_KB=$$($$(which stat) -c%s "$(PACKED_EXTENSION_FILE)" | awk '{printf "%.2f KB", $$1/1024}'); echo "Packed $(NAME): $$FILE_SIZE_KB"

uninstall:
	@echo "Uninstalling $(NAME) extension..."
	@if [ -d "$$HOME/.local/share/gnome-shell/extensions/$(EXTENSION_ID)" ]; then \
	echo "Extension $(EXTENSION_ID) found. Proceeding with uninstallation..."; \
	gnome-extensions uninstall "$(EXTENSION_ID)"; \
	rm -rf "$$HOME/.local/share/gnome-shell/extensions/$(EXTENSION_ID)"; \
	echo "Done uninstalling."; \
	else \
	echo "Extension $(EXTENSION_ID) not installed. Nothing to do."; \
	fi

install: compile pack uninstall
	@echo "Installing $(NAME) extension ..."
	@gnome-extensions install "$(PACKED_EXTENSION_FILE)"
	@echo "Done installing. To see it in action restart your session."
