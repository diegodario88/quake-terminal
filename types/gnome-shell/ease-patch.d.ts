/**
 * Workaround for https://github.com/gjsify/gnome-shell/issues/65.
 * FIXME: Remove this when that issue is fixed.
 */
import "@girs/gnome-shell/extensions/global";

declare module "@girs/clutter-16/clutter-16" {
  type PatchedActor = import("@girs/clutter-16").Clutter.Actor;

  export namespace Clutter {
    export interface Actor extends PatchedActor {}
  }
}

declare module "@girs/st-16/st-16" {
  type PatchedAdjustment = import("@girs/st-16").St.Adjustment;

  export namespace St {
    export interface Adjustment extends PatchedAdjustment {}
  }
}
