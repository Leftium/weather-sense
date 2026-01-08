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
	// Optional: callback for tap in top region (e.g., toggle sky visibility)
	onTopRegionTap?: () => void;
	// Optional: height ratio for top region (default 0.3 = top 30%)
	topRegionRatio?: number;
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

	// Tap detection for top region
	let pointerDownX = 0;
	let pointerDownY = 0;
	let pointerDownTime = 0;
	const TAP_THRESHOLD = 10; // max pixels moved to count as tap
	const TAP_MAX_DURATION = 300; // max ms for a tap

	// Throttling for scrubbing - limits updates to reduce GPU usage
	let pendingMs: number | null = null;
	let rafId: number | null = null;
	let lastUpdateTime = 0;
	const THROTTLE_MS = 1000 / 60; // 60fps

	function scheduleTimeUpdate(ms: number) {
		pendingMs = ms;
		const now = performance.now();

		if (now - lastUpdateTime >= THROTTLE_MS) {
			// Enough time passed, update immediately via RAF
			if (rafId === null) {
				rafId = requestAnimationFrame(() => {
					if (pendingMs !== null) {
						options.onTimeChange(pendingMs);
						pendingMs = null;
						lastUpdateTime = performance.now();
					}
					rafId = null;
				});
			}
		}
		// Otherwise, skip this update (throttled)
	}

	function trackToMouseX(e: PointerEvent | MouseEvent, useRaf = false) {
		const ms = options.getMs(e);
		if (useRaf) {
			scheduleTimeUpdate(ms);
		} else {
			options.onTimeChange(ms);
		}
	}

	function handlePointerMove(e: PointerEvent) {
		// Skip touch events - handled separately for gesture detection
		if (e.pointerType === 'touch') return;

		const trackedElement = options.getTrackedElement();
		if (trackedElement === node) {
			trackToMouseX(e, true); // Use RAF throttling
		} else if (mouseIsOver && trackedElement === null) {
			trackToMouseX(e, true); // Use RAF throttling
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

		// Record position for tap detection
		pointerDownX = e.clientX;
		pointerDownY = e.clientY;
		pointerDownTime = Date.now();

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

			// Check for tap in top region
			if (options.onTopRegionTap) {
				const deltaX = Math.abs(e.clientX - pointerDownX);
				const deltaY = Math.abs(e.clientY - pointerDownY);
				const duration = Date.now() - pointerDownTime;

				if (deltaX < TAP_THRESHOLD && deltaY < TAP_THRESHOLD && duration < TAP_MAX_DURATION) {
					// Check if tap is in top region of the node
					const rect = node.getBoundingClientRect();
					const relativeY = e.clientY - rect.top;
					const topRegionRatio = options.topRegionRatio ?? 0.3;

					if (relativeY < rect.height * topRegionRatio) {
						options.onTopRegionTap();
					}
				}
			}
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

		// If already scrubbing, continue scrubbing with RAF throttling
		if (isScrubbing) {
			trackToMouseX(e, true); // Use RAF for touch scrubbing
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
				trackToMouseX(e, true); // Use RAF for touch scrubbing
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
			// Cancel any pending RAF update
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
			// Apply final position immediately
			if (pendingMs !== null) {
				options.onTimeChange(pendingMs);
				pendingMs = null;
			}
			options.onTrackingEnd();
			node.style.touchAction = ''; // Restore native scroll for next gesture
		} else if (!gestureDecided && options.onTopRegionTap) {
			// No gesture decided = tap (didn't move enough to trigger scrub or scroll)
			const rect = node.getBoundingClientRect();
			const relativeY = touchStartY - rect.top;
			const topRegionRatio = options.topRegionRatio ?? 0.3;

			if (relativeY >= 0 && relativeY < rect.height * topRegionRatio) {
				options.onTopRegionTap();
			}
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
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
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
