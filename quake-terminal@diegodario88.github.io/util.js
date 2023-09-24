export class Signal {
	constructor(target, name, cb) {
		this.name = name;
		this.target = target;

		this.id = target.connect(name, (...args) => cb(this, ...args));
	}
	off() {
		this.target.disconnect(this.id);
	}
}

export function on(target, signal_name, cb) {
	return new Signal(target, signal_name, cb);
}

export function once(target, signal_name, cb) {
	let disconnected = false;
	return new Signal(target, signal_name, (signal, ...args) => {
		if (disconnected) {
			return;
		}

		disconnected = true;
		signal.off();
		cb(...args);
	});
}
