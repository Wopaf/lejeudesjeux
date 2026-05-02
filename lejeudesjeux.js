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
const VERSION = '1.0.0';

// ============================================================
//  CONFIGURATION — Modifie ce tableau pour personnaliser les jeux
// ============================================================
const JEUX = [
    { nom: "Super Meat Boy",           img: "medias-lejeudesjeux/meatboy.png",      couleur: "#db2727" },
    { nom: "Dungeon Siège",            img: "medias-lejeudesjeux/dungeonsiege.png", couleur: "#ecc349" },
    { nom: "Castlevania: Aria of Sorrow", img: "medias-lejeudesjeux/castelvania.png", couleur: "#4d67ff" },
    { nom: "Kingdom Hearts III",       img: "medias-lejeudesjeux/kingdown.png",     couleur: "#a748ef" },
    { nom: "Have a Nice Death",        img: "medias-lejeudesjeux/have.png",         couleur: "#454545" },
    { nom: "Dead Island 2",            img: "medias-lejeudesjeux/dead.png",         couleur: "#33c0ad" },
    { nom: "Gorogoa",                  img: "medias-lejeudesjeux/gorogoa.png",      couleur: "#4bc561" },
];

// ============================================================
//  UTILISATEURS — couleurs et identifiants
// ============================================================
const USERS = [
    { id: 'matthias', name: 'Matthias', initial: 'M',  couleur: '#4ade80' },
    { id: 'valentin', name: 'Valentin', initial: 'V',  couleur: '#fb923c' },
    { id: 'morgane',  name: 'Morgane',  initial: 'Mo', couleur: '#d946ef' },
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
let fbListener    = null;
let visitData     = {};  // données lues à l'ouverture de la modal Visiter
let tooltipTimeout     = null;
let tooltipHideTimeout = null;

// ============================================================
//  INIT
// ============================================================
document.addEventListener('click', (e) => {
    if (!e.target.closest('.time-dist-segment')) {
        hideTooltip();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('app-version').textContent = `v${VERSION}`;

    document.querySelectorAll('.user-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => setUser(btn.dataset.user));
    });

    document.getElementById('visit-btn').addEventListener('click', openVisitModal);
    document.getElementById('visit-close').addEventListener('click', closeVisitModal);
    document.getElementById('visit-overlay').addEventListener('click', closeVisitModal);

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

    const userConfig = USERS.find(u => u.id === user);
    const color      = userConfig ? userConfig.couleur : '#7c5cfc';
    const initial    = userConfig ? userConfig.initial : user.charAt(0).toUpperCase();
    const badge      = document.getElementById('user-badge');
    document.getElementById('user-badge-avatar').textContent = initial;
    document.getElementById('user-badge-name').textContent   = userConfig ? userConfig.name : user;
    badge.style.setProperty('--user-color', color);

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
        const footerEl = document.getElementById('footer-timer-val');
        if (footerEl) footerEl.textContent = formatTime(elapsed);
        updateTotalTime();
    }, 1000);
}

