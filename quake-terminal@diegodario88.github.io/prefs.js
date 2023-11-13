import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gdk from "gi://Gdk";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import {
	ExtensionPreferences,
	gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

/**
 *
 * @returns GdkMonitor[]
 */
const getConnectedMonitorsList = () => {
	const monitors = [];

	const display = Gdk.Display.get_default(); // Gets the default GdkDisplay
	if (display && "get_monitors" in display) {
		const monitorsAvailable = display.get_monitors();  // Gets the list of monitors associated with this display.

		for (let idx = 0; idx < monitorsAvailable.get_n_items(); idx++) {
			const monitor = monitorsAvailable.get_item(idx);
			monitors.push(monitor);
		}
	} else {
		console.warn(`Could not get monitor list from Display of type ${display}`);
	}

	return monitors;
};

const isValidAccel = (mask, keyval) => {
	return (
		Gtk.accelerator_valid(keyval, mask) ||
		(keyval === Gdk.KEY_Tab && mask !== 0)
	);
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
				0,
				100,
				0
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
			subtitle: "/usr/share/applications/ or \n /var/lib/flatpak/exports/share/applications/",
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

				if (!isValidAccel(mask, keyval)) {
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

		// Render on current Monitor
		const renderOnCurrentMonitor = new Adw.SwitchRow({
			title: _("Show on the current Display"),
			subtitle: _(
				"When enabled, the Terminal will be shown on the Display that currently has the mouse pointer"
			),
		});
		generalSettingsGroup.add(renderOnCurrentMonitor);

		settings.bind(
			"render-on-current-monitor",
			renderOnCurrentMonitor,
			"active",
			Gio.SettingsBindFlags.DEFAULT
		);

		// Render on primary Monitor
		const renderOnPrimaryMonitor = new Adw.SwitchRow({
			title: _("Show on the primary Display"),
			subtitle: _(
				"When enabled, the Terminal will be shown on the Display set as Primary in Gnome Display settings"
			),
		});
		generalSettingsGroup.add(renderOnPrimaryMonitor);

		settings.bind(
			"render-on-primary-monitor",
			renderOnPrimaryMonitor,
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
				`${monitor.description}`.toUpperCase(),
				idx
			);
			monitorScreenModel.append(monitorScreen);
		}
		const monitorRow = new Adw.ComboRow({
			title: _("Display"),
			subtitle: _("Which display should the terminal be rendered on"),
			model: monitorScreenModel,
			expression: new Gtk.PropertyExpression(GenericObjectModel, null, "name"),
			selected: settings.get_int("monitor-screen"),
			sensitive: !settings.get_boolean("render-on-current-monitor") && !settings.get_boolean("render-on-primary-monitor"),
		});

		generalSettingsGroup.add(monitorRow);

		monitorRow.connect("notify::selected", () => {
			settings.set_int("monitor-screen", monitorRow.selected);
		});

		// watch for render-on-current-monitor changes
		settings.connect("changed::render-on-current-monitor", () => {
			// set render-on-primary-monitor to false when render-on-current-monitor was set to true
			if (settings.get_boolean("render-on-current-monitor") && settings.get_boolean("render-on-primary-monitor")) {
				settings.set_boolean("render-on-primary-monitor", false);
			}
			// disable selecting a monitor screen
			monitorRow.set_sensitive(!settings.get_boolean("render-on-current-monitor"));
		});

		// watch for render-on-primary-monitor changes
		settings.connect("changed::render-on-primary-monitor", () => {
			// set render-on-current-monitor to false when render-on-primary-monitor was set to true
			if (settings.get_boolean("render-on-primary-monitor") && settings.get_boolean("render-on-current-monitor")) {
				settings.set_boolean("render-on-current-monitor", false);
			}
			// disable selecting a monitor screen
			monitorRow.set_sensitive(!settings.get_boolean("render-on-primary-monitor"));
		});

		// Animation Time
		const animationTime = new Adw.SpinRow({
			title: _("Animation Time"),
			subtitle: _("Duration of the dropdown animation in milliseconds"),
			adjustment: new Gtk.Adjustment({
				lower: 0,
				"step-increment": 5,
				upper: 500,
				value: settings.get_int("animation-time"),
			}),
		});
		generalSettingsGroup.add(animationTime);
		animationTime.connect("changed", () => {
			settings.set_int("animation-time", animationTime.get_value());
		});
		settings.connect("changed::animation-time", () => {
			animationTime.set_value(settings.get_int("animation-time"));
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
