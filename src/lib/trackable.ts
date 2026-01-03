// Svelte action for time-scrubbing behavior
// Supports both mouse hover (desktop) and touch scrubbing (mobile).
// On mobile: direction detection - horizontal = scrub, vertical = scroll.

export type TrackableOptions = {
	// Convert pointer event to timestamp
	getMs: (e: PointerEvent | MouseEvent) => number;
	// Get the currently tracked element from shared state
	getTrackedElement: () => HTMLElement | null;
	// Emit time change event
	onTimeChange: (ms: number) => void;
	// Emit tracking start event
	onTrackingStart: (node: HTMLElement) => void;
	// Emit tracking end event
	onTrackingEnd: () => void;
	// Optional: check if target should be ignored (e.g., temp labels)
	shouldIgnoreTarget?: (target: Element) => boolean;
};

export function trackable(node: HTMLElement, options: TrackableOptions) {
	let trackUntilMouseUp = false;
	let mouseIsOver = false;

	// Touch gesture state
	let touchStartX = 0;
	let touchStartY = 0;
	let savedScrollTop = 0;
	let gestureDecided = false;
	let isScrubbing = false;
	let activePointerId: number | null = null;
	const GESTURE_THRESHOLD = 8; // pixels to move before deciding gesture type

	function trackToMouseX(e: PointerEvent | MouseEvent) {
		const ms = options.getMs(e);
		options.onTimeChange(ms);
	}

	function handlePointerMove(e: PointerEvent) {
		// Skip touch events - handled separately for gesture detection
		if (e.pointerType === 'touch') return;

		const trackedElement = options.getTrackedElement();
		if (trackedElement === node) {
			trackToMouseX(e);
		} else if (mouseIsOver && trackedElement === null) {
			trackToMouseX(e);
			options.onTrackingStart(node);
		}
	}

	function handlePointerDown(e: PointerEvent) {
		// Skip touch events - handled separately
		if (e.pointerType === 'touch') return;

		// Check if target should be ignored
		if (options.shouldIgnoreTarget?.(e.target as Element)) {
			return;
		}

		trackUntilMouseUp = true;
		trackToMouseX(e);
		options.onTrackingStart(node);
	}

	function handlePointerUp(e: PointerEvent) {
		// Skip touch events - handled separately
		if (e.pointerType === 'touch') return;

		if (options.getTrackedElement() === node) {
			trackUntilMouseUp = false;
			options.onTrackingEnd();
		}
	}

	function handleMouseEnter(e: MouseEvent) {
		mouseIsOver = true;
		if (!options.getTrackedElement()) {
			trackToMouseX(e);
			options.onTrackingStart(node);
		}
	}

	function handleMouseLeave(e: MouseEvent) {
		mouseIsOver = false;
		if (options.getTrackedElement() === node && !trackUntilMouseUp) {
			options.onTrackingEnd();
		}
	}

	// Touch pointer event handlers - direction detection for scrub vs scroll
	function handleTouchPointerDown(e: PointerEvent) {
		if (e.pointerType !== 'touch') return;

		// Check if target should be ignored
		if (options.shouldIgnoreTarget?.(e.target as Element)) {
			return;
		}

		touchStartX = e.clientX;
		touchStartY = e.clientY;
		savedScrollTop = document.documentElement.scrollTop || document.body.scrollTop;
		gestureDecided = false;
		isScrubbing = false;
		activePointerId = e.pointerId;
	}

	function handleTouchPointerMove(e: PointerEvent) {
		if (e.pointerType !== 'touch') return;
		if (activePointerId === null) return;

		const deltaX = e.clientX - touchStartX;
		const deltaY = e.clientY - touchStartY;
		const absDeltaX = Math.abs(deltaX);
		const absDeltaY = Math.abs(deltaY);

		// If already scrubbing, continue scrubbing
		if (isScrubbing) {
			trackToMouseX(e);
			// Lock scroll position
			document.documentElement.scrollTop = savedScrollTop;
			document.body.scrollTop = savedScrollTop;
			return;
		}

		// If already decided to scroll, let native scroll handle it
		if (gestureDecided && !isScrubbing) {
			return;
		}

		// Decide gesture type once threshold is reached
		if (!gestureDecided && (absDeltaX > GESTURE_THRESHOLD || absDeltaY > GESTURE_THRESHOLD)) {
			gestureDecided = true;

			if (absDeltaX > absDeltaY) {
				// More horizontal = scrubbing - capture pointer and set touch-action
				isScrubbing = true;
				node.style.touchAction = 'none';
				node.setPointerCapture(e.pointerId);
				trackToMouseX(e);
				options.onTrackingStart(node);
			} else {
				// More vertical = scrolling - let native scroll handle it
				isScrubbing = false;
				activePointerId = null;
			}
		}
	}

	function handleTouchPointerUp(e: PointerEvent) {
		if (e.pointerType !== 'touch') return;

		if (isScrubbing) {
			options.onTrackingEnd();
			node.style.touchAction = ''; // Restore native scroll for next gesture
		}

		gestureDecided = false;
		isScrubbing = false;
		activePointerId = null;
	}

	const abortController = new AbortController();
	const { signal } = abortController;

	window.addEventListener('pointermove', handlePointerMove, { signal });
	node.addEventListener('pointerdown', handlePointerDown, { signal });
	window.addEventListener('pointerup', handlePointerUp, { signal });
	node.addEventListener('mouseenter', handleMouseEnter, { signal });
	node.addEventListener('mouseleave', handleMouseLeave, { signal });

	// Touch pointer events for mobile
	node.addEventListener('pointerdown', handleTouchPointerDown, { signal });
	window.addEventListener('pointermove', handleTouchPointerMove, { signal });
	window.addEventListener('pointerup', handleTouchPointerUp, { signal });

	return {
		destroy() {
			abortController.abort();
		},
	};
}

// Helper to check if target is a temp label (common pattern)
export function isTempLabel(target: Element): boolean {
	return (
		target?.classList?.contains('temp-label') ||
		(target as SVGElement)?.className?.baseVal?.includes('temp-label')
	);
}
