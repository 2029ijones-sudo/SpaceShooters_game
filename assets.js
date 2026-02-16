// ==================== ASSETS.JS ====================
// Global asset storage
const assets = {
    images: {},
    sounds: {},
    videos: {},
    loaded: false,
    totalAssets: 0,
    loadedCount: 0
};

// List of assets to load – UPDATE PATHS TO YOUR FILES
const assetManifest = {
    images: [
        { name: 'player', src: 'images/player.png' },
        { name: 'enemy1', src: 'images/enemy1.png' },
        { name: 'enemy2', src: 'images/enemy2.png' },
        { name: 'bullet', src: 'images/bullet.png' },
        { name: 'enemyBullet', src: 'images/enemy_bullet.png' },
        { name: 'explosion', src: 'images/explosion.png' },
        { name: 'starfield', src: 'images/starfield.png' } // optional
    ],
    sounds: [
        { name: 'laser', src: 'sounds/Laser 3.mp3' },
        { name: 'explode', src: 'sounds/dragon-studio-loud-explosion-425457.mp3' },
        { name: 'bgm', src: 'sounds/universfield-horror-background-atmosphere-156462.mp3' }
    ],
    videos: [
        { name: 'nebula', src: 'videos/139106-771366016_small.mp4' } // optional background
    ]
};

// Load all assets
function loadAssets(callback) {
    assets.totalAssets = assetManifest.images.length + assetManifest.sounds.length + assetManifest.videos.length;

    // Images
    assetManifest.images.forEach(item => {
        const img = new Image();
        img.src = item.src;
        img.onload = assetLoaded;
        assets.images[item.name] = img;
    });

    // Sounds (Audio elements)
    assetManifest.sounds.forEach(item => {
        const audio = new Audio();
        audio.src = item.src;
        audio.load();
        // We don't wait for canplaythrough – just assume it's okay
        assets.sounds[item.name] = audio;
        assetLoaded(); // count as loaded immediately (or you can wait for canplaythrough)
    });

    // Videos (HTML5 video elements)
    assetManifest.videos.forEach(item => {
        const video = document.createElement('video');
        video.src = item.src;
        video.loop = true;
        video.muted = true; // usually muted for background
        video.load();
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

// Play a sound (with volume from localStorage)
function playSound(name, volume = 1.0) {
    if (!assets.sounds[name]) return;
    // Clone to allow overlapping
    const sound = assets.sounds[name].cloneNode();
    sound.volume = (localStorage.getItem('spaceShooters_volume') / 100) * volume;
    sound.play().catch(e => {}); // ignore autoplay errors – we'll call after user gesture
}

// Initialize audio context on first click (to unlock audio)
function enableAudioOnUserGesture() {
    const unlockAudio = () => {
        // Play a silent sound to unlock Web Audio (if we were using Web Audio API)
        // But we're using simple Audio elements – they are already "unlocked" by user interaction.
        // We'll just remove the listener.
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);
}

// Call this at the beginning of game.js
enableAudioOnUserGesture();
