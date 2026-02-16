// ==================== ENEMIES.JS ====================
// Enemy definition
class Enemy {
    constructor(x, y, type = 'enemy1') {
        this.x = x;
        this.y = y;
        this.type = type;
        this.width = 40;
        this.height = 40;
        this.speed = 2;
        this.hp = 1;
        this.pattern = 'down'; // movement pattern
        this.frame = 0;
        this.lastShot = 0;
    }

    update(playerX, playerY) {
        // Basic movement: go down, sometimes sideways
        this.y += this.speed;
        if (this.pattern === 'sine') {
            this.x += Math.sin(this.frame * 0.1) * 1.5;
        }
        this.frame++;
    }

    shoot() {
        // Enemy shooting logic (called from game loop)
        return {
            x: this.x + this.width/2,
            y: this.y + this.height,
            w: 5,
            h: 10,
            speed: 4
        };
    }
}

// Wave manager
const waveManager = {
    enemies: [],
    waveCount: 0,
    spawnTimer: 0,
    spawnInterval: 60, // frames
    enemiesPerWave: 5,
    active: true,

    update() {
        if (!this.active) return;

        // Spawn new enemies over time
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
        // Set pattern based on wave
        enemy.pattern = this.waveCount % 2 === 0 ? 'down' : 'sine';
        this.enemies.push(enemy);
    },

    startWave() {
        this.waveCount++;
        this.spawnInterval = Math.max(20, 60 - this.waveCount * 2);
        this.enemiesPerWave = 5 + this.waveCount;
        // Reset spawn timer
        this.spawnTimer = 30;
    },

    reset() {
        this.enemies = [];
        this.waveCount = 0;
        this.spawnTimer = 0;
    }
};
