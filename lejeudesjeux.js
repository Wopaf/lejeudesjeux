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
const VERSION = '1.4.0';

const ICON_PLAY = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M320-273v-414q0-17 12-28.5t28-11.5q5 0 10.5 1.5T381-721l326 207q9 6 13.5 15t4.5 19q0 10-4.5 19T707-446L381-239q-5 3-10.5 4.5T360-233q-16 0-28-11.5T320-273Zm80-207Zm0 134 210-134-210-134v268Z"/></svg>`;

// ============================================================
//  CONFIGURATION — Modifie ce tableau pour personnaliser les jeux
// ============================================================
const JEUX = [
    { nom: "Super Meat Boy",             img: "medias-lejeudesjeux/meatboy.png",      bg: "medias-lejeudesjeux/bg-meatboy.png",      couleur: "#db2727" },
    { nom: "Dungeon Siège",              img: "medias-lejeudesjeux/dungeonsiege.png", bg: "medias-lejeudesjeux/bg-dungeonsiege.png", couleur: "#ecc349" },
    { nom: "Castlevania: Aria of Sorrow",img: "medias-lejeudesjeux/castelvania.png", bg: "medias-lejeudesjeux/bg-castelvania.png",  couleur: "#4d67ff" },
    { nom: "Kingdom Hearts III",         img: "medias-lejeudesjeux/kingdown.png",     bg: "medias-lejeudesjeux/bg-kingdown.png",     couleur: "#a748ef" },
    { nom: "Have a Nice Death",          img: "medias-lejeudesjeux/have.png",         bg: "medias-lejeudesjeux/bg-have.png",         couleur: "#454545" },
    { nom: "Dead Island 2",              img: "medias-lejeudesjeux/dead.png",         bg: "medias-lejeudesjeux/bg-dead.png",         couleur: "#33c0ad" },
    { nom: "Gorogoa",                    img: "medias-lejeudesjeux/gorogoa.png",      bg: "medias-lejeudesjeux/bg-gorogoa.png",      couleur: "#4bc561" },
];

// ============================================================
//  UTILISATEURS — couleurs et identifiants
// ============================================================
const ACCENT_COLORS = [
    ['#7c5cfc', '#a855f7'],
    ['#3b82f6', '#06b6d4'],
    ['#06b6d4', '#22c55e'],
    ['#31c166', '#79c20c'],
    ['#dcb234', '#e4792c'],
    ['#f97316', '#ef4444'],
    ['#ef4444', '#ec4899'],
    ['#ec4899', '#d946ef'],
];

const ACCENT_DEFAULT = ['#7c5cfc', '#a855f7'];

const USERS = [
    { id: 'matthias', name: 'Matthias', initial: 'M',  couleur: '#4ade80' },
    { id: 'valentin', name: 'Valentin', initial: 'V',  couleur: '#fb923c' },
    { id: 'morgane',  name: 'Morgane',  initial: 'Mo', couleur: '#d946ef' },
    { id: 'tom',      name: 'Tom',      initial: 'T',  couleur: '#38bdf8' },
];

// ============================================================
//  ÉTAT
// ============================================================
let currentUser  = null;
let selectedJeu  = null;
let timers       = new Array(JEUX.length).fill(0);    // valeurs accumulées Firebase
let validated    = new Array(JEUX.length).fill(false); // état validé par jeu
let firstRender  = false;
let timerRunning = false;
let startedAt    = null;   // timestamp (ms) du démarrage de la session en cours
let liveInterval = null;   // mise à jour du compteur live dans le footer
let fbListener    = null;
let _skipNextRender = false;
let currentAccent = ACCENT_DEFAULT;
let visitData     = {};  // données lues à l'ouverture de la modal Visiter
let tooltipTimeout     = null;
let tooltipHideTimeout = null;
let noteTimeout        = null;

