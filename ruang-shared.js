// ================================================
// COCOMEO BOLA — SHARED UTILITIES
// Used across: zones, hangouts, bola tabs
// ================================================

const SUPABASE_URL = 'https://fuovfrdicdhnlymnacpz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1b3ZmcmRpY2Robmx5bW5hY3B6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjYxMzEsImV4cCI6MjA4MjYwMjEzMX0.oX4fVTEIWiRG2NaNJJKOV8dTnSHWhicLVMIFzZUl1o0';

const currentUser = localStorage.getItem('nope_username') || '@newglitch';

// Supabase fetch helper
async function supabaseFetch(table, method = 'GET', body = null, filter = '') {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  let url = `${SUPABASE_URL}/rest/v1/${table}${filter}`;
  let options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ Gagal fetch ${table}:`, res.status, errorText);
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.json();
}

// Trigger pulse animation
function triggerPulse() {
  const pulse = document.createElement('div');
  pulse.className = 'pulse-animation';
  document.body.appendChild(pulse);
  setTimeout(() => pulse.remove(), 1400);
}

// Navigation helpers
function navigateTo(page) {
  window.location.href = page;
}

function logout() {
  if (confirm('Yakin mau keluar?')) {
    localStorage.removeItem('nope_username');
    window.location.href = 'index.html';
  }
}

// Setup settings button (common across all tabs)
document.addEventListener('DOMContentLoaded', () => {
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    settingsBtn.onclick = logout;
  }
});
