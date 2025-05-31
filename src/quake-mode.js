import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Shell from "gi://Shell";
import Meta from "gi://Meta";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

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
  static LIFECYCLE = {
    READY: "READY",
    STARTING: "STARTING",
    CREATED_ACTOR: "CREATED_ACTOR",
    RUNNING: "RUNNING",
    DEAD: "DEAD",
  };

  /**
   * Creates a new QuakeMode instance.
   *
   * @param {Shell.App} terminal - The terminal application instance.
   * @param {Gio.Settings} settings - The Gio.Settings object for configuration.
   */
  constructor(terminal, settings) {
    console.log(
      `*** QuakeTerminal@constructor - IsWayland = ${Meta.is_wayland_compositor()} ***`
    );
    console.log(
      `*** QuakeTerminal@constructor - Terminal App = ${terminal.get_name()} ***`
    );

    /**
     *@type {Shell.App}
     */
    this._terminal = terminal;
    this._settings = settings;
    this._internalState = QuakeMode.LIFECYCLE.READY;

    this._sourceTimeoutLoopId = null;
    this._terminalWindowUnmanagedId = null;
    this._terminalWindowFocusId = null;
    this._wmMapSignalId = null;
    this._terminalChangedId = null;
    this._actorStageViewChangedId = null;

    /**
     *@type {Meta.Window}
     */
    this._terminalWindow = null;
    this._isTaskbarConfigured = null;

    /** We will monkey-patch this method. Let's store the original one. */
    // @ts-ignore
    this._original_shouldAnimateActor = Main.wm._shouldAnimateActor;

    // Enhance the close animation behavior when exiting
    this._configureActorCloseAnimation();

    /**
     * Stores the IDs of settings signal handlers.
     *
     * @type {number[]}
     */
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
      console.log(
        `*** QuakeTerminal@terminalWindow - There's no terminal application ***`
      );
      console.log(
        `*** QuakeTerminal@terminalWindow - Current state ${this._internalState}  ***`
      );
      return null;
    }

    if (!this._terminalWindow) {
      console.log(
        `*** QuakeTerminal@terminalWindow - There's no WindowActor, finding one ... ***`
      );
      let ourWindow = this._terminal.get_windows().find((w) => {
        /**
         * The window actor for this terminal window.
         *
         * @type {Meta.WindowActor & { ease: Function }}
         */
        const actor = w.get_compositor_private();
        return actor.get_name() === "quake-terminal" && w.is_alive;
      });

      if (!ourWindow) {
        return null;
      }

      this._terminalWindow = ourWindow;
      if (!this._terminalWindowUnmanagedId) {
        this._terminalWindowUnmanagedId = this._terminalWindow.connect(
          "unmanaged",
          () => {
            console.log(
              `*** QuakeTerminal@Unmanaged Called unmanaged after suspend or lockscreen ***`
            );
            this.destroy();
          }
        );
      }
    }

    return this._terminalWindow;
  }

  get actor() {
    if (!this.terminalWindow) {
      console.log(`*** QuakeTerminal@actor - There's no terminalWindow ***`);
      return null;
    }

    /**
     * The window actor for this terminal window.
     *
     * @type {Meta.WindowActor & { ease: Function }}
     */
    const actor = this.terminalWindow.get_compositor_private();

    if (!actor) {
      console.log(`*** QuakeTerminal@actor - There's no actor ***`);
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
      return Shell.Global.get().display.get_current_monitor();
    }

    if (this._settings.get_boolean("render-on-primary-monitor")) {
      return Shell.Global.get().display.get_primary_monitor();
    }

    const userSelectionDisplayIndex = this._settings.get_int("monitor-screen");
    const availableDisplaysIndexes =
      Shell.Global.get().display.get_n_monitors() - 1;

    if (
      userSelectionDisplayIndex >= 0 &&
      userSelectionDisplayIndex <= availableDisplaysIndexes
    ) {
      return userSelectionDisplayIndex;
    }

    return Shell.Global.get().display.get_primary_monitor();
  }

  destroy() {
    console.log(`*** QuakeTerminal@destroy - Starting destroy action ***`);
    if (this._sourceTimeoutLoopId) {
      GLib.Source.remove(this._sourceTimeoutLoopId);
      this._sourceTimeoutLoopId = null;
    }

    if (this._settingsWatchingListIds.length && this._settings) {
      this._settingsWatchingListIds.forEach((id) => {
        this._settings.disconnect(id);
      });
    }

    if (this.actor && this._actorStageViewChangedId) {
      this.actor.disconnect(this._actorStageViewChangedId);
      this._actorStageViewChangedId = null;
    }

    if (this._terminalWindowUnmanagedId && this.terminalWindow) {
      this.terminalWindow.disconnect(this._terminalWindowUnmanagedId);
      this._terminalWindowUnmanagedId = null;
    }

    if (this._terminalChangedId && this._terminal) {
      this._terminal.disconnect(this._terminalChangedId);
      this._terminalChangedId = null;
    }

    if (this._terminalWindowFocusId) {
      Shell.Global.get().display.disconnect(this._terminalWindowFocusId);
      this._terminalWindowFocusId = null;
    }

    if (this._wmMapSignalId) {
      Shell.Global.get().window_manager.disconnect(this._wmMapSignalId);
      this._wmMapSignalId = null;
    }

    this._settingsWatchingListIds = [];
    this._terminal = null;
    this._terminalWindow = null;
    this._internalState = QuakeMode.LIFECYCLE.DEAD;
    this._isTaskbarConfigured = null;
    // @ts-ignore
    Main.wm._shouldAnimateActor = this._original_shouldAnimateActor;
  }

  /**
   * Toggles the visibility of the terminal window with animations.
   *
   * @returns {Promise<void>} A promise that resolves when the toggle operation is complete.
   */
  async toggle() {
    if (!this.terminalWindow) {
      try {
        await this._launchTerminalWindow();
        this._adjustTerminalWindowPosition();
      } catch (error) {
        console.log(`*** QuakeTerminal@toggle - Catch error ${error} ***`);
        this.destroy();
        return;
      }
    }

    if (!this._isTaskbarConfigured) {
      this._configureSkipTaskbarProperty();
    }

    if (this.terminalWindow.has_focus()) {
      return this._hideTerminalWithAnimationBottomUp();
    }

    if (this.terminalWindow.is_hidden()) {
      return this._showTerminalWithAnimationTopDown();
    }

    console.log(this.terminalWindow.get_pid);

    Main.activateWindow(this.terminalWindow);
  }

  /**
   * Launches the terminal window and sets up event handlers.
   *
   * @returns {Promise<boolean>} A promise that resolves when the terminal window is ready.
   */
  _launchTerminalWindow() {
    this._internalState = QuakeMode.LIFECYCLE.STARTING;

    if (!this._terminal) {
      return Promise.reject(Error("Quake-Terminal - Terminal App is null"));
    }

    const info = this._terminal.get_app_info();
    console.log(
      `*** QuakeTerminal@_launchTerminalWindow - launching a new window for terminal ${info.get_name()}  ***`
    );
    const launchArgsMap =
      this._settings.get_value("launch-args-map").deep_unpack() || {};

    const launchArgs = launchArgsMap[info.get_id()] || "";
    const cancellable = new Gio.Cancellable();

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

          if (this._internalState !== QuakeMode.LIFECYCLE.STARTING) {
            console.log(
              `*** QuakeTerminal@_launchTerminalWindow - Not in STARTING state, ignoring windows-changed signal ***`
            );

            this._terminal.disconnect(this._terminalChangedId);
            return;
          }

          if (this._terminal.get_n_windows() < 1) {
            return reject(
              Error(
                `Quake-Terminal - App '${this._terminal.id}' is launched but no windows`
              )
            );
          }

          const ourWindow = this._terminal.get_windows()[0];
          /**
           * The window actor for this terminal window.
           *
           * @type {Meta.WindowActor & { ease: Function }}
           */
          const actor = ourWindow.get_compositor_private();
          actor.set_name("quake-terminal");
          this._terminalWindow = ourWindow;
          this._internalState = QuakeMode.LIFECYCLE.CREATED_ACTOR;

          // Keeps the Terminal out of Overview mode and Alt-Tab window switching
          this._configureSkipTaskbarProperty();

          this._handleAlwaysOnTop();

          this._terminalWindowUnmanagedId = this.terminalWindow.connect(
            "unmanaged",
            () => {
              console.log(`*** QuakeTerminal@Unmanaged Called unmanaged ***`);
              this.destroy();
            }
          );

          this._terminalWindowFocusId = Shell.Global.get().display.connect(
            "notify::focus-window",
            () => {
              this._handleHideOnFocusLoss();
            }
          );
          resolve(true);
        };

        this._terminalChangedId = this._terminal.connect(
          "windows-changed",
          shellAppWindowsChangedHandler
        );

        const exec = info.get_string("Exec");
        let fullCommand = `${exec} ${launchArgs}`;

        try {
          const [success, argv] = GLib.shell_parse_argv(fullCommand);
          if (success) {
            this._spawn(argv, cancellable).catch((e) => reject(e));
          } else {
            reject(Error(`Failed to parse command line args: ${fullCommand}`));
          }
        } catch (e) {
          reject(e);
        }

        this._sourceTimeoutLoopId = GLib.timeout_add_seconds(
          GLib.PRIORITY_DEFAULT,
          STARTUP_TIMER_IN_SECONDS,
          () => {
            cancellable.cancel();
            reject(
              Error(
                `Quake-Terminal: Timeout reached after ${STARTUP_TIMER_IN_SECONDS} seconds while trying to open the Quake terminal`
              )
            );
            return GLib.SOURCE_REMOVE;
          }
        );
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
      console.log(
        `*** QuakeTerminal@_adjustTerminalWindowPosition - No terminalWindow || actor ***`
      );
      return;
    }

    // @ts-ignore
    this.actor.set_clip(0, 0, this.actor.width, 0);
    this.terminalWindow.stick();

    const mapSignalHandler = (
      /** @type {Shell.WM} */ wm,
      /** @type {Meta.WindowActor} */ metaWindowActor
    ) => {
      if (metaWindowActor !== this.actor) {
        console.log(
          `*** QuakeTerminal@mapSignalHandler - ${metaWindowActor.get_name()} is not our actor, skipping. ***`
        );
        return;
      }

      // This code should run exclusively during the initial creation of the terminal application
      // to ensure an immediate disconnection, we turn off the signal.
      Shell.Global.get().window_manager.disconnect(this._wmMapSignalId);
      this._wmMapSignalId = null;

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
      this._actorStageViewChangedId = this.actor.connect(
        "stage-views-changed",
        () => {
          console.log(
            `*** QuakeTerminal@_adjustTerminalWindowPosition - State ${this._internalState} ***`
          );

          if (this._internalState !== QuakeMode.LIFECYCLE.CREATED_ACTOR) {
            console.log(
              `*** QuakeTerminal@_adjustTerminalWindowPosition - Not in CREATED_ACTOR state, ignoring stage-views-changed signal ***`
            );
            this.actor.disconnect(this._actorStageViewChangedId);
            this._actorStageViewChangedId = null;
            return;
          }

          this._internalState = QuakeMode.LIFECYCLE.RUNNING;
          this.actor.remove_clip();
          this._showTerminalWithAnimationTopDown();
        }
      );

      this._fitTerminalToMainMonitor();
    };

    this._wmMapSignalId = Shell.Global.get().window_manager.connect(
      "map",
      mapSignalHandler
    );
  }

  _shouldAvoidAnimation() {
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

    this._isTaskbarConfigured = true;
  }

  _configureActorCloseAnimation() {
    /** We will use `self` to refer to the extension inside the patched method. */
    const self = this;

    // @ts-ignore
    Main.wm._shouldAnimateActor = function (
      /**
       * @type {Meta.WindowActor & { ease: Function }}
       */
      actor,
      /** @type {any} */ types
    ) {
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
      const originalActorAnimate = actor.ease;

      /**
       * Intercept the next call to actor.animate() to perform a custom bottom-up close animation.
       * Afterward, immediately restore the original behavior.
       */
      actor.ease = function () {
        actor.ease = originalActorAnimate;

        originalActorAnimate.call(actor, {
          mode: Clutter.AnimationMode.EASE_OUT_QUAD,
          translation_y: actor.height * -1,
          duration: self._settings.get_int("animation-time"),
          onComplete: () => {
            // @ts-ignore
            Main.wm._destroyWindowDone(Main.wm._shellwm, actor);
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

    const focusedWindow = Shell.Global.get().display.focus_window;

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

  /**
   * Execute a command asynchronously and check the exit status.
   *
   * If given, @cancellable can be used to stop the process before it finishes.
   *
   * @param {string[]} argv - a list of string arguments
   * @param {Gio.Cancellable} [cancellable] - optional cancellable object
   * @returns {Promise<void>} - The process success
   */
  async _spawn(argv, cancellable = null) {
    let cancelId = 0;
    const proc = new Gio.Subprocess({
      argv,
      flags: Gio.SubprocessFlags.NONE,
    });
    proc.init(cancellable);

    if (cancellable instanceof Gio.Cancellable)
      cancelId = cancellable.connect(() => proc.force_exit());

    try {
      const success = await proc.wait_check_async(null);

      if (!success) {
        const status = proc.get_exit_status();

        throw new Gio.IOErrorEnum({
          code: Gio.IOErrorEnum.FAILED,
          message: `Command '${argv}' failed with exit code ${status}`,
        });
      }
    } finally {
      if (cancelId > 0) cancellable.disconnect(cancelId);
    }
  }
};