// ============================================================
//  INIT
// ============================================================
document.addEventListener('click', (e) => {
    if (!e.target.closest('.time-dist-segment')) {
        hideTooltip();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('loader-modal');
    setTimeout(() => {
        loader.classList.add('hiding');
        setTimeout(() => loader.classList.add('hidden'), 600);
    }, 1000);

    document.querySelectorAll('.app-version').forEach(el => el.textContent = `v${VERSION}`);

    document.querySelectorAll('.user-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => setUser(btn.dataset.user));
    });

    document.getElementById('user-badge').addEventListener('click', openProfileModal);
    document.getElementById('profile-close').addEventListener('click', closeProfileModal);
    document.getElementById('profile-overlay').addEventListener('click', closeProfileModal);
    document.getElementById('profile-logout-btn').addEventListener('click', () => {
        localStorage.removeItem('jdj_user');
        location.reload();
    });
    document.getElementById('profile-note').addEventListener('input', (e) => {
        const val   = e.target.value;
        const noteEl = document.getElementById('user-note-badge');
        if (noteEl) { noteEl.textContent = val; noteEl.classList.toggle('hidden', !val); }
        clearTimeout(noteTimeout);
        noteTimeout = setTimeout(() => {
            db.ref(`jeudesjeux/${currentUser}/note`).set(val || null).catch(console.error);
        }, 600);
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

    currentAccent = ACCENT_DEFAULT;
    document.documentElement.style.setProperty('--accent',   currentAccent[0]);
    document.documentElement.style.setProperty('--accent-2', currentAccent[1]);

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
    document.documentElement.style.setProperty('--accent',   ACCENT_DEFAULT[0]);
    document.documentElement.style.setProperty('--accent-2', ACCENT_DEFAULT[1]);
    currentUser  = null;
    timers       = new Array(JEUX.length).fill(0);
    validated    = new Array(JEUX.length).fill(false);
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

    let isFirstLoad = true;

    fbListener = db.ref(`jeudesjeux/${currentUser}`).on('value', snap => {
        const data = snap.val() || {};

        if (isFirstLoad) {
            isFirstLoad = false;
            firstRender = true;
        }

        // Timers accumulés → affichage des cartes (pas le live)
        for (let i = 0; i < JEUX.length; i++) {
            timers[i] = data[i] || 0;
        }

        // Note personnelle
        const noteEl = document.getElementById('user-note-badge');
        if (noteEl) {
            const note = data.note || '';
            noteEl.textContent = note;
            noteEl.classList.toggle('hidden', !note);
        }

        // État validé par jeu
        const validatedData = data.validated || {};
        for (let i = 0; i < JEUX.length; i++) {
            validated[i] = validatedData[i] === true;
        }

        // Couleur d'accent
        if (Array.isArray(data.accent) && data.accent.length === 2) {
            currentAccent = data.accent;
            document.documentElement.style.setProperty('--accent',   currentAccent[0]);
            document.documentElement.style.setProperty('--accent-2', currentAccent[1]);
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

        if (_skipNextRender) {
            _skipNextRender = false;
        } else {
            renderJeux();
        }
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
        const isSelected  = i === selectedJeu;
        const isRunning   = isSelected && timerRunning;
        const isValidated = validated[i];

        const card = document.createElement('div');
        card.className = ['game-card', isSelected ? 'selected' : '', isRunning ? 'running' : '', isValidated ? 'validated' : '']
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
                    ${isRunning   ? '<div class="game-card-running-dot"></div>' : ''}
                    ${isValidated ? '<div class="game-card-check"></div>' : ''}
                </div>
                <span class="game-card-name">${jeu.nom}</span>
                <span class="game-card-timer ${isValidated ? 'validated' : ''}">${formatTime(timers[i])}</span>
            </div>
            <div class="game-card-swipe-overlay"></div>
        `;

        // Clic → sélection (annulé si un swipe vient d'avoir lieu)
        let cardSwiped = false;
        card.addEventListener('click', () => {
            if (cardSwiped) { cardSwiped = false; return; }
            selectJeu(i);
        });

        // Swipe → validation
        let txStart = null;
        let tyStart = null;
        let axis    = null;
        const overlay = card.querySelector('.game-card-swipe-overlay');

        if (firstRender) {
            card.style.animation = `cardEnter 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${950 + i * 50}ms both`;
        }

        card.addEventListener('touchstart', (e) => {
            txStart    = e.touches[0].clientX;
            tyStart    = e.touches[0].clientY;
            axis       = null;
            cardSwiped = false;
            card.style.animation = '';
            card.classList.add('swiping');
        }, { passive: true });

        card.addEventListener('touchmove', (e) => {
            if (txStart === null) return;
            const dx = e.touches[0].clientX - txStart;
            const dy = e.touches[0].clientY - tyStart;
            if (!axis) {
                if (Math.abs(dx) > Math.abs(dy) + 4) axis = 'h';
                else if (Math.abs(dy) > Math.abs(dx) + 4) axis = 'v';
                else return;
            }
            if (axis === 'v') { card.classList.remove('swiping'); return; }
            const clamped = Math.max(-110, Math.min(110, dx));
            card.style.transform = `translateX(${clamped}px)`;
            const alpha = Math.min(Math.abs(clamped) / 110 * 0.45, 0.45);
            overlay.style.background = clamped < 0
                ? `rgba(34,197,94,${alpha})`
                : `rgba(239,68,68,${alpha})`;
        }, { passive: true });

        const _endSwipe = (changedX) => {
            const dx = changedX - txStart;
            card.classList.remove('swiping');
            card.style.transform   = '';
            overlay.style.background = '';
            if (axis === 'h' && Math.abs(dx) >= 60) {
                cardSwiped = true;
                setValidated(i, dx < 0);
            }
            txStart = null;
            tyStart = null;
            axis    = null;
        };

        card.addEventListener('touchend',    (e) => _endSwipe(e.changedTouches[0].clientX), { passive: true });
        card.addEventListener('touchcancel', ()  => _endSwipe(txStart ?? 0));

        // Simulation souris (même logique)
        card.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            txStart    = e.clientX;
            tyStart    = e.clientY;
            axis       = null;
            cardSwiped = false;
            card.style.animation = '';
            card.classList.add('swiping');

            const onMove = (e) => {
                if (txStart === null) return;
                const dx = e.clientX - txStart;
                const dy = e.clientY - tyStart;
                if (!axis) {
                    if (Math.abs(dx) > Math.abs(dy) + 4) axis = 'h';
                    else if (Math.abs(dy) > Math.abs(dx) + 4) axis = 'v';
                    else return;
                }
                if (axis === 'v') { card.classList.remove('swiping'); return; }
                const clamped = Math.max(-110, Math.min(110, dx));
                card.style.transform = `translateX(${clamped}px)`;
                const alpha = Math.min(Math.abs(clamped) / 110 * 0.45, 0.45);
                overlay.style.background = clamped < 0
                    ? `rgba(34,197,94,${alpha})`
                    : `rgba(239,68,68,${alpha})`;
            };
            const onUp = (e) => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                _endSwipe(e.clientX);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        grid.appendChild(card);
    });

    firstRender = false;
    updateDistribution();
    updateTotalTime();
}

function setValidated(i, bool) {
    if (validated[i] === bool) return;
    validated[i] = bool;
    db.ref(`jeudesjeux/${currentUser}/validated/${i}`)
      .set(bool ? true : null)
      .catch(console.error);
    renderJeux();
}

function updateDistribution() {
    const bar   = document.getElementById('time-dist-bar');
    const slots = document.getElementById('time-dist-slots');
    if (!bar) return;

    // Barre de distribution
    const total = timers.reduce((sum, t) => sum + t, 0);
    bar.innerHTML = '';
    if (total > 0) {
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

    // Slots de validation
    if (slots) {
        slots.innerHTML = '';
        JEUX.forEach((jeu, i) => {
            const slot = document.createElement('div');
            const isDone = validated[i];
            slot.className = 'visit-slot' + (isDone ? ' done' : '');
            if (isDone) {
                slot.style.borderColor     = jeu.couleur;
                slot.style.boxShadow       = `0 0 6px ${jeu.couleur}88`;
                slot.style.backgroundImage = `url('${jeu.img}')`;
            }
            slots.appendChild(slot);
        });
    }
}

let _launchBgCurrent = null;
let _launchBgTimer   = null;

function setLaunchBg(path) {
    if (path === _launchBgCurrent) return;
    _launchBgCurrent = path;
    clearTimeout(_launchBgTimer);
    const el = document.getElementById('launch-btn-bg');
    if (!el) return;
    el.style.opacity = '0';
    _launchBgTimer = setTimeout(() => {
        if (path) {
            el.style.backgroundImage = `url(${path})`;
            el.style.opacity = '0.18';
        } else {
            el.style.backgroundImage = '';
        }
    }, 350);
}

function updateFooter() {
    document.getElementById('grid-overlay').classList.toggle('active', timerRunning);

    const nameEl   = document.getElementById('footer-selected-name');
    const timerEl  = document.getElementById('footer-timer-val');
    const btn      = document.getElementById('launch-btn');
    const btnIcon  = document.getElementById('launch-btn-icon');
    const btnLabel = document.getElementById('launch-btn-label');

    if (selectedJeu !== null) {
        const newName = JEUX[selectedJeu].nom;
        if (nameEl.textContent !== newName) {
            nameEl.textContent = newName;
            nameEl.classList.remove('name-enter');
            void nameEl.offsetWidth; // force reflow
            nameEl.classList.add('name-enter');
        }
        setLaunchBg(JEUX[selectedJeu].bg || null);
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
            btnIcon.innerHTML    = ICON_PLAY;
            btnLabel.textContent = 'Lancer le timer';
            btn.classList.remove('running');
        }
    } else {
        nameEl.textContent  = '—';
        timerEl.textContent = '00:00:00';
        setLaunchBg(null);
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
    _skipNextRender = true;
    db.ref(`jeudesjeux/${currentUser}/selectedJeu`).set(index)
      .catch(err => console.error('Firebase error:', err));
    document.querySelectorAll('#jeux-grid .game-card').forEach(card => {
        card.classList.toggle('selected', parseInt(card.dataset.index) === index);
    });
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
    const modal = document.getElementById('confirm-modal');
    modal.classList.add('closing');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('closing');
    }, 350);
}

// ============================================================
//  MODAL PROFIL
// ============================================================
function openProfileModal() {
    if (!currentUser) return;
    const modal      = document.getElementById('profile-modal');
    const userConfig = USERS.find(u => u.id === currentUser);
    modal.classList.remove('hidden', 'closing');

    const avatarEl = document.getElementById('profile-avatar');
    avatarEl.textContent  = userConfig.initial;
    avatarEl.style.background = `linear-gradient(135deg, ${userConfig.couleur}, color-mix(in srgb, ${userConfig.couleur} 70%, #000))`;
    document.getElementById('profile-name').textContent = userConfig.name;

    const colorsEl = document.getElementById('profile-colors');
    colorsEl.innerHTML = '';
    ACCENT_COLORS.forEach(pair => {
        const swatch = document.createElement('button');
        const isActive = pair[0] === currentAccent[0] && pair[1] === currentAccent[1];
        swatch.className = 'profile-color-swatch' + (isActive ? ' active' : '');
        swatch.style.background = `linear-gradient(135deg, ${pair[0]}, ${pair[1]})`;
        swatch.addEventListener('click', () => {
            colorsEl.querySelectorAll('.profile-color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            setAccentColor(pair);
        });
        colorsEl.appendChild(swatch);
    });

    db.ref(`jeudesjeux/${currentUser}/note`).once('value').then(snap => {
        document.getElementById('profile-note').value = snap.val() || '';
    });
}

function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal.classList.contains('hidden')) return;
    modal.classList.add('closing');
    setTimeout(() => {
        modal.classList.remove('closing');
        modal.classList.add('hidden');
    }, 200);
}

function setAccentColor(pair) {
    currentAccent = pair;
    document.documentElement.style.setProperty('--accent',   pair[0]);
    document.documentElement.style.setProperty('--accent-2', pair[1]);
    _skipNextRender = true;
    db.ref(`jeudesjeux/${currentUser}/accent`).set(pair).catch(console.error);
}

// ============================================================
//  MODAL VISITER
// ============================================================
function openVisitModal() {
    const modal = document.getElementById('visit-modal');
    modal.classList.remove('hidden', 'closing');
    visitData = {};

    Promise.all(USERS.map(user =>
        db.ref(`jeudesjeux/${user.id}`).once('value').then(snap => {
            visitData[user.id] = snap.val() || {};
        })
    )).then(() => renderVisitModal());
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

    USERS.forEach((user, index) => {
        const data        = visitData[user.id] || {};
        const userTimers  = JEUX.map((_, i) => data[i] || 0);
        const total       = userTimers.reduce((sum, t) => sum + t, 0);
        const isPlaying   = !!data.timerActive;
        const selIdx      = (data.selectedJeu != null && data.selectedJeu < JEUX.length)
                            ? data.selectedJeu : null;
        const selJeu      = selIdx !== null ? JEUX[selIdx] : null;

        const statusText  = isPlaying && selJeu ? selJeu.nom : 'Hors ligne';
        const statusClass = isPlaying ? 'online' : '';

        const accent = (Array.isArray(data.accent) && data.accent.length === 2)
                       ? data.accent : ACCENT_DEFAULT;

        const card = document.createElement('div');
        card.className = 'visit-user-card' + (isPlaying ? ' is-playing' : '');
        card.style.setProperty('--visit-a1', accent[0]);
        card.style.setProperty('--visit-a2', accent[1]);
        card.style.animationDelay = `${0.2 + index * 0.09}s`;
        const bgStyle = selJeu?.bg ? `--visit-bg:url(${selJeu.bg});` : '';
        card.innerHTML = `
            <div class="visit-user-header" style="${bgStyle}">
                <svg class="visit-chevron" xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor">
                    <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/>
                </svg>
                <div class="visit-user-info">
                    <span class="visit-user-name">${user.name}</span>
                    <span class="visit-user-status ${statusClass}">
                        ${isPlaying ? '<span class="visit-status-dot"></span>' : ''}
                        ${statusText}
                    </span>
                </div>
            </div>
        `;
        card.querySelector('.visit-user-header').addEventListener('click', () => {
            card.classList.toggle('expanded');
        });

        const body = document.createElement('div');
        body.className = 'visit-card-body';
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
            body.appendChild(bar);
        } else {
            const noData = document.createElement('div');
            noData.className   = 'visit-no-data';
            noData.textContent = 'Aucune donnée';
            body.appendChild(noData);
        }
        card.appendChild(body);

        // Slots de validation + total
        const validatedData = data.validated || {};
        const slotsRow = document.createElement('div');
        slotsRow.className = 'visit-slots-row';

        const slots = document.createElement('div');
        slots.className = 'visit-slots';
        JEUX.forEach((jeu, i) => {
            const slot = document.createElement('div');
            const isDone = validatedData[i] === true;
            slot.className = 'visit-slot' + (isDone ? ' done' : '');
            if (isDone) {
                slot.style.borderColor     = jeu.couleur;
                slot.style.boxShadow       = `0 0 6px ${jeu.couleur}88`;
                slot.style.backgroundImage = `url('${jeu.img}')`;
            }
            slots.appendChild(slot);
        });

        const totalWrap = document.createElement('div');
        totalWrap.className = 'visit-total-wrap';
        totalWrap.innerHTML = `
            <span class="visit-total-label">Temps total</span>
            <span class="visit-user-total">${formatTimeHM(total)}</span>
        `;

        slotsRow.appendChild(slots);
        slotsRow.appendChild(totalWrap);
        card.appendChild(slotsRow);

        const note = (data.note || '').trim();
        const wrap = document.createElement('div');
        wrap.className = 'visit-user-wrap';
        if (note) {
            const bubble = document.createElement('div');
            bubble.className = 'visit-bubble';
            bubble.style.setProperty('--visit-a1', accent[0]);
            bubble.style.setProperty('--visit-a2', accent[1]);
            bubble.textContent = note;
            const lastCardEnd = 0.01 + (USERS.length - 1) * 0.09 + 0.35;
            bubble.style.animationDelay = `${lastCardEnd + index * 0.1}s`;
            wrap.appendChild(bubble);
        }
        wrap.appendChild(card);
        container.appendChild(wrap);
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

function formatTimeHM(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${pad(h)}h${pad(m)}`;
}

function pad(n) {
    return String(n).padStart(2, '0');
}
