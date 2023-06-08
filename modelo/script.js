'use strict';
console.clear();



const IS_MOBILE = window.innerWidth <= 640;
const IS_DESKTOP = window.innerWidth > 800;
const IS_HEADER = IS_DESKTOP && window.innerHeight < 300;
// 8K - can restrict this if needed
const MAX_WIDTH = 7680;
const MAX_HEIGHT = 4320;
const GRAVITY = 0.9; // Acceleration in px/s
let simSpeed = 1;

let scale = 1;
if (IS_MOBILE) scale = 0.94;
if (IS_HEADER) scale = 0.75;

// Width/height values that take scale into account.
// USE THESE FOR DRAWING POSITIONS
let stageW, stageH;

// All quality globals will be overwritten and updated via `configDidUpdate`.
let quality = 1;
let isLowQuality = false;
let isNormalQuality = true;
let isHighQuality = false;

const QUALITY_LOW = 1;
const QUALITY_NORMAL = 2;
const QUALITY_HIGH = 3;

const SKY_LIGHT_NONE = 0;
const SKY_LIGHT_DIM = 1;
const SKY_LIGHT_NORMAL = 2;

const COLOR = {
	Red: '#ff0043',
	Green: '#14fc56',
	Blue: '#1e7fff',
	Purple: '#e60aff',
	Gold: '#ffae00',
	White: '#ffffff'
};

// Special invisible color (not rendered, and therefore not in COLOR map)
const INVISIBLE = '_INVISIBLE_';

const PI_2 = Math.PI * 2;
const PI_HALF = Math.PI * 0.5;

// Stage.disableHighDPI = true;
const trailsStage = new Stage('trails-canvas');
const mainStage = new Stage('main-canvas');
const stages = [
	trailsStage,
	mainStage
];




// Interactive state management
const store = {
	_listeners: new Set(),
	_dispatch() {
		this._listeners.forEach(listener => listener(this.state))
	},
	
	state: {
		paused: false,
		longExposure: false,
		menuOpen: false,
		// Note that config values used for <select>s must be strings.
		config: {
			quality: QUALITY_NORMAL + '', // will be mirrored to a global variable named `quality` in `configDidUpdate`, for perf.
			shell: 'Random',
			size: IS_DESKTOP
				? '3' // Desktop default
				: IS_HEADER 
					? '1.2' // Profile header default (doesn't need to be an int)
					: '1', // Mobile default
			autoLaunch: true,
			finale: false,
			skyLighting: SKY_LIGHT_NORMAL + '',
			hideControls: IS_HEADER
		}
	},
	
	setState(nextState) {
		this.state = Object.assign({}, this.state, nextState);
		this._dispatch();
		this.persist();
	},
	
	subscribe(listener) {
		this._listeners.add(listener);
		return () => this._listeners.remove(listener);
	},
	
	// Load / persist select state to localStorage
	// Mutates state because `store.load()` should only be called once immediately after store is created, before any subscriptions.
	load() {
		const serializedData = localStorage.getItem('cm_fireworks_data');
		if (serializedData) {
			const {
				schemaVersion,
				data
			} = JSON.parse(serializedData);
			
			const config = this.state.config;
			switch(schemaVersion) {
				case '1.1':
					config.quality = data.quality;
					config.size = data.size;
					config.skyLighting = data.skyLighting;
					config.hideControls = data.hideControls;
					break;
				default:
					console.error('Version switch should be exhaustive. Falling back to default settings.');
			}
			console.log(`Loaded config (schema version ${schemaVersion})`);
		}
		// Deprecated data format. Apply carefully (it's not namespaced).
		else if (localStorage.getItem('schemaVersion') === '1') {
			let size, hideControls;
			// Attempt to parse data, ignoring if there is an error.
			try {
				const sizeRaw = localStorage.getItem('configSize');
				const hideControlsRaw = localStorage.getItem('hideControls');
				size = typeof sizeRaw === 'string' && JSON.parse(sizeRaw);
				hideControls = typeof hideControlsRaw === 'string' && JSON.parse(hideControlsRaw);
			}
			catch(e) {
				console.log('Recovered from error parsing saved config:');
				console.error(e);
				return;
			}
			// Only restore validated values
			const sizeInt = parseInt(size, 10);
			if (sizeInt >= 0 && sizeInt <= 4) {
				this.state.config.size = String(sizeInt);
			}
			if (typeof hideControls == 'boolean') {
				this.state.config.hideControls = hideControls;
			}
		}
	},
	
	persist() {
		const config = this.state.config;
		localStorage.setItem('cm_fireworks_data', JSON.stringify({
			schemaVersion: '1.1',
			data: {
				quality: config.quality,
				size: config.size,
				skyLighting: config.skyLighting,
				hideControls: config.hideControls
			}
		}));
	}
};


if (!IS_HEADER) {
	store.load();
}

// Actions
// ---------

function togglePause(toggle) {
	if (typeof toggle === 'boolean') {
		store.setState({ paused: toggle });
	} else {
		store.setState({ paused: !store.state.paused });
	}
}

function toggleLongExposure(toggle) {
	if (typeof toggle === 'boolean') {
		store.setState({ longExposure: toggle });
	} else {
		store.setState({ longExposure: !store.state.longExposure });
	}
}

function toggleMenu(toggle) {
	if (typeof toggle === 'boolean') {
		store.setState({ menuOpen: toggle });
	} else {
		store.setState({ menuOpen: !store.state.menuOpen });
	}
}

function updateConfig(nextConfig) {
	nextConfig = nextConfig || getConfigFromDOM();
	store.setState({
		config: Object.assign({}, store.state.config, nextConfig)
	});
	
	configDidUpdate();
}

// Map config to various properties & apply side effects
function configDidUpdate() {
	const config = store.state.config;
	
	quality = qualitySelector();
	isLowQuality = quality === QUALITY_LOW;
	isNormalQuality = quality === QUALITY_NORMAL;
	isHighQuality = quality === QUALITY_HIGH;
	
	if (skyLightingSelector() === SKY_LIGHT_NONE) {
		appNodes.canvasContainer.style.backgroundColor = '#000';
	}
	
	Spark.drawWidth = quality === QUALITY_HIGH ? 0.5 : 0.75;
}

// Selectors
// -----------

const canInteract = () => !store.state.paused && !store.state.menuOpen;
// Convert quality to number.
const qualitySelector = () => +store.state.config.quality;
const shellNameSelector = () => store.state.config.shell;
// Convert shell size to number.
const shellSizeSelector = () => +store.state.config.size;
const finaleSelector = () => store.state.config.finale;
const skyLightingSelector = () => +store.state.config.skyLighting;


