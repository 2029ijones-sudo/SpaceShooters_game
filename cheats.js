// ==================== CHEATS.JS ====================
console.log('cheats.js loaded');

// All possible cheats
const cheatDefinitions = [
    {
        id: 'rapidfire',
        name: 'RAPID FIRE',
        code: 'FASTER',
        description: 'Double firing speed',
        unlockWave: 1,          // unlocked after wave 1
        effect: () => {
            // Effect applied in game.js (we'll set a flag)
            console.log('CHEAT: Rapid Fire activated');
        }
    },
    {
        id: 'invincible',
        name: 'INVINCIBILITY',
        code: 'GODMODE',
        description: 'Enemies cannot hurt you',
        unlockWave: 3,
        effect: () => {
            console.log('CHEAT: Invincibility activated');
        }
    },
    {
        id: 'autotarget',
        name: 'AUTO AIM',
        code: 'HOMING',
        description: 'Bullets seek nearest enemy',
        unlockWave: 5,
        effect: () => {
            console.log('CHEAT: Auto aim activated');
        }
    },
    {
        id: 'onehitkill',
        name: 'ONE HIT KILL',
        code: 'POWER',
        description: 'Any hit destroys enemy',
        unlockWave: 7,
        effect: () => {
            console.log('CHEAT: One hit kill activated');
        }
    },
    {
        id: 'extralife',
        name: 'EXTRA LIFE',
        code: 'LIFEUP',
        description: 'Gain one additional life',
        unlockWave: 2,
        effect: () => {
            console.log('CHEAT: Extra life activated');
        }
    }
];

// Player's unlocked cheats (by id)
let unlockedCheats = [];

// Active cheats (by id) – effects currently ON
let activeCheats = [];

// Check for new unlocks based on wave count
function updateUnlocks(waveCount) {
    cheatDefinitions.forEach(cheat => {
        if (waveCount >= cheat.unlockWave && !unlockedCheats.includes(cheat.id)) {
            unlockedCheats.push(cheat.id);
            console.log(`CHEAT UNLOCKED: ${cheat.name} (wave ${waveCount})`);
        }
    });
}

// Apply cheat effect by id
function activateCheat(cheatId) {
    const cheat = cheatDefinitions.find(c => c.id === cheatId);
    if (!cheat) return false;
    if (!unlockedCheats.includes(cheatId)) {
        console.log(`Cheat ${cheatId} not unlocked yet`);
        return false;
    }
    if (activeCheats.includes(cheatId)) {
        console.log(`Cheat ${cheatId} already active`);
        return false; // already active
    }
    activeCheats.push(cheatId);
    cheat.effect();
    return true;
}

// Render cheat menu (called from game.js when menu open)
function drawCheatMenu(ctx, canvasWidth, canvasHeight) {
    // Semi‑transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Menu panel
    ctx.fillStyle = '#112233';
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 4;
    ctx.fillRect(200, 100, canvasWidth - 400, canvasHeight - 200);
    ctx.strokeRect(200, 100, canvasWidth - 400, canvasHeight - 200);

    // Title
    ctx.font = '28px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffd966';
    ctx.textAlign = 'center';
    ctx.fillText('CHEAT CODES', canvasWidth / 2, 160);

    // Instructions
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillStyle = '#8ac4ff';
    ctx.fillText('ENTER CODE BELOW', canvasWidth / 2, 220);

    // Input box (we'll draw a simple rectangle; actual input is handled by prompt or a hidden input? For simplicity we'll use a browser prompt, but better to have an on‑canvas input. Let's use a hidden input field for actual typing – easier.)
    // We'll draw a box and the typed code from a variable.
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(300, 250, canvasWidth - 600, 50);
    ctx.fillStyle = '#000';
    ctx.fillRect(301, 251, canvasWidth - 602, 48);
    ctx.font = '20px "Press Start 2P", monospace';
    ctx.fillStyle = '#0f0';
    ctx.textAlign = 'left';
    ctx.fillText(cheatInputBuffer || '_', 310, 290);

    // Unlocked cheats list
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText('UNLOCKED CODES:', 250, 350);
    let y = 390;
    unlockedCheats.forEach(id => {
        const cheat = cheatDefinitions.find(c => c.id === id);
        if (!cheat) return;
        ctx.fillStyle = activeCheats.includes(id) ? '#0f0' : '#ffd700';
        ctx.fillText(`${cheat.code} - ${cheat.name}`, 280, y);
        y += 30;
    });

    // Hint
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'center';
    ctx.fillText('PRESS ESC TO CLOSE', canvasWidth / 2, canvasHeight - 140);
}

// Cheat input buffer (temporary)
let cheatInputBuffer = '';

// Handle keyboard input when cheat menu is open
function handleCheatKey(e) {
    const key = e.key;
    if (key === 'Escape') {
        closeCheatMenu();
        return;
    }
    if (key === 'Enter') {
        // Attempt to activate cheat with current buffer
        const matchedCheat = cheatDefinitions.find(c => c.code.toUpperCase() === cheatInputBuffer.toUpperCase());
        if (matchedCheat && unlockedCheats.includes(matchedCheat.id)) {
            activateCheat(matchedCheat.id);
            cheatInputBuffer = '';
        } else {
            cheatInputBuffer = ''; // clear on fail
        }
        return;
    }
    if (key === 'Backspace') {
        cheatInputBuffer = cheatInputBuffer.slice(0, -1);
        return;
    }
    // Only allow alphanumeric and uppercase
    if (/^[a-zA-Z0-9]$/.test(key)) {
        cheatInputBuffer += key.toUpperCase();
    }
}

// Export for game.js
window.cheatSystem = {
    updateUnlocks,
    drawCheatMenu,
    handleCheatKey,
    getActiveCheats: () => activeCheats,
    isCheatActive: (id) => activeCheats.includes(id)
};
