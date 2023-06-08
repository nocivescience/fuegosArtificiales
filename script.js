'use strict';

const { subscribe } = require("diagnostics_channel");

console.clear();
const IS_MOBILE=window.innerWidth<=640;
const IS_DESKTOP=window.innerWidth>800;
const IS_HEADER=IS_DESKTOP&&window.innerHeight<300;
const MAX_WIDTH=7680;
const MAX_HEIGHT=4320;
const GRAVITY=0.9;
let simSpeed=1;
let scale=1;
if(IS_MOBILE){
  scale=0.94;
}
if(IS_HEADER){
  scale=0.75;
}
let stageW, stageH;
let quality=1;
let isLowQuality=false;
let isNormalQuality=true;
let isHighQuality=false;
const QUALITY_LOW=1;
const QUALITY_NORMAL=2;
const QUALITY_HIGH=3;
const SKY_LIGHT_NONE=0;
const SKY_LIGHT_DIM=1;
const SKY_LIGHT_NORMAL=2;
const COLOR = {
	Red: '#ff0043',
	Green: '#14fc56',
	Blue: '#1e7fff',
	Purple: '#e60aff',
	Gold: '#ffae00',
	White: '#ffffff'
};
const INVISIBLE='_INVISIBLE_';
const PI_2=Math.PI*2;
const PI_HALF=Math.PI/2;
const trailsStage=new Stage('trails-canvas');
const mainStage=new Stage('main-canvas');
const stages=[
    trailsStage,
    mainStage
];
const store={
	_listeners: new Set(),
	_dispatch(){
		this._listeners.forEach(listener=>{
			listener(this.state);
		});
	},
	state:{
		paused:false,
		longExposure:false,
		menuOpen:false,
		config:{
			quality:QUALITY_NORMAL,
			shell:'Random',
			size: IS_DESKTOP ? '3' : '1.2',
			autoLaunch:true,
			finale:false,
			skyLighting:SKY_LIGHT_NORMAL+'',
			hideControls: IS_HEADER,
		}
	},
	setState(nextState){
		this.state=Object.assign({},this.state,nextState);
		this._dispatch();
		this.persist();
	},
	subscribe(listener){
		this._listeners.add(listener);
		return ()=>{
			this._listeners.delete(listener);
		}
	},
	load(){
		const serializedData=localStorage.getItem('cm_fireworks_data');
		if(serializedData){
			const {
				shemaVersion,
				data
			}=JSON.parse(serializedData);
			const config=this.state.config
			switch(shemaVersion){
				case '1.1':
					config.quality=data.quality;
					config.size=data.size;
					config.skyLighting=data.skyLighting;
					config.hideControls=data.hideControls;
					break;
				default:
					console.error('Unknown shema version',shemaVersion);	
			}
			console.log('Loaded config',config);
		}
		else if(localStorage.getItem('schemaVersion')==='1'){
			let size,hideControls
			try{
				const sizeRaw=localStorage.getItem('configSize');
				const hideControlsRaw=localStorage.getItem('hideControls');
				size=typeof sizeRaw==='string' && JSON.parse(sizeRaw);
				hideControls=typeof hideControlsRaw==='string' && JSON.parse(hideControlsRaw);
			}catch(e){
				console.error('Failed to load config',e);
				return
			}
			const sizeInt=parseInt(size,10);
			if(sizeInt>=0&&sizeInt<=4){
				this.state.config.size=sizeInt;
			}
			if(typeof hideControls==='boolean'){
				this.state.config.hideControls=hideControls;
			}
		}
	},
	persist(){
		const config=this.state.config;
		localStorage.setItem('cm_fireworks_data',JSON.stringify({
			shemaVersion:'1.1',
			data:{
				quality:config.quality,
				size:config.size,
				skyLighting:config.skyLighting,
				hideControls:config.hideControls
			}
		}));
	}
};
if(!IS_HEADER){
	store.load();
}
function togglePause(toggle){
	if(typeof toggle==='boolean'){
		store.setState({paused:toggle});
	}else{
		store.setState({paused:!store.state.paused});
	}
}
function toggleLongExposure(toggle){
	if(typeof toggle==='boolean'){
		store.setState({longExposure:toggle});
	}else{
		store.setState({longExposure:!store.state.longExposure});
	}
}
function toggleMenu(toggle){
	if(typeof toggle==='boolean'){
		store.setState({menuOpen:toggle});
	}else{
		store.setState({menuOpen:!store.state.menuOpen});
	}
}
function updateConfig(nextConfig){
	nextConfig=nextConfig||getConfigFromDOM();
	store.setState({config:Object.assign({},store.state.config,nextConfig)});
	configDidUpdate();
}
function configDidUpdate(){
	const config=store.state.config;
	quality=qualitySelector();
	isLowQuality=quality===QUALITY_LOW;
	isNormalQuality=quality===QUALITY_NORMAL;
	isHighQuality=quality===QUALITY_HIGH;
	if(skyLightingSelector()===SKY_LIGHT_NONE){
		appNodes.canvasContainer.style.background='#000';
	}
	Spark.drawWidth=quality===QUALITY_HIGH ? .5 : .75;
}
const canInteract=()=>!store.state.paused&&!store.state.menuOpen;
const qualitySelector=()=>+store.state.config.quality;
const shellNameSelector=()=>store.state.config.shell;
const finaleSelector=()=>store.state.config.finale;
const skyLightingSelector=()=>+store.state.config.skyLighting;
const appNodes={
	stateContainer: '#state-container',
	canvasContainer: '#canvas-container',
	constrols: '#controls',
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
	hideControlsLabel: '#hide-controls-label',
};
Object.keys(appNodes).forEach(key=>{
	appNodes[key]=document.querySelector(appNodes[key]);
});
document.getElementById('loading-init').remove();
appNodes.stateContainer.classList.remove('remove');
function renderApp(state){
	const pauseBtnIcon=`#icon-${state.paused ? 'play':'pause'}`;
	constshutterBtnIcon=`#icon-${state.longExposure ? 'fast':'slow'}`;
	appNodes.pauseBtnSVG.setAttribute('href',pauseBtnIcon);
	appNodes.pauseBtnSVG.setAttribute('xlink:href',pauseBtnIcon);
	appNodes.shutterBtnSVG.setAttribute('href',shutterBtnIcon);
	appNodes.shutterBtnSVG.setAttribute('xlink:href',shutterBtnIcon);
	appNodes.constrols.classList.toggle('hide',state.menuOpen||state.config.hideControls);
	appNodes.canvasContainer.classList.toggle('blur',state.menuOpen);
	appNodes.menu.classList.toggle('open',state.menuOpen);
	appNodes.finaleModeLabel.style.opacity=state.config.finale ? 1 : .32;
	appNodes.quality.value=state.config.quality;
	appNodes.shellType.value=state.config.shell;
	appNodes.shellSize.value=state.config.size;
	appNodes.autoLaunch.checked=state.config.autoLaunch;
	appNodes.finaleMode.checked=state.config.finale;
	appNodes.skyLighting.value=state.config.skyLighting;
	appNodes.hideControls.checked=state.config.hideControls;
}
store.subscribe(renderApp);
function getConfigFromDOM(){
	return {
		quality:appNodes.quality.value,
		shell:appNodes.shellType.value,
		size:appNodes.shellSize.value,
		autoLaunch:appNodes.autoLaunch.checked,
		finale:appNodes.finaleMode.checked,
		skyLighting:appNodes.skyLighting.value,
		hideControls:appNodes.hideControls.checked
	};
}
const updateConfigNoEvent=()=>updateConfig();
appNodes.quality.addEventListener('input',updateConfigNoEvent);
appNodes.shellType.addEventListener('input',updateConfigNoEvent);
appNodes.shellSize.addEventListener('input',updateConfigNoEvent);
appNodes.autoLaunchLabel.addEventListener('click',()=>setTimeout(updateConfig,0));
appNodes.finaleModeLabel.addEventListener('click',()=>setTimeout(updateConfig,0));
appNodes.skyLighting.addEventListener('input',updateConfigNoEvent);
appNodes.hideControlsLabel.addEventListener('click',()=>setTimeout(updateConfig,0));