// Render app UI / keep in sync with state
const appNodes = {
	stageContainer: '#stage-container',
	canvasContainer: '#canvas-container',
	controls: '#controls',
	menu: '#menu',
	pauseBtn: '#pause-btn',
	pauseBtnSVG: '#pause-btn use',
	shutterBtn: '#shutter-btn',
	shutterBtnSVG: '#shutter-btn use',
	quality: '#quality-ui',
	shellType: '#shell-type',
	shellSize: '#shell-size',
	autoLaunch: '#auto-launch',
	autoLaunchLabel: '#auto-launch-label',
	finaleMode: '#finale-mode',
	finaleModeLabel: '#finale-mode-label',
	skyLighting: '#sky-lighting',
	hideControls: '#hide-controls',
	hideControlsLabel: '#hide-controls-label'
};

// Convert appNodes selectors to dom nodes
Object.keys(appNodes).forEach(key => {
	appNodes[key] = document.querySelector(appNodes[key]);
});

// Remove loading state
document.getElementById('loading-init').remove();
appNodes.stageContainer.classList.remove('remove');

// First render is called in init()
function renderApp(state) {
	const pauseBtnIcon = `#icon-${state.paused ? 'play' : 'pause'}`;
	const shutterBtnIcon = `#icon-shutter-${state.longExposure ? 'fast' : 'slow'}`;
	appNodes.pauseBtnSVG.setAttribute('href', pauseBtnIcon);
	appNodes.pauseBtnSVG.setAttribute('xlink:href', pauseBtnIcon);
	appNodes.shutterBtnSVG.setAttribute('href', shutterBtnIcon);
	appNodes.shutterBtnSVG.setAttribute('xlink:href', shutterBtnIcon);
	appNodes.controls.classList.toggle('hide', state.menuOpen || state.config.hideControls);
	appNodes.canvasContainer.classList.toggle('blur', state.menuOpen);
	appNodes.menu.classList.toggle('hide', !state.menuOpen);
	appNodes.finaleModeLabel.style.opacity = state.config.autoLaunch ? 1 : 0.32;
	
	appNodes.quality.value = state.config.quality;
	appNodes.shellType.value = state.config.shell;
	appNodes.shellSize.value = state.config.size;
	appNodes.autoLaunch.checked = state.config.autoLaunch;
	appNodes.finaleMode.checked = state.config.finale;
	appNodes.skyLighting.value = state.config.skyLighting;
	appNodes.hideControls.checked = state.config.hideControls;
}

store.subscribe(renderApp);


function getConfigFromDOM() {
	return {
		quality: appNodes.quality.value,
		shell: appNodes.shellType.value,
		size: appNodes.shellSize.value,
		autoLaunch: appNodes.autoLaunch.checked,
		finale: appNodes.finaleMode.checked,
		skyLighting: appNodes.skyLighting.value,
		hideControls: appNodes.hideControls.checked
	};
};

const updateConfigNoEvent = () => updateConfig();
appNodes.quality.addEventListener('input', updateConfigNoEvent);
appNodes.shellType.addEventListener('input', updateConfigNoEvent);
appNodes.shellSize.addEventListener('input', updateConfigNoEvent);
appNodes.autoLaunchLabel.addEventListener('click', () => setTimeout(updateConfig, 0));
appNodes.finaleModeLabel.addEventListener('click', () => setTimeout(updateConfig, 0));
appNodes.skyLighting.addEventListener('input', updateConfigNoEvent);
appNodes.hideControlsLabel.addEventListener('click', () => setTimeout(updateConfig, 0));


// Constant derivations
const COLOR_NAMES = Object.keys(COLOR);
const COLOR_CODES = COLOR_NAMES.map(colorName => COLOR[colorName]);
// Invisible stars need an indentifier, even through they won't be rendered - physics still apply.
const COLOR_CODES_W_INVIS = [...COLOR_CODES, INVISIBLE];
// Map of color codes to their index in the array. Useful for quickly determining if a color has already been updated in a loop.
const COLOR_CODE_INDEXES = COLOR_CODES_W_INVIS.reduce((obj, code, i) => {
	obj[code] = i;
	return obj;
}, {});
// Tuples is a map keys by color codes (hex) with values of { r, g, b } tuples (still just objects).
const COLOR_TUPLES = {};
COLOR_CODES.forEach(hex => {
	COLOR_TUPLES[hex] = {
		r: parseInt(hex.substr(1, 2), 16),
		g: parseInt(hex.substr(3, 2), 16),
		b: parseInt(hex.substr(5, 2), 16),
	};
});

// Get a random color.
function randomColorSimple() {
	return COLOR_CODES[Math.random() * COLOR_CODES.length | 0];
}

// Get a random color, with some customization options available.
let lastColor;
function randomColor(options) {
	const notSame = options && options.notSame;
	const notColor = options && options.notColor;
	const limitWhite = options && options.limitWhite;
	let color = randomColorSimple();
	
	// limit the amount of white chosen randomly
	if (limitWhite && color === COLOR.White && Math.random() < 0.6) {
		color = randomColorSimple();
	}
	
	if (notSame) {
		while (color === lastColor) {
			color = randomColorSimple();
		}
	}
	else if (notColor) {
		while (color === notColor) {
			color = randomColorSimple();
		}
	}
	
	lastColor = color;
	return color;
}

function whiteOrGold() {
	return Math.random() < 0.5 ? COLOR.Gold : COLOR.White;
}


// Fullscreen helpers, using Fscreen for prefixes
function requestFullscreen() {
	if (fullscreenEnabled() && !isFullscreen()) {
		fscreen.requestFullscreen(document.documentElement);
	}
}

function fullscreenEnabled() {
	return fscreen.fullscreenEnabled;
}

function isFullscreen() {
	return !!fscreen.fullscreenElement;
}


// Shell helpers
function makePistilColor(shellColor) {
	return (shellColor === COLOR.White || shellColor === COLOR.Gold) ? randomColor({ notColor: shellColor }) : whiteOrGold();
}

// Unique shell types
const crysanthemumShell = (size=1) => {
	const glitter = Math.random() < 0.25;
	const singleColor = Math.random() < 0.72;
	const color = singleColor ? randomColor({ limitWhite: true }) : [randomColor(), randomColor({ notSame: true })];
	const pistil = singleColor && Math.random() < 0.42;
	const pistilColor = pistil && makePistilColor(color);
	const secondColor = singleColor && (Math.random() < 0.42 || color === COLOR.White) ? pistilColor || randomColor({ notColor: color, limitWhite: true }) : null;
	const streamers = !pistil && color !== COLOR.White && Math.random() < 0.42;
	let starDensity = glitter ? 1.1 : 1.5;
	if (isLowQuality) starDensity *= 0.8;
	if (isHighQuality) starDensity = 1.5;
	return {
		size: 300 + size * 100,
		starLife: 900 + size * 200,
		starDensity,
		color,
		secondColor,
		glitter: glitter ? 'light' : '',
		glitterColor: whiteOrGold(),
		pistil,
		pistilColor,
		streamers
	};
};


