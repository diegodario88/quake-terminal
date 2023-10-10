import Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import {
	ExtensionPreferences,
	gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

const isValidAccel$1 = (mask, keyval) => {
	return (
		Gtk.accelerator_valid(keyval, mask) ||
		(keyval === Gdk.KEY_Tab && mask !== 0)
	);
};

const isValidBinding$1 = (mask, keycode, keyval) => {
	return mask !== 0 && keycode !== 0 && mask & ~Gdk.ModifierType.SHIFT_MASK;
};

export default class QuakeTerminalPreferences extends ExtensionPreferences {
	fillPreferencesWindow(window) {
		const settings = this.getSettings();

		const page = new Adw.PreferencesPage();
		page.set_title(_("Quake Terminal"));
		page.set_name("quake-terminal-preferences");

		const group = new Adw.PreferencesGroup();
		group.set_title(_("Settings"));
		group.set_name("settings-group");

		page.add(group);

		// App ID
		const rowId = new Adw.ActionRow({
			title: _("Terminal App ID"),
			subtitle: "/usr/share/applications/",
		});
		group.add(rowId);

		const entryId = new Gtk.Entry({
			placeholder_text: "org.gnome.Terminal.desktop",
			text: settings.get_string("terminal-id"),
			valign: Gtk.Align.CENTER,
			hexpand: true,
		});

		settings.bind(
			"terminal-id",
			entryId,
			"text",
			Gio.SettingsBindFlags.DEFAULT
		);

		rowId.add_suffix(entryId);
		rowId.activatable_widget = entryId;

		// Shortcut
		const shortcutId = "terminal-shortcut";
		const rowShortcut = new Adw.ActionRow({
			title: _("Toggle Shortcut"),
			subtitle: _("Shortcut to activate the terminal application"),
		});

		const shortcutLabel = new Gtk.ShortcutLabel({
			disabled_text: _("Select a shortcut"),
			accelerator: settings.get_strv(shortcutId)[0] ?? "<Control>backslash",
			valign: Gtk.Align.CENTER,
			halign: Gtk.Align.CENTER,
		});

		settings.connect(`changed::${shortcutId}`, () => {
			shortcutLabel.set_accelerator(settings.get_strv(shortcutId)[0]);
		});

		rowShortcut.connect("activated", () => {
			const ctl = new Gtk.EventControllerKey();

			const statusPage = new Adw.StatusPage({
				description: _("Enter new shortcut to toggle Quake Terminal"),
				icon_name: "preferences-desktop-keyboard-shortcuts-symbolic",
			});

			const toolbarView = new Adw.ToolbarView({
				content: statusPage,
			});

			const headerBar = new Adw.HeaderBar({
				title_widget: new Adw.WindowTitle({
					title: _("Set Shortcut"),
				}),
			});

			toolbarView.add_top_bar(headerBar);

			const editor = new Adw.Window({
				modal: true,
				transient_for: page.get_root(),
				hide_on_close: true,
				width_request: 400,
				height_request: 300,
				resizable: false,
				content: toolbarView,
			});

			editor.add_controller(ctl);
			ctl.connect("key-pressed", (_, keyval, keycode, state) => {
				let mask = state & Gtk.accelerator_get_default_mod_mask();
				mask &= ~Gdk.ModifierType.LOCK_MASK;

				if (
					!mask &&
					(keyval === Gdk.KEY_Escape || keyval === Gdk.KEY_BackSpace)
				) {
					editor.close();
					return Gdk.EVENT_STOP;
				}

				if (
					!isValidBinding$1(mask, keycode, keyval) ||
					!isValidAccel$1(mask, keyval)
				) {
					return Gdk.EVENT_STOP;
				}

				settings.set_strv(shortcutId, [
					Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask),
				]);

				editor.destroy();
				return Gdk.EVENT_STOP;
			});

			editor.present();
		});

		rowShortcut.add_suffix(shortcutLabel);
		rowShortcut.activatable_widget = shortcutLabel;
		group.add(rowShortcut);

		// Vertical Size as percentage
		const spinRow = new Adw.SpinRow({
			title: _("Vertical Size"),
			subtitle: _("Terminal descent distance as a percentage"),
			adjustment: new Gtk.Adjustment({
				lower: 25,
				"step-increment": 25,
				upper: 100,
				value: settings.get_int("vertical-size"),
			}),
		});
		group.add(spinRow);

		spinRow.connect("changed", () => {
			settings.set_int("vertical-size", spinRow.get_value());
		});
		settings.connect("changed::vertical-size", () => {
			spinRow.set_value(settings.get_int("vertical-size"));
		});

		window.add(page);
	}
}
