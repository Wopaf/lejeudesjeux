// ============================================================
//  FIREBASE
// ============================================================
const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyBsjr0peOj1jFPhAA080MWuUGlyYapjxn0",
    authDomain:        "moviegame-1b838.firebaseapp.com",
    databaseURL:       "https://moviegame-1b838-default-rtdb.europe-west1.firebasedatabase.app",
    projectId:         "moviegame-1b838",
    storageBucket:     "moviegame-1b838.firebasestorage.app",
    messagingSenderId: "448540908211",
    appId:             "1:448540908211:web:894cb1e8c38d59c4a9eec6",
};
const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
const db  = firebase.database(app);

// ============================================================
//  VERSION — Modifie cette valeur pour changer le numéro de version
// ============================================================
const VERSION = '0.1.2';

// ============================================================
//  CONFIGURATION — Modifie ce tableau pour personnaliser les jeux
// ============================================================
const JEUX = [
    { nom: "Super Meat Boy",           img: "medias-lejeudesjeux/meatboy.png",      couleur: "#7c5cfc" },
    { nom: "Dungeon Siège",            img: "medias-lejeudesjeux/dungeonsiege.png", couleur: "#a855f7" },
    { nom: "Castlevania: Aria of Sorrow", img: "medias-lejeudesjeux/castelvania.png", couleur: "#ec4899" },
    { nom: "Kingdom Hearts III",       img: "medias-lejeudesjeux/kingdown.png",     couleur: "#f97316" },
    { nom: "Have a Nice Death",        img: "medias-lejeudesjeux/have.png",         couleur: "#eab308" },
    { nom: "Dead Island 2",            img: "medias-lejeudesjeux/dead.png",         couleur: "#22c55e" },
    { nom: "Gorogoa",                  img: "medias-lejeudesjeux/gorogoa.png",      couleur: "#06b6d4" },
];

// ============================================================
//  ÉTAT
// ============================================================
let currentUser  = null;
let selectedJeu  = null;
let timers       = new Array(JEUX.length).fill(0); // valeurs accumulées Firebase
let timerRunning = false;
let startedAt    = null;   // timestamp (ms) du démarrage de la session en cours
let liveInterval = null;   // mise à jour du compteur live dans le footer
let fbListener   = null;

// ============================================================
//  INIT
// ============================================================
document.addEventListener('click', (e) => {
    if (!e.target.closest('.time-dist-segment')) {
        document.getElementById('dist-tooltip').classList.add('hidden');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('app-version').textContent = `v${VERSION}`;

    document.querySelectorAll('.user-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => setUser(btn.dataset.user));
    });

    document.getElementById('user-badge').addEventListener('click', () => {
        if (timerRunning) stopTimer();
        resetApp();
        document.getElementById('app').classList.add('hidden');
        document.getElementById('user-modal').classList.remove('hidden');
    });

    document.getElementById('launch-btn').addEventListener('click', () => {
        if (timerRunning) stopTimer();
        else showConfirm();
    });

    document.getElementById('confirm-cancel').addEventListener('click', hideConfirm);
    document.querySelector('.confirm-overlay').addEventListener('click', hideConfirm);
    document.getElementById('confirm-ok').addEventListener('click', () => {
        hideConfirm();
        startTimer();
    });

    const savedUser = localStorage.getItem('jdj_user');
    if (savedUser) setUser(savedUser);
});

// ============================================================
//  UTILISATEUR
// ============================================================
function setUser(user) {
    currentUser = user;
    localStorage.setItem('jdj_user', user);

    const initial = user.charAt(0).toUpperCase();
    document.getElementById('user-badge-avatar').textContent = initial;
    document.getElementById('user-badge-name').textContent   = initial + user.slice(1);

    document.getElementById('user-modal').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    // Affichage rapide avant Firebase
    const saved = localStorage.getItem('jdj_selected');
    selectedJeu = saved !== null ? parseInt(saved) : null;
    if (selectedJeu !== null && selectedJeu >= JEUX.length) selectedJeu = null;

    timers = new Array(JEUX.length).fill(0);
    renderJeux();
    updateFooter();

    loadFromFirebase();
}

let resetConfirmTimeout = null;

function handleResetSaves() {
    const btn = document.getElementById('reset-saves-btn');
    if (!btn.classList.contains('confirm')) {
        btn.classList.add('confirm');
        btn.textContent = 'Confirmer la réinitialisation ?';
        resetConfirmTimeout = setTimeout(() => {
            btn.classList.remove('confirm');
            btn.textContent = 'Réinitialiser les sauvegardes';
        }, 3000);
    } else {
        clearTimeout(resetConfirmTimeout);
        btn.classList.remove('confirm');
        btn.textContent = 'Réinitialiser les sauvegardes';
        if (timerRunning) stopTimer();
        timers      = new Array(JEUX.length).fill(0);
        selectedJeu = null;
        localStorage.removeItem('jdj_selected');
        renderJeux();
        updateFooter();
        db.ref('jeudesjeux').remove()
          .catch(err => console.error('Firebase reset error:', err));
    }
}