const palmShell = (size=1) => {
	const color = randomColor();
	const thick = Math.random() < 0.5;
	return {
		color,
		size: 250 + size * 75,
		starDensity: thick ? 0.3 : 0.6,
		starLife: 1800 + size * 200,
		glitter: thick ? 'thick' : 'heavy'
	};
};

const ringShell = (size=1) => {
	const color = randomColor();
	const pistil = Math.random() < 0.75;
	return {
		ring: true,
		color,
		size: 300 + size * 100,
		starLife: 900 + size * 200,
		starCount: 2.2 * PI_2 * (size+1),
		pistil,
		pistilColor: makePistilColor(color),
		glitter: !pistil ? 'light' : '',
		glitterColor: color === COLOR.Gold ? COLOR.Gold : COLOR.White,
		streamers: Math.random() < 0.3
	};
	// return Object.assign({}, defaultShell, config);
};

const crossetteShell = (size=1) => {
	const color = randomColor({ limitWhite: true });
	return {
		size: 300 + size * 100,
		starLife: 900 + size * 200,
		starLifeVariation: 0.22,
		color,
		crossette: true,
		pistil: Math.random() < 0.5,
		pistilColor: makePistilColor(color)
	};
};

const floralShell = (size=1) => ({
	size: 300 + size * 120,
	starDensity: 0.38,
	starLife: 500 + size * 50,
	starLifeVariation: 0.5,
	color: Math.random() < 0.65 ? 'random' : (Math.random() < 0.15 ? randomColor() : [randomColor(), randomColor({ notSame: true })]),
	floral: true
});

const fallingLeavesShell = (size=1) => ({
	color: INVISIBLE,
	size: 300 + size * 120,
	starDensity: 0.38,
	starLife: 500 + size * 50,
	starLifeVariation: 0.5,
	glitter: 'medium',
	glitterColor: COLOR.Gold,
	fallingLeaves: true
});

const willowShell = (size=1) => ({
	size: 300 + size * 100,
	starDensity: 0.7,
	starLife: 3000 + size * 300,
	glitter: 'willow',
	glitterColor: COLOR.Gold,
	color: INVISIBLE
});

const crackleShell = (size=1) => {
	// favor gold
	const color = Math.random() < 0.75 ? COLOR.Gold : randomColor();
	return {
		size: 380 + size * 75,
		starDensity: isLowQuality ? 0.65 : 1,
		starLife: 600 + size * 100,
		starLifeVariation: 0.32,
		glitter: 'light',
		glitterColor: COLOR.Gold,
		color,
		crackle: true,
		pistil: Math.random() < 0.65,
		pistilColor: makePistilColor(color)
	};
};

const horsetailShell = (size=1) => {
	const color = randomColor();
	return {
		horsetail: true,
		color,
		size: 250 + size * 38,
		starDensity: 0.85 + size * 0.1,
		starLife: 2500 + size * 300,
		glitter: 'medium',
		glitterColor: Math.random() < 0.5 ? whiteOrGold() : color
	};
};

function randomShellName() {
	return Math.random() < 0.6 ? 'Crysanthemum' : shellNames[(Math.random() * (shellNames.length - 1) + 1) | 0 ];
}

function randomShell(size) {
	return shellTypes[randomShellName()](size);
}

function shellFromConfig(size) {
	return shellTypes[shellNameSelector()](size);
}

// Get a random shell, not including processing intensive varients
// Note this is only random when "Random" shell is selected in config.
// Also, this does not create the shell, only returns the factory function.
const fastShellBlacklist = ['Falling Leaves', 'Floral', 'Willow'];
function randomFastShell() {
	const isRandom = shellNameSelector() === 'Random';
	let shellName = isRandom ? randomShellName() : shellNameSelector();
	if (isRandom) {
		while (fastShellBlacklist.includes(shellName)) {
			shellName = randomShellName();
		}
	}
	return shellTypes[shellName];
}


const shellTypes = {
	'Random': randomShell,
	'Crackle': crackleShell,
	'Crossette': crossetteShell,
	'Crysanthemum': crysanthemumShell,
	'Falling Leaves': fallingLeavesShell,
	'Floral': floralShell,
	'Horse Tail': horsetailShell,
	'Palm': palmShell,
	'Ring': ringShell,
	'Willow': willowShell
};

const shellNames = Object.keys(shellTypes);

function init() {
	// Populate dropdowns
	// shell type
	let options = '';
	shellNames.forEach(opt => options += `<option value="${opt}">${opt}</option>`);
	appNodes.shellType.innerHTML = options;
	// shell size
	options = '';
	['3"', '5"', '6"', '8"', '12"'].forEach((opt, i) => options += `<option value="${i}">${opt}</option>`);
	appNodes.shellSize.innerHTML = options;
	
	const qualityOptions = [
		{ label: 'Low', value: QUALITY_LOW },
		{ label: 'Normal', value: QUALITY_NORMAL },
		{ label: 'High', value: QUALITY_HIGH }
	];
	
	appNodes.quality.innerHTML = qualityOptions.reduce((acc, opt) => acc += `<option value="${opt.value}">${opt.label}</option>`, '');
	
	const skyLightingOptions = [
		{ label: 'None', value: SKY_LIGHT_NONE },
		{ label: 'Dim', value: SKY_LIGHT_DIM },
		{ label: 'Normal', value: SKY_LIGHT_NORMAL }
	];
	
	appNodes.skyLighting.innerHTML = skyLightingOptions.reduce((acc, opt) => acc += `<option value="${opt.value}">${opt.label}</option>`, '');
	
	// initial render
	renderApp(store.state);
	
	// Apply initial config
	configDidUpdate();
}


function fitShellPositionInBoundsH(position) {
	const edge = 0.18;
	return (1 - edge*2) * position + edge;
}

function fitShellPositionInBoundsV(position) {
	return position * 0.75;
}

function getRandomShellPositionH() {
	return fitShellPositionInBoundsH(Math.random());
}

function getRandomShellPositionV() {
	return fitShellPositionInBoundsV(Math.random());
}

function getRandomShellSize() {
	const baseSize = shellSizeSelector();
	const maxVariance = Math.min(2.5, baseSize);
	const variance = Math.random() * maxVariance;
	const size = baseSize - variance;
	const height = maxVariance === 0 ? Math.random() : 1 - (variance / maxVariance);
	const centerOffset = Math.random() * (1 - height * 0.65) * 0.5;
	const x = Math.random() < 0.5 ? 0.5 - centerOffset : 0.5 + centerOffset;
	return {
		size,
		x: fitShellPositionInBoundsH(x),
		height: fitShellPositionInBoundsV(height)
	};
}


// Launches a shell from a user pointer event, based on state.config
function launchShellFromConfig(event) {
	const shell = new Shell(shellFromConfig(shellSizeSelector()));
	const w = mainStage.width;
	const h = mainStage.height;
	
	shell.launch(
		event ? event.x / w : getRandomShellPositionH(),
		event ? 1 - event.y / h : getRandomShellPositionV()
	);
}


