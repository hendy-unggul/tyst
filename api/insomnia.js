// ================================================================
//  PATCH spill.html — INSOMNIA MODE
//  Hot Take → Insomnia, jam aktif 22.00-04.00 WIB
//  AI persona pool reset tiap 22.00, max 3 per malam
//  Soft Talk tidak diubah sama sekali
// ================================================================


// ────────────────────────────────────────────────────────────────
//  PATCH 1 — HTML: Ganti tombol btnHot
//
//  CARI (di bagian HTML, bukan JS):
//    <button class="btn-gender btn-hot" id="btnHot">
//        <span class="gender-icon">🔥</span><span>HOT TAKE</span>
//    </button>
//
//  GANTI DENGAN:
// ────────────────────────────────────────────────────────────────
/*
<button class="btn-gender btn-hot" id="btnHot">
    <span class="gender-icon" id="insomniaIcon">🌙</span>
    <span>INSOMNIA</span>
    <span id="insomniaStatus" style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;opacity:.7"></span>
</button>
*/


// ────────────────────────────────────────────────────────────────
//  PATCH 2 — HTML: Ganti label chatVibeBadge hot_take di header
//
//  CARI (di bagian HTML):
//    <span class="chat-vibe-label" id="chatVibeBadge">HOT TAKE</span>
//
//  GANTI DENGAN:
// ────────────────────────────────────────────────────────────────
/*
<span class="chat-vibe-label" id="chatVibeBadge">INSOMNIA</span>
*/


// ────────────────────────────────────────────────────────────────
//  PATCH 3 — HTML: Ganti scan badge default
//
//  CARI (di bagian HTML):
//    <div class="scan-vibe" id="scanVibeBadge">HOT TAKE</div>
//
//  GANTI DENGAN:
// ────────────────────────────────────────────────────────────────
/*
<div class="scan-vibe" id="scanVibeBadge">INSOMNIA</div>
*/


// ────────────────────────────────────────────────────────────────
//  PATCH 4 — HTML: Ganti invite badge default
//
//  CARI (di bagian HTML):
//    <div class="invite-vibe-badge" id="inviteVibeBadge">🔥 HOT TAKE</div>
//
//  GANTI DENGAN:
// ────────────────────────────────────────────────────────────────
/*
<div class="invite-vibe-badge" id="inviteVibeBadge">🌙 INSOMNIA</div>
*/


// ────────────────────────────────────────────────────────────────
//  PATCH 5 — CSS: Tambahkan style .insomnia di dalam <style>
//
//  CARI baris:
//    .btn-hot{background:linear-gradient(145deg,var(--ap),#ff6b8b);color:#fff}
//
//  GANTI DENGAN:
// ────────────────────────────────────────────────────────────────
/*
.btn-hot{background:linear-gradient(145deg,#1a0533,#3d0f6e);color:#fff;border-color:#7b2fff}
.btn-hot.inactive{background:linear-gradient(145deg,#111,#1a1a2e);color:#444;border-color:#222;cursor:default}
.chat-vibe-label.hot_take{background:#7b2fff;color:#fff}
.scan-vibe.hot_take{background:#7b2fff;color:#fff}
.invite-vibe-badge.hot_take{background:#7b2fff;color:#fff}
*/


// ────────────────────────────────────────────────────────────────
//  PATCH 6 — JS: TAMBAHKAN blok ini tepat setelah baris
//    const AI={hot_take:[...],soft_talk:[...]};
//  (jangan hapus baris AI tersebut, taruh SETELAH baris itu)
// ────────────────────────────────────────────────────────────────

// ── INSOMNIA: jam aktif & persona pool ───────────────────────────
const INSOMNIA_OPEN_HOUR  = 22; // WIB
const INSOMNIA_CLOSE_HOUR = 4;  // WIB (04.00)
const INSOMNIA_TZ_OFFSET  = 7;  // UTC+7
const INSOMNIA_AI_POOL    = ['agak.koplak','chili.padi','satria.bajahitam','sejuta.badai','pretty.sad','move.on'];
const INSOMNIA_LS_KEY     = 'insomnia_personas_v1'; // localStorage key
const INSOMNIA_LS_DATE    = 'insomnia_personas_date';

function getWIBHour() {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const wib = new Date(utc + INSOMNIA_TZ_OFFSET * 3600000);
    return wib.getHours();
}

function getWIBDateString() {
    // Format: "YYYY-MM-DD" berdasarkan sesi malam (22.00 = hari baru)
    // Jam 22-23 → pakai tanggal hari ini
    // Jam 00-04 → pakai tanggal kemarin (masih sesi malam yang sama)
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const wib = new Date(utc + INSOMNIA_TZ_OFFSET * 3600000);
    const h = wib.getHours();
    // Jam 0-4 dianggap masih "malam sebelumnya"
    if (h < INSOMNIA_CLOSE_HOUR) {
        wib.setDate(wib.getDate() - 1);
    }
    return wib.toISOString().slice(0, 10);
}

function isInsomniaActive() {
    const h = getWIBHour();
    return h >= INSOMNIA_OPEN_HOUR || h < INSOMNIA_CLOSE_HOUR;
}

