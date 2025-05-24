import Adw from "gi://Adw";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Gdk from "gi://Gdk";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

const ABOUT_TERMINAL_APPLICATION_HELP_DIALOG = `
<markup>
  <span font_desc='11'>When this row is activated, the system searches for installed apps based on specific criteria that each app must meet:</span>

  <span font_desc='10'> - A valid <a href="https://developer.gnome.org/documentation/tutorials/application-id.html">Application ID</a>.</span>
  <span font_desc='10'> - Should not be hidden.</span>
  <span font_desc='10'> - Must have <i>terminal</i> specified in its categories metadata.</span>

  <small>This process ensures accurate and relevant results. For help and more information, refer to <a href="https://github.com/diegodario88/quake-terminal">Quake Terminal</a>.</small>
</markup>
`;

/**
 *
 * @returns GdkMonitor[]
 */
const getConnectedMonitorsList = () => {
  const monitors = [];

  const display = Gdk.Display.get_default(); // Gets the default GdkDisplay
  if (display && "get_monitors" in display) {
    const monitorsAvailable = display.get_monitors(); // Gets the list of monitors associated with this display.

    for (let idx = 0; idx < monitorsAvailable.get_n_items(); idx++) {
      const monitor = monitorsAvailable.get_item(idx);
      monitors.push(monitor);
    }
  } else {
    console.warn(`Could not get monitor list from Display of type ${display}`);
  }

  return monitors;
};

const isValidAccel = (
  /** @type {number | Gdk.ModifierType} */ mask,
  /** @type {number} */ keyval
) => {
  return (
    Gtk.accelerator_valid(keyval, mask) ||
    (keyval === Gdk.KEY_Tab && mask !== 0)
  );
};

/**
 * @param {Gio.DesktopAppInfo} app - Selected terminal application
 */
function getAppIconImage(app) {
  const appIconString = app?.get_icon()?.to_string() ?? "icon-missing";

  return new Gtk.Image({
    gicon: Gio.icon_new_for_string(appIconString),
    iconSize: Gtk.IconSize.LARGE,
  });
}

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
    /**
     * @param {string} name - Object name
     * @param {number} value - Object value
     */
    _init(name, value) {
      super._init({ name, value });
    }
  }
);

/** Dialog window used for selecting application from given list of apps
 *  Emits `app-selected` signal with application id
 */
const AppChooserDialog = GObject.registerClass(
  {
    Properties: {},
    Signals: { "app-selected": { param_types: [GObject.TYPE_STRING] } },
  },
  class AppChooserDialog extends Adw.PreferencesWindow {
    /**
     * @param {Gio.DesktopAppInfo[]} apps list of apps to display in dialog
     * @param {{ defaultWidth: number; defaultHeight: number; }} parent parent window, dialog will be transient for parent
     */
    _init(apps, parent) {
      super._init({
        modal: true,
        transientFor: parent,
        destroyWithParent: false,
        title: "Select terminal application",
      });

      this.set_default_size(
        0.7 * parent.defaultWidth,
        0.7 * parent.defaultHeight
      );
      this._group = new Adw.PreferencesGroup();
      const page = new Adw.PreferencesPage();
      page.add(this._group);
      this.add(page);
      apps.forEach((app) => this._addAppRow(app));
    }

    /**
     * @param {Gio.DesktopAppInfo} app - The terminal application
     */
    _addAppRow(app) {
      const row = new Adw.ActionRow({
        title: app.get_display_name(),
        subtitle: app.get_description(),
        activatable: true,
      });

      row.add_prefix(getAppIconImage(app));
      this._group.add(row);

      row.connect("activated", () => {
        this.emit("app-selected", app.get_id());
        this.close();
      });
    }
  }
);

export default class QuakeTerminalPreferences extends ExtensionPreferences {
  /**
   * Fills the preferences window with extension settings UI.
   *
   * @param {Adw.PreferencesWindow} window - The preferences window to populate.
   * @returns {Promise<void>}
   */
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage();
    page.set_title(_("Quake Terminal Settings"));
    page.set_name("quake-terminal-preferences");

    const applicationSettingsGroup = new Adw.PreferencesGroup();
    applicationSettingsGroup.set_title(_("Application"));
    applicationSettingsGroup.set_name("application-settings-group");

    page.add(applicationSettingsGroup);

    // Application Terminal ID
    const terminalApplicationId = settings.get_string("terminal-id");

    const defaultTerminalApplicationId = settings
      .get_default_value("terminal-id")
      .deep_unpack();

    const applicationIDRow = new Adw.ActionRow({
      title: _("Terminal Application"),
    });

    let selectedTerminalEmulator = Gio.DesktopAppInfo.new(
      terminalApplicationId
    );

