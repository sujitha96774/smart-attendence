// Live Classroom Projector Controller

let activeSession = null;
let currentRemainingSec = 10;
let countdownTimer = null;
let attendancePollTimer = null;
let previousCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
  await initLiveView();

  // Fullscreen button
  document.getElementById('btnToggleFullscreen').addEventListener('click', toggleFullScreen);
});

async function initLiveView() {
  try {
    const data = await apiFetch('/api/session/active');
    const noSession = document.getElementById('noSessionMessage');
    const activeLayout = document.getElementById('activeSessionLayout');

    if (!data.active || !data.session) {
      noSession.style.display = 'block';
      activeLayout.style.display = 'none';
      return;
    }

    activeSession = data.session;
    noSession.style.display = 'none';
    activeLayout.style.display = 'grid';

    document.getElementById('liveCourseName').textContent = `${activeSession.courseCode}: ${activeSession.courseName}`;
    document.getElementById('liveCourseMeta').textContent = 
      `Faculty: ${activeSession.faculty} | Room: ${activeSession.room} | Date: ${activeSession.date}`;

    // Initial QR fetch
    await fetchDynamicQr();

    // Start countdown timer
    startCountdown();

    // Start live attendance feed
    pollLiveAttendance();
    attendancePollTimer = setInterval(pollLiveAttendance, 2000);

  } catch (err) {
    console.error('Error initializing live projector view:', err);
  }
}

// Fetch rotating dynamic QR from server
async function fetchDynamicQr() {
  if (!activeSession) return;
  try {
    const data = await apiFetch(`/api/session/dynamic-qr/${activeSession.id}`);
    const img = document.getElementById('dynamicQrImg');
    img.src = data.qrDataUrl;

    currentRemainingSec = data.secondsRemaining || 10;
    updateTimerDisplay();
  } catch (err) {
    console.warn('Failed to refresh QR code:', err.message);
  }
}

// Countdown timer loop
function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);

  countdownTimer = setInterval(async () => {
    currentRemainingSec--;
    if (currentRemainingSec <= 0) {
      await fetchDynamicQr();
    } else {
      updateTimerDisplay();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const lbl = document.getElementById('countdownSeconds');
  const bar = document.getElementById('countdownBar');
  if (lbl) lbl.textContent = `${currentRemainingSec}s`;

  if (bar) {
    const pct = Math.max(0, Math.min(100, (currentRemainingSec / 10) * 100));
    bar.style.width = `${pct}%`;
    // Color changes to red when expiring
    if (currentRemainingSec <= 3) {
      bar.style.background = '#ef4444';
    } else {
      bar.style.background = 'linear-gradient(90deg, #38bdf8, #818cf8)';
    }
  }
}

// Poll live attendance records
async function pollLiveAttendance() {
  if (!activeSession) return;
  try {
    const data = await apiFetch(`/api/attendance/live/${activeSession.id}`);
    const count = data.count || 0;
    const total = data.totalStudents || 1;
    const records = data.attendance || [];

    document.getElementById('livePresentCount').textContent = count;
    document.getElementById('turnoutPercent').textContent = `${data.percentage}% (${count}/${total})`;
    document.getElementById('turnoutBar').style.width = `${data.percentage}%`;

    // Play chime when a new student is recorded
    if (count > previousCount && previousCount !== 0) {
      SoundFX.playSuccess();
    }
    previousCount = count;

    // Render feed
    const feed = document.getElementById('studentFeedList');
    if (records.length === 0) {
      feed.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
          <i class="fa-solid fa-camera fa-fade" style="font-size: 2rem; margin-bottom: 0.75rem; display: block;"></i>
          Awaiting student scans...
        </div>
      `;
      return;
    }

    feed.innerHTML = records.slice().reverse().map(r => `
      <div class="feed-item">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #4338ca; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; font-size: 0.85rem;">
            ${r.studentName.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div style="font-weight: 600; color: #fff; font-size: 0.95rem;">${r.studentName}</div>
            <div style="color: var(--text-muted); font-size: 0.8rem;">${r.studentRollNo} &bull; ${r.department}</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 0.85rem; color: #34d399; font-weight: 600;">
            <i class="fa-solid fa-circle-check"></i> Present
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${r.timeFormatted}</div>
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error('Error polling attendance feed:', err);
  }
}

// Toggle full-screen mode for projector
function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn(`Error attempting to enable fullscreen: ${err.message}`);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}