function getInsomniaPersonas() {
    const today = getWIBDateString();
    const savedDate = localStorage.getItem(INSOMNIA_LS_DATE);
    const saved = localStorage.getItem(INSOMNIA_LS_KEY);

    // Kalau masih sesi malam yang sama → pakai pool yang sudah tersimpan
    if (savedDate === today && saved) {
        try { return JSON.parse(saved); } catch(e) {}
    }

    // Sesi baru → pilih 3 persona acak, simpan ke localStorage
    const shuffled = [...INSOMNIA_AI_POOL].sort(() => Math.random() - 0.5);
    const personas = shuffled.slice(0, 3);
    localStorage.setItem(INSOMNIA_LS_KEY, JSON.stringify(personas));
    localStorage.setItem(INSOMNIA_LS_DATE, today);
    return personas;
}

function updateInsomniaButton() {
    const btn = document.getElementById('btnHot');
    const status = document.getElementById('insomniaStatus');
    const icon = document.getElementById('insomniaIcon');
    if (!btn || !status) return;

    if (isInsomniaActive()) {
        btn.classList.remove('inactive');
        btn.disabled = false;
        status.textContent = 'LIVE';
        if (icon) icon.textContent = '🌙';
    } else {
        btn.classList.add('inactive');
        btn.disabled = true; // akan di-override oleh IS_GUEST check
        status.textContent = '22.00';
        if (icon) icon.textContent = '😴';
    }
}


// ────────────────────────────────────────────────────────────────
//  PATCH 7 — JS: Ganti baris AI array untuk hot_take
//
//  CARI:
//    const AI={hot_take:['agak.koplak','chili.padi','sejuta.badai','satria.bajahitam'],soft_talk:[...]}
//
//  Ubah hanya bagian hot_take — soft_talk JANGAN DIUBAH:
//    hot_take → diisi dinamis saat runtime dari getInsomniaPersonas()
//
//  GANTI DENGAN (replace seluruh baris const AI):
// ────────────────────────────────────────────────────────────────
// const AI={hot_take:['agak.koplak','chili.padi','sejuta.badai','satria.bajahitam'],soft_talk:['beby.manis','pretty.sad','strawberry.shortcake','cinnamon.girl','move.on']};
// → HAPUS BARIS DI ATAS, GANTI DENGAN:
const AI={
    get hot_take(){ return getInsomniaPersonas(); },
    soft_talk:['beby.manis','pretty.sad','strawberry.shortcake','cinnamon.girl','move.on']
};


// ────────────────────────────────────────────────────────────────
//  PATCH 8 — JS: Ganti label di showInvitePopup
//
//  CARI:
//    badge.textContent=inv.vibe==='hot_take'?'🔥 HOT TAKE':'💬 SOFT TALK';
//
//  GANTI DENGAN:
// ────────────────────────────────────────────────────────────────
badge.textContent=inv.vibe==='hot_take'?'🌙 INSOMNIA':'💬 SOFT TALK';


// ────────────────────────────────────────────────────────────────
//  PATCH 9 — JS: Ganti label di openChatUI
//
//  CARI:
//    badge.textContent=v==='hot_take'?'🔥 HOT TAKE':'💬 SOFT TALK';
//
//  GANTI DENGAN:
// ────────────────────────────────────────────────────────────────
badge.textContent=v==='hot_take'?'🌙 INSOMNIA':'💬 SOFT TALK';


// ────────────────────────────────────────────────────────────────
//  PATCH 10 — JS: Ganti label di showScan
//
//  CARI:
//    b.textContent=v==='hot_take'?'🔥 HOT TAKE':'💬 SOFT TALK';
//
//  GANTI DENGAN:
// ────────────────────────────────────────────────────────────────
b.textContent=v==='hot_take'?'🌙 INSOMNIA':'💬 SOFT TALK';


// ────────────────────────────────────────────────────────────────
//  PATCH 11 — JS: Ganti onclick btnHot
//
//  CARI:
//    if(!IS_GUEST){ $('btnHot').onclick=()=>{if(state===S.IDLE)startBid('hot_take');}; ...
//
//  GANTI DENGAN:
// ────────────────────────────────────────────────────────────────
if(!IS_GUEST){
    $('btnHot').onclick=()=>{
        if(state!==S.IDLE) return;
        if(!isInsomniaActive()){
            toast('🌙 Insomnia buka jam 22.00 WIB');
            return;
        }
        startBid('hot_take');
    };
    $('btnSoft').onclick=()=>{if(state===S.IDLE)startBid('soft_talk');};
}


// ────────────────────────────────────────────────────────────────
//  PATCH 12 — JS: Panggil updateInsomniaButton saat init
//
//  CARI fungsi init():
//    async function init(){
//        setupGuestUI();
//        initRadar();loadSpills();startBrewInterval();
//
//  Tambahkan baris updateInsomniaButton() setelah setupGuestUI():
// ────────────────────────────────────────────────────────────────
async function init(){
    setupGuestUI();
    updateInsomniaButton();                    // ← TAMBAHKAN BARIS INI
    setInterval(updateInsomniaButton, 60000);  // ← DAN INI (cek tiap menit)
    initRadar();loadSpills();startBrewInterval();
    // ... sisa kode init tidak berubah
}
