import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gdk from "gi://Gdk";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import {
	ExtensionPreferences,
	gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

const getConnectedMonitorsList = () => {
	const monitors = [];

	const display = Gdk.Display.get_default();
	if (display && "get_monitors" in display) {
		const monitorsAvailable = display.get_monitors();

		for (let idx = 0; idx < monitorsAvailable.get_n_items(); idx++) {
			const monitor = monitorsAvailable.get_item(idx);
			monitors.push(monitor);
		}
	} else {
		console.warn(`Could not get monitor list from Display of type ${display}`);
	}

	return monitors;
};

const keyvalIsAllowed = (keyval) => {
	return [
		Gdk.KEY_F1,
		Gdk.KEY_F2,
		Gdk.KEY_F3,
		Gdk.KEY_F4,
		Gdk.KEY_F5,
		Gdk.KEY_F6,
		Gdk.KEY_F7,
		Gdk.KEY_F8,
		Gdk.KEY_F9,
		Gdk.KEY_F10,
		Gdk.KEY_F11,
		Gdk.KEY_F12,
		Gdk.KEY_F13,
		Gdk.KEY_grave,
		Gdk.KEY_dead_grave,
	].includes(keyval);
};

const isValidAccel = (mask, keyval) => {
	return (
		Gtk.accelerator_valid(keyval, mask) ||
		(keyval === Gdk.KEY_Tab && mask !== 0)
	);
};

const isValidBinding = (mask, keycode, keyval) => {
	if (keyvalIsAllowed(keyval)) {
		return true;
	}

	return mask !== 0 && keycode !== 0 && mask & ~Gdk.ModifierType.SHIFT_MASK;
};

const GenericObjectModel = GObject.registerClass(
	{
		Properties: {
			name: GObject.ParamSpec.string(
				"name",
				"name",
				"name",
				GObject.ParamFlags.READWRITE,
				null
			),
			value: GObject.ParamSpec.int(
				"value",
				"value",
				"value",
				GObject.ParamFlags.READWRITE,
				null
			),
		},
	},
	class GenericObjectModel extends GObject.Object {
		_init(name, value) {
			super._init({ name, value });
		}
	}
);

export default class QuakeTerminalPreferences extends ExtensionPreferences {
	fillPreferencesWindow(window) {
		const settings = this.getSettings();

		const page = new Adw.PreferencesPage();
		page.set_title(_("Quake Terminal Settings"));
		page.set_name("quake-terminal-preferences");

		const generalSettingsGroup = new Adw.PreferencesGroup();
		generalSettingsGroup.set_title(_("General"));
		generalSettingsGroup.set_name("general-settings-group");

		page.add(generalSettingsGroup);

		// App ID
		const rowId = new Adw.ActionRow({
			title: _("Terminal App ID"),
			subtitle: "/usr/share/applications/",
		});
		generalSettingsGroup.add(rowId);

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
					!isValidBinding(mask, keycode, keyval) ||
					!isValidAccel(mask, keyval)
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
		generalSettingsGroup.add(rowShortcut);

		// Auto Hide Window
		const autoHideWindowRow = new Adw.SwitchRow({
			title: _("Auto Hide Terminal"),
			subtitle: _(
				"When enabled, this hides the Terminal window when it loses focus"
			),
		});
		generalSettingsGroup.add(autoHideWindowRow);

		settings.bind(
			"auto-hide-window",
			autoHideWindowRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT
		);

		// Monitor Screen
		const monitorScreenModel = new Gio.ListStore({
			item_type: GenericObjectModel,
		});

		const monitorScreens = getConnectedMonitorsList();

		for (const [idx, monitor] of monitorScreens.entries()) {
			const monitorScreen = new GenericObjectModel(
				`${monitor.model}`.toUpperCase(),
				idx
			);
			monitorScreenModel.append(monitorScreen);
		}

		const monitorRow = new Adw.ComboRow({
			title: _("Monitor Screen"),
			subtitle: _("Which monitor the terminal should be rendered"),
			model: monitorScreenModel,
			expression: new Gtk.PropertyExpression(GenericObjectModel, null, "name"),
			selected: settings.get_int("monitor-screen"),
		});

		generalSettingsGroup.add(monitorRow);

		monitorRow.connect("notify::selected", () => {
			settings.set_int("monitor-screen", monitorRow.selected);
		});

		// Position Group Settings
		const positionSettingsGroup = new Adw.PreferencesGroup();
		positionSettingsGroup.set_title(_("Position"));
		positionSettingsGroup.set_name("position-settings-group");

		page.add(positionSettingsGroup);

		// Vertical Size as percentage
		const verticalSpinRow = new Adw.SpinRow({
			title: _("Vertical Size"),
			subtitle: _("Terminal vertical distance as a percentage"),
			adjustment: new Gtk.Adjustment({
				lower: 30,
				"step-increment": 5,
				upper: 100,
				value: settings.get_int("vertical-size"),
			}),
		});
		positionSettingsGroup.add(verticalSpinRow);

		verticalSpinRow.connect("changed", () => {
			settings.set_int("vertical-size", verticalSpinRow.get_value());
		});
		settings.connect("changed::vertical-size", () => {
			verticalSpinRow.set_value(settings.get_int("vertical-size"));
		});

		// Horizontal Size as percentage
		const horizontalSpinRow = new Adw.SpinRow({
			title: _("Horizontal Size"),
			subtitle: _("Terminal horizontal distance as a percentage"),
			adjustment: new Gtk.Adjustment({
				lower: 30,
				"step-increment": 5,
				upper: 100,
				value: settings.get_int("horizontal-size"),
			}),
		});
		positionSettingsGroup.add(horizontalSpinRow);

		horizontalSpinRow.connect("changed", () => {
			settings.set_int("horizontal-size", horizontalSpinRow.get_value());
		});
		settings.connect("changed::horizontal-size", () => {
			horizontalSpinRow.set_value(settings.get_int("horizontal-size"));
		});

		// Horizontal Alignment
		const horizontalAlignmentModel = new Gio.ListStore({
			item_type: GenericObjectModel,
		});

		["Left", "Right", "Center"].forEach((hAlign, idx) => {
			const horizontalAlignment = new GenericObjectModel(hAlign, idx);
			horizontalAlignmentModel.append(horizontalAlignment);
		});

		const horizontalAlignmentRow = new Adw.ComboRow({
			title: _("Horizontal Alignment"),
			subtitle: _("Control the value for horizontal alignment"),
			model: horizontalAlignmentModel,
			expression: new Gtk.PropertyExpression(GenericObjectModel, null, "name"),
			selected: settings.get_int("horizontal-alignment"),
		});

		positionSettingsGroup.add(horizontalAlignmentRow);

		horizontalAlignmentRow.connect("notify::selected", () => {
			settings.set_int("horizontal-alignment", horizontalAlignmentRow.selected);
		});

		// Always on top
		const alwaysOnTopRow = new Adw.SwitchRow({
			title: _("Always On Top"),
			subtitle: _(
				"When enabled, terminal window will appear on top of all other non-topmost windows"
			),
		});
		positionSettingsGroup.add(alwaysOnTopRow);

		settings.bind(
			"always-on-top",
			alwaysOnTopRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT
		);

		window.add(page);
	}
}
