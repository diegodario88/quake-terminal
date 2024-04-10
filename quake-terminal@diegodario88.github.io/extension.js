/*
 * Quake Terminal for GNOME Shell 45+
 * Copyright 2024 Diego Dario
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * If this extension breaks your desktop you get to keep all of the pieces...
 */

import Meta from "gi://Meta";
import Shell from "gi://Shell";
import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { TERMINAL_STATE } from "./util.js";
import { QuakeMode } from "./quake-mode.js";

export default class TogglerExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._appSystem = Shell.AppSystem.get_default();
    this._quakeMode = null;

    Main.wm.addKeybinding(
      "terminal-shortcut",
      this._settings,
      Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
      Shell.ActionMode.NORMAL |
        Shell.ActionMode.OVERVIEW |
        Shell.ActionMode.POPUP,
      () => this._handleQuakeModeTerminal()
    );
  }

  disable() {
    Main.wm.removeKeybinding("terminal-shortcut");

    if (this._quakeMode) {
      this._quakeMode.destroy();
    }

    this._settings = null;
    this._appSystem = null;
    this._quakeMode = null;
  }

  _handleQuakeModeTerminal() {
    if (
      !this._quakeMode ||
      this._quakeMode._internalState === TERMINAL_STATE.DEAD
    ) {
      const terminalId = this._settings.get_string("terminal-id");

      if (!terminalId) {
        Main.notify(_(`Select an application in Quake Terminal preferences.`));
        return;
      }

      const terminal = this._appSystem.lookup_app(terminalId);

      if (!terminal) {
        Main.notify(_(`No terminal found with id ${terminalId}. Skipping ...`));
        return;
      }

      this._quakeMode = new QuakeMode(terminal, this._settings);
      return this._quakeMode.toggle();
    }

    return this._quakeMode.toggle();
  }
}
