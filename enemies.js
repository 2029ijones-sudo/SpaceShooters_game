// ==================== ENEMIES.JS ====================
console.log('enemies.js loaded (with learning AI)');

// ========== PLAYER PROFILE & LEARNING ==========
const playerProfile = {
    // Aggregated stats across all games
    totalGames: 0,
    avgPlayerX: 0.5,      // 0 = far left, 1 = far right
    avgPlayerY: 0.8,       // 0 = top, 1 = bottom
    shotCount: 0,
    moveLeftCount: 0,
    moveRightCount: 0,
    moveUpCount: 0,
    moveDownCount: 0,
    totalFrames: 0,
    // Derived tendencies
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

// Load profile from localStorage
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

// Save profile to localStorage
function saveProfile() {
    localStorage.setItem('spaceShooters_playerProfile', JSON.stringify(playerProfile));
}

// Update profile with data from a single game
function updateProfile(gameStats) {
    playerProfile.totalGames++;
    // Weighted average for position (new average = (oldAvg * oldCount + newAvg) / (oldCount+1))
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

// Expose learning functions globally
window.enemyLearning = {
    loadProfile,
    updateProfile,
    getProfile: () => playerProfile
};

// Load profile at startup
loadProfile();

// ========== ENEMY CLASS ==========
class Enemy {
    constructor(x, y, type = 'enemy1', learning = null) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.width = 40;
        this.height = 40;
        // Base speed, may be modified by learning
        this.speed = 2;
        this.hp = 1;
        this.pattern = 'down';
        this.frame = 0;
        this.lastShot = 0;

        // Apply learning adjustments if provided
        if (learning) {
            // If player stays left, make enemies come more from right
            if (learning.leftBias > 0.6) {
                this.x = 800 + Math.random() * 200; // spawn right side
            } else if (learning.leftBias < 0.4) {
                this.x = 50 + Math.random() * 200;  // spawn left side
            }
            // If player moves up a lot, increase speed
            if (learning.upBias > 0.7) {
                this.speed = 2.5;
            }
            // If player shoots a lot, increase enemy speed or make pattern erratic
            if (learning.shotsPerFrame > 0.05) {
                this.speed = 2.8;
                this.pattern = 'sine'; // more unpredictable
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

// ========== WAVE MANAGER WITH LEARNING ==========
const waveManager = {
    enemies: [],
    waveCount: 0,
    spawnTimer: 0,
    spawnInterval: 30,
    enemiesPerWave: 5,
    active: true,
    // Current learning profile (may be null)
    learningProfile: null,

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
        // Base random position
        let x = 50 + Math.random() * (1024 - 100);
        const y = -40;
        const type = Math.random() < 0.7 ? 'enemy1' : 'enemy2';
        const enemy = new Enemy(x, y, type, this.learningProfile);
        // Override pattern based on wave and learning
        if (this.learningProfile && this.learningProfile.shotsPerFrame > 0.05) {
            enemy.pattern = 'sine'; // more aggressive
        } else {
            enemy.pattern = this.waveCount % 2 === 0 ? 'down' : 'sine';
        }
        this.enemies.push(enemy);
        console.log(`Spawned enemy at (${x}, ${y}), type: ${type}, speed: ${enemy.speed}`);
    },

    startWave() {
        this.waveCount++;
        this.spawnInterval = Math.max(20, 60 - this.waveCount * 2);
        // Adjust interval based on player shooting frequency
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
        console.log('waveManager reset');
    },

    // Call this at game start to apply learning
    applyLearning() {
        this.learningProfile = playerProfile.totalGames > 0 ? playerProfile : null;
        if (this.learningProfile) {
            console.log('Applying learning from', this.learningProfile.totalGames, 'previous games');
        }
    }
};

window.waveManager = waveManager;