function resetApp() {
    if (fbListener && currentUser) {
        db.ref(`jeudesjeux/${currentUser}`).off('value', fbListener);
        fbListener = null;
    }
    _stopLiveInterval();
    currentUser  = null;
    timers       = new Array(JEUX.length).fill(0);
    selectedJeu  = null;
    timerRunning = false;
    startedAt    = null;
}

// ============================================================
//  FIREBASE
// ============================================================
function loadFromFirebase() {
    if (fbListener) {
        db.ref(`jeudesjeux/${currentUser}`).off('value', fbListener);
    }

    fbListener = db.ref(`jeudesjeux/${currentUser}`).on('value', snap => {
        const data = snap.val() || {};

        // Timers accumulés → affichage des cartes (pas le live)
        for (let i = 0; i < JEUX.length; i++) {
            timers[i] = data[i] || 0;
        }

        // Jeu sélectionné (ne pas écraser pendant une session active)
        if (!timerRunning && data.selectedJeu != null) {
            selectedJeu = data.selectedJeu;
            localStorage.setItem('jdj_selected', selectedJeu);
        }

        // Synchronisation état du timer
        const fbActive    = !!data.timerActive;
        const fbStartedAt = data.startedAt || null;

        if (fbActive && !timerRunning && fbStartedAt) {
            // Timer actif (rechargement de page ou autre appareil)
            startedAt    = fbStartedAt;
            timerRunning = true;
            _startLiveInterval();
        } else if (!fbActive && timerRunning) {
            // Timer arrêté depuis un autre appareil
            _stopLiveInterval();
            timerRunning = false;
            startedAt    = null;
        }

        renderJeux();
        updateFooter();
    });
}

function _startLiveInterval() {
    clearInterval(liveInterval);
    liveInterval = setInterval(() => {
        if (!timerRunning || startedAt === null) return;
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        const el = document.getElementById('footer-timer-val');
        if (el) el.textContent = formatTime(elapsed);
    }, 1000);
}

function _stopLiveInterval() {
    clearInterval(liveInterval);
    liveInterval = null;
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
        card.className = ['game-card', isSelected ? 'selected' : '', isRunning ? 'running' : '']
            .filter(Boolean).join(' ');
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
        seg.style.width      = pct + '%';
        seg.style.background = jeu.couleur;

        seg.addEventListener('click', (e) => {
            e.stopPropagation();
            const tooltip = document.getElementById('dist-tooltip');
            document.getElementById('dist-tooltip-name').textContent  = jeu.nom;
            document.getElementById('dist-tooltip-timer').textContent = formatTime(timers[i]);
            tooltip.style.left = e.clientX + 'px';
            tooltip.style.top  = (e.clientY - 10) + 'px';
            tooltip.classList.add('hidden');
            requestAnimationFrame(() => tooltip.classList.remove('hidden'));
        });

        bar.appendChild(seg);
    });
}

function updateFooter() {
    const nameEl   = document.getElementById('footer-selected-name');
    const timerEl  = document.getElementById('footer-timer-val');
    const btn      = document.getElementById('launch-btn');
    const btnIcon  = document.getElementById('launch-btn-icon');
    const btnLabel = document.getElementById('launch-btn-label');

    if (selectedJeu !== null) {
        nameEl.textContent = JEUX[selectedJeu].nom;
        btn.disabled = false;

        if (timerRunning && startedAt !== null) {
            const elapsed = Math.floor((Date.now() - startedAt) / 1000);
            timerEl.textContent  = formatTime(elapsed);
            timerEl.classList.add('running');
            btnIcon.textContent  = '⏹';
            btnLabel.textContent = 'Arrêter le timer';
            btn.classList.add('running');
        } else {
            timerEl.textContent  = formatTime(timers[selectedJeu]);
            timerEl.classList.remove('running');
            btnIcon.textContent  = '▶';
            btnLabel.textContent = 'Lancer le timer';
            btn.classList.remove('running');
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
    if (timerRunning) return;
    selectedJeu = index;
    localStorage.setItem('jdj_selected', index);
    db.ref(`jeudesjeux/${currentUser}/selectedJeu`).set(index)
      .catch(err => console.error('Firebase error:', err));
    renderJeux();
    updateFooter();
}

// ============================================================
//  TIMER
// ============================================================
function startTimer() {
    if (selectedJeu === null) return;

    const now    = Date.now();
    startedAt    = now;
    timerRunning = true;

    db.ref(`jeudesjeux/${currentUser}`).update({
        timerActive: true,
        startedAt:   now,
    }).catch(err => console.error('Firebase error:', err));

    _startLiveInterval();
    updateFooter();
    renderJeux();
}

function stopTimer() {
    if (!timerRunning || selectedJeu === null || startedAt === null) return;

    const diff = Math.floor((Date.now() - startedAt) / 1000);
    timers[selectedJeu] += diff;

    _stopLiveInterval();
    timerRunning = false;
    startedAt    = null;

    db.ref(`jeudesjeux/${currentUser}`).update({
        [selectedJeu]: timers[selectedJeu],
        timerActive:   false,
        startedAt:     null,
    }).catch(err => console.error('Firebase error:', err));

    updateFooter();
    renderJeux();
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
