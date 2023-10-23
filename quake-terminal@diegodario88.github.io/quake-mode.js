import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { on, once, SHELL_APP_STATE, TERMINAL_STATE } from "./util.js";

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
	constructor(terminal, settings) {
		this._terminal = terminal;
		this._settings = settings;
		this._internalState = TERMINAL_STATE.READY;
		this._sourceTimeoutLoopId = null;
		this._terminalWindowUnmanagedId = null;
		this._terminalWindowFocusId = null;
		this.terminalWindow = undefined;

		/**
		 * An array that stores signal connections. Used to disconnect when destroy (disable) is called.
		 * @type {Array<import("./util.js").SignalConnector>}
		 */
		this._connectedSignals = [];
		this._settingsWatchingListIds = [];

		["vertical-size", "horizontal-size", "horizontal-alignment"].forEach(
			(prefAdjustment) => {
				const settingsId = settings.connect(
					`changed::${prefAdjustment}`,
					() => {
						this._fitTerminalToMainMonitor();
					}
				);

				this._settingsWatchingListIds.push(settingsId);
			}
		);

		const alwaysOnTopSettingsId = settings.connect(
			"changed::always-on-top",
			() => {
				this._handleAlwaysOnTop();
			}
		);

		this._settingsWatchingListIds.push(alwaysOnTopSettingsId);
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

		if (this._settingsWatchingListIds.length && this._settings) {
			this._settingsWatchingListIds.forEach((id) => {
				this._settings.disconnect(id);
			});
		}

		if (this._terminalWindowUnmanagedId && this.terminalWindow) {
			this.terminalWindow.disconnect(this._terminalWindowUnmanagedId);
			this._terminalWindowUnmanagedId = null;
		}

		if (this._terminalWindowFocusId && this.terminalWindow) {
			this.terminalWindow.disconnect(this._terminalWindowFocusId);
			this._terminalWindowFocusId = null;
		}

		this._connectedSignals.forEach((s) => s.off());
		this._connectedSignals = [];
		this._settingsWatchingListIds = [];
		this._terminal = null;
		this._internalState = TERMINAL_STATE.DEAD;
	}

	/**
	 * Toggles the visibility of the terminal window with animations.
	 * @returns {Promise<void>} A promise that resolves when the toggle operation is complete.
	 */
	async toggle() {
		if (
			this._internalState === TERMINAL_STATE.READY ||
			this._terminal.state === SHELL_APP_STATE.STOPPED
		) {
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

		if (!this._terminal) {
			return Promise.reject(new Error("No Terminal APP"));
		}


		return new Promise((resolve, reject) => {
			const shellAppWindowsChangedHandler = () => {
				GLib.Source.remove(this._sourceTimeoutLoopId);
				this._sourceTimeoutLoopId = null;

				if (this._terminal.get_n_windows() < 1) {
					return reject(
						`app '${this._terminal.id}' is launched but no windows`
					);
				}

				this.terminalWindow = this._terminal.get_windows()[0];

				this._setupHideFromOverviewAndAltTab();
				this._handleAlwaysOnTop();

				this._terminalWindowUnmanagedId = this.terminalWindow.connect(
					"unmanaged",
					() => this.destroy()
				);

				this._terminalWindowFocusId = global.display.connectObject(
					"notify::focus-window",
					() => {
						this._handleHideOnFocusLoss();
					}
				);

				resolve(true);
			};

			const windowsChangedSignalConnector = on(
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

			this._terminal.open_new_window(-1);
		});
	}

	/**
	 * Adjusts the terminal window's initial position and handles signal connections related
	 * to window mapping and sizing.
	 */
	_adjustTerminalWindowPosition() {
		if (!this.terminalWindow || !this.actor) {
			return;
		}

		this.actor.set_clip(0, 0, this.actor.width, 0);

		const mapSignalHandler = (sig, wm, metaWindowActor) => {
			if (metaWindowActor !== this.actor) {
				return;
			}

			// This code should run exclusively during the initial creation of the terminal application
			// to ensure an immediate disconnection, we turn off the signal.
			//sig.off();

			// Since our terminal application has his own "drop-down" showing animation, we must get rid of any other effect
			// that the windows have when they are created.
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

		if (!this.actor) {
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

		parent.set_child_above_sibling(this.actor, null);
		this.actor.translation_y = this.actor.height * -1;

		Main.wm.skipNextEffect(this.actor);
		Main.activateWindow(this.actor.meta_window);

		this.actor.ease({
			mode: Clutter.AnimationMode.EASE_IN_QUAD,
			translation_y: 0,
			duration: ANIMATION_TIME_IN_MILLISECONDS
		});

		this._fitTerminalToMainMonitor();
	}

	_hideTerminalWithAnimationBottomUp() {
		if (this._shouldAvoidAnimation()) {
			return;
		}

		this.actor.ease({
			mode: Clutter.AnimationMode.EASE_OUT_QUAD,
			translation_y: this.actor.height * -1,
			duration: ANIMATION_TIME_IN_MILLISECONDS,
			onComplete: () => {
				Main.wm.skipNextEffect(this.actor);
				this.actor.meta_window.minimize();
				this.actor.translation_y = 0;
			},
		});
	}

	_fitTerminalToMainMonitor() {
		if (!this.terminalWindow) {
			return;
		}

		let mainMonitorScreen = this._settings.get_int("monitor-screen");
		const maxNumberOfMonitors = global.display.get_n_monitors() - 1;

		if (mainMonitorScreen > maxNumberOfMonitors) {
			mainMonitorScreen = maxNumberOfMonitors;
		}

		const area =
			this.terminalWindow.get_work_area_for_monitor(mainMonitorScreen);

		const verticalSettingsValue = this._settings.get_int("vertical-size");
		const horizontalSettingsValue = this._settings.get_int("horizontal-size");

		const horizontalAlignmentSettingsValue = this._settings.get_int(
			"horizontal-alignment"
		);

		const terminalHeight = Math.round(
			(verticalSettingsValue * area.height) / 100
		);
		const terminalWidth = Math.round(
			(horizontalSettingsValue * area.width) / 100
		);

		const terminalX =
			area.x +
			Math.round(
				horizontalAlignmentSettingsValue &&
					(area.width - terminalWidth) / horizontalAlignmentSettingsValue
			);

		this.terminalWindow.move_to_monitor(mainMonitorScreen);

		this.terminalWindow.move_resize_frame(
			false,
			terminalX,
			area.y,
			terminalWidth,
			terminalHeight
		);
	}

	_setupHideFromOverviewAndAltTab() {
		const terminalWindow = this.terminalWindow;

		Object.defineProperty(terminalWindow, "skip_taskbar", {
			get() {
				if (terminalWindow) {
					return true;
				}

				return this.is_skip_taskbar();
			},
			configurable: true
		});
	}

	_handleHideOnFocusLoss() {
		const shouldAutoHide = this._settings.get_boolean("auto-hide-window");

		if (!shouldAutoHide) {
			return;
		}

		const focusedWindow = global.display.focus_window;

		if (!focusedWindow) {
			return;
		}

		if (focusedWindow === this.terminalWindow) {
			return;
		}

		this._hideTerminalWithAnimationBottomUp();
	}

	_handleAlwaysOnTop() {
		const shouldAlwaysOnTop = this._settings.get_boolean("always-on-top");

		if (!shouldAlwaysOnTop && !this.terminalWindow.is_above()) {
			return;
		}

		if (!shouldAlwaysOnTop && this.terminalWindow.is_above()) {
			this.terminalWindow.unmake_above();
			return;
		}

		this.terminalWindow.make_above();
	}
};
