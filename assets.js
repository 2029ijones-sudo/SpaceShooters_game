// ==================== ASSETS.JS ====================
const assets = {
    images: {},
    sounds: {},
    videos: {},
    loaded: false,
    totalAssets: 0,
    loadedCount: 0,
    // Helper: check if video is ready to draw
    useVideo: (name) => assets.videos[name] && assets.videos[name].readyState >= 2
};

const assetManifest = {
    // Images are fallbacks
    images: [
        { name: 'bullet', src: 'images/bullet.png' },
        { name: 'enemyBullet', src: 'images/bullet.png' },
        { name: 'explosion', src: 'images/explosion.png' },
        { name: 'starfield', src: 'images/starfield.png' },
        // Player/enemy PNGs – fallback if videos fail
        { name: 'player', src: 'images/player.png' },
        { name: 'enemy1', src: 'images/enemy1.png' },
        { name: 'enemy2', src: 'images/enemy2.png' }
    ],
    sounds: [
        { name: 'laser', src: 'sounds/Laser 3.mp3' },
        { name: 'explode', src: 'sounds/dragon-studio-loud-explosion-425457.mp3' },
        { name: 'bgm', src: 'sounds/universfield-horror-background-atmosphere-156462.mp3' }
    ],
    videos: [
        { name: 'nebula', src: 'sounds/139106-771366016_small.mp4' },  // background video (stored in sounds folder)
        { name: 'playerVideo', src: 'videos/player.mp4' },             // animated player
        { name: 'enemyVideo', src: 'videos/enemy.mp4' }                // animated enemy
    ]
};

function loadAssets(callback) {
    assets.totalAssets = assetManifest.images.length + assetManifest.sounds.length + assetManifest.videos.length;

    // Images (fallback)
    assetManifest.images.forEach(item => {
        const img = new Image();
        img.src = item.src;
        img.onload = assetLoaded;
        img.onerror = () => {
            console.warn(`Failed to load image: ${item.src}`);
            assetLoaded();
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

    // Videos (primary)
    assetManifest.videos.forEach(item => {
        const video = document.createElement('video');
        video.src = item.src;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.load();
        video.onerror = () => console.warn(`Failed to load video: ${item.src}`);
        video.onloadeddata = assetLoaded; // consider loaded when first frame ready
        assets.videos[item.name] = video;
    });

    function assetLoaded() {
        assets.loadedCount++;
        if (assets.loadedCount >= assets.totalAssets) {
            assets.loaded = true;
            console.log('All assets loaded');
            if (callback) callback();
        }
    }
}

// Play sound with safe volume default
function playSound(name, volume = 1.0) {
    if (!assets.sounds[name]) return;
    const sound = assets.sounds[name].cloneNode();
    let volSetting = localStorage.getItem('spaceShooters_volume');
    if (volSetting === null) volSetting = 70;
    sound.volume = (volSetting / 100) * volume;
    sound.play().catch(e => {});
}

// Unlock audio and start videos on first user gesture
function enableAudioOnUserGesture() {
    const unlock = () => {
        // Start all videos (they are muted)
        for (let key in assets.videos) {
            const v = assets.videos[key];
            if (v && v.paused) {
                v.play().catch(e => console.log(`Video ${key} play failed:`, e));
            }
        }
        document.removeEventListener('click', unlock);
        document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
}
enableAudioOnUserGesture();
