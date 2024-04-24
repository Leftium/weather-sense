// Wrapper for mittjs (https://npm.im/mitt).
//
// Differences from mittjs:
// - A single global emitter is re-used in instead of creating new instances.
// - Metadata automatically added to events.
// - Optionally logs events. (Configured via localStorage.debugEvents.)
// - Unsupported: all, off().

import mitt, { type Handler, type EventType } from 'mitt';
import { gg } from '$lib/gg';

const storage =
	typeof localStorage !== 'undefined' ? localStorage : { getItem: () => '', setItem: () => null };

// Based on: https://github.com/debug-js/debug/blob/master/src/common.js

// A namespace is a list of names to check against separated by commas/whitespace.
// The `*` wildcard matches anything.
// Prepending `-` to a name skips them.
// Returns a function that tests if a given string name is in the namespace.
export function makeNamespace(localStorageKey = 'debug') {
	let namespaces = storage.getItem(localStorageKey);

	const names: RegExp[] = [];
	const skips: RegExp[] = [];

	let i;
	const split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
	const len = split.length;

	for (i = 0; i < len; i++) {
		if (!split[i]) {
			// ignore empty strings
			continue;
		}

		namespaces = split[i].replace(/\*/g, '.*?');

		if (namespaces[0] === '-') {
			skips.push(new RegExp('^' + namespaces.slice(1) + '$'));
		} else {
			names.push(new RegExp('^' + namespaces + '$'));
		}
	}

	// Returns true if the given mode name is enabled, false otherwise.
	return function (name: string) {
		if (name[name.length - 1] === '*') {
			return true;
		}

		let i;
		let len;

		for (i = 0, len = skips.length; i < len; i++) {
			if (skips[i].test(name)) {
				return false;
			}
		}

		for (i = 0, len = names.length; i < len; i++) {
			if (names[i].test(name)) {
				return true;
			}
		}

		return false;
	};
}

// Abbreviates SvelteKit meta URLs.
function cleanMetaUrl(url: string) {
	return url.replace(/^.*?\/src\//i, '').replace(/\?t=[0-9]*$/, '');
}

const singletonEmitter = mitt();

const isLoggedEvent = makeNamespace('debugEvents');

export interface Emitter<Events extends Record<EventType, unknown>> {
	on<Key extends keyof Events>(type: Key, handler: Handler<Events[Key]>): void;

	emit<Key extends keyof Events>(type: Key, event: Events[Key]): void;
	emit<Key extends keyof Events>(type: undefined extends Events[Key] ? Key : never): void;
}

export function getEmitter<Events extends Record<EventType, unknown>>(
	source: string | { url: string }
): Emitter<Events> {
	if (typeof source != 'string' && source?.url) {
		source = cleanMetaUrl(source.url);
	}

	const emitter = singletonEmitter as Emitter<Events>;

	// Wrapper for mitt's emitter.emit():
	// - automatically adds params like .source.
	// - transforms params into full XState style event object.
	function emit<Key extends keyof Events>(eventType: Key, params?: Events[Key]) {
		const meta = {
			// ts: new Date(),
			target: '*',
			source,
			memo: []
		};

		// type EmitterEvent
		const event = {
			type: eventType,
			meta,
			params
		};

		// Param event: EmitterEvent technically wraps params: Events[Key]
		emitter.emit(eventType, event as Events[Key]);
	}

	// Wrapper for mitt's emitter.on()
	// - Saves unbind callback for semi-auto cleanup by destroy().
	function on<Key extends keyof Events>(eventType: Key, callback: Handler<Events[Key]>) {
		type EmitterEvent = {
			type: EventType;
			meta: Record<string, unknown>;
			params: Events[Key];
		};

		emitter.on(eventType, function (event) {
			if (typeof eventType === 'string' && isLoggedEvent(eventType)) {
				gg(event);
			}

			// Unwrap EmitterEvent
			callback((event as EmitterEvent).params);
		});
	}

	return { emit, on };
}
