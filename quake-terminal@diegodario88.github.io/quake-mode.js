import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Workspace } from "resource:///org/gnome/shell/ui/workspace.js";
import { on, once, TERMINAL_STATE } from "./util.js";

const ANIMATION_TIME_IN_MILLISECONDS = 250;

/**
 * Quake Mode Module
 *
 * This module provides a Quake mode for managing a terminal window with animations and specific behavior.
 * It allows showing and hiding a terminal window with animation effects.
 *
 * @module QuakeMode
 */
export const QuakeMode = class {
	constructor(terminal) {
		this._terminal = terminal;
		this._isTransitioning = false;
		this._internalState = TERMINAL_STATE.READY;
		this._sourceTimeoutLoopId = null;
		this._terminalWindowUnmanagedId = null;

		/**
		 * An array that stores signal connections. Used to disconnect when destroy (disable) is called.
		 * @type {Array<import("./util.js").SignalConnector>}
		 */
		this._connectedSignals = [];
	}

	get terminalWindow() {
		if (!this._terminal) {
			return null;
		}

		return this._terminal.get_windows()[0];
	}

	get actor() {
		if (!this.terminalWindow) {
			return null;
		}

		const actor = this.terminalWindow.get_compositor_private();

		if (!actor) {
			return null;
		}

		if ("clip_y" in actor) {
			return actor;
		}

		Object.defineProperty(actor, "clip_y", {
			get() {
				return this.clip_rect.origin.y;
			},
			set(y) {
				const rect = this.clip_rect;
				this.set_clip(rect.origin.x, y, rect.size.width, rect.size.height);
			},
		});

		return actor;
	}

	destroy() {
		if (this._sourceTimeoutLoopId) {
			GLib.Source.remove(this._sourceTimeoutLoopId);
			this._sourceTimeoutLoopId = null;
		}

		if (this._terminalWindowUnmanagedId && this.terminalWindow) {
			this.terminalWindow.disconnect(this._terminalWindowUnmanagedId);
			this._terminalWindowUnmanagedId = null;
		}

		this._connectedSignals.forEach((s) => s.off());
		this._connectedSignals = [];
		this._terminal = null;
		this._isTransitioning = false;
		this._internalState = TERMINAL_STATE.DEAD;
	}

	/**
	 * Toggles the visibility of the terminal window with animations.
	 * @returns {Promise<void>} A promise that resolves when the toggle operation is complete.
	 */
	async toggle() {
		if (this._internalState === TERMINAL_STATE.READY) {
			try {
				await this._launchTerminalWindow();
				this._adjustTerminalWindowPosition();
			} catch (error) {
				this.destroy();
				console.error(error);
			} finally {
				return;
			}
		}

		if (
			this._internalState !== TERMINAL_STATE.RUNNING ||
			!this.terminalWindow
		) {
			return;
		}

		if (this.terminalWindow.has_focus()) {
			return this._hideTerminalWithAnimationBottomUp();
		}

		if (this.terminalWindow.is_hidden()) {
			return this._showTerminalWithAnimationTopDown();
		}

		Main.activateWindow(this.terminalWindow);
	}

	/**
	 * Launches the terminal window and sets up event handlers.
	 * @returns {Promise<boolean>} A promise that resolves when the terminal window is ready.
	 */
	_launchTerminalWindow() {
		this._internalState = TERMINAL_STATE.STARTING;
		this._terminal.open_new_window(-1);

		return new Promise((resolve, reject) => {
			const shellAppWindowsChangedHandler = () => {
				GLib.Source.remove(this._sourceTimeoutLoopId);
				this._sourceTimeoutLoopId = null;

				if (this._terminal.get_n_windows() < 1) {
					return reject(
						`app '${this._terminal.id}' is launched but no windows`
					);
				}

				this._setupTerminalWindowAlwaysAboveOthers();
				this._setupOverrideWorkspaceOverviewToHideTerminalWindow();

				this._terminalWindowUnmanagedId = this.terminalWindow.connect(
					"unmanaged",
					() => this.destroy()
				);

				resolve(true);
			};

			const windowsChangedSignalConnector = once(
				this._terminal,
				"windows-changed",
				shellAppWindowsChangedHandler
			);

			this._connectedSignals.push(windowsChangedSignalConnector);

			this._sourceTimeoutLoopId = GLib.timeout_add_seconds(
				GLib.PRIORITY_DEFAULT,
				5,
				() => {
					reject(new Error(`launch '${this._terminal.id}' timeout`));
					return GLib.SOURCE_REMOVE;
				}
			);
		});
	}

	/**
	 * Adjusts the terminal window's initial position and handles signal connections related
	 * to window mapping and sizing.
	 */
	_adjustTerminalWindowPosition() {
		this.actor.set_clip(0, 0, this.actor.width, 0);
		this.terminalWindow.stick();

		const mapSignalHandler = (sig, wm, metaWindowActor) => {
			if (metaWindowActor !== this.actor) {
				return;
			}

			sig.off();
			wm.emit("kill-window-effects", this.actor);

			/**
			 * Listens once for the `size-changed(Meta.Window)` signal, which is emitted when the size of the toplevel
			 * window has changed, or when the size of the client window has changed.
			 */
			const sizeChangedSignalConnector = once(
				this.terminalWindow,
				"size-changed",
				() => {
					this._internalState = TERMINAL_STATE.RUNNING;
					this.actor.remove_clip();
					this._showTerminalWithAnimationTopDown();
				}
			);

			this._connectedSignals.push(sizeChangedSignalConnector);
			this._fitTerminalToMainMonitor();
		};

		const mapSignalConnector = on(
			global.window_manager,
			"map",
			mapSignalHandler
		);

		this._connectedSignals.push(mapSignalConnector);
	}

	_shouldAvoidAnimation() {
		if (this._internalState !== TERMINAL_STATE.RUNNING) {
			return true;
		}

		if (this._isTransitioning) {
			return true;
		}

		return false;
	}

	_showTerminalWithAnimationTopDown() {
		if (this._shouldAvoidAnimation()) {
			return;
		}

		const parent = this.actor.get_parent();

		if (!parent) {
			return;
		}

		this._isTransitioning = true;
		parent.set_child_above_sibling(this.actor, null);
		this.actor.translation_y = this.actor.height * -1;

		Main.wm.skipNextEffect(this.actor);
		Main.activateWindow(this.actor.meta_window);

		this.actor.ease({
			mode: Clutter.AnimationMode.EASE_IN_QUAD,
			translation_y: 0,
			duration: ANIMATION_TIME_IN_MILLISECONDS,
			onComplete: () => {
				this._isTransitioning = false;
			},
		});

		this._fitTerminalToMainMonitor();
	}

	_hideTerminalWithAnimationBottomUp() {
		if (this._shouldAvoidAnimation()) {
			return;
		}

		this.isTransition = true;

		this.actor.ease({
			mode: Clutter.AnimationMode.EASE_OUT_QUAD,
			translation_y: this.actor.height * -1,
			duration: ANIMATION_TIME_IN_MILLISECONDS,
			onComplete: () => {
				Main.wm.skipNextEffect(this.actor);
				this.actor.meta_window.minimize();
				this.actor.translation_y = 0;
				this._isTransitioning = false;
			},
		});
	}

	_fitTerminalToMainMonitor() {
		const mainMonitorScreen = global.display.get_n_monitors() - 1;
		const area =
			this.terminalWindow.get_work_area_for_monitor(mainMonitorScreen);

		this.terminalWindow.move_to_monitor(mainMonitorScreen);

		this.terminalWindow.move_resize_frame(
			false,
			area.x,
			area.y,
			area.width,
			area.height
		);
	}

	_setupTerminalWindowAlwaysAboveOthers() {
		this.terminalWindow.make_above();
	}

	_setupOverrideWorkspaceOverviewToHideTerminalWindow() {
		const matchTerminalWindow = (window) => this.terminalWindow === window;

		Workspace.prototype._isOverviewWindow = (window) => {
			if (matchTerminalWindow(window)) {
				return false;
			}

			return !window.skip_taskbar;
		};
	}
};
