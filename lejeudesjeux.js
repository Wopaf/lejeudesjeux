// ============================================================
//  CONFIGURATION — Modifie ce tableau pour personnaliser les jeux
// ============================================================
const JEUX = [
    { nom: "Super Meat Boy", img: "medias-lejeudesjeux/meatboy.png", couleur: "#7c5cfc" },
    { nom: "Dungeon Siège", img: "medias-lejeudesjeux/dungeonsiege.png", couleur: "#a855f7" },
    { nom: "Castlevania: Aria of Sorrow", img: "medias-lejeudesjeux/castelvania.png", couleur: "#ec4899" },
    { nom: "Kingdom Hearts III", img: "medias-lejeudesjeux/kingdown.png", couleur: "#f97316" },
    { nom: "Jeu 5", img: null, couleur: "#eab308" },
    { nom: "Jeu 6", img: null, couleur: "#22c55e" },
    { nom: "Jeu 7", img: null, couleur: "#06b6d4" },
    { nom: "Jeu 8", img: null, couleur: "#3b82f6" },
];

// ============================================================
//  ÉTAT
// ============================================================
let currentUser   = null;   // 'matthias' | 'valentin'
let selectedJeu   = null;   // index 0-7
let timers        = new Array(8).fill(0); // secondes par jeu
let timerRunning  = false;
let timerInterval = null;
let saveInterval  = null;
let fbListener    = null;

// ============================================================
//  INIT
// ============================================================
document.addEventListener('click', (e) => {
    if (!e.target.closest('.time-dist-segment')) {
        document.getElementById('dist-tooltip').classList.add('hidden');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Sélection dans la modal
    document.querySelectorAll('.user-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => setUser(btn.dataset.user));
    });

    // Badge header → changer d'utilisateur
    document.getElementById('user-badge').addEventListener('click', () => {
        if (timerRunning) stopTimer();
        resetApp();
        document.getElementById('app').classList.add('hidden');
        document.getElementById('user-modal').classList.remove('hidden');
    });

    // Bouton lancer / arrêter
    document.getElementById('launch-btn').addEventListener('click', () => {
        if (timerRunning) {
            stopTimer();
        } else {
            showConfirm();
        }
    });

    // Modal confirmation
    document.getElementById('confirm-cancel').addEventListener('click', hideConfirm);
    document.querySelector('.confirm-overlay').addEventListener('click', hideConfirm);
    document.getElementById('confirm-ok').addEventListener('click', () => {
        hideConfirm();
        startTimer();
    });

    // Sauvegarder si la page se ferme pendant que le timer tourne
    window.addEventListener('beforeunload', () => {
        if (timerRunning) saveCurrentTimer();
    });

    // Utilisateur déjà choisi ?
    const savedUser = localStorage.getItem('jdj_user');
    if (savedUser) {
        setUser(savedUser);
    }
});

// ============================================================
//  UTILISATEUR
// ============================================================
function setUser(user) {
    currentUser = user;
    localStorage.setItem('jdj_user', user);

    const initial = user.charAt(0).toUpperCase();
    document.getElementById('user-badge-avatar').textContent = initial;
    document.getElementById('user-badge-name').textContent = initial + user.slice(1);

    document.getElementById('user-modal').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    // Restaurer la sélection de jeu sauvegardée
    const saved = localStorage.getItem('jdj_selected');
    selectedJeu = saved !== null ? parseInt(saved) : null;

    // Affichage immédiat des jeux (timers à 0), mis à jour quand Firebase répond
    timers = new Array(8).fill(0);
    renderJeux();
    updateFooter();

    loadTimers();
}

function resetApp() {
    // Détacher le listener AVANT de nullifier currentUser
    if (fbListener && currentUser) {
        db.ref(`jeudesjeux/${currentUser}`).off('value', fbListener);
        fbListener = null;
    }
    currentUser = null;
    timers = new Array(8).fill(0);
    selectedJeu = null;
}

// ============================================================
//  FIREBASE — Chargement des timers
// ============================================================
function loadTimers() {
    // Détacher l'ancien listener si existant
    if (fbListener) {
        db.ref(`jeudesjeux/${currentUser}`).off('value', fbListener);
    }

    fbListener = db.ref(`jeudesjeux/${currentUser}`).on('value', snap => {
        const data = snap.val() || {};
        for (let i = 0; i < 8; i++) {
            // Ne pas écraser la valeur locale du jeu en cours de timer
            if (!(timerRunning && i === selectedJeu)) {
                timers[i] = data[i] || 0;
            }
        }
        renderJeux();
        updateFooter();
    });
}

function saveCurrentTimer() {
    if (selectedJeu === null || !currentUser) return;
    db.ref(`jeudesjeux/${currentUser}/${selectedJeu}`).set(timers[selectedJeu]);
}