function updateTotalTime() {
    const accumulated = timers.reduce((sum, t) => sum + t, 0);
    const live = (timerRunning && startedAt) ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    const el = document.getElementById('app-total-val');
    if (el) el.textContent = formatTime(accumulated + live);
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
    updateTotalTime();
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
            bar.querySelectorAll('.time-dist-segment').forEach(s => s.classList.remove('focused'));
            bar.classList.add('has-focus');
            seg.classList.add('focused');
            showTooltip(e.clientX, e.clientY - 10, jeu.nom, formatTime(timers[i]));
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
//  MODAL VISITER
// ============================================================
function openVisitModal() {
    const modal = document.getElementById('visit-modal');
    modal.classList.remove('hidden', 'closing');
    visitData = {};

    USERS.forEach(user => {
        db.ref(`jeudesjeux/${user.id}`).once('value', snap => {
            visitData[user.id] = snap.val() || {};
            renderVisitModal();
        });
    });
}

function closeVisitModal() {
    const modal = document.getElementById('visit-modal');
    if (modal.classList.contains('hidden')) return;
    modal.classList.add('closing');
    setTimeout(() => {
        modal.classList.remove('closing');
        modal.classList.add('hidden');
        visitData = {};
    }, 200);
}

function renderVisitModal() {
    const container = document.getElementById('visit-users');
    container.innerHTML = '';

    USERS.forEach(user => {
        const data        = visitData[user.id] || {};
        const userTimers  = JEUX.map((_, i) => data[i] || 0);
        const total       = userTimers.reduce((sum, t) => sum + t, 0);
        const isPlaying   = !!data.timerActive;
        const selIdx      = (data.selectedJeu != null && data.selectedJeu < JEUX.length)
                            ? data.selectedJeu : null;
        const selJeu      = selIdx !== null ? JEUX[selIdx] : null;

        const statusText  = isPlaying && selJeu ? selJeu.nom : 'Hors ligne';
        const statusClass = isPlaying ? 'online' : '';

        const card = document.createElement('div');
        card.className = 'visit-user-card' + (isPlaying ? ' is-playing' : '');
        card.innerHTML = `
            <div class="visit-user-header">
                <div class="visit-user-avatar" style="background:linear-gradient(135deg,${user.couleur},${user.couleur}88)">
                    ${user.initial}
                </div>
                <div class="visit-user-info">
                    <span class="visit-user-name">${user.name}</span>
                    <span class="visit-user-status ${statusClass}">
                        ${isPlaying ? '<span class="visit-status-dot"></span>' : ''}
                        ${statusText}
                    </span>
                </div>
                <span class="visit-user-total">${formatTime(total)}</span>
            </div>
        `;

        if (total > 0) {
            const bar = document.createElement('div');
            bar.className = 'visit-dist-bar';
            JEUX.forEach((jeu, i) => {
                if (userTimers[i] === 0) return;
                const pct = (userTimers[i] / total) * 100;
                const seg = document.createElement('div');
                seg.className = 'visit-dist-seg';
                seg.style.width      = pct + '%';
                seg.style.background = jeu.couleur;
                seg.style.cursor     = 'pointer';
                seg.addEventListener('click', (e) => {
                    e.stopPropagation();
                    bar.querySelectorAll('.visit-dist-seg').forEach(s => s.classList.remove('focused'));
                    bar.classList.add('has-focus');
                    seg.classList.add('focused');
                    showTooltip(e.clientX, e.clientY - 10, jeu.nom, formatTime(userTimers[i]));
                });
                bar.appendChild(seg);
            });
            card.appendChild(bar);
        } else {
            const noData = document.createElement('div');
            noData.className   = 'visit-no-data';
            noData.textContent = 'Aucune donnée';
            card.appendChild(noData);
        }

        container.appendChild(card);
    });
}

// ============================================================
//  UTILITAIRES
// ============================================================
function hideTooltip() {
    const tooltip = document.getElementById('dist-tooltip');
    if (tooltip.classList.contains('hidden')) return;
    clearTimeout(tooltipHideTimeout);
    tooltip.classList.add('hiding');
    tooltipHideTimeout = setTimeout(() => {
        tooltip.classList.remove('hiding');
        tooltip.classList.add('hidden');
        document.querySelectorAll('.time-dist-bar, .visit-dist-bar').forEach(b => {
            b.classList.remove('has-focus');
            b.querySelectorAll('.focused').forEach(s => s.classList.remove('focused'));
        });
    }, 120);
}

function showTooltip(x, y, name, time) {
    const tooltip = document.getElementById('dist-tooltip');
    clearTimeout(tooltipHideTimeout);
    tooltip.classList.remove('hiding');
    document.getElementById('dist-tooltip-name').textContent  = name;
    document.getElementById('dist-tooltip-timer').textContent = time;
    tooltip.style.left = x + 'px';
    tooltip.style.top  = y + 'px';
    tooltip.classList.add('hidden');
    requestAnimationFrame(() => tooltip.classList.remove('hidden'));
    clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => hideTooltip(), 2000);
}


function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n) {
    return String(n).padStart(2, '0');
}