// Sequences
// -----------

function seqRandomShell() {
	const size = getRandomShellSize();
	const shell = new Shell(shellFromConfig(size.size));
	shell.launch(size.x, size.height);
	
	let extraDelay = shell.starLife;
	if (shell.fallingLeaves) {
		extraDelay = 4600;
	}
	
	return 900 + Math.random() * 600 + extraDelay;
}

function seqTwoRandom() {
	const size1 = getRandomShellSize();
	const size2 = getRandomShellSize();
	const shell1 = new Shell(shellFromConfig(size1.size));
	const shell2 = new Shell(shellFromConfig(size2.size));
	const leftOffset = Math.random() * 0.2 - 0.1;
	const rightOffset = Math.random() * 0.2 - 0.1;
	shell1.launch(0.3 + leftOffset, size1.height);
	shell2.launch(0.7 + rightOffset, size2.height);
	
	let extraDelay = Math.max(shell1.starLife, shell2.starLife);
	if (shell1.fallingLeaves || shell2.fallingLeaves) {
		extraDelay = 4600;
	}
	
	return 900 + Math.random() * 600 + extraDelay;
}

function seqTriple() {
	const shellType = randomFastShell();
	const baseSize = shellSizeSelector();
	const smallSize = Math.max(0, baseSize - 1.25);
	
	const offset = Math.random() * 0.08 - 0.04;
	const shell1 = new Shell(shellType(baseSize));
	shell1.launch(0.5 + offset, 0.7);
	
	const leftDelay = 1000 + Math.random() * 400;
	const rightDelay = 1000 + Math.random() * 400;
	
	setTimeout(() => {
		const offset = Math.random() * 0.08 - 0.04;
		const shell2 = new Shell(shellType(smallSize));
		shell2.launch(0.2 + offset, 0.1);
	}, leftDelay);
	
	setTimeout(() => {
		const offset = Math.random() * 0.08 - 0.04;
		const shell3 = new Shell(shellType(smallSize));
		shell3.launch(0.8 + offset, 0.1);
	}, rightDelay);
	
	return 4000;
}

function seqSmallBarrage() {
	seqSmallBarrage.lastCalled = Date.now();
	const barrageCount = IS_DESKTOP ? 11 : 5;
	const specialIndex = IS_DESKTOP ? 3 : 1;
	const shellSize = Math.max(0, shellSizeSelector() - 2);
	const randomMainShell = Math.random() < 0.78 ? crysanthemumShell : ringShell;
	const randomSpecialShell = randomFastShell();
	
	// (cos(x*5π+0.5π)+1)/2 is a custom wave bounded by 0 and 1 used to set varying launch heights
	function launchShell(x, useSpecial) {
		const isRandom = shellNameSelector() === 'Random';
		let shellType = isRandom
			? useSpecial ? randomSpecialShell : randomMainShell
			: shellTypes[shellNameSelector()];
		const shell = new Shell(shellType(shellSize));
		const height = (Math.cos(x*5*Math.PI + PI_HALF) + 1) / 2;
		shell.launch(x, height * 0.75);
	}
	
	let count = 0;
	let delay = 0;
	while(count < barrageCount) {
		if (count === 0) {
			launchShell(0.5, false)
			count += 1;
		}
		else {
			const offset = (count + 1) / barrageCount / 2;
			const useSpecial = count === specialIndex;
			setTimeout(() => {
				launchShell(0.5 + offset, useSpecial);
				launchShell(0.5 - offset, useSpecial);
			}, delay);
			count += 2;
		}
		delay += 200;
	}
	
	return 3400 + barrageCount * 120;
}
seqSmallBarrage.cooldown = 15000;
seqSmallBarrage.lastCalled = Date.now();


const sequences = [
	seqRandomShell,
	seqTwoRandom,
	seqTriple,
	seqSmallBarrage
];


let isFirstSeq = true;
const finaleCount = 32;
let currentFinaleCount = 0;
function startSequence() {
	if (isFirstSeq) {
		isFirstSeq = false;
		if (IS_HEADER) {
			return seqTwoRandom();
		}
		else {
			const shell = new Shell(crysanthemumShell(shellSizeSelector()));
			shell.launch(0.5, 0.5);
			return 2400;
		}
	}
	
	if (finaleSelector()) {
		seqRandomShell();
		if (currentFinaleCount < finaleCount) {
			currentFinaleCount++;
			return 170;
		}
		else {
			currentFinaleCount = 0;
			return 6000;
		}
	}
	
	const rand = Math.random();
	
	if (rand < 0.2 && Date.now() - seqSmallBarrage.lastCalled > seqSmallBarrage.cooldown) {
		return seqSmallBarrage();
	}
	
	if (rand < 0.6 && !IS_HEADER) {
		return seqRandomShell();
	}
	else if (rand < 0.8) {
		return seqTwoRandom();
	}
	else if (rand < 1) {
		return seqTriple();
	}
}


let activePointerCount = 0;
let isUpdatingSpeed = false;

function handlePointerStart(event) {
	activePointerCount++;
	const btnSize = 44;
	
	if (event.y < btnSize) {
		if (event.x < btnSize) {
			togglePause();
			return;
		}
		if (event.x > mainStage.width/2 - btnSize/2 && event.x < mainStage.width/2 + btnSize/2) {
			toggleLongExposure();
			return;
		}
		if (event.x > mainStage.width - btnSize) {
			toggleMenu();
			return;
		}
	}
	
	if (!canInteract()) return;
	
	if (updateSpeedFromEvent(event)) {
		isUpdatingSpeed = true;
	}
	else if (event.onCanvas) {
		launchShellFromConfig(event);
	}
}

function handlePointerEnd(event) {
	activePointerCount--;
	isUpdatingSpeed = false;
}

function handlePointerMove(event) {
	if (!canInteract()) return;
	
	if (isUpdatingSpeed) {
		updateSpeedFromEvent(event);
	}
}

function handleKeydown(event) {
	// P
	if (event.keyCode === 80) {
		togglePause();
	}
	// O
	else if (event.keyCode === 79) {
		toggleMenu();
	}
	// Esc
	else if (event.keyCode === 27) {
		toggleMenu(false);
	}
}

mainStage.addEventListener('pointerstart', handlePointerStart);
mainStage.addEventListener('pointerend', handlePointerEnd);
mainStage.addEventListener('pointermove', handlePointerMove);
window.addEventListener('keydown', handleKeydown);
// Try to go fullscreen upon a touch
window.addEventListener('touchend', (event) => !IS_DESKTOP && requestFullscreen());