    if (!selectedTerminalEmulator) {
      console.warn(
        `Unable to locate a terminal application with the specified ID (${terminalApplicationId}). Falling back to the default terminal (${defaultTerminalApplicationId}).`
      );

      selectedTerminalEmulator = Gio.DesktopAppInfo.new(
        defaultTerminalApplicationId
      );
    }

    if (!selectedTerminalEmulator) {
      console.warn(
        `Unable to locate default terminal application (${defaultTerminalApplicationId}).`
      );

      applicationIDRow.set_subtitle(
        `${defaultTerminalApplicationId} not found. Click here to select another terminal app.`
      );
    } else {
      applicationIDRow.set_subtitle(selectedTerminalEmulator.get_id());
    }

    const gtkIcon = getAppIconImage(selectedTerminalEmulator);
    applicationSettingsGroup.add(applicationIDRow);

    const helpButton = Gtk.Button.new_from_icon_name("help-about-symbolic");
    helpButton.set_valign(Gtk.Align.CENTER);
    helpButton.add_css_class("flat");

    helpButton.connect("clicked", () => {
      const helpDialogLabel = new Gtk.Label({
        margin_start: 24,
        margin_end: 24,
        margin_bottom: 24,
        wrap: true,
        useMarkup: true,
        justify: Gtk.Justification.FILL,
        label: ABOUT_TERMINAL_APPLICATION_HELP_DIALOG,
      });

      const helpDialogScrolledWindow = new Gtk.ScrolledWindow({
        propagate_natural_height: true,
        vscrollbar_policy: Gtk.PolicyType.NEVER,
      });

      helpDialogScrolledWindow.set_child(helpDialogLabel);

      const helpButtonToolbarView = new Adw.ToolbarView({
        content: helpDialogScrolledWindow,
      });

      helpButtonToolbarView.add_top_bar(new Adw.HeaderBar());

      const helpDialog = new Adw.Window({
        title: "About terminal application",
        modal: true,
        // @ts-ignore
        transient_for: page.get_root(),
        hide_on_close: true,
        width_request: 360,
        height_request: 300,
        default_width: 420,
        resizable: false,
        content: helpButtonToolbarView,
      });

      helpDialog.present();
    });

    applicationIDRow.add_prefix(gtkIcon);
    applicationIDRow.add_suffix(helpButton);
    applicationIDRow.activatable_widget = gtkIcon;

    // Custom terminal arguments per application
    const launchArgsMap =
      settings.get_value("launch-args-map").deep_unpack() || {};
    const currentAppArgs = launchArgsMap[terminalApplicationId] || "";

    const launchArgRow = new Adw.EntryRow({
      title: _("Launch Options"),
      tooltip_text: _(
        "Optional command-line arguments to customize how the terminal starts for this application. For example: -o font_size=18"
      ),
      text: currentAppArgs,
      show_apply_button: true,
    });

    launchArgRow.connect("apply", () => {
      const applyTerminalApplicationId = settings.get_string("terminal-id");
      const applyLaunchArgsMap =
        settings.get_value("launch-args-map").deep_unpack() || {};

      const updatedMap = { ...applyLaunchArgsMap };
      updatedMap[applyTerminalApplicationId] = launchArgRow.text;
      settings.set_value(
        "launch-args-map",
        new GLib.Variant("a{ss}", updatedMap)
      );
      launchArgRow.get_root().set_focus(null);
    });

    applicationSettingsGroup.add(launchArgRow);
    applicationIDRow.connect("activated", () => {
      const allApps = Gio.app_info_get_all();

      const selectableApps = allApps
        .filter((app) => {
          const appId = app.get_id();

          if (!appId) {
            return false;
          }

          if (!app.should_show()) {
            return false;
          }

          // @ts-ignore
          const appCategories = app.get_categories();
          if (!appCategories) {
            return false;
          }

          return appCategories.toLowerCase().includes("terminal");
        })
        .sort((a, b) => a.get_id().localeCompare(b.get_id()));

      // @ts-ignore
      const appChooserDialog = new AppChooserDialog(selectableApps, window);

      appChooserDialog.connect("app-selected", (_source, appId) => {
        settings.set_string("terminal-id", appId);

        const newSelectedTerminalEmulator = Gio.DesktopAppInfo.new(appId);
        applicationIDRow.set_subtitle(newSelectedTerminalEmulator.get_id());

        const appIconString =
          newSelectedTerminalEmulator.get_icon()?.to_string() ?? "icon-missing";

        gtkIcon.clear();
        gtkIcon.set_from_gicon(Gio.icon_new_for_string(appIconString));

        const settingsArgsMap =
          settings.get_value("launch-args-map").deep_unpack() || {};

        const currentSelectedAppArgs = settingsArgsMap[appId] || "";
        launchArgRow.text = currentSelectedAppArgs;
      });

      appChooserDialog.present();
    });

