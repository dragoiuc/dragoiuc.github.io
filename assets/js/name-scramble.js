const SCRAMBLE_DEFAULTS = {
	duration: 900,
	minDelay: 2000,
	maxDelay: 3000,
	easePower: 3,
	chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
	loop: false,
	autoStart: false,
};

const VIEWPORT_SCRAMBLE_DEFAULTS = {
	duration: 900,
	easePower: 3,
	stagger: 40,
	chars: SCRAMBLE_DEFAULTS.chars,
	threshold: 0.35,
	rootMargin: '0px 0px -12% 0px',
	replayOnReentry: false,
};

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const scrambleControllers = new WeakMap();

const resolveElement = (target) => {
	if (typeof target === 'string') {
		return document.querySelector(target);
	}

	return target instanceof Element ? target : null;
};

const randomBetween = (min, max) => min + Math.random() * (max - min);

const inOutPower = (progress, power) => {
	if (progress < 0.5) {
		return Math.pow(progress * 2, power) / 2;
	}

	return 1 - Math.pow((1 - progress) * 2, power) / 2;
};

const attachScrambleEffect = (target, options = {}) => {
	const element = resolveElement(target);

	if (!element) {
		return null;
	}

	const existingController = scrambleControllers.get(element);
	if (existingController) {
		existingController.configure(options);
		return existingController;
	}

	const originalText = element.textContent;
	if (!originalText || !originalText.trim()) {
		return null;
	}

	const state = {
		animationFrameId: 0,
		replayTimeoutId: 0,
		animationToken: 0,
		options: {
			...SCRAMBLE_DEFAULTS,
			...options,
		},
	};

	element.setAttribute('aria-label', originalText.trim());

	const randomChar = () => {
		const chars = state.options.chars || SCRAMBLE_DEFAULTS.chars;
		const index = Math.floor(Math.random() * chars.length);
		return chars[index];
	};

	const renderFrame = (progress) => {
		const easedProgress = inOutPower(progress, state.options.easePower);
		const revealCount = Math.floor(easedProgress * originalText.length);
		let scrambledText = '';

		for (let i = 0; i < originalText.length; i += 1) {
			const currentChar = originalText[i];

			if (/\s/.test(currentChar)) {
				scrambledText += currentChar;
				continue;
			}

			scrambledText += i < revealCount ? currentChar : randomChar();
		}

		element.textContent = scrambledText;
	};

	const finish = () => {
		element.textContent = originalText;
	};

	const stop = () => {
		state.animationToken += 1;
		cancelAnimationFrame(state.animationFrameId);
		clearTimeout(state.replayTimeoutId);
		finish();
	};

	const play = () => {
		if (prefersReducedMotion.matches) {
			finish();
			return;
		}

		state.animationToken += 1;
		const currentToken = state.animationToken;
		const startTime = performance.now();

		cancelAnimationFrame(state.animationFrameId);

		const step = (now) => {
			if (currentToken !== state.animationToken) {
				return;
			}

			const elapsed = now - startTime;
			const progress = Math.min(elapsed / state.options.duration, 1);

			renderFrame(progress);

			if (progress < 1) {
				state.animationFrameId = requestAnimationFrame(step);
			} else {
				finish();
			}
		};

		state.animationFrameId = requestAnimationFrame(step);
	};

	const schedule = () => {
		clearTimeout(state.replayTimeoutId);

		if (!state.options.loop) {
			return;
		}

		const minDelay = Math.min(state.options.minDelay, state.options.maxDelay);
		const maxDelay = Math.max(state.options.minDelay, state.options.maxDelay);
		const delay = randomBetween(minDelay, maxDelay);

		state.replayTimeoutId = window.setTimeout(() => {
			play();
			schedule();
		}, delay);
	};

	const start = () => {
		clearTimeout(state.replayTimeoutId);
		play();
		schedule();
	};

	const configure = (nextOptions = {}) => {
		const previousLoop = state.options.loop;

		state.options = {
			...state.options,
			...nextOptions,
		};

		if (previousLoop && !state.options.loop) {
			clearTimeout(state.replayTimeoutId);
		}
	};

	const setLoop = (enabled) => {
		state.options.loop = Boolean(enabled);
		clearTimeout(state.replayTimeoutId);
	};

	const destroy = () => {
		stop();
		scrambleControllers.delete(element);
	};

	const controller = {
		element,
		play,
		start,
		stop,
		destroy,
		configure,
		setLoop,
		getOptions: () => ({ ...state.options }),
	};

	scrambleControllers.set(element, controller);

	if (state.options.autoStart) {
		start();
	}

	return controller;
};

