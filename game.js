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

    // Play background video if available
    if (assets.videos && assets.videos.nebula) {
        assets.videos.nebula.play().catch(e => {
            console.log('Background video autoplay failed:', e);
            const playVideoOnGesture = () => {
                assets.videos.nebula.play().catch(() => {});
                document.removeEventListener('click', playVideoOnGesture);
                document.removeEventListener('keydown', playVideoOnGesture);
            };
            document.addEventListener('click', playVideoOnGesture);
            document.addEventListener('keydown', playVideoOnGesture);
        });
    }

    // ========== GAME STATE ==========
    let player = {
        x: 512 - 25,
        y: 650,
        width: 50,
        height: 50,
        speed: 5,
        lives: 3,
        invincible: 0
    };

    let bullets = [];
    let enemyBullets = [];
    let score = 0;
    let gameOver = false;
    let frame = 0;

    // NEW: Kill count for bullet progression (unlimited)
    let killCount = 0;

    // Wave tracking
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
    let multiplayerActive = false;          // set true when connected
    let remotePlayer = null;                // { x, y, width, height } from network
    let isHost = false;                     // determined by network init

    // If network.js is loaded, it will provide these callbacks
    if (window.network) {
        // Called when a remote player joins or sends update
        window.network.onRemoteUpdate = (data) => {
            remotePlayer = data;
            // Also pass to enemies.js multiplayer hook
            if (window.multiplayer) {
                window.multiplayer.updateRemotePlayer(data);
            }
        };
        window.network.onDisconnect = () => {
            multiplayerActive = false;
            remotePlayer = null;
            console.log('Remote player disconnected');
        };
    }

    // ========== CHEAT MENU TOGGLE (LEFT CLICK) ==========
    canvas.addEventListener('click', (e) => {
        if (e.button === 0) { // left click
            e.preventDefault();
            cheatMenuOpen = !cheatMenuOpen;
            if (cheatMenuOpen) {
                console.log('Cheat menu opened');
            }
        }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard input for cheat menu
    window.addEventListener('keydown', (e) => {
        if (cheatMenuOpen) {
            e.preventDefault();
            if (window.cheatSystem) {
                window.cheatSystem.handleCheatKey(e);
                if (e.key === 'Escape') {
                    cheatMenuOpen = false;
                }
            }
        }
    });

    // Function to apply cheat effects that modify game state directly
    window.applyCheatEffect = (cheatId) => {
        switch(cheatId) {
            case 'extralife':
                player.lives++;
                document.getElementById('lives').textContent = player.lives;
                waveMessage = 'EXTRA LIFE!';
                waveMessageTimer = 60;
                break;
            // Other cheats are handled via flags in update()
        }
    };

    // Start first wave
    waveManager.startWave();
    currentWave = waveManager.waveCount;
    if (window.cheatSystem) window.cheatSystem.updateUnlocks(currentWave);
    waveMessage = `WAVE ${currentWave}`;
    waveMessageTimer = 60;

    // ========== GAME LOOP ==========
    function gameLoop() {
        if (gameOver) {
            document.getElementById('gameOver').style.display = 'block';
            // Save learning stats on game over
            if (window.enemyLearning) {
                window.enemyLearning.updateProfile(gameStats);
            }
            // Disconnect from multiplayer
            if (window.network) window.network.disconnect();
            return;
        }

        if (!cheatMenuOpen) {
            update();
        }
        draw();

        requestAnimationFrame(gameLoop);
    }

    // ========== HELPER: Generate bullets based on kill count ==========
    function createBullets(playerX, playerY, playerWidth, baseSpeed, rapidFireActive) {
        const bulletsArray = [];
        // Base bullet properties
        let baseWidth = 4;
        let baseHeight = 15;
        let baseSpeedValue = -8; // negative = upward

        // Scale with kill count (unlimited)
        // Width increases slowly, height increases, speed increases
        const scale = 1 + killCount * 0.02; // 2% per kill, unlimited
        const bulletWidth = baseWidth * scale;
        const bulletHeight = baseHeight * scale;
        const bulletSpeed = baseSpeedValue * (1 + killCount * 0.01); // 1% speed increase per kill

        // Number of bullets: start with 1, gain an extra bullet every 10 kills
        let bulletCount = 1 + Math.floor(killCount / 10);
        // Cap bullet count for sanity? No limit, but we can keep it reasonable
        if (bulletCount > 20) bulletCount = 20; // optional soft cap, but remove if you want truly unlimited

        // Create spread
        const spreadAngle = 0.1; // radians
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
            // Multiple bullets in a fan
            for (let i = 0; i < bulletCount; i++) {
                // Angle offset from center
                const angleOffset = (i - (bulletCount - 1) / 2) * spreadAngle;
                // Speed vector components
                const speedX = Math.sin(angleOffset) * Math.abs(bulletSpeed) * 0.5; // slight horizontal
                const speedY = bulletSpeed * Math.cos(angleOffset); // mostly vertical
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

    // ========== UPDATE ==========
    function update() {
        // Set global frame for enemies.js live learning
        if (window.enemyLearning) {
            window.enemyLearning.setGlobalFrame(frame);
        }

        // Player movement
        const leftPressed = keys['ArrowLeft'] || keys['KeyA'];
        const rightPressed = keys['ArrowRight'] || keys['KeyD'];
        const upPressed = keys['ArrowUp'] || keys['KeyW'];
        const downPressed = keys['ArrowDown'] || keys['KeyS'];

        if (leftPressed) player.x = Math.max(0, player.x - player.speed);
        if (rightPressed) player.x = Math.min(1024 - player.width, player.x + player.speed);
        if (upPressed) player.y = Math.max(0, player.y - player.speed);
        if (downPressed) player.y = Math.min(768 - player.height, player.y + player.speed);

        // Update stats for cross‑game learning
        gameStats.totalFrames++;
        gameStats.avgX = (gameStats.avgX * (gameStats.totalFrames - 1) + (player.x / canvas.width)) / gameStats.totalFrames;
        gameStats.avgY = (gameStats.avgY * (gameStats.totalFrames - 1) + (player.y / canvas.height)) / gameStats.totalFrames;
        if (leftPressed) gameStats.leftMoves++;
        if (rightPressed) gameStats.rightMoves++;
        if (upPressed) gameStats.upMoves++;
        if (downPressed) gameStats.downMoves++;

        // Check active cheats
        const rapidFireActive = window.cheatSystem ? window.cheatSystem.isCheatActive('rapidfire') : false;
        const invincibleActive = window.cheatSystem ? window.cheatSystem.isCheatActive('invincible') : false;
        const autoAimActive = window.cheatSystem ? window.cheatSystem.isCheatActive('autotarget') : false;
        const oneHitKillActive = window.cheatSystem ? window.cheatSystem.isCheatActive('onehitkill') : false;

        // Shooting – now uses kill-based bullet creation
        const shotThisFrame = keys['Space'] && shootCooldown <= 0;
        if (shotThisFrame) {
            // Generate bullets based on current kill count
            const newBullets = createBullets(player.x, player.y, player.width, -8, rapidFireActive);
            bullets.push(...newBullets);
            playSound('laser', 0.5);
            // Cooldown affected by rapid fire cheat
            shootCooldown = rapidFireActive ? 5 : 10;
            gameStats.shotsFired += newBullets.length; // count all bullets for stats
        }
        if (shootCooldown > 0) shootCooldown--;

        // ========== REAL‑TIME LIVE LEARNING ==========
        if (window.liveLearning) {
            window.liveLearning.update(player.x, player.y, shotThisFrame);
        }

        // Update wave manager (enemies)
        waveManager.update();

        // Update player bullets (handle both simple and vector bullets)
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            if (b.speedX !== undefined) {
                b.x += b.speedX;
                b.y += b.speedY;
            } else {
                b.y += b.speed;
            }
            // Remove if off screen (top or bottom, but mostly top)
            if (b.y + b.h < 0 || b.y > canvas.height) {
                bullets.splice(i, 1);
            }
        }

        // Enemy shooting – rate increases with wave and learning
        let enemyShootRate = Math.min(0.5, 0.2 + currentWave * 0.02);
        if (window.enemyLearning && window.enemyLearning.getProfile().shotsPerFrame > 0.05) {
            enemyShootRate += 0.1;
        }
        if (frame % 30 === 0) {
            waveManager.enemies.forEach(enemy => {
                if (Math.random() < enemyShootRate) {
                    const eb = enemy.shoot();
                    enemyBullets.push(eb);
                }
            });
        }

        // Update enemy bullets
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            enemyBullets[i].y += enemyBullets[i].speed;
            if (enemyBullets[i].y > 768) enemyBullets.splice(i, 1);
        }

        // Collisions: player bullets vs enemies – also increment killCount
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            for (let j = waveManager.enemies.length - 1; j >= 0; j--) {
                const e = waveManager.enemies[j];
                if (b.x < e.x + e.width &&
                    b.x + b.w > e.x &&
                    b.y < e.y + e.height &&
                    b.y + b.h > e.y) {
                    // Hit
                    bullets.splice(i, 1);
                    waveManager.enemies.splice(j, 1);
                    score += 10;
                    killCount++; // Increase kill count – powers up future bullets
                    playSound('explode', 0.7);
                    break;
                }
            }
        }

        // Collisions: enemy bullets vs player
        if (player.invincible <= 0 && !invincibleActive) {
            for (let i = enemyBullets.length - 1; i >= 0; i--) {
                const eb = enemyBullets[i];
                if (eb.x < player.x + player.width &&
                    eb.x + eb.w > player.x &&
                    eb.y < player.y + player.height &&
                    eb.y + eb.h > player.y) {
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

        // Collisions: enemies vs player
        if (player.invincible <= 0 && !invincibleActive) {
            for (let i = waveManager.enemies.length - 1; i >= 0; i--) {
                const e = waveManager.enemies[i];
                if (e.x < player.x + player.width &&
                    e.x + e.width > player.x &&
                    e.y < player.y + player.height &&
                    e.y + e.height > player.y) {
                    waveManager.enemies.splice(i, 1);
                    player.lives--;
                    player.invincible = 60;
                    playSound('explode', 1);
                    if (player.lives <= 0) gameOver = true;
                    break;
                }
            }
        }

        // ========== MULTIPLAYER NETWORK SYNC ==========
        if (multiplayerActive && window.network) {
            // Send our player state to remote
            window.network.sendPlayerState({
                x: player.x,
                y: player.y,
                width: player.width,
                height: player.height,
                lives: player.lives
            });

            // If we are the host, also send enemy positions for co‑op
            if (isHost && window.network.sendEnemyState) {
                window.network.sendEnemyState(waveManager.getSerializedEnemies());
            }
        }

        // Update UI (show kill count optionally)
        document.getElementById('lives').textContent = player.lives;
        document.getElementById('score').textContent = score;

        // Wave progression
        if (waveManager.enemies.length === 0 && waveManager.spawnTimer <= 0) {
            waveManager.startWave();
            currentWave = waveManager.waveCount;
            if (window.cheatSystem) window.cheatSystem.updateUnlocks(currentWave);
            waveMessage = `WAVE ${currentWave}`;
            waveMessageTimer = 60;
        }

        // Update wave message timer
        if (waveMessageTimer > 0) waveMessageTimer--;

        // Auto‑aim cheat
        if (autoAimActive && waveManager.enemies.length > 0) {
            bullets.forEach(b => {
                let closestDist = Infinity;
                let closestEnemy = null;
                waveManager.enemies.forEach(e => {
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
                    // For bullets with speedX/speedY, we'd need more complex homing.
                    // Simplified: just adjust x position gradually
                    if (b.speedX !== undefined) {
                        // Vector bullet – adjust velocity slightly
                        b.speedX += Math.sign(dx) * 0.2;
                        b.speedY += Math.sign(dy) * 0.2;
                        // Normalize to keep speed roughly constant
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

        // Draw background (video or starfield)
        if (assets.videos && assets.videos.nebula && assets.videos.nebula.readyState >= 2) {
            ctx.drawImage(assets.videos.nebula, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = 'white';
            for (let i = 0; i < 100; i++) {
                let sx = (i * 73) % canvas.width;
                let sy = (frame * 0.5 + i * 23) % canvas.height;
                ctx.fillRect(sx, sy, 2, 2);
            }
        }

        // Draw wave message if active
        if (waveMessageTimer > 0) {
            ctx.font = '40px "Press Start 2P", monospace';
            ctx.fillStyle = '#ffd966';
            ctx.textAlign = 'center';
            ctx.fillText(waveMessage, canvas.width/2, 300);
        }

        // Draw player
        if (player.invincible <= 0 || Math.floor(frame / 5) % 2 === 0) {
            if (assets.images && assets.images.player) {
                ctx.drawImage(assets.images.player, player.x, player.y, player.width, player.height);
            } else {
                ctx.fillStyle = 'cyan';
                ctx.fillRect(player.x, player.y, player.width, player.height);
            }
        }

        // Draw enemies
        waveManager.enemies.forEach(e => {
            if (assets.images && assets.images[e.type]) {
                ctx.drawImage(assets.images[e.type], e.x, e.y, e.width, e.height);
            } else {
                ctx.fillStyle = 'red';
                ctx.fillRect(e.x, e.y, e.width, e.height);
            }
        });

        // Draw remote player (if in multiplayer)
        if (multiplayerActive && remotePlayer) {
            if (assets.images && assets.images.player) {
                ctx.globalAlpha = 0.7;
                ctx.drawImage(assets.images.player, remotePlayer.x, remotePlayer.y, remotePlayer.width || 50, remotePlayer.height || 50);
                ctx.globalAlpha = 1.0;
            } else {
                ctx.fillStyle = 'purple';
                ctx.fillRect(remotePlayer.x, remotePlayer.y, remotePlayer.width || 50, remotePlayer.height || 50);
            }
        }

        // Draw player bullets (now potentially with varying sizes)
        bullets.forEach(b => {
            if (assets.images && assets.images.bullet) {
                // Scale image to bullet dimensions
                ctx.drawImage(assets.images.bullet, b.x, b.y, b.w, b.h);
            } else {
                ctx.fillStyle = 'yellow';
                ctx.fillRect(b.x, b.y, b.w, b.h);
            }
        });

        // Draw enemy bullets
        enemyBullets.forEach(b => {
            if (assets.images && assets.images.enemyBullet) {
                ctx.drawImage(assets.images.enemyBullet, b.x, b.y, b.w, b.h);
            } else {
                ctx.fillStyle = 'orange';
                ctx.fillRect(b.x, b.y, b.w, b.h);
            }
        });

        // Draw cheat menu if open
        if (cheatMenuOpen && window.cheatSystem) {
            window.cheatSystem.drawCheatMenu(ctx, canvas.width, canvas.height);
        }

        // Draw multiplayer status
        if (multiplayerActive) {
            ctx.font = '16px "Press Start 2P", monospace';
            ctx.fillStyle = '#0ff';
            ctx.textAlign = 'right';
            ctx.fillText('MULTIPLAYER', canvas.width - 20, 40);
        }

        // Optionally display kill count for feedback
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