// Account for window resize and custom scale changes.
function handleResize() {
	const w = window.innerWidth;
	const h = window.innerHeight;
	// Try to adopt screen size, heeding maximum sizes specified
	const containerW = Math.min(w, MAX_WIDTH);
	// On small screens, use full device height
	const containerH = w <= 420 ? h : Math.min(h, MAX_HEIGHT);
	appNodes.stageContainer.style.width = containerW + 'px';
	appNodes.stageContainer.style.height = containerH + 'px';
	stages.forEach(stage => stage.resize(containerW, containerH));
	// Account for scale
	stageW = containerW / scale;
	stageH = containerH / scale;
}

// Compute initial dimensions
handleResize();

window.addEventListener('resize', handleResize);


// Dynamic globals
let currentFrame = 0;
let speedBarOpacity = 0;
let autoLaunchTime = 0;

function updateSpeedFromEvent(event) {
	if (isUpdatingSpeed || event.y >= mainStage.height - 44) {
		// On phones it's hard to hit the edge pixels in order to set speed at 0 or 1, so some padding is provided to make that easier.
		const edge = 16;
		const newSpeed = (event.x - edge) / (mainStage.width - edge * 2);
		simSpeed = Math.min(Math.max(newSpeed, 0), 1);
		// show speed bar after an update
		speedBarOpacity = 1;
		// If we updated the speed, return true
		return true;
	}
	// Return false if the speed wasn't updated
	return false;
}


// Extracted function to keep `update()` optimized
function updateGlobals(timeStep, lag) {
	currentFrame++;
	
	// Always try to fade out speed bar
	if (!isUpdatingSpeed) {
	speedBarOpacity -= lag / 30; // half a second
		if (speedBarOpacity < 0) {
			speedBarOpacity = 0;
		}
	}
	
	// auto launch shells
	if (store.state.config.autoLaunch) {
		autoLaunchTime -= timeStep;
		if (autoLaunchTime <= 0) {
			autoLaunchTime = startSequence() * 1.25;
		}
	}
}


function update(frameTime, lag) {
	if (!canInteract()) return;
	
	const width = stageW;
	const height = stageH;
	const timeStep = frameTime * simSpeed;
	const speed = simSpeed * lag;
	
	updateGlobals(timeStep, lag);
	
	const starDrag = 1 - (1 - Star.airDrag) * speed;
	const starDragHeavy = 1 - (1 - Star.airDragHeavy) * speed;
	const sparkDrag = 1 - (1 - Spark.airDrag) * speed;
	const gAcc = timeStep / 1000 * GRAVITY;
	COLOR_CODES_W_INVIS.forEach(color => {
		// Stars
		const stars = Star.active[color];
		for (let i=stars.length-1; i>=0; i=i-1) {
			const star = stars[i];
			// Only update each star once per frame. Since color can change, it's possible a star could update twice without this, leading to a "jump".
			if (star.updateFrame === currentFrame) {
				continue;
			}
			star.updateFrame = currentFrame;
			
			star.life -= timeStep;
			if (star.life <= 0) {
				stars.splice(i, 1);
				Star.returnInstance(star);
			} else {
				const burnRate = Math.pow(star.life / star.fullLife, 0.5);
				const burnRateInverse = 1 - burnRate;

				star.prevX = star.x;
				star.prevY = star.y;
				star.x += star.speedX * speed;
				star.y += star.speedY * speed;
				// Apply air drag if star isn't "heavy". The heavy property is used for the shell comets.
				if (!star.heavy) {
					star.speedX *= starDrag;
					star.speedY *= starDrag;
				}
				else {
					star.speedX *= starDragHeavy;
					star.speedY *= starDragHeavy;
				}
				star.speedY += gAcc;
				
				if (star.spinRadius) {
					star.spinAngle += star.spinSpeed * speed;
					star.x += Math.sin(star.spinAngle) * star.spinRadius * speed;
					star.y += Math.cos(star.spinAngle) * star.spinRadius * speed;
				}
				
				if (star.sparkFreq) {
					star.sparkTimer -= timeStep;
					while (star.sparkTimer < 0) {
						star.sparkTimer += star.sparkFreq * 0.75 + star.sparkFreq * burnRateInverse * 4;
						Spark.add(
							star.x,
							star.y,
							star.sparkColor,
							Math.random() * PI_2,
							Math.random() * star.sparkSpeed * burnRate,
							star.sparkLife * 0.8 + Math.random() * star.sparkLifeVariation * star.sparkLife
						);
					}
				}
				
				if (star.secondColor && !star.colorChanged && star.life < star.secondColorTime) {
					star.colorChanged = true;
					star.color = star.secondColor;
					stars.splice(i, 1);
					Star.active[star.secondColor].push(star);
					if (star.secondColor === INVISIBLE) {
						star.sparkFreq = 0;
					}
				}
			}
		}
											
		// Sparks
		const sparks = Spark.active[color];
		for (let i=sparks.length-1; i>=0; i=i-1) {
			const spark = sparks[i];
			spark.life -= timeStep;
			if (spark.life <= 0) {
				sparks.splice(i, 1);
				Spark.returnInstance(spark);
			} else {
				spark.prevX = spark.x;
				spark.prevY = spark.y;
				spark.x += spark.speedX * speed;
				spark.y += spark.speedY * speed;
				spark.speedX *= sparkDrag;
				spark.speedY *= sparkDrag;
				spark.speedY += gAcc;
			}
		}
	});
	
	render(speed);
}

