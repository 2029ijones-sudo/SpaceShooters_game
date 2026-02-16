// ==================== ENEMIES.JS ====================
console.log('enemies.js loaded'); // Confirm file is loaded

class Enemy {
    constructor(x, y, type = 'enemy1') {
        this.x = x;
        this.y = y;
        this.type = type;
        this.width = 40;
        this.height = 40;
        this.speed = 2;
        this.hp = 1;
        this.pattern = 'down';
        this.frame = 0;
        this.lastShot = 0;
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

const waveManager = {
    enemies: [],
    waveCount: 0,
    spawnTimer: 0,
    spawnInterval: 30,          // reduced from 60 for faster spawning (debug)
    enemiesPerWave: 5,
    active: true,

    update() {
        if (!this.active) {
            console.log('waveManager is inactive');
            return;
        }

        // Debug: log timer and enemy count occasionally
        if (this.spawnTimer % 30 === 0) {
            console.log(`spawnTimer: ${this.spawnTimer}, enemies: ${this.enemies.length}`);
        }

        // Spawn new enemies
        if (this.spawnTimer <= 0 && this.enemies.length < 20) {
            this.spawnEnemy();
            this.spawnTimer = this.spawnInterval;
        } else {
            this.spawnTimer--;
        }

        // Update all enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            e.update();

            // Remove if off screen (below canvas)
            if (e.y > 768) {
                this.enemies.splice(i, 1);
            }
        }
    },

    spawnEnemy() {
        const x = 50 + Math.random() * (1024 - 100);
        const y = -40;
        const type = Math.random() < 0.7 ? 'enemy1' : 'enemy2';
        const enemy = new Enemy(x, y, type);
        enemy.pattern = this.waveCount % 2 === 0 ? 'down' : 'sine';
        this.enemies.push(enemy);
        console.log(`Spawned enemy at (${x}, ${y}), type: ${type}, total enemies: ${this.enemies.length}`);
    },

    startWave() {
        this.waveCount++;
        this.spawnInterval = Math.max(20, 60 - this.waveCount * 2);
        this.enemiesPerWave = 5 + this.waveCount;
        this.spawnTimer = 30;          // first enemy appears after 30 frames
        console.log(`Wave ${this.waveCount} started, spawnInterval: ${this.spawnInterval}`);
    },

    reset() {
        this.enemies = [];
        this.waveCount = 0;
        this.spawnTimer = 0;
        console.log('waveManager reset');
    }
};

// Expose waveManager globally (already is, but just to be sure)
window.waveManager = waveManager;
