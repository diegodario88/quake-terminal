import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as Util from "./util.js";

const STARTUP_TIMER_IN_SECONDS = 5;

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
    this._internalState = Util.TERMINAL_STATE.READY;
    this._sourceTimeoutLoopId = null;
    this._terminalWindowUnmanagedId = null;
    this._terminalWindowFocusId = null;
    this._terminalWindow = null;

    /** We will monkey-patch this method. Let's store the original one. */
    this._original_shouldAnimateActor = Main.wm._shouldAnimateActor;

    // Enhance the close animation behavior when exiting
    this._configureActorCloseAnimation();

    if (this._terminal.state === Util.SHELL_APP_STATE.RUNNING) {
      this._internalState = Util.TERMINAL_STATE.RUNNING;
    }

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

    const skipTaskbarSettingsId = settings.connect(
      "changed::skip-taskbar",
      () => {
        this._configureSkipTaskbarProperty();
      }
    );

    this._settingsWatchingListIds.push(skipTaskbarSettingsId);
  }

  get terminalWindow() {
    if (!this._terminal) {
      return null;
    }

    if (!this._terminalWindow) {
      this._terminalWindow = this._terminal.get_windows()[0];
    }

    return this._terminalWindow;
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

  get monitorDisplayScreenIndex() {
    if (this._settings.get_boolean("render-on-current-monitor")) {
      return global.display.get_current_monitor();
    }

    if (this._settings.get_boolean("render-on-primary-monitor")) {
      return global.display.get_primary_monitor();
    }

    const userSelectionDisplayIndex = this._settings.get_int("monitor-screen");
    const availableDisplaysIndexes = global.display.get_n_monitors() - 1;

    if (
      userSelectionDisplayIndex >= 0 &&
      userSelectionDisplayIndex <= availableDisplaysIndexes
    ) {
      return userSelectionDisplayIndex;
    }

    return global.display.get_primary_monitor();
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
    this._terminalWindow = null;
    this._internalState = Util.TERMINAL_STATE.DEAD;
    Main.wm._shouldAnimateActor = this._original_shouldAnimateActor;
  }

  /**
   * Toggles the visibility of the terminal window with animations.
   * @returns {Promise<void>} A promise that resolves when the toggle operation is complete.
   */
  async toggle() {
    if (
      this._internalState === Util.TERMINAL_STATE.READY ||
      this._terminal.state === Util.SHELL_APP_STATE.STOPPED
    ) {
      try {
        await this._launchTerminalWindow();
        this._adjustTerminalWindowPosition();
      } catch (error) {
        console.error(error);
        this.destroy();
      }
    }

    if (
      this._internalState !== Util.TERMINAL_STATE.RUNNING ||
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
    this._internalState = Util.TERMINAL_STATE.STARTING;

    if (!this._terminal) {
      return Promise.reject(Error("Quake-Terminal - Terminal App is null"));
    }

    const promiseTerminalWindowInLessThanFiveSeconds = new Promise(
      (resolve, reject) => {
        const shellAppWindowsChangedHandler = () => {
          GLib.Source.remove(this._sourceTimeoutLoopId);
          this._sourceTimeoutLoopId = null;

          if (!this._terminal) {
            return reject(
              Error(
                "Quake-Terminal - Something destroyed the internal reference of terminal app"
              )
            );
          }
          if (this._terminal.get_n_windows() < 1) {
            return reject(
              Error(
                `Quake-Terminal - App '${this._terminal.id}' is launched but no windows`
              )
            );
          }

          this._terminalWindow = this._terminal.get_windows()[0];

          // Keeps the Terminal out of Overview mode and Alt-Tab window switching
          this._configureSkipTaskbarProperty();

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

        const windowsChangedSignalConnector = Util.once(
          this._terminal,
          "windows-changed",
          shellAppWindowsChangedHandler
        );

        this._connectedSignals.push(windowsChangedSignalConnector);

        this._sourceTimeoutLoopId = Util.setTimeoutAndRejectOnExpiration(
          STARTUP_TIMER_IN_SECONDS,
          reject,
          `Quake-Terminal: Timeout reached after ${STARTUP_TIMER_IN_SECONDS} seconds while trying to open the Quake terminal`
        );

        this._terminal.open_new_window(-1);
      }
    );

    return promiseTerminalWindowInLessThanFiveSeconds;
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
    this.terminalWindow.stick();

    const mapSignalHandler = (sig, wm, metaWindowActor) => {
      if (metaWindowActor !== this.actor) {
        return;
      }

      // This code should run exclusively during the initial creation of the terminal application
      // to ensure an immediate disconnection, we turn off the signal.
      sig.off();

      // Since our terminal application has his own "drop-down" showing animation, we must get rid of any other effect
      // that the windows have when they are created.
      wm.emit("kill-window-effects", this.actor);

      /**
       * Listens once for the `Clutter.Actor::stage-views-changed` signal, which should be emitted
       * right before the terminal resizing is complete. Even if the terminal does not need to be
       * resized, this signal should be emitted correctly by Mutter.
       *
       * @see https://mutter.gnome.org/clutter/signal.Actor.stage-views-changed.html
       */
      const stageViewsChangedSignalConnector = Util.once(
        this.actor,
        "stage-views-changed",
        () => {
          this._internalState = Util.TERMINAL_STATE.RUNNING;
          this.actor.remove_clip();
          this._showTerminalWithAnimationTopDown();
        }
      );

      this._connectedSignals.push(stageViewsChangedSignalConnector);
      this._fitTerminalToMainMonitor();
    };

    const mapSignalConnector = Util.on(
      global.window_manager,
      "map",
      mapSignalHandler
    );

    this._connectedSignals.push(mapSignalConnector);
  }

  _shouldAvoidAnimation() {
    if (this._internalState !== Util.TERMINAL_STATE.RUNNING) {
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
      duration: this._settings.get_int("animation-time"),
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

    this.actor.ease({
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      translation_y: this.actor.height * -1,
      duration: this._settings.get_int("animation-time"),
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
    const monitorDisplayScreenIndex = this.monitorDisplayScreenIndex;
    const area = this.terminalWindow.get_work_area_for_monitor(
      monitorDisplayScreenIndex
    );

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

    this.terminalWindow.move_to_monitor(monitorDisplayScreenIndex);

    this.terminalWindow.move_resize_frame(
      false,
      terminalX,
      area.y,
      terminalWidth,
      terminalHeight
    );
  }

  _configureSkipTaskbarProperty() {
    const terminalWindow = this.terminalWindow;
    const shouldSkipTaskbar = this._settings.get_boolean("skip-taskbar");

    Object.defineProperty(terminalWindow, "skip_taskbar", {
      get() {
        if (terminalWindow && shouldSkipTaskbar) {
          return true;
        }

        return this.is_skip_taskbar();
      },
      configurable: true,
    });
  }

  _configureActorCloseAnimation() {
    /** We will use `self` to refer to the extension inside the patched method. */
    const self = this;

    Main.wm._shouldAnimateActor = function (actor, types) {
      const stack = new Error().stack;
      const forClosing = stack.includes("_destroyWindow@");

      /**
       * We specifically handle window closing events, but only when our actor is the target.
       * For all other cases, the original behavior remains in effect.
       */
      if (!forClosing || actor !== self.actor) {
        return self._original_shouldAnimateActor.apply(this, [actor, types]);
      }

      /** Store the original ease() method of the terminal actor. */
      const originalActorEase = actor.ease;

      /**
       * Intercept the next call to actor.ease() to perform a custom bottom-up close animation.
       * Afterward, immediately restore the original behavior.
       */
      actor.ease = function () {
        actor.ease = originalActorEase;

        actor.ease({
          mode: Clutter.AnimationMode.EASE_OUT_QUAD,
          translation_y: actor.height * -1,
          duration: self._settings.get_int("animation-time"),
          onComplete: () => {
            Main.wm._destroyWindowDone(global.window_manager, actor);
          },
        });
      };

      return true;
    };
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
