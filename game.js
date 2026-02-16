// ==================== GAME.JS ====================
// Wait for assets to load
window.addEventListener('load', () => {
    console.log('Page loaded, calling loadAssets...');
    loadAssets(startGame);
});

function startGame() {
    console.log('startGame() called – assets loaded, game starting');

    // Ensure waveManager exists (from enemies.js)
    if (typeof waveManager === 'undefined') {
        console.error('waveManager not found! Check that enemies.js is loaded before game.js');
        window.waveManager = {
            enemies: [],
            waveCount: 0,
            update: function() {},
            startWave: function() { console.log('Dummy wave started'); }
        };
    }

    // Apply learning from previous games (enemies adapt to your style)
    if (waveManager.applyLearning) {
        waveManager.applyLearning();
    }

    // Canvas setup
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // ========== OPEN WORLD PARAMETERS ==========
    const WORLD_SIZE = 100000;                     // virtual universe size (pixels)
    let worldX = 512;                               // player's absolute X in world
    let worldY = 650;                               // player's absolute Y in world
    const SECTOR_SIZE = 1024;                       // size of one sector (matches canvas)
    let currentSector = { x: 0, y: 0 };
    let loadedSectors = new Set();                  // track loaded sectors to avoid reloading
    let sectorEnemies = new Map();                   // key "x,y" -> array of enemies (world coordinates)

    // Camera: top‑left corner of viewport in world coordinates
    let camera = { x: 0, y: 0 };

    // ========== GAME STATE ==========
    let player = {
        width: 50,
        height: 50,
        speed: 5,
        lives: 3,
        invincible: 0
    };

    let bullets = [];
    let enemyBullets = [];
    let healthPickups = [];
    let score = 0;
    let gameOver = false;
    let frame = 0;

    // Kill count for bullet progression (unlimited)
    let killCount = 0;

    // Wave tracking – now global (difficulty increases over time)
    let currentWave = 0;
    let waveMessage = '';
    let waveMessageTimer = 0;

    // Cheat system integration
    let cheatMenuOpen = false;

    // Input handling
    const keys = {};
    window.addEventListener('keydown', e => keys[e.code] = true);
    window.addEventListener('keyup', e => keys[e.code] = false);

    // Shooting cooldown
    let shootCooldown = 0;

    // ========== PLAYER STATS TRACKING (FOR CROSS‑GAME LEARNING) ==========
    let gameStats = {
        avgX: 0,
        avgY: 0,
        shotsFired: 0,
        leftMoves: 0,
        rightMoves: 0,
        upMoves: 0,
        downMoves: 0,
        totalFrames: 0
    };

    // ========== MULTIPLAYER (LAN) ==========
    let multiplayerActive = false;
    let remotePlayer = null;
    let isHost = false;

    if (window.network) {
        window.network.onRemoteUpdate = (data) => {
            remotePlayer = data;
            if (window.multiplayer) window.multiplayer.updateRemotePlayer(data);
        };
        window.network.onDisconnect = () => {
            multiplayerActive = false;
            remotePlayer = null;
            console.log('Remote player disconnected');
        };
    }

    // ========== CHEAT MENU TOGGLE (LEFT CLICK) ==========
    canvas.addEventListener('click', (e) => {
        if (e.button === 0) {
            e.preventDefault();
            cheatMenuOpen = !cheatMenuOpen;
            if (cheatMenuOpen) console.log('Cheat menu opened');
        }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
        if (cheatMenuOpen) {
            e.preventDefault();
            if (window.cheatSystem) {
                window.cheatSystem.handleCheatKey(e);
                if (e.key === 'Escape') cheatMenuOpen = false;
            }
        }
    });

    window.applyCheatEffect = (cheatId) => {
        switch(cheatId) {
            case 'extralife':
                player.lives++;
                document.getElementById('lives').textContent = player.lives;
                waveMessage = 'EXTRA LIFE!';
                waveMessageTimer = 60;
                break;
        }
    };

    // Start first wave
    waveManager.startWave();
    currentWave = waveManager.waveCount;
    if (window.cheatSystem) window.cheatSystem.updateUnlocks(currentWave);
    waveMessage = `WAVE ${currentWave}`;
    waveMessageTimer = 60;

    // ========== SECTOR MANAGEMENT ==========
    function getSectorKey(wx, wy) {
        return `${Math.floor(wx / SECTOR_SIZE)},${Math.floor(wy / SECTOR_SIZE)}`;
    }

    function generateSector(sx, sy) {
        const key = `${sx},${sy}`;
        if (sectorEnemies.has(key)) return; // already generated

        const enemies = [];
        // Procedurally generate enemies based on sector coordinates and wave
        const enemyCount = 3 + Math.floor(Math.random() * 5) + waveManager.waveCount;
        for (let i = 0; i < enemyCount; i++) {
            const x = sx * SECTOR_SIZE + Math.random() * SECTOR_SIZE;
            const y = sy * SECTOR_SIZE + Math.random() * SECTOR_SIZE;
            const type = Math.random() < 0.7 ? 'enemy1' : 'enemy2';
            // Create enemy using waveManager's learning profile
            const enemy = new Enemy(x, y, type, waveManager.learningProfile);
            enemy.pattern = waveManager.waveCount % 2 === 0 ? 'down' : 'sine';
            enemies.push(enemy);
        }
        sectorEnemies.set(key, enemies);
        loadedSectors.add(key);
        console.log(`Generated sector ${key} with ${enemies.length} enemies`);
    }

    function updateSector() {
        const sx = Math.floor(worldX / SECTOR_SIZE);
        const sy = Math.floor(worldY / SECTOR_SIZE);
        if (currentSector.x !== sx || currentSector.y !== sy) {
            currentSector = { x: sx, y: sy };
            // Generate current and adjacent sectors (9 sectors)
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    generateSector(sx + dx, sy + dy);
                }
            }
            // Optional: unload far sectors to save memory
        }
    }

    // Get all enemies that are in loaded sectors (near player)
    function getNearbyEnemies() {
        const nearby = [];
        for (let enemies of sectorEnemies.values()) {
            nearby.push(...enemies);
        }
        return nearby;
    }

    // ========== HELPER: Generate bullets based on kill count ==========
    function createBullets(playerX, playerY, playerWidth, baseSpeed, rapidFireActive) {
        const bulletsArray = [];
        let baseWidth = 4;
        let baseHeight = 15;
        let baseSpeedValue = -8;

        const scale = 1 + killCount * 0.02;
        const bulletWidth = baseWidth * scale;
        const bulletHeight = baseHeight * scale;
        const bulletSpeed = baseSpeedValue * (1 + killCount * 0.01);

        let bulletCount = 1 + Math.floor(killCount / 10);
        if (bulletCount > 20) bulletCount = 20;

        const spreadAngle = 0.1;
        const centerX = playerX + playerWidth / 2;
        const startY = playerY - 10;

        if (bulletCount === 1) {
            bulletsArray.push({
                x: centerX - bulletWidth / 2,
                y: startY,
                w: bulletWidth,
                h: bulletHeight,
                speed: bulletSpeed
            });
        } else {
            for (let i = 0; i < bulletCount; i++) {
                const angleOffset = (i - (bulletCount - 1) / 2) * spreadAngle;
                const speedX = Math.sin(angleOffset) * Math.abs(bulletSpeed) * 0.5;
                const speedY = bulletSpeed * Math.cos(angleOffset);
                bulletsArray.push({
                    x: centerX - bulletWidth / 2,
                    y: startY,
                    w: bulletWidth,
                    h: bulletHeight,
                    speedX: speedX,
                    speedY: speedY
                });
            }
        }
        return bulletsArray;
    }

    // ========== GAME LOOP ==========
    function gameLoop() {
        if (gameOver) {
            document.getElementById('gameOver').style.display = 'block';
            if (window.enemyLearning) window.enemyLearning.updateProfile(gameStats);
            if (window.network) window.network.disconnect();
            return;
        }

        if (!cheatMenuOpen) {
            update();
        }
        draw();

        requestAnimationFrame(gameLoop);
    }

    // ========== UPDATE ==========
    function update() {
        if (window.enemyLearning) window.enemyLearning.setGlobalFrame(frame);

        // Player movement (world coordinates)
        const leftPressed = keys['ArrowLeft'] || keys['KeyA'];
        const rightPressed = keys['ArrowRight'] || keys['KeyD'];
        const upPressed = keys['ArrowUp'] || keys['KeyW'];
        const downPressed = keys['ArrowDown'] || keys['KeyS'];

        if (leftPressed) worldX = Math.max(0, worldX - player.speed);
        if (rightPressed) worldX = Math.min(WORLD_SIZE - player.width, worldX + player.speed);
        if (upPressed) worldY = Math.max(0, worldY - player.speed);
        if (downPressed) worldY = Math.min(WORLD_SIZE - player.height, worldY + player.speed);

        // Update camera to center on player
        camera.x = worldX - canvas.width / 2;
        camera.y = worldY - canvas.height / 2;
        camera.x = Math.max(0, Math.min(camera.x, WORLD_SIZE - canvas.width));
        camera.y = Math.max(0, Math.min(camera.y, WORLD_SIZE - canvas.height));

        // Update sector based on new position
        updateSector();

        // Update stats for cross‑game learning
        gameStats.totalFrames++;
        gameStats.avgX = (gameStats.avgX * (gameStats.totalFrames - 1) + (worldX / WORLD_SIZE)) / gameStats.totalFrames;
        gameStats.avgY = (gameStats.avgY * (gameStats.totalFrames - 1) + (worldY / WORLD_SIZE)) / gameStats.totalFrames;
        if (leftPressed) gameStats.leftMoves++;
        if (rightPressed) gameStats.rightMoves++;
        if (upPressed) gameStats.upMoves++;
        if (downPressed) gameStats.downMoves++;

        // Check active cheats
        const rapidFireActive = window.cheatSystem ? window.cheatSystem.isCheatActive('rapidfire') : false;
        const invincibleActive = window.cheatSystem ? window.cheatSystem.isCheatActive('invincible') : false;
        const autoAimActive = window.cheatSystem ? window.cheatSystem.isCheatActive('autotarget') : false;
        const oneHitKillActive = window.cheatSystem ? window.cheatSystem.isCheatActive('onehitkill') : false;

        // Shooting
        const shotThisFrame = keys['Space'] && shootCooldown <= 0;
        if (shotThisFrame) {
            const newBullets = createBullets(worldX, worldY, player.width, -8, rapidFireActive);
            bullets.push(...newBullets);
            playSound('laser', 0.5);
            shootCooldown = rapidFireActive ? 5 : 10;
            gameStats.shotsFired += newBullets.length;
        }
        if (shootCooldown > 0) shootCooldown--;

        // Real‑time learning
        if (window.liveLearning) {
            window.liveLearning.update(worldX, worldY, shotThisFrame);
        }

        // Get all enemies near player (from loaded sectors)
        const allEnemies = getNearbyEnemies();

        // Update enemies (only those on screen? For performance, we could update all, but let's keep it simple)
        allEnemies.forEach(e => e.update(worldX, worldY));

        // Update player bullets (world coordinates)
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            if (b.speedX !== undefined) {
                b.x += b.speedX;
                b.y += b.speedY;
            } else {
                b.y += b.speed;
            }
            // Remove if far outside loaded area (optional)
            if (b.y + b.h < 0 || b.y > WORLD_SIZE || b.x + b.w < 0 || b.x > WORLD_SIZE) {
                bullets.splice(i, 1);
            }
        }

        // Enemy shooting (world coordinates)
        let enemyShootRate = Math.min(0.5, 0.2 + currentWave * 0.02);
        if (window.enemyLearning && window.enemyLearning.getProfile().shotsPerFrame > 0.05) {
            enemyShootRate += 0.1;
        }
        if (frame % 30 === 0) {
            allEnemies.forEach(enemy => {
                if (Math.random() < enemyShootRate) {
                    const eb = enemy.shoot();
                    // Convert enemy bullet to world coordinates
                    enemyBullets.push(eb);
                }
            });
        }

        // Update enemy bullets
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            enemyBullets[i].y += enemyBullets[i].speed;
            if (enemyBullets[i].y > WORLD_SIZE) enemyBullets.splice(i, 1);
        }

        // Collisions: player bullets vs enemies (world coordinates)
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            for (let j = allEnemies.length - 1; j >= 0; j--) {
                const e = allEnemies[j];
                if (b.x < e.x + e.width &&
                    b.x + b.w > e.x &&
                    b.y < e.y + e.height &&
                    b.y + b.h > e.y) {
                    bullets.splice(i, 1);
                    // Remove enemy from its sector
                    const key = getSectorKey(e.x, e.y);
                    const sectorList = sectorEnemies.get(key);
                    if (sectorList) {
                        const idx = sectorList.indexOf(e);
                        if (idx !== -1) sectorList.splice(idx, 1);
                    }
                    score += 10;
                    killCount++;
                    playSound('explode', 0.7);

                    // Drop health pickup (100% chance)
                    healthPickups.push({
                        x: e.x + e.width/2 - 10,
                        y: e.y,
                        w: 20,
                        h: 20,
                        speed: 2
                    });
                    break;
                }
            }
        }

        // Health pickups update and collection
        for (let i = healthPickups.length - 1; i >= 0; i--) {
            const h = healthPickups[i];
            h.y += h.speed;
            if (h.y > WORLD_SIZE) {
                healthPickups.splice(i, 1);
                continue;
            }
            // Collision with player (world coordinates)
            if (h.x < worldX + player.width && h.x + h.w > worldX &&
                h.y < worldY + player.height && h.y + h.h > worldY) {
                player.lives++;
                document.getElementById('lives').textContent = player.lives;
                healthPickups.splice(i, 1);
                playSound('explode', 0.5);
            }
        }

        // Enemy bullets vs player
        if (player.invincible <= 0 && !invincibleActive) {
            for (let i = enemyBullets.length - 1; i >= 0; i--) {
                const eb = enemyBullets[i];
                if (eb.x < worldX + player.width && eb.x + eb.w > worldX &&
                    eb.y < worldY + player.height && eb.y + eb.h > worldY) {
                    enemyBullets.splice(i, 1);
                    player.lives--;
                    player.invincible = 60;
                    playSound('explode', 1);
                    if (player.lives <= 0) gameOver = true;
                    break;
                }
            }
        } else {
            player.invincible--;
        }

        // Enemies vs player
        if (player.invincible <= 0 && !invincibleActive) {
            for (let i = allEnemies.length - 1; i >= 0; i--) {
                const e = allEnemies[i];
                if (e.x < worldX + player.width && e.x + e.width > worldX &&
                    e.y < worldY + player.height && e.y + e.height > worldY) {
                    // Remove enemy
                    const key = getSectorKey(e.x, e.y);
                    const sectorList = sectorEnemies.get(key);
                    if (sectorList) {
                        const idx = sectorList.indexOf(e);
                        if (idx !== -1) sectorList.splice(idx, 1);
                    }
                    player.lives--;
                    player.invincible = 60;
                    playSound('explode', 1);
                    if (player.lives <= 0) gameOver = true;
                    break;
                }
            }
        }

        // Multiplayer sync
        if (multiplayerActive && window.network) {
            window.network.sendPlayerState({
                x: worldX, y: worldY,
                width: player.width, height: player.height,
                lives: player.lives
            });
            if (isHost && window.network.sendEnemyState) {
                // Send nearby enemies (limit to reduce network traffic)
                const nearbyEnemies = allEnemies.filter(e => {
                    const dx = e.x - worldX;
                    const dy = e.y - worldY;
                    return Math.abs(dx) < 2000 && Math.abs(dy) < 2000;
                }).map(e => ({ x: e.x, y: e.y, type: e.type }));
                window.network.sendEnemyState(nearbyEnemies);
            }
        }

        // Update UI
        document.getElementById('lives').textContent = player.lives;
        document.getElementById('score').textContent = score;

        // Wave progression (global, based on time or kills)
        if (killCount > currentWave * 10) {
            waveManager.startWave();
            currentWave = waveManager.waveCount;
            if (window.cheatSystem) window.cheatSystem.updateUnlocks(currentWave);
            waveMessage = `WAVE ${currentWave}`;
            waveMessageTimer = 60;
        }
        if (waveMessageTimer > 0) waveMessageTimer--;

        // Auto‑aim cheat (simplified for world coordinates)
        if (autoAimActive && allEnemies.length > 0) {
            bullets.forEach(b => {
                let closestDist = Infinity;
                let closestEnemy = null;
                allEnemies.forEach(e => {
                    const dx = (e.x + e.width/2) - (b.x + b.w/2);
                    const dy = (e.y + e.height/2) - (b.y + b.h/2);
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestEnemy = e;
                    }
                });
                if (closestEnemy) {
                    const targetX = closestEnemy.x + closestEnemy.width/2;
                    const targetY = closestEnemy.y + closestEnemy.height/2;
                    const dx = targetX - (b.x + b.w/2);
                    const dy = targetY - (b.y + b.h/2);
                    if (b.speedX !== undefined) {
                        b.speedX += Math.sign(dx) * 0.2;
                        b.speedY += Math.sign(dy) * 0.2;
                        const sp = Math.sqrt(b.speedX*b.speedX + b.speedY*b.speedY);
                        if (sp > 0) {
                            b.speedX = (b.speedX / sp) * Math.abs(b.speedY);
                            b.speedY = (b.speedY / sp) * Math.abs(b.speedY);
                        }
                    } else {
                        b.x += Math.sign(dx) * Math.min(Math.abs(dx)*0.1, 2);
                    }
                }
            });
        }

        frame++;
    }

    // ========== DRAW ==========
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background video (full screen, but in world coordinates we can just draw it static)
        if (assets.videos && assets.videos.nebula && assets.videos.nebula.readyState >= 2) {
            // For open world, you might tile the video or draw it once. Here we draw it scaled to canvas.
            ctx.drawImage(assets.videos.nebula, 0, 0, canvas.width, canvas.height);
        } else {
            // Simple starfield (scrolling)
            ctx.fillStyle = 'white';
            for (let i = 0; i < 100; i++) {
                let sx = (i * 73 + frame) % canvas.width;
                let sy = (frame * 0.5 + i * 23) % canvas.height;
                ctx.fillRect(sx, sy, 2, 2);
            }
        }

        // Wave message
        if (waveMessageTimer > 0) {
            ctx.font = '40px "Press Start 2P", monospace';
            ctx.fillStyle = '#ffd966';
            ctx.textAlign = 'center';
            ctx.fillText(waveMessage, canvas.width/2, 300);
        }

        // Draw player (convert world to screen)
        const playerScreenX = worldX - camera.x;
        const playerScreenY = worldY - camera.y;
        if (player.invincible <= 0 || Math.floor(frame / 5) % 2 === 0) {
            if (assets.useVideo('playerVideo')) {
                ctx.drawImage(assets.videos.playerVideo, playerScreenX, playerScreenY, player.width, player.height);
            } else if (assets.images && assets.images.player) {
                ctx.drawImage(assets.images.player, playerScreenX, playerScreenY, player.width, player.height);
            } else {
                ctx.fillStyle = 'cyan';
                ctx.fillRect(playerScreenX, playerScreenY, player.width, player.height);
            }
        }

        // Draw enemies (world to screen)
        const allEnemies = getNearbyEnemies();
        allEnemies.forEach(e => {
            const ex = e.x - camera.x;
            const ey = e.y - camera.y;
            // Only draw if on screen
            if (ex + e.width > 0 && ex < canvas.width && ey + e.height > 0 && ey < canvas.height) {
                if (assets.useVideo('enemyVideo')) {
                    ctx.drawImage(assets.videos.enemyVideo, ex, ey, e.width, e.height);
                } else if (assets.images && assets.images[e.type]) {
                    ctx.drawImage(assets.images[e.type], ex, ey, e.width, e.height);
                } else {
                    ctx.fillStyle = 'red';
                    ctx.fillRect(ex, ey, e.width, e.height);
                }
            }
        });

        // Draw remote player
        if (multiplayerActive && remotePlayer) {
            const rx = remotePlayer.x - camera.x;
            const ry = remotePlayer.y - camera.y;
            if (rx + 50 > 0 && rx < canvas.width && ry + 50 > 0 && ry < canvas.height) {
                if (assets.useVideo('playerVideo')) {
                    ctx.globalAlpha = 0.7;
                    ctx.drawImage(assets.videos.playerVideo, rx, ry, remotePlayer.width || 50, remotePlayer.height || 50);
                    ctx.globalAlpha = 1.0;
                } else {
                    ctx.fillStyle = 'purple';
                    ctx.fillRect(rx, ry, remotePlayer.width || 50, remotePlayer.height || 50);
                }
            }
        }

        // Draw health pickups
        healthPickups.forEach(h => {
            const hx = h.x - camera.x;
            const hy = h.y - camera.y;
            if (hx + h.w > 0 && hx < canvas.width && hy + h.h > 0 && hy < canvas.height) {
                ctx.fillStyle = '#0f0';
                ctx.beginPath();
                ctx.arc(hx + h.w/2, hy + h.h/2, h.w/2, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = 'white';
                ctx.fillRect(hx + h.w/2 - 2, hy + 4, 4, h.h-8);
                ctx.fillRect(hx + 4, hy + h.h/2 - 2, h.w-8, 4);
            }
        });

        // Draw player bullets
        bullets.forEach(b => {
            const bx = b.x - camera.x;
            const by = b.y - camera.y;
            if (bx + b.w > 0 && bx < canvas.width && by + b.h > 0 && by < canvas.height) {
                if (assets.images && assets.images.bullet) {
                    ctx.drawImage(assets.images.bullet, bx, by, b.w, b.h);
                } else {
                    ctx.fillStyle = 'yellow';
                    ctx.fillRect(bx, by, b.w, b.h);
                }
            }
        });

        // Draw enemy bullets
        enemyBullets.forEach(b => {
            const bx = b.x - camera.x;
            const by = b.y - camera.y;
            if (bx + b.w > 0 && bx < canvas.width && by + b.h > 0 && by < canvas.height) {
                if (assets.images && assets.images.enemyBullet) {
                    ctx.drawImage(assets.images.enemyBullet, bx, by, b.w, b.h);
                } else {
                    ctx.fillStyle = 'orange';
                    ctx.fillRect(bx, by, b.w, b.h);
                }
            }
        });

        // Cheat menu
        if (cheatMenuOpen && window.cheatSystem) {
            window.cheatSystem.drawCheatMenu(ctx, canvas.width, canvas.height);
        }

        // Multiplayer status
        if (multiplayerActive) {
            ctx.font = '16px "Press Start 2P", monospace';
            ctx.fillStyle = '#0ff';
            ctx.textAlign = 'right';
            ctx.fillText('MULTIPLAYER', canvas.width - 20, 40);
        }

        // Kill count
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.fillStyle = '#ff0';
        ctx.textAlign = 'left';
        ctx.fillText(`KILLS: ${killCount}`, 20, 100);
    }

    // Start game loop
    gameLoop();

    // Background music – plays after first user click/tap
    document.addEventListener('click', function playBGM() {
        if (assets.sounds && assets.sounds.bgm) {
            assets.sounds.bgm.loop = true;
            let vol = localStorage.getItem('spaceShooters_volume');
            if (vol === null) vol = 70;
            assets.sounds.bgm.volume = (vol / 100) * 0.5;
            assets.sounds.bgm.play().catch(e => console.log('BGM play failed:', e));
        }
        document.removeEventListener('click', playBGM);
    }, { once: true });
}