function render(speed) {
	const { dpr } = mainStage;
	const width = stageW;
	const height = stageH;
	const trailsCtx = trailsStage.ctx;
	const mainCtx = mainStage.ctx;
	
	if (skyLightingSelector() !== SKY_LIGHT_NONE) {
		colorSky(speed);
	}
	
	trailsCtx.scale(dpr * scale, dpr * scale);
	mainCtx.scale(dpr * scale, dpr * scale);
	
	trailsCtx.globalCompositeOperation = 'source-over';
	trailsCtx.fillStyle = `rgba(0, 0, 0, ${store.state.longExposure ? 0.0025 : 0.1 * speed})`;
	trailsCtx.fillRect(0, 0, width, height);
	
	mainCtx.clearRect(0, 0, width, height);
	
	// Draw queued burst flashes
	// These must also be drawn using source-over due to Safari. Seems rendering the gradients using lighten draws large black boxes instead.
	// Thankfully, these burst flashes look pretty much the same either way.
	while (BurstFlash.active.length) {
		const bf = BurstFlash.active.pop();
		
		const burstGradient = trailsCtx.createRadialGradient(bf.x, bf.y, 0, bf.x, bf.y, bf.radius);
		burstGradient.addColorStop(0.024, 'rgba(255, 255, 255, 1)');
		burstGradient.addColorStop(0.125, 'rgba(255, 160, 20, 0.2)');
		burstGradient.addColorStop(0.32, 'rgba(255, 140, 20, 0.11)');
		burstGradient.addColorStop(1, 'rgba(255, 120, 20, 0)');
		trailsCtx.fillStyle = burstGradient;
		trailsCtx.fillRect(bf.x - bf.radius, bf.y - bf.radius, bf.radius * 2, bf.radius * 2);
		
		BurstFlash.returnInstance(bf);
	}
	
	// Remaining drawing on trails canvas will use 'lighten' blend mode
	trailsCtx.globalCompositeOperation = 'lighten';
	
	// Draw stars
	trailsCtx.lineWidth = Star.drawWidth;
	trailsCtx.lineCap = isLowQuality ? 'square' : 'round';
	mainCtx.strokeStyle = '#fff';
  mainCtx.lineWidth = 1;
	mainCtx.beginPath();
	COLOR_CODES.forEach(color => {
		const stars = Star.active[color];
		trailsCtx.strokeStyle = color;
		trailsCtx.beginPath();
		stars.forEach(star => {
			trailsCtx.moveTo(star.x, star.y);
			trailsCtx.lineTo(star.prevX, star.prevY);
			mainCtx.moveTo(star.x, star.y);
			mainCtx.lineTo(star.x - star.speedX * 1.6, star.y - star.speedY * 1.6);
		});
		trailsCtx.stroke();
	});
	mainCtx.stroke();

	// Draw sparks
	trailsCtx.lineWidth = Spark.drawWidth;
	trailsCtx.lineCap = 'butt';
	COLOR_CODES.forEach(color => {
		const sparks = Spark.active[color];
		trailsCtx.strokeStyle = color;
		trailsCtx.beginPath();
		sparks.forEach(spark => {
			trailsCtx.moveTo(spark.x, spark.y);
			trailsCtx.lineTo(spark.prevX, spark.prevY);
		});
		trailsCtx.stroke();
	});
	
	
	// Render speed bar if visible
	if (speedBarOpacity) {
		const speedBarHeight = 6;
		mainCtx.globalAlpha = speedBarOpacity;
		mainCtx.fillStyle = COLOR.Blue;
		mainCtx.fillRect(0, height - speedBarHeight, width * simSpeed, speedBarHeight);
		mainCtx.globalAlpha = 1;
	}
	
	
	trailsCtx.setTransform(1, 0, 0, 1, 0, 0);
	mainCtx.setTransform(1, 0, 0, 1, 0, 0);
}


// Draw colored overlay based on combined brightness of stars (light up the sky!)
// Note: this is applied to the canvas container's background-color, so it's behind the particles
const currentSkyColor = { r: 0, g: 0, b: 0 };
const targetSkyColor = { r: 0, g: 0, b: 0 };
function colorSky(speed) {
	// The maximum r, g, or b value that will be used (255 would represent no maximum)
	const maxSkySaturation = skyLightingSelector() * 15;
	// How many stars are required in total to reach maximum sky brightness
	const maxStarCount = 500;
	let totalStarCount = 0;
	// Initialize sky as black
	targetSkyColor.r = 0;
	targetSkyColor.g = 0;
	targetSkyColor.b = 0;
	// Add each known color to sky, multiplied by particle count of that color. This will put RGB values wildly out of bounds, but we'll scale them back later.
	// Also add up total star count.
	COLOR_CODES.forEach(color => {
		const tuple = COLOR_TUPLES[color];
		const count =  Star.active[color].length;
		totalStarCount += count;
		targetSkyColor.r += tuple.r * count;
		targetSkyColor.g += tuple.g * count;
		targetSkyColor.b += tuple.b * count;
	});
	
	// Clamp intensity at 1.0, and map to a custom non-linear curve. This allows few stars to perceivably light up the sky, while more stars continue to increase the brightness but at a lesser rate. This is more inline with humans' non-linear brightness perception.
	const intensity = Math.pow(Math.min(1, totalStarCount / maxStarCount), 0.3);
	// Figure out which color component has the highest value, so we can scale them without affecting the ratios.
	// Prevent 0 from being used, so we don't divide by zero in the next step.
	const maxColorComponent = Math.max(1, targetSkyColor.r, targetSkyColor.g, targetSkyColor.b);
	// Scale all color components to a max of `maxSkySaturation`, and apply intensity.
	targetSkyColor.r = targetSkyColor.r / maxColorComponent * maxSkySaturation * intensity;
	targetSkyColor.g = targetSkyColor.g / maxColorComponent * maxSkySaturation * intensity;
	targetSkyColor.b = targetSkyColor.b / maxColorComponent * maxSkySaturation * intensity;
	
	// Animate changes to color to smooth out transitions.
	const colorChange = 10;
	currentSkyColor.r += (targetSkyColor.r - currentSkyColor.r) / colorChange * speed;
	currentSkyColor.g += (targetSkyColor.g - currentSkyColor.g) / colorChange * speed;
	currentSkyColor.b += (targetSkyColor.b - currentSkyColor.b) / colorChange * speed;
	
	appNodes.canvasContainer.style.backgroundColor = `rgb(${currentSkyColor.r | 0}, ${currentSkyColor.g | 0}, ${currentSkyColor.b | 0})`;
}

mainStage.addEventListener('ticker', update);


// Helper used to semi-randomly spread particles over an arc
// Values are flexible - `start` and `arcLength` can be negative, and `randomness` is simply a multiplier for random addition.
function createParticleArc(start, arcLength, count, randomness, particleFactory) {
	const angleDelta = arcLength / count;
	// Sometimes there is an extra particle at the end, too close to the start. Subtracting half the angleDelta ensures that is skipped.
	// Would be nice to fix this a better way.
	const end = start + arcLength - (angleDelta * 0.5);
	
	if (end > start) {
		// Optimization: `angle=angle+angleDelta` vs. angle+=angleDelta
		// V8 deoptimises with let compound assignment
		for (let angle=start; angle<end; angle=angle+angleDelta) {
			particleFactory(angle + Math.random() * angleDelta * randomness);
		}
	}
	else {
		for (let angle=start; angle>end; angle=angle+angleDelta) {
			particleFactory(angle + Math.random() * angleDelta * randomness);
		}
	}
}


// Various star effects.
// These are designed to be attached to a star's `onDeath` event.

// Crossette breaks star into four same-color pieces which branch in a cross-like shape.
function crossetteEffect(star) {
	const startAngle = Math.random() * PI_HALF;
	createParticleArc(startAngle, PI_2, 4, 0.5, (angle) => {
		Star.add(
			star.x,
			star.y,
			star.color,
			angle,
			Math.random() * 0.6 + 0.75,
			600
		);
	});
}

// Flower is like a mini shell
function floralEffect(star) {
	const startAngle = Math.random() * PI_HALF;
	const count = 12 + 6 * quality;
	createParticleArc(startAngle, PI_2, count, 1, (angle) => {
		Star.add(
			star.x,
			star.y,
			star.color,
			angle,
			// apply near cubic falloff to speed (places more particles towards outside)
			Math.pow(Math.random(), 0.45) * 2.4,
			1000 + Math.random() * 300,
			star.speedX,
			star.speedY
		);
	});
	// Queue burst flash render
	BurstFlash.add(star.x, star.y, 46);
}