// ============================================================
//  RENDU
// ============================================================
function renderJeux() {
    const grid = document.getElementById('jeux-grid');
    grid.innerHTML = '';

    JEUX.forEach((jeu, i) => {
        const isSelected = i === selectedJeu;
        const isRunning  = isSelected && timerRunning;

        const card = document.createElement('div');
        card.className = [
            'game-card',
            isSelected ? 'selected' : '',
            isRunning  ? 'running'  : '',
        ].filter(Boolean).join(' ');
        card.dataset.index = i;
        if (isSelected) card.style.setProperty('--card-accent', jeu.couleur);

        const imgContent = jeu.img
            ? `<img src="${jeu.img}" alt="${jeu.nom}">`
            : `<div class="game-card-placeholder" style="background:${jeu.couleur}22;color:${jeu.couleur}">${i + 1}</div>`;

        card.innerHTML = `
            <div class="game-card-inner">
                <div class="game-card-img" style="background:${jeu.couleur}11;border-color:${jeu.couleur}33">
                    ${imgContent}
                    ${isRunning ? '<div class="game-card-running-dot"></div>' : ''}
                </div>
                <span class="game-card-name">${jeu.nom}</span>
                <span class="game-card-timer">${formatTime(timers[i])}</span>
            </div>
        `;

        card.addEventListener('click', () => selectJeu(i));
        grid.appendChild(card);
    });

    updateDistribution();
}

function updateDistribution() {
    const bar = document.getElementById('time-dist-bar');
    if (!bar) return;

    const total = timers.reduce((sum, t) => sum + t, 0);
    bar.innerHTML = '';

    if (total === 0) return;

    JEUX.forEach((jeu, i) => {
        if (timers[i] === 0) return;
        const pct = (timers[i] / total) * 100;
        const seg = document.createElement('div');
        seg.className = 'time-dist-segment' + (i === selectedJeu && timerRunning ? ' active' : '');
        seg.style.width = pct + '%';
        seg.style.background = jeu.couleur;

        seg.addEventListener('click', (e) => {
            e.stopPropagation();
            const tooltip = document.getElementById('dist-tooltip');
            document.getElementById('dist-tooltip-name').textContent = jeu.nom;
            document.getElementById('dist-tooltip-timer').textContent = formatTime(timers[i]);
            tooltip.style.left = e.clientX + 'px';
            tooltip.style.top  = (e.clientY - 10) + 'px';
            // Forcer la réanimation
            tooltip.classList.add('hidden');
            requestAnimationFrame(() => tooltip.classList.remove('hidden'));
        });

        bar.appendChild(seg);
    });
}

function updateFooter() {
    const nameEl    = document.getElementById('footer-selected-name');
    const timerEl   = document.getElementById('footer-timer-val');
    const btn       = document.getElementById('launch-btn');
    const btnIcon   = document.getElementById('launch-btn-icon');
    const btnLabel  = document.getElementById('launch-btn-label');

    if (selectedJeu !== null) {
        nameEl.textContent = JEUX[selectedJeu].nom;
        timerEl.textContent = formatTime(timers[selectedJeu]);
        btn.disabled = false;

        if (timerRunning) {
            btnIcon.textContent  = '⏹';
            btnLabel.textContent = 'Arrêter le timer';
            btn.classList.add('running');
            timerEl.classList.add('running');
        } else {
            btnIcon.textContent  = '▶';
            btnLabel.textContent = 'Lancer le timer';
            btn.classList.remove('running');
            timerEl.classList.remove('running');
        }
    } else {
        nameEl.textContent  = '—';
        timerEl.textContent = '00:00:00';
        btn.disabled = true;
        btn.classList.remove('running');
        timerEl.classList.remove('running');
    }
}

// ============================================================
//  SÉLECTION D'UN JEU
// ============================================================
function selectJeu(index) {
    if (timerRunning) return; // Impossible de changer pendant que le timer tourne
    selectedJeu = index;
    localStorage.setItem('jdj_selected', index);
    renderJeux();
    updateFooter();
}

// ============================================================
//  TIMER
// ============================================================
function startTimer() {
    if (selectedJeu === null) return;

    timerRunning = true;
    updateFooter();
    renderJeux();

    // Incrément chaque seconde
    timerInterval = setInterval(() => {
        timers[selectedJeu]++;

        // Mise à jour légère (sans re-render complet)
        document.getElementById('footer-timer-val').textContent = formatTime(timers[selectedJeu]);
        const cardTimer = document.querySelector(`.game-card[data-index="${selectedJeu}"] .game-card-timer`);
        if (cardTimer) cardTimer.textContent = formatTime(timers[selectedJeu]);
    }, 1000);

    // Sauvegarde automatique toutes les 30 secondes
    saveInterval = setInterval(saveCurrentTimer, 30_000);
}

function showConfirm() {
    if (selectedJeu === null) return;
    const jeu = JEUX[selectedJeu];

    document.getElementById('confirm-game-name').textContent = jeu.nom;

    const thumb = document.getElementById('confirm-thumb');
    if (jeu.img) {
        thumb.style.backgroundImage = `url('${jeu.img}')`;
        thumb.innerHTML = '';
    } else {
        thumb.style.backgroundImage = '';
        thumb.innerHTML = `<div class="confirm-thumb-placeholder" style="background:${jeu.couleur}22;color:${jeu.couleur}">${selectedJeu + 1}</div>`;
    }

    document.getElementById('confirm-modal').classList.remove('hidden');
}

function hideConfirm() {
    document.getElementById('confirm-modal').classList.add('hidden');
}

function stopTimer() {
    timerRunning = false;
    clearInterval(timerInterval);
    clearInterval(saveInterval);
    timerInterval = null;
    saveInterval  = null;

    saveCurrentTimer();
    updateFooter();
    renderJeux();
}

// ============================================================
//  UTILITAIRES
// ============================================================
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n) {
    return String(n).padStart(2, '0');
}
