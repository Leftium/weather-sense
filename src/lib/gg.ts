import debugFactory from 'debug';

const GG_ENABLED = true;

const timestampColumnNumberRegex = /(\?t=\d+)?(:\d+):\d+\)?$/;
const swapPathFunctionNameRegex = /([ \][_.\S]+) \((.*)/;
const lineNumberRegex = /:\d+ ?/;

function getStack() {
	// Get stack array
	const originalPrepareStackTrace = Error.prepareStackTrace;
	Error.prepareStackTrace = (error, stack) => stack;
	const { stack } = new Error();
	Error.prepareStackTrace = originalPrepareStackTrace;
	return stack || [];
}

const callSiteFileNameCommonPrefix =
	getStack()[0]
		?.toString()
		.match(/\((.*?\/)lib\//i)?.[1] || '';

export function gg(...args: [...unknown[]]) {
	if (!GG_ENABLED) {
		return args[0];
	}

	const stack = getStack();

	const caller = getStack()[2].toString() || '';
	const callerClean = caller.replace(timestampColumnNumberRegex, '$2'); // Strip timestamp and/or column number.
	const callerSwapped = callerClean.replace(swapPathFunctionNameRegex, '$2 $1'); // Put path in front of function name.
	const callerFinal = callerSwapped
		.replace(callSiteFileNameCommonPrefix, '')
		.replace(lineNumberRegex, '| '); // Remove base path and line number.

	const ggLog = debugFactory(callerFinal);
	if (args.length === 0) {
		ggLog(caller);
		return { caller, stack };
	}

	ggLog(...(args as [formatter: unknown, ...args: unknown[]]));
	return args[0];
}
