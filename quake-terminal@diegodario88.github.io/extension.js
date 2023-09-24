/*
 * Quake Terminal for GNOME Shell 45+
 * Copyright 2023 Diego Dario
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
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { QuakeMode } from "./quake-mode.js";

export default class TogglerExtension extends Extension {
	enable() {
		this._settings = this.getSettings();
		const terminalId = this._settings.get_string("terminal-id");
		const appSys = Shell.AppSystem.get_default();
		const terminal = appSys.lookup_app(terminalId);

		if (!terminal) {
			console.warn(`No terminal found with id ${id}. Skipping ...`);
			return;
		}

		this._quakeMode = new QuakeMode(terminal);

		Main.wm.addKeybinding(
			"terminal-shortcut",
			this._settings,
			Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
			Shell.ActionMode.NORMAL |
				Shell.ActionMode.OVERVIEW |
				Shell.ActionMode.POPUP,
			() => this._quakeMode.toggle()
		);
	}

	disable() {
		Main.wm.removeKeybinding("terminal-shortcut");
		this._settings = null;
		this._quakeMode = null;
	}
}
