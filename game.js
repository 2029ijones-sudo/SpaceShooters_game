// ==================== GAME.JS ====================
// Wait for assets to load
window.addEventListener('load', () => {
    loadAssets(startGame);
});

function startGame() {
    // Canvas setup
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // Game state
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

    // Input handling
    const keys = {};
    window.addEventListener('keydown', e => keys[e.code] = true);
    window.addEventListener('keyup', e => keys[e.code] = false);

    // Shooting cooldown
    let shootCooldown = 0;

    // Start first wave
    waveManager.startWave();

    // Game loop
    function gameLoop() {
        if (gameOver) {
            document.getElementById('gameOver').style.display = 'block';
            return;
        }

        update();
        draw();
        requestAnimationFrame(gameLoop);
    }

    function update() {
        // Player movement
        if (keys['ArrowLeft'] || keys['KeyA']) player.x = Math.max(0, player.x - player.speed);
        if (keys['ArrowRight'] || keys['KeyD']) player.x = Math.min(1024 - player.width, player.x + player.speed);
        if (keys['ArrowUp'] || keys['KeyW']) player.y = Math.max(0, player.y - player.speed);
        if (keys['ArrowDown'] || keys['KeyS']) player.y = Math.min(768 - player.height, player.y + player.speed);

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
            shootCooldown = 10;
        }
        if (shootCooldown > 0) shootCooldown--;

        // Update wave manager
        waveManager.update();

        // Update bullets (player)
        for (let i = bullets.length - 1; i >= 0; i--) {
            bullets[i].y += bullets[i].speed;
            if (bullets[i].y + bullets[i].h < 0) bullets.splice(i, 1);
        }

        // Enemy shooting
        if (frame % 30 === 0) {
            waveManager.enemies.forEach(enemy => {
                if (Math.random() < 0.3) {
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
                    break; // bullet gone
                }
            }
        }

        // Collisions: enemy bullets vs player
        if (player.invincible <= 0) {
            for (let i = enemyBullets.length - 1; i >= 0; i--) {
                const eb = enemyBullets[i];
                if (eb.x < player.x + player.width &&
                    eb.x + eb.w > player.x &&
                    eb.y < player.y + player.height &&
                    eb.y + eb.h > player.y) {
                    // Hit player
                    enemyBullets.splice(i, 1);
                    player.lives--;
                    player.invincible = 60; // 1 sec invincibility
                    playSound('explode', 1);
                    if (player.lives <= 0) {
                        gameOver = true;
                    }
                    break;
                }
            }
        } else {
            player.invincible--;
        }

        // Collisions: enemies vs player
        if (player.invincible <= 0) {
            for (let i = waveManager.enemies.length - 1; i >= 0; i--) {
                const e = waveManager.enemies[i];
                if (e.x < player.x + player.width &&
                    e.x + e.width > player.x &&
                    e.y < player.y + player.height &&
                    e.y + e.height > player.y) {
                    // Player collided with enemy
                    waveManager.enemies.splice(i, 1);
                    player.lives--;
                    player.invincible = 60;
                    playSound('explode', 1);
                    if (player.lives <= 0) {
                        gameOver = true;
                    }
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
        }

        frame++;
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background (optional video or starfield)
        if (assets.videos.nebula) {
            ctx.drawImage(assets.videos.nebula, 0, 0, canvas.width, canvas.height);
        } else {
            // Simple starfield
            ctx.fillStyle = 'white';
            for (let i = 0; i < 100; i++) {
                let sx = (i * 73) % canvas.width;
                let sy = (frame * 0.5 + i * 23) % canvas.height;
                ctx.fillRect(sx, sy, 2, 2);
            }
        }

        // Draw player (with invincibility blink)
        if (player.invincible <= 0 || Math.floor(frame / 5) % 2 === 0) {
            if (assets.images.player) {
                ctx.drawImage(assets.images.player, player.x, player.y, player.width, player.height);
            } else {
                ctx.fillStyle = 'cyan';
                ctx.fillRect(player.x, player.y, player.width, player.height);
            }
        }

        // Draw enemies
        waveManager.enemies.forEach(e => {
            if (assets.images[e.type]) {
                ctx.drawImage(assets.images[e.type], e.x, e.y, e.width, e.height);
            } else {
                ctx.fillStyle = 'red';
                ctx.fillRect(e.x, e.y, e.width, e.height);
            }
        });

        // Draw player bullets
        bullets.forEach(b => {
            if (assets.images.bullet) {
                ctx.drawImage(assets.images.bullet, b.x, b.y, b.w, b.h);
            } else {
                ctx.fillStyle = 'yellow';
                ctx.fillRect(b.x, b.y, b.w, b.h);
            }
        });

        // Draw enemy bullets
        enemyBullets.forEach(b => {
            if (assets.images.enemyBullet) {
                ctx.drawImage(assets.images.enemyBullet, b.x, b.y, b.w, b.h);
            } else {
                ctx.fillStyle = 'orange';
                ctx.fillRect(b.x, b.y, b.w, b.h);
            }
        });

        // Draw score etc on canvas as fallback (already in HTML UI)
    }

    // Start the game loop
    gameLoop();

    // Optionally play background music (after user gesture)
    document.addEventListener('click', function playBGM() {
        if (assets.sounds.bgm) {
            assets.sounds.bgm.loop = true;
            assets.sounds.bgm.volume = (localStorage.getItem('spaceShooters_volume') / 100) * 0.5;
            assets.sounds.bgm.play().catch(e => {});
        }
        document.removeEventListener('click', playBGM);
    }, { once: true });
}