// Floral burst with willow stars
function fallingLeavesEffect(star) {
	const startAngle = Math.random() * PI_HALF;
	createParticleArc(startAngle, PI_2, 12, 1, (angle) => {
		const newStar = Star.add(
			star.x,
			star.y,
			INVISIBLE,
			angle,
			// apply near cubic falloff to speed (places more particles towards outside)
			Math.pow(Math.random(), 0.45) * 2.4,
			2400 + Math.random() * 600,
			star.speedX,
			star.speedY
		);
		
		newStar.sparkColor = COLOR.Gold;
		newStar.sparkFreq = 144 / quality;
		newStar.sparkSpeed = 0.28;
		newStar.sparkLife = 750;
		newStar.sparkLifeVariation = 3.2;
	});
	// Queue burst flash render
	BurstFlash.add(star.x, star.y, 46);
}

// Crackle pops into a small cloud of golden sparks.
function crackleEffect(star) {
	const count = isHighQuality ? 26 : 12;
	createParticleArc(0, PI_2, count, 1.8, (angle) => {
		Spark.add(
			star.x,
			star.y,
			COLOR.Gold,
			angle,
			// apply near cubic falloff to speed (places more particles towards outside)
			Math.pow(Math.random(), 0.45) * 2.4,
			300 + Math.random() * 200
		);
	});
}



/**
 * Shell can be constructed with options:
 *
 * size:      Size of the burst.
 * starCount: Number of stars to create. This is optional, and will be set to a reasonable quantity for size if omitted.
 * starLife:
 * starLifeVariation:
 * color:
 * glitterColor:
 * glitter: One of: 'light', 'medium', 'heavy', 'streamer', 'willow'
 * pistil:
 * pistilColor:
 * streamers:
 * crossette:
 * floral:
 * crackle:
 */

class Shell {
	constructor(options) {
		Object.assign(this, options);
		this.starLifeVariation = options.starLifeVariation || 0.125;
		this.color = options.color || randomColor();
		this.glitterColor = options.glitterColor || this.color;
				
		// Set default starCount if needed, will be based on shell size and scale exponentially, like a sphere's surface area.
		if (!this.starCount) {
			const density = options.starDensity || 1;
			const scaledSize = this.size / 50 * density;
			this.starCount = Math.max(6, scaledSize * scaledSize);
		}
	}
	
	launch(position, launchHeight) {
		const width = stageW;
		const height = stageH;
		// Distance from sides of screen to keep shells.
		const hpad = 60;
		// Distance from top of screen to keep shell bursts.
		const vpad = 50;
		// Minimum burst height, as a percentage of stage height
		const minHeightPercent = 0.45;
		// Minimum burst height in px
		const minHeight = height - height * minHeightPercent;
		
		const launchX = position * (width - hpad * 2) + hpad;
		const launchY = height;
		const burstY = minHeight - (launchHeight * (minHeight - vpad));
		
		const launchDistance = launchY - burstY;
		// Using a custom power curve to approximate Vi needed to reach launchDistance under gravity and air drag.
		// Magic numbers came from testing.
		const launchVelocity = Math.pow(launchDistance * 0.04, 0.64);
		
		const comet = this.comet = Star.add(
			launchX,
			launchY,
			typeof this.color === 'string' && this.color !== 'random' ? this.color : COLOR.White,
			Math.PI,
			launchVelocity * (this.horsetail ? 1.2 : 1),
			// Hang time is derived linearly from Vi; exact number came from testing
			launchVelocity * (this.horsetail ? 100 : 400)
		);
		
		// making comet "heavy" limits air drag
		comet.heavy = true;
		// comet spark trail
		comet.spinRadius = 0.78;
		comet.sparkFreq = 32 / quality;
		if (isHighQuality) comet.sparkFreq = 8;
		comet.sparkLife = 320;
		comet.sparkLifeVariation = 3;
		if (this.glitter === 'willow' || this.fallingLeaves) {
			comet.sparkFreq = 20 / quality;
			comet.sparkSpeed = 0.5;
			comet.sparkLife = 500;
		}
		if (this.color === INVISIBLE) {
			comet.sparkColor = COLOR.Gold;
		}
		
		if (Math.random() > 0.5) {
			comet.secondColor = INVISIBLE;
			comet.secondColorTime = Math.pow(Math.random(), 1.5) * 700 + 500;
		}
		
		comet.onDeath = comet => this.burst(comet.x, comet.y);
		// comet.onDeath = () => this.burst(launchX, burstY);
	}
	
