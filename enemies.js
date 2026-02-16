// ==================== ENEMIES.JS ====================
console.log('enemies.js loaded (with learning AI + real‑time adaptation + multiplayer)');

// ========== GLOBAL FRAME COUNTER (set by game.js) ==========
let globalFrame = 0;
function setGlobalFrame(frame) { globalFrame = frame; }

// ========== PLAYER PROFILE & CROSS‑GAME LEARNING ==========
const playerProfile = {
    totalGames: 0,
    avgPlayerX: 0.5,
    avgPlayerY: 0.8,
    shotCount: 0,
    moveLeftCount: 0,
    moveRightCount: 0,
    moveUpCount: 0,
    moveDownCount: 0,
    totalFrames: 0,
    get leftBias() {
        const total = this.moveLeftCount + this.moveRightCount;
        return total === 0 ? 0.5 : this.moveLeftCount / total;
    },
    get upBias() {
        const total = this.moveUpCount + this.moveDownCount;
        return total === 0 ? 0.5 : this.moveUpCount / total;
    },
    get shotsPerFrame() {
        return this.totalFrames === 0 ? 0 : this.shotCount / this.totalFrames;
    }
};

function loadProfile() {
    const saved = localStorage.getItem('spaceShooters_playerProfile');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            Object.assign(playerProfile, data);
            console.log('Player profile loaded', playerProfile);
        } catch (e) {
            console.warn('Failed to load profile', e);
        }
    }
}

function saveProfile() {
    localStorage.setItem('spaceShooters_playerProfile', JSON.stringify(playerProfile));
}

function updateProfile(gameStats) {
    playerProfile.totalGames++;
    const oldWeight = playerProfile.totalGames - 1;
    playerProfile.avgPlayerX = (playerProfile.avgPlayerX * oldWeight + gameStats.avgX) / playerProfile.totalGames;
    playerProfile.avgPlayerY = (playerProfile.avgPlayerY * oldWeight + gameStats.avgY) / playerProfile.totalGames;
    playerProfile.shotCount += gameStats.shotsFired;
    playerProfile.moveLeftCount += gameStats.leftMoves;
    playerProfile.moveRightCount += gameStats.rightMoves;
    playerProfile.moveUpCount += gameStats.upMoves;
    playerProfile.moveDownCount += gameStats.downMoves;
    playerProfile.totalFrames += gameStats.totalFrames;
    saveProfile();
    console.log('Profile updated', playerProfile);
}

window.enemyLearning = {
    loadProfile,
    updateProfile,
    getProfile: () => playerProfile,
    setGlobalFrame
};

loadProfile();

// ========== REAL‑TIME LIVE LEARNING ==========
const liveLearning = {
    playerPositions: [],      // last 60 normalized positions
    playerShots: [],          // frame numbers of recent shots
    lastAnalysisFrame: 0,
    analysisInterval: 60,     // analyse every 60 frames

    // Called every frame with current player data
    update(playerX, playerY, shotThisFrame) {
        // Store normalized position
        this.playerPositions.push({ x: playerX / 1024, y: playerY / 768, frame: globalFrame });
        if (this.playerPositions.length > 60) this.playerPositions.shift();

        if (shotThisFrame) {
            this.playerShots.push(globalFrame);
            if (this.playerShots.length > 20) this.playerShots.shift();
        }

        // Analyse at intervals
        if (globalFrame - this.lastAnalysisFrame >= this.analysisInterval) {
            this.analyse();
            this.lastAnalysisFrame = globalFrame;
        }
    },

    analyse() {
        if (this.playerPositions.length < 10) return;

        // Average X (left/right bias)
        const avgX = this.playerPositions.reduce((sum, p) => sum + p.x, 0) / this.playerPositions.length;
        // Average Y (vertical bias)
        const avgY = this.playerPositions.reduce((sum, p) => sum + p.y, 0) / this.playerPositions.length;
        // Recent shot rate (shots per frame over last 60 frames)
        const recentShots = this.playerShots.filter(ts => globalFrame - ts < 60).length;
        const shotRate = recentShots / 60;

        // Adjust waveManager parameters for NEXT spawns
        if (avgX < 0.3) {
            waveManager.spawnBias = 'right';   // player stays left → spawn enemies from right
        } else if (avgX > 0.7) {
            waveManager.spawnBias = 'left';
        } else {
            waveManager.spawnBias = 'random';
        }

        // If player stays high (avgY < 0.5), make enemies faster
        waveManager.enemySpeedMultiplier = (avgY < 0.5) ? 1.3 : 1.0;

        // If player shoots a lot, use erratic sine patterns
        waveManager.forceSinePattern = (shotRate > 0.1);
    },

    reset() {
        this.playerPositions = [];
        this.playerShots = [];
        this.lastAnalysisFrame = 0;
    }
};

// ========== MULTIPLAYER SUPPORT ==========
let multiplayerMode = false;
let remotePlayer = null; // { x, y, width, height, ... } if opponent appears as enemy