const isScrambleCandidate = (textNode, root) => {
	const parent = textNode.parentElement;
	if (!parent || !root.contains(parent)) {
		return false;
	}

	if (!textNode.nodeValue || !textNode.nodeValue.trim()) {
		return false;
	}

	if (parent.closest('script, style, noscript, textarea, option, code, pre, svg, .icon, [data-scramble-ignore], [data-scramble-generated]')) {
		return false;
	}

	return true;
};

const wrapTextNode = (textNode) => {
	const span = document.createElement('span');
	span.dataset.scrambleGenerated = 'true';
	span.textContent = textNode.nodeValue;
	textNode.parentNode.replaceChild(span, textNode);
	return span;
};

const prepareScrambleTextNodes = (root = document.body, options = {}) => {
	const scope = resolveElement(root) || document.body;
	const settings = {
		...VIEWPORT_SCRAMBLE_DEFAULTS,
		...options,
	};

	if (prefersReducedMotion.matches) {
		return [];
	}

	const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
	const textNodes = [];

	while (walker.nextNode()) {
		const textNode = walker.currentNode;
		if (isScrambleCandidate(textNode, scope)) {
			textNodes.push(textNode);
		}
	}

	return textNodes.map((textNode) => {
		const span = wrapTextNode(textNode);
		return attachScrambleEffect(span, {
			duration: settings.duration,
			easePower: settings.easePower,
			chars: settings.chars,
			loop: false,
			autoStart: false,
		});
	}).filter(Boolean);
};

const scrambleTextNodesOnce = (root = document.body, options = {}) => {
	const settings = {
		...VIEWPORT_SCRAMBLE_DEFAULTS,
		...options,
	};
	const controllers = prepareScrambleTextNodes(root, settings);

	controllers.forEach((controller, index) => {
		window.setTimeout(() => controller.play(), index * settings.stagger);
	});

	return controllers;
};

const observeScrambleTextNodes = (root = document.body, options = {}) => {
	const scope = resolveElement(root) || document.body;
	const settings = {
		...VIEWPORT_SCRAMBLE_DEFAULTS,
		...options,
	};
	const controllers = prepareScrambleTextNodes(scope, settings);

	if (!('IntersectionObserver' in window)) {
		controllers.forEach((controller, index) => {
			window.setTimeout(() => controller.play(), index * settings.stagger);
		});

		return {
			controllers,
			disconnect: () => {},
		};
	}

	const observer = new IntersectionObserver((entries) => {
		const visibleEntries = [];

		entries.forEach((entry) => {
			if (entry.isIntersecting && entry.target.dataset.scramblePlayed !== 'true') {
				visibleEntries.push(entry);
				return;
			}

			if (settings.replayOnReentry && !entry.isIntersecting && entry.intersectionRatio === 0) {
				entry.target.dataset.scramblePlayed = 'false';
			}
		});

		visibleEntries
			.sort((entryA, entryB) => entryA.boundingClientRect.top - entryB.boundingClientRect.top)
			.forEach((entry, index) => {
				const controller = scrambleControllers.get(entry.target);
				if (!controller) {
					observer.unobserve(entry.target);
					return;
				}

				entry.target.dataset.scramblePlayed = 'true';
				window.setTimeout(() => controller.play(), index * settings.stagger);

				if (!settings.replayOnReentry) {
					observer.unobserve(entry.target);
				}
			});
	}, {
		threshold: settings.threshold,
		rootMargin: settings.rootMargin,
	});

	controllers.forEach((controller) => {
		observer.observe(controller.element);
	});

	return {
		controllers,
		disconnect: () => observer.disconnect(),
		observer,
	};
};

window.addEventListener('load', () => {
	window.setTimeout(() => {
		observeScrambleTextNodes(document.body, {
			duration: 900,
			easePower: 3,
			stagger: 40,
			replayOnReentry: true,
		});
	}, 150);
});

window.attachScrambleEffect = attachScrambleEffect;
window.getScrambleEffect = (target) => {
	const element = resolveElement(target);
	return element ? scrambleControllers.get(element) || null : null;
};
window.scrambleTextNodesOnce = scrambleTextNodesOnce;
window.observeScrambleTextNodes = observeScrambleTextNodes;