    const generalSettingsGroup = new Adw.PreferencesGroup();
    generalSettingsGroup.set_title(_("General"));
    generalSettingsGroup.set_name("general-settings-group");

    page.add(generalSettingsGroup);

    // Shortcut
    const shortcutId = "terminal-shortcut";
    const shortcutRow = new Adw.ActionRow({
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

    shortcutRow.connect("activated", () => {
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
        // @ts-ignore
        transient_for: page.get_root(),
        hide_on_close: true,
        width_request: 400,
        height_request: 300,
        resizable: false,
        content: toolbarView,
      });

      editor.add_controller(ctl);

      ctl.connect("key-pressed", (__, keyval, keycode, state) => {
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

    shortcutRow.add_suffix(shortcutLabel);
    shortcutRow.activatable_widget = shortcutLabel;
    generalSettingsGroup.add(shortcutRow);

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
      item_type: GenericObjectModel.$gtype,
    });

    const monitorScreens = getConnectedMonitorsList();

    for (const [idx, monitor] of monitorScreens.entries()) {
      const monitorScreen = new GenericObjectModel(
        // @ts-ignore
        `${monitor.description}`.toUpperCase(),
        // @ts-ignore
        idx
      );
      monitorScreenModel.append(monitorScreen);
    }
    const monitorRow = new Adw.ComboRow({
      title: _("Display"),
      subtitle: _("Which display should the terminal be rendered on"),
      model: monitorScreenModel,
      expression: Gtk.PropertyExpression.new(
        GenericObjectModel.$gtype,
        null,
        "name"
      ),
      selected: settings.get_int("monitor-screen"),
      sensitive:
        !settings.get_boolean("render-on-current-monitor") &&
        !settings.get_boolean("render-on-primary-monitor"),
    });

    generalSettingsGroup.add(monitorRow);

    monitorRow.connect("notify::selected", () => {
      settings.set_int("monitor-screen", monitorRow.selected);
    });

    // watch for render-on-current-monitor changes
    settings.connect("changed::render-on-current-monitor", () => {
      // set render-on-primary-monitor to false when render-on-current-monitor was set to true
      if (
        settings.get_boolean("render-on-current-monitor") &&
        settings.get_boolean("render-on-primary-monitor")
      ) {
        settings.set_boolean("render-on-primary-monitor", false);
      }
      // disable selecting a monitor screen
      monitorRow.set_sensitive(
        !settings.get_boolean("render-on-current-monitor")
      );
    });

    // watch for render-on-primary-monitor changes
    settings.connect("changed::render-on-primary-monitor", () => {
      // set render-on-current-monitor to false when render-on-primary-monitor was set to true
      if (
        settings.get_boolean("render-on-primary-monitor") &&
        settings.get_boolean("render-on-current-monitor")
      ) {
        settings.set_boolean("render-on-current-monitor", false);
      }
      // disable selecting a monitor screen
      monitorRow.set_sensitive(
        !settings.get_boolean("render-on-primary-monitor")
      );
    });

    // Animation Time
    const animationTime = new Adw.SpinRow({
      title: _("Animation Time"),
      subtitle: _("Duration of the dropdown animation in milliseconds"),
      adjustment: new Gtk.Adjustment({
        lower: 0,
        step_increment: 5,
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
        step_increment: 5,
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
        step_increment: 5,
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
      item_type: GenericObjectModel.$gtype,
    });

    ["Left", "Right", "Center"].forEach((hAlign, idx) => {
      // @ts-ignore
      const horizontalAlignment = new GenericObjectModel(hAlign, idx);
      horizontalAlignmentModel.append(horizontalAlignment);
    });

    const horizontalAlignmentRow = new Adw.ComboRow({
      title: _("Horizontal Alignment"),
      subtitle: _("Control the value for horizontal alignment"),
      model: horizontalAlignmentModel,
      expression: Gtk.PropertyExpression.new(
        GenericObjectModel.$gtype,
        null,
        "name"
      ),
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

    // Skip taskbar
    const skipTaskbarRow = new Adw.SwitchRow({
      title: _("Hide In Certain Modes"),
      subtitle: _(
        "When enabled, the terminal window will not appear in overview mode or when using Alt+Tab."
      ),
    });
    positionSettingsGroup.add(skipTaskbarRow);

    settings.bind(
      "skip-taskbar",
      skipTaskbarRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT
    );

    window.add(page);
    return Promise.resolve();
  }
}
