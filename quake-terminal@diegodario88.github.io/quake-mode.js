import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Workspace } from "resource:///org/gnome/shell/ui/workspace.js";
import { on, once } from "./util.js";

const TERMINAL_STATE = {
	READY: Symbol("READY"),
	STARTING: Symbol("STARTING"),
	RUNNING: Symbol("RUNNING"),
	DEAD: Symbol("DEAD"),
};

const ANIMATION_TIME_IN_MILLISECONDS = 250;

export const QuakeMode = class {
	constructor(terminal) {
		this._terminal = terminal;
		this._isTransitioning = false;
		this._internalState = TERMINAL_STATE.READY;
	}

	get terminalWindow() {
		return this._terminal.get_windows()[0];
	}

	get actor() {
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
		this._internalState = TERMINAL_STATE.DEAD;
		this._terminal = null;
	}

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

	_launchTerminalWindow() {
		this._internalState = TERMINAL_STATE.STARTING;
		this._terminal.open_new_window(-1);

		return new Promise((resolve, reject) => {
			const shellAppWindowsChangedHandler = () => {
				GLib.source_remove(timer);

				if (this._terminal.get_n_windows() < 1) {
					return reject(
						`app '${this._terminal.id}' is launched but no windows`
					);
				}

				this._setupTerminalWindowAlwaysAboveOthers(true);
				this._setupOverrideWorkspaceOverviewToHideTerminalWindow();

				once(this.terminalWindow, "unmanaged", () => this.destroy());
				resolve(true);
			};

			const shellAppSignal = once(
				this._terminal,
				"windows-changed",
				shellAppWindowsChangedHandler
			);

			const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
				shellAppSignal.off();
				reject(new Error(`launch '${this._terminal.id}' timeout`));
				return true;
			});
		});
	}

	_adjustTerminalWindowPosition() {
		this.actor.set_clip(0, 0, this.actor.width, 0);
		this.terminalWindow.stick();

		const mapSignalHandler = (sig, wm, metaWindowActor) => {
			if (metaWindowActor !== this.actor) {
				return;
			}

			sig.off();
			wm.emit("kill-window-effects", this.actor);

			once(this.terminalWindow, "size-changed", () => {
				this._internalState = TERMINAL_STATE.RUNNING;
				this.actor.remove_clip();
				this._showTerminalWithAnimationTopDown();
			});

			this._fitTerminalToMainMonitor();
		};

		on(global.window_manager, "map", mapSignalHandler);
	}

	_showTerminalWithAnimationTopDown() {
		if (this._internalState !== TERMINAL_STATE.RUNNING) {
			return;
		}

		if (this._isTransitioning) {
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
			translation_y: 0,
			duration: ANIMATION_TIME_IN_MILLISECONDS,
			mode: Clutter.AnimationMode.EASE_OUT_QUART,
			onComplete: () => {
				this._isTransitioning = false;
			},
		});

		this._fitTerminalToMainMonitor();
	}

	_hideTerminalWithAnimationBottomUp() {
		if (this._internalState !== TERMINAL_STATE.RUNNING) {
			return;
		}

		if (this._isTransitioning) {
			return;
		}

		this.isTransition = true;

		this.actor.ease({
			translation_y: this.actor.height * -1,
			duration: ANIMATION_TIME_IN_MILLISECONDS,
			mode: Clutter.AnimationMode.EASE_IN_QUART,
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
