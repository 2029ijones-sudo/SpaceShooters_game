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
                // If Escape was pressed, cheatSystem will set cheatMenuOpen false via global flag? 
                // We'll handle Escape separately: close menu
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
        // Player movement
        if (keys['ArrowLeft'] || keys['KeyA']) player.x = Math.max(0, player.x - player.speed);
        if (keys['ArrowRight'] || keys['KeyD']) player.x = Math.min(1024 - player.width, player.x + player.speed);
        if (keys['ArrowUp'] || keys['KeyW']) player.y = Math.max(0, player.y - player.speed);
        if (keys['ArrowDown'] || keys['KeyS']) player.y = Math.min(768 - player.height, player.y + player.speed);

        // Check active cheats
        const rapidFireActive = window.cheatSystem ? window.cheatSystem.isCheatActive('rapidfire') : false;
        const invincibleActive = window.cheatSystem ? window.cheatSystem.isCheatActive('invincible') : false;
        const autoAimActive = window.cheatSystem ? window.cheatSystem.isCheatActive('autotarget') : false;
        const oneHitKillActive = window.cheatSystem ? window.cheatSystem.isCheatActive('onehitkill') : false;

        // Shooting
        if (keys['Space'] && shootCooldown <= 0) {
            bullets.push({
                x: player.x + player.width/2 - 2,
                y: player.y - 10,
                w: 4,
                h: 15,
                speed: -8
            });
            playSound('laser', 0.5);
            shootCooldown = rapidFireActive ? 5 : 10; // rapid fire halves cooldown
        }
        if (shootCooldown > 0) shootCooldown--;

        // Update wave manager (enemies)
        waveManager.update();

        // Update player bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
            bullets[i].y += bullets[i].speed;
            if (bullets[i].y + bullets[i].h < 0) bullets.splice(i, 1);
        }

        // Enemy shooting (every 30 frames) – rate increases with wave
        const enemyShootRate = Math.min(0.5, 0.2 + currentWave * 0.02);
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

        // Collisions: player bullets vs enemies
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

        // Update UI
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

        // Auto‑aim (basic homing) – if cheat active, redirect bullets toward nearest enemy
        if (autoAimActive && waveManager.enemies.length > 0) {
            bullets.forEach(b => {
                // Find closest enemy
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
                    // Gradually steer bullet toward enemy (simple homing)
                    const targetX = closestEnemy.x + closestEnemy.width/2;
                    const targetY = closestEnemy.y + closestEnemy.height/2;
                    const dx = targetX - (b.x + b.w/2);
                    const dy = targetY - (b.y + b.h/2);
                    const angle = Math.atan2(dy, dx);
                    // Limit turning speed
                    const currentAngle = Math.atan2(b.speed, 0); // assuming bullet moves vertically only; we need to store velocity vector.
                    // Simpler: just set velocity towards target (cheat is strong!)
                    b.speed = -8; // keep vertical speed, adjust x gradually
                    const step = 0.2;
                    b.x += Math.sign(dx) * Math.min(Math.abs(dx)*0.1, 2);
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

        // Draw player bullets
        bullets.forEach(b => {
            if (assets.images && assets.images.bullet) {
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
