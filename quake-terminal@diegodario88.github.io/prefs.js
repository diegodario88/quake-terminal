import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";

export default class TogglerPreferences extends ExtensionPreferences {
	fillPreferencesWindow(window) {
		const settings = this.getSettings();
		const page = new Adw.PreferencesPage();
		const group = new Adw.PreferencesGroup();

		page.add(group);

		// App ID
		const rowId = new Adw.ActionRow({
			title: "Terminal App ID",
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
		const rowShortcut = new Adw.ActionRow({
			title: "Toggle Shortcut",
			subtitle: "&lt;special_key&gt;regular_key",
		});
		group.add(rowShortcut);

		const entryShortcut = new Gtk.Entry({
			placeholder_text: "<Super>Return",
			text: settings.get_string("terminal-shortcut-text"),
			valign: Gtk.Align.CENTER,
			hexpand: true,
		});

		settings.bind(
			"terminal-shortcut-text",
			entryShortcut,
			"text",
			Gio.SettingsBindFlags.DEFAULT
		);

		rowShortcut.add_suffix(entryShortcut);
		rowShortcut.activatable_widget = entryShortcut;

		// SpinRow
		const spinRow = new Adw.SpinRow({
			title: "Vertical Size",
			subtitle: "How far the terminal will go down",
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

		settings.connect("changed::terminal-shortcut-text", () => {
			const shortcutText = settings.get_string("terminal-shortcut-text");
			const [success, key, mods] = Gtk.accelerator_parse(shortcutText);

			if (success && Gtk.accelerator_valid(key, mods)) {
				const shortcut = Gtk.accelerator_name(key, mods);
				settings.set_strv("terminal-shortcut", [shortcut]);
			} else {
				console.warn(`Invalid shortcut, ${shortcutText}`);
				settings.set_strv("terminal-shortcut", []);
			}
		});

		window.add(page);
	}
}
