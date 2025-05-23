import GObject from "gi://GObject";

/**
 * Signal Connector
 *
 * This module defines a SignalConnector class and functions 'on' and 'once' for working with signals (or events) in JavaScript.
 * Signals allow objects to emit events, and the SignalConnector class helps manage event connections.
 *
 * - SignalConnector: A class that represents a signal connection. It connects to a target object's signal and provides a way to disconnect.
 * - on(target, signalName, handler): Function to subscribe to a signal and receive continuous updates when the signal is emitted.
 * - once(target, signalName, handler): Function to subscribe to a signal and automatically disconnect after the first emission.
 *
 * Example usage:
 * const myObject = createObjectWithSignals(); // Replace with your own object
 * const signalHandler = (signal, eventData) => {
 *   console.log(`Signal '${signal.name}' emitted with data: ${eventData}`);
 * };
 *
 * const connection = on(myObject, 'mySignal', signalHandler); // Subscribe to 'mySignal'
 * // To disconnect later: connection.off();
 *
 * const oneTimeConnection = once(myObject, 'anotherSignal', signalHandler); // Subscribe to 'anotherSignal' for a single emission
 *
 * @class SignalConnector
 * @module SignalConnector
 */
export class SignalConnector {
  /**
   * Connects a handler to a named signal on the target.
   *
   * @param {GObject.Object} target - The GObject instance to connect the signal to.
   * @param {string} name - The name of the signal.
   * @param {Function} handler - The function to handle the signal.
   */
  constructor(target, name, handler) {
    this.name = name;
    this.target = target;
    this.id = target.connect(name, (...args) => handler(this, ...args));
  }

  /**
   * Disconnects a handler from an instance so it will not be called during
   * any future or currently ongoing emissions of the signal it has been
   * connected to.
   *
   * The `handler_id` becomes invalid and may be reused.
   *
   * @function off
   * @returns {void}
   */
  off() {
    const matchedId = GObject.signal_handler_find(
      this.target,
      GObject.SignalMatchType.ID,
      this.id,
      null,
      null,
      null,
      null
    );

    if (matchedId) {
      this.target.disconnect(this.id);
    }
  }
}

/**
 * Subscribe to a signal for continuous updates.
 *
 * @function on
 * @param {GObject.Object} target - The GObject instance to connect the signal to.
 * @param {string} signalName - The name of the signal to subscribe to.
 * @param {Function} handler - The callback function to execute when the signal is emitted.
 * @returns {SignalConnector} - A SignalConnector instance representing the connection.
 */
export function on(target, signalName, handler) {
  const onSignal = new SignalConnector(target, signalName, handler);
  return onSignal;
}

/**
 * Subscribe to a signal for a single emission, automatically disconnecting afterward.
 *
 * @function once
 * @param {GObject.Object} target - The GObject instance to connect the signal to.
 * @param {string} signalName - The name of the signal to subscribe to.
 * @param {Function} handler - The callback function to execute when the signal is emitted.
 * @returns {SignalConnector} - A SignalConnector instance representing the connection.
 */
export function once(target, signalName, handler) {
  let disconnected = false;

  const signalOnceHandler = (
    /** @type {{ off: () => void; }} */ signal,
    /** @type {any[]} */ ...args
  ) => {
    // Ensure we run the callback only once
    if (disconnected) {
      return;
    }

    disconnected = true;
    signal.off(); // Disconnect the signal
    handler(...args);
  };

  const onceSignal = new SignalConnector(target, signalName, signalOnceHandler);

  return onceSignal;
}

export const TERMINAL_STATE = {
  READY: Symbol("READY"),
  STARTING: Symbol("STARTING"),
  RUNNING: Symbol("RUNNING"),
  DEAD: Symbol("DEAD"),
};

export const SHELL_APP_STATE = {
  STOPPED: 0,
  STARTING: 1,
  RUNNING: 2,
};