function setMultiplayer(enabled) {
    multiplayerMode = enabled;
}

function updateRemotePlayer(data) {
    remotePlayer = data;
}

// Serialize enemies for network transmission (only positions/types)
function serializeEnemies() {
    return waveManager.enemies.map(e => ({
        x: e.x, y: e.y, type: e.type, pattern: e.pattern, speed: e.speed
    }));
}

// ========== ENEMY CLASS ==========
class Enemy {
    constructor(x, y, type = 'enemy1', learning = null, speedMultiplier = 1.0) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.width = 40;
        this.height = 40;
        this.speed = 2 * speedMultiplier;
        this.hp = 1;
        this.pattern = 'down';
        this.frame = 0;
        this.lastShot = 0;

        // Apply cross‑game learning (historical profile)
        if (learning) {
            if (learning.leftBias > 0.6) {
                this.x = 800 + Math.random() * 200;
            } else if (learning.leftBias < 0.4) {
                this.x = 50 + Math.random() * 200;
            }
            if (learning.upBias > 0.7) {
                this.speed *= 1.25;
            }
            if (learning.shotsPerFrame > 0.05) {
                this.speed *= 1.4;
                this.pattern = 'sine';
            }
        }
    }

    update(playerX, playerY) {
        this.y += this.speed;
        if (this.pattern === 'sine') {
            this.x += Math.sin(this.frame * 0.1) * 1.5;
        }
        this.frame++;
    }

    shoot() {
        return {
            x: this.x + this.width / 2,
            y: this.y + this.height,
            w: 5,
            h: 10,
            speed: 4
        };
    }
}

// ========== WAVE MANAGER ==========
const waveManager = {
    enemies: [],
    waveCount: 0,
    spawnTimer: 0,
    spawnInterval: 30,
    enemiesPerWave: 5,
    active: true,
    learningProfile: null,
    // Real‑time adaptation parameters
    spawnBias: 'random',        // 'left', 'right', 'random'
    enemySpeedMultiplier: 1.0,
    forceSinePattern: false,

    update() {
        if (!this.active) return;

        this.spawnTimer--;

        if (this.spawnTimer <= 0 && this.enemies.length < 20) {
            this.spawnEnemy();
            this.spawnTimer = this.spawnInterval;
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            e.update();

            if (e.y > 768) {
                this.enemies.splice(i, 1);
            }
        }
    },

    spawnEnemy() {
        let x;
        switch (this.spawnBias) {
            case 'left':  x = 50 + Math.random() * 200; break;
            case 'right': x = 800 + Math.random() * 200; break;
            default:      x = 50 + Math.random() * (1024 - 100);
        }
        const y = -40;
        const type = Math.random() < 0.7 ? 'enemy1' : 'enemy2';
        const enemy = new Enemy(x, y, type, this.learningProfile, this.enemySpeedMultiplier);

        // Override pattern based on wave and live learning
        if (this.forceSinePattern) {
            enemy.pattern = 'sine';
        } else {
            enemy.pattern = this.waveCount % 2 === 0 ? 'down' : 'sine';
        }
        this.enemies.push(enemy);
        console.log(`Spawned enemy at (${x}, ${y}), type: ${type}, speed: ${enemy.speed}, pattern: ${enemy.pattern}`);
    },

    startWave() {
        this.waveCount++;
        this.spawnInterval = Math.max(20, 60 - this.waveCount * 2);
        if (this.learningProfile && this.learningProfile.shotsPerFrame > 0.05) {
            this.spawnInterval = Math.max(15, this.spawnInterval - 5);
        }
        this.enemiesPerWave = 5 + this.waveCount;
        this.spawnTimer = 30;
        console.log(`Wave ${this.waveCount} started, spawnInterval: ${this.spawnInterval}`);
    },

    reset() {
        this.enemies = [];
        this.waveCount = 0;
        this.spawnTimer = 0;
        this.spawnBias = 'random';
        this.enemySpeedMultiplier = 1.0;
        this.forceSinePattern = false;
        liveLearning.reset();
        console.log('waveManager reset');
    },

    applyLearning() {
        this.learningProfile = playerProfile.totalGames > 0 ? playerProfile : null;
        if (this.learningProfile) {
            console.log('Applying learning from', this.learningProfile.totalGames, 'previous games');
        }
    },

    // Multiplayer sync: get enemies for network
    getSerializedEnemies() {
        return serializeEnemies();
    },

    // For host: optionally inject remote player as an enemy
    getRemotePlayerEnemy() {
        return remotePlayer ? [{
            x: remotePlayer.x,
            y: remotePlayer.y,
            width: remotePlayer.width || 40,
            height: remotePlayer.height || 40,
            type: 'remote',
            isRemote: true
        }] : [];
    }
};

// Expose multiplayer controls
window.multiplayer = {
    setMultiplayer,
    updateRemotePlayer,
    serializeEnemies
};

window.waveManager = waveManager;
window.liveLearning = liveLearning; // for game.js to call update()
