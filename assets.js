// ==================== ASSETS.JS ====================
const assets = {
    images: {},
    sounds: {},
    videos: {},
    loaded: false,
    totalAssets: 0,
    loadedCount: 0
};

const assetManifest = {
    images: [
        { name: 'player', src: 'images/player.png' },
        { name: 'enemy1', src: 'images/enemy1.png' },
        { name: 'enemy2', src: 'images/enemy2.png' },
        { name: 'bullet', src: 'images/bullet.png' },
        { name: 'enemyBullet', src: 'images/bullet.png' },
        { name: 'explosion', src: 'images/explosion.png' },
        { name: 'starfield', src: 'images/starfield.png' }
    ],
    sounds: [
        { name: 'laser', src: 'sounds/Laser 3.mp3' },
        { name: 'explode', src: 'sounds/dragon-studio-loud-explosion-425457.mp3' },
        { name: 'bgm', src: 'sounds/universfield-horror-background-atmosphere-156462.mp3' }
    ],
    videos: [
        { name: 'nebula', src: 'sounds/139106-771366016_small.mp4' }
    ]
};

function loadAssets(callback) {
    assets.totalAssets = assetManifest.images.length + assetManifest.sounds.length + assetManifest.videos.length;

    // Images (with error fallback)
    assetManifest.images.forEach(item => {
        const img = new Image();
        img.src = item.src;
        img.onload = assetLoaded;
        img.onerror = () => {
            console.warn(`Failed to load image: ${item.src}`);
            assetLoaded(); // still count it so game continues
        };
        assets.images[item.name] = img;
    });

    // Sounds
    assetManifest.sounds.forEach(item => {
        const audio = new Audio();
        audio.src = item.src;
        audio.load();
        audio.onerror = () => console.warn(`Failed to load sound: ${item.src}`);
        assets.sounds[item.name] = audio;
        assetLoaded();
    });

    // Videos
    assetManifest.videos.forEach(item => {
        const video = document.createElement('video');
        video.src = item.src;
        video.loop = true;
        video.muted = true;
        video.load();
        video.onerror = () => console.warn(`Failed to load video: ${item.src}`);
        assets.videos[item.name] = video;
        assetLoaded();
    });

    function assetLoaded() {
        assets.loadedCount++;
        if (assets.loadedCount >= assets.totalAssets) {
            assets.loaded = true;
            if (callback) callback();
        }
    }
}

// Play sound with safe volume default
function playSound(name, volume = 1.0) {
    if (!assets.sounds[name]) return;
    const sound = assets.sounds[name].cloneNode();
    let volSetting = localStorage.getItem('spaceShooters_volume');
    if (volSetting === null) volSetting = 70;          // default 70%
    sound.volume = (volSetting / 100) * volume;
    sound.play().catch(e => {}); // ignore autoplay blockers
}

// Unlock audio on first user gesture
function enableAudioOnUserGesture() {
    const unlock = () => {
        document.removeEventListener('click', unlock);
        document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
}
enableAudioOnUserGesture();