	burst(x, y) {
		// Set burst speed so overall burst grows to set size. This specific formula was derived from testing, and is affected by simulated air drag.
		const speed = this.size / 96;

		let color, onDeath, sparkFreq, sparkSpeed, sparkLife;
		let sparkLifeVariation = 0.25;
		
		if (this.crossette) onDeath = crossetteEffect;
		if (this.floral) onDeath = floralEffect;
		if (this.crackle) onDeath = crackleEffect;
		if (this.fallingLeaves) onDeath = fallingLeavesEffect;
		
		if (this.glitter === 'light') {
			sparkFreq = 400;
			sparkSpeed = 0.3;
			sparkLife = 300;
			sparkLifeVariation = 2;
		}
		else if (this.glitter === 'medium') {
			sparkFreq = 200;
			sparkSpeed = 0.44;
			sparkLife = 700;
			sparkLifeVariation = 2;
		}
		else if (this.glitter === 'heavy') {
			sparkFreq = 82;
			sparkSpeed = 0.8;
			sparkLife = 1400;
			sparkLifeVariation = 2;
		}
		else if (this.glitter === 'thick') {
			sparkFreq = 15;
			sparkSpeed = isHighQuality ? 1.65 : 1.42;
			sparkLife = 2000;
			sparkLifeVariation = 3;
		}
		else if (this.glitter === 'streamer') {
			sparkFreq = 40;
			sparkSpeed = 0.92;
			sparkLife = 400;
			sparkLifeVariation = 2;
		}
		else if (this.glitter === 'willow') {
			sparkFreq = 120;
			sparkSpeed = 0.34;
			sparkLife = 1400;
			sparkLifeVariation = 3.8;
		}
		
		// Apply quality to spark count
		sparkFreq = sparkFreq / quality;
		
		const starFactory = angle => {
			const star = Star.add(
				x,
				y,
				color || randomColor(),
				angle,
				// apply near cubic falloff to speed (places more particles towards outside)
				Math.pow(Math.random(), 0.45) * speed,
				// add minor variation to star life
				this.starLife + Math.random() * this.starLife * this.starLifeVariation,
				this.horsetail && this.comet && this.comet.speedX,
				this.horsetail && this.comet && this.comet.speedY
			);
	
			star.secondColor = this.secondColor;
			if (this.secondColor) star.secondColorTime = this.starLife * (Math.random() * 0.05 + 0.32);
			star.onDeath = onDeath;

			if (this.glitter) {
				star.sparkFreq = sparkFreq;
				star.sparkSpeed = sparkSpeed;
				star.sparkLife = sparkLife;
				star.sparkLifeVariation = sparkLifeVariation;
				star.sparkColor = this.glitterColor;
				star.sparkTimer = Math.random() * star.sparkFreq;
			}
		};
		
		
		if (typeof this.color === 'string') {
			if (this.color === 'random') {
				color = null; // falsey value creates random color in starFactory
			} else {
				color = this.color;
			}
			
			// Rings have positional randomness, but are rotated randomly
			if (this.ring) {
				const ringStartAngle = Math.random() * Math.PI;
				const ringSquash = Math.pow(Math.random(), 0.45) * 0.992 + 0.008;
				
				createParticleArc(0, PI_2, this.starCount, 0, angle => {
					// Create a ring, squashed horizontally
					const initSpeedX = Math.sin(angle) * speed * ringSquash;
					const initSpeedY = Math.cos(angle) * speed;
					// Rotate ring
					const newSpeed = MyMath.pointDist(0, 0, initSpeedX, initSpeedY);
					const newAngle = MyMath.pointAngle(0, 0, initSpeedX, initSpeedY) + ringStartAngle;
					const star = Star.add(
						x,
						y,
						color,
						newAngle,
						// apply near cubic falloff to speed (places more particles towards outside)
						newSpeed,//speed,
						// add minor variation to star life
						this.starLife + Math.random() * this.starLife * this.starLifeVariation
					);
					
					if (this.glitter) {
						star.sparkFreq = sparkFreq;
						star.sparkSpeed = sparkSpeed;
						star.sparkLife = sparkLife;
						star.sparkLifeVariation = sparkLifeVariation;
						star.sparkColor = this.glitterColor;
						star.sparkTimer = Math.random() * star.sparkFreq;
					}
				});
			}
			// "Normal burst
			else {
				createParticleArc(0, PI_2, this.starCount, 1, starFactory);
			}
		}
		else if (Array.isArray(this.color)) {
			let start, start2, arc;
			if (Math.random() < 0.5) {
				start = Math.random() * Math.PI;
				start2 = start + Math.PI;
				arc = Math.PI;
			} else {
				start = 0;
				start2 = 0;
				arc = PI_2;
			}
			color = this.color[0];
			createParticleArc(start, arc, this.starCount/2, 1, starFactory);
			color = this.color[1];
			createParticleArc(start2, arc, this.starCount/2, 1, starFactory)
		}
		
		if (this.pistil) {
			const innerShell = new Shell({
				size: this.size * 0.5,
				starLife: this.starLife * 0.7,
				starLifeVariation: this.starLifeVariation,
				starDensity: 1.65,
				color: this.pistilColor,
				glitter: 'light',
				glitterColor: this.pistilColor === COLOR.Gold ? COLOR.Gold : COLOR.White
			});
			innerShell.burst(x, y);
		}
		
		if (this.streamers) {
			const innerShell = new Shell({
				size: this.size,
				starLife: this.starLife * 0.8,
				starLifeVariation: this.starLifeVariation,
				starCount: Math.max(6, this.size / 45) | 0,
				color: COLOR.White,
				glitter: 'streamer'
			});
			innerShell.burst(x, y);
		}
		
		// Queue burst flash render
		BurstFlash.add(x, y, this.size / 4);
	}
}



const BurstFlash = {
	active: [],
	_pool: [],
	
	_new() {
		return {}
	},
	
	add(x, y, radius) {
		const instance = this._pool.pop() || this._new();
		
		instance.x = x;
		instance.y = y;
		instance.radius = radius;
		
		this.active.push(instance);
		return instance;
	},
	
	returnInstance(instance) {
		this._pool.push(instance);
	}
};



// Helper to generate objects for storing active particles.
// Particles are stored in arrays keyed by color (code, not name) for improved rendering performance.
function createParticleCollection() {
	const collection = {};
	COLOR_CODES_W_INVIS.forEach(color => {
		collection[color] = [];
	});
	return collection;
}


// Star properties (WIP)
// -----------------------
// secondColorTime - how close to end of life that color transition happens

const Star = {
	// Visual properties
	drawWidth: 3,
	airDrag: 0.98,
	airDragHeavy: 0.992,
	
	// Star particles will be keyed by color
	active: createParticleCollection(),
	_pool: [],
	
	_new() {
		return {};
	},

	add(x, y, color, angle, speed, life, speedOffX, speedOffY) {
		const instance = this._pool.pop() || this._new();
		
		instance.heavy = false;
		instance.x = x;
		instance.y = y;
		instance.prevX = x;
		instance.prevY = y;
		instance.color = color;
		instance.speedX = Math.sin(angle) * speed + (speedOffX || 0);
		instance.speedY = Math.cos(angle) * speed + (speedOffY || 0);
		instance.life = life;
		instance.fullLife = life;
		instance.spinAngle = Math.random() * PI_2;
		instance.spinSpeed = 0.8;
		instance.spinRadius = 0;
		instance.sparkFreq = 0; // ms between spark emissions
		instance.sparkSpeed = 1;
		instance.sparkTimer = 0;
		instance.sparkColor = color;
		instance.sparkLife = 750;
		instance.sparkLifeVariation = 0.25;
		
		this.active[color].push(instance);
		return instance;
	},

	// Public method for cleaning up and returning an instance back to the pool.
	returnInstance(instance) {
		// Call onDeath handler if available (and pass it current star instance)
		instance.onDeath && instance.onDeath(instance);
		// Clean up
		instance.onDeath = null;
		instance.secondColor = null;
		instance.secondColorTime = 0;
		instance.colorChanged = false;
		// Add back to the pool.
		this._pool.push(instance);
	}
};


const Spark = {
	// Visual properties
	drawWidth: 0, // set in `configDidUpdate()`
	airDrag: 0.9,
	
	// Star particles will be keyed by color
	active: createParticleCollection(),
	_pool: [],
	
	_new() {
		return {};
	},

	add(x, y, color, angle, speed, life) {
		const instance = this._pool.pop() || this._new();
		
		instance.x = x;
		instance.y = y;
		instance.prevX = x;
		instance.prevY = y;
		instance.color = color;
		instance.speedX = Math.sin(angle) * speed;
		instance.speedY = Math.cos(angle) * speed;
		instance.life = life;
		
		this.active[color].push(instance);
		return instance;
	},

	// Public method for cleaning up and returning an instance back to the pool.
	returnInstance(instance) {
		// Add back to the pool.
		this._pool.push(instance);
	}
};



init();

