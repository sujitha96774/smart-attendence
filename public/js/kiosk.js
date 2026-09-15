// Classroom Kiosk Controller

let kioskScanner = null;
let isKioskScanning = false;
let isProcessingKiosk = false;
let activeSessionData = null;
const scannedLog = [];

document.addEventListener('DOMContentLoaded', async () => {
  await checkActiveSession();
  await loadKioskStudents();

  document.getElementById('btnStartKiosk').addEventListener('click', startKiosk);
  document.getElementById('btnStopKiosk').addEventListener('click', stopKiosk);
  document.getElementById('btnSimulateBadgeScan').addEventListener('click', simulateBadgeScan);
});

async function checkActiveSession() {
  try {
    const data = await apiFetch('/api/session/active');
    const badge = document.getElementById('kioskSessionStatus');
    if (data.active && data.session) {
      activeSessionData = data.session;
      badge.className = 'badge badge-success';
      badge.textContent = `Active: ${data.session.courseCode} (${data.session.room})`;
    } else {
      activeSessionData = null;
      badge.className = 'badge badge-warning';
      badge.textContent = 'No Active Session (Start in Faculty Dashboard)';
    }
  } catch (err) {
    console.error('Session check failed:', err);
  }
}

async function loadKioskStudents() {
  try {
    const students = await apiFetch('/api/students');
    const select = document.getElementById('kioskStudentSelect');
    students.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.rollNo;
      opt.textContent = `${s.rollNo} - ${s.name}`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Error loading students:', err);
  }
}

async function startKiosk() {
  const btnStart = document.getElementById('btnStartKiosk');
  const btnStop = document.getElementById('btnStopKiosk');

  try {
    if (!kioskScanner) {
      kioskScanner = new Html5Qrcode('kioskReader');
    }

    const config = {
      fps: 15,
      qrbox: { width: 280, height: 280 },
      aspectRatio: 1.0
    };

    await kioskScanner.start(
      { facingMode: 'user' }, // Laptop front webcam
      config,
      onKioskScanSuccess,
      () => {}
    );

    isKioskScanning = true;
    btnStart.style.display = 'none';
    btnStop.style.display = 'inline-flex';
    showToast('Kiosk scanner active! Ready to scan student ID cards.', 'info');
  } catch (err) {
    console.error('Kiosk camera error:', err);
    showToast('Camera error: ' + err, 'error');
  }
}

async function stopKiosk() {
  if (kioskScanner && isKioskScanning) {
    try {
      await kioskScanner.stop();
      isKioskScanning = false;
      document.getElementById('btnStartKiosk').style.display = 'inline-flex';
      document.getElementById('btnStopKiosk').style.display = 'none';
    } catch (e) {
      console.warn('Error stopping kiosk camera:', e);
    }
  }
}

async function onKioskScanSuccess(decodedText) {
  if (isProcessingKiosk) return;
  isProcessingKiosk = true;

  try {
    // Expected badge format: "STUDENT_ID:rollNo:name" or "CS2101"
    let rollNo = decodedText;
    if (decodedText.startsWith('STUDENT_ID:')) {
      rollNo = decodedText.split(':')[1];
    }

    await handleKioskCheckIn(rollNo, decodedText);
  } finally {
    // 2.5s cooldown so the same badge isn't immediately double-detected
    setTimeout(() => {
      isProcessingKiosk = false;
    }, 2500);
  }
}

async function handleKioskCheckIn(rollNo, qrData) {
  const popup = document.getElementById('kioskCheckinPopup');

  try {
    const res = await apiFetch('/api/attendance/mark', {
      method: 'POST',
      body: JSON.stringify({
        rollNo,
        qrData: qrData || `STUDENT_ID:${rollNo}`,
        method: 'Student ID Badge'
      })
    });

    SoundFX.playSuccess();

    // Show popup
    document.getElementById('kioskStudentName').textContent = res.student.name;
    document.getElementById('kioskRoll').textContent = `${res.student.rollNo} (${res.student.department})`;
    document.getElementById('kioskTime').textContent = res.alreadyMarked ? 
      `Already Marked at ${res.record.timeFormatted}` : `Checked In At ${res.record.timeFormatted}`;
    popup.style.display = 'block';

    // Add to log
    addToLog(res.student, res.record, res.alreadyMarked);

    setTimeout(() => {
      popup.style.display = 'none';
    }, 2500);

  } catch (err) {
    SoundFX.playError();
    showToast(err.message, 'error');
  }
}

function addToLog(student, record, alreadyMarked) {
  scannedLog.unshift({ student, record, alreadyMarked });
  document.getElementById('kioskCountBadge').textContent = `${scannedLog.length} Scanned`;

  const list = document.getElementById('kioskLogList');
  list.innerHTML = scannedLog.map(item => `
    <div style="padding: 0.75rem; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
      <div>
        <div style="font-weight: 600; color: #fff;">${item.student.name}</div>
        <div style="color: var(--text-muted); font-size: 0.8rem;">${item.student.rollNo} &bull; ${item.student.department}</div>
      </div>
      <div style="text-align: right;">
        <span class="badge ${item.alreadyMarked ? 'badge-info' : 'badge-success'}">
          ${item.alreadyMarked ? 'Already Present' : 'Checked In'}
        </span>
        <div style="color: var(--text-muted); font-size: 0.75rem; margin-top: 2px;">${item.record.timeFormatted}</div>
      </div>
    </div>
  `).join('');
}

// Simulate badge scan for testing
async function simulateBadgeScan() {
  const rollNo = document.getElementById('kioskStudentSelect').value;
  if (!rollNo) return showToast('Please select a student to simulate badge scan', 'warning');
  await handleKioskCheckIn(rollNo, `STUDENT_ID:${rollNo}`);
}
