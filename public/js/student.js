// Student Scanner Controller

let html5QrScanner = null;
let activeSessionData = null;
let isScanning = false;
let isProcessing = false;

document.addEventListener('DOMContentLoaded', async () => {
  await loadStudents();
  await checkActiveSession();

  // Tabs
  const tabCamera = document.getElementById('tabCamera');
  const tabManual = document.getElementById('tabManual');
  const cameraView = document.getElementById('cameraView');
  const manualView = document.getElementById('manualView');

  tabCamera.addEventListener('click', () => {
    tabCamera.classList.add('active');
    tabManual.classList.remove('active');
    cameraView.style.display = 'block';
    manualView.style.display = 'none';
  });

  tabManual.addEventListener('click', () => {
    tabManual.classList.add('active');
    tabCamera.classList.remove('active');
    manualView.style.display = 'block';
    cameraView.style.display = 'none';
    stopCamera();
  });

  // Buttons
  document.getElementById('btnStartCamera').addEventListener('click', startCamera);
  document.getElementById('btnStopCamera').addEventListener('click', stopCamera);
  document.getElementById('btnSubmitManual').addEventListener('click', submitManualToken);
  document.getElementById('btnSimulateScan').addEventListener('click', simulateActiveScan);
});

// Load students dropdown
async function loadStudents() {
  try {
    const students = await apiFetch('/api/students');
    const select = document.getElementById('studentSelect');
    students.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.rollNo;
      opt.textContent = `${s.rollNo} - ${s.name} (${s.department})`;
      select.appendChild(opt);
    });

    // Default select first student for fast demo
    if (students.length > 0) {
      select.value = students[0].rollNo;
    }
  } catch (err) {
    console.error('Error loading students:', err);
  }
}

// Check session
async function checkActiveSession() {
  try {
    const data = await apiFetch('/api/session/active');
    const indicator = document.getElementById('sessionIndicator');
    if (data.active && data.session) {
      activeSessionData = data.session;
      indicator.className = 'badge badge-success';
      indicator.textContent = `${data.session.courseCode} Live`;
    } else {
      activeSessionData = null;
      indicator.className = 'badge badge-warning';
      indicator.textContent = 'No Active Session';
    }
  } catch (err) {
    console.error('Error checking active session:', err);
  }
}

// Start HTML5 Camera QR Scanner
async function startCamera() {
  const rollNo = document.getElementById('studentSelect').value;
  if (!rollNo) {
    return showToast('Please select your Student Roll Number first!', 'warning');
  }

  const btnStart = document.getElementById('btnStartCamera');
  const btnStop = document.getElementById('btnStopCamera');

  try {
    if (!html5QrScanner) {
      html5QrScanner = new Html5Qrcode('reader');
    }

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0
    };

    await html5QrScanner.start(
      { facingMode: 'environment' }, // Prefer rear camera on mobile
      config,
      onScanSuccess,
      onScanFailure
    );

    isScanning = true;
    btnStart.style.display = 'none';
    btnStop.style.display = 'inline-flex';
    showToast('Camera active! Point at the classroom projector screen.', 'info');
  } catch (err) {
    console.error('Camera start error:', err);
    showToast('Could not access camera: ' + err, 'error');
  }
}

// Stop Camera
async function stopCamera() {
  if (html5QrScanner && isScanning) {
    try {
      await html5QrScanner.stop();
      isScanning = false;
      document.getElementById('btnStartCamera').style.display = 'inline-flex';
      document.getElementById('btnStopCamera').style.display = 'none';
    } catch (e) {
      console.warn('Error stopping camera:', e);
    }
  }
}

// When QR code is detected
async function onScanSuccess(decodedText, decodedResult) {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const rollNo = document.getElementById('studentSelect').value;
    await processAttendanceMarking(decodedText, rollNo, 'Dynamic QR');
  } finally {
    // Cooldown 3 seconds before next scan
    setTimeout(() => {
      isProcessing = false;
    }, 3000);
  }
}

function onScanFailure(error) {
  // Silent frame-level non-detects
}

// Process Attendance submission
async function processAttendanceMarking(qrData, rollNo, method) {
  const statusPanel = document.getElementById('statusPanel');
  const statusIcon = document.getElementById('statusIcon');
  const statusTitle = document.getElementById('statusTitle');
  const statusDesc = document.getElementById('statusDesc');
  const statusDetails = document.getElementById('statusDetails');

  try {
    const res = await apiFetch('/api/attendance/mark', {
      method: 'POST',
      body: JSON.stringify({ qrData, rollNo, method })
    });

    SoundFX.playSuccess();
    statusPanel.className = 'status-panel success';
    statusPanel.style.display = 'block';

    if (res.alreadyMarked) {
      statusIcon.textContent = 'ℹ️';
      statusTitle.textContent = 'Already Marked Present!';
      statusTitle.style.color = '#38bdf8';
    } else {
      statusIcon.textContent = '🎉';
      statusTitle.textContent = 'Attendance Verified & Marked!';
      statusTitle.style.color = '#34d399';
    }

    statusDesc.textContent = res.message;
    statusDetails.innerHTML = `
      <div><strong>Student:</strong> ${res.student.name} (${res.student.rollNo})</div>
      <div><strong>Course:</strong> ${res.session.courseCode} - ${res.session.courseName}</div>
      <div><strong>Time Recorded:</strong> ${res.record.timeFormatted} (${res.record.date})</div>
      <div><strong>Verification:</strong> <span class="badge badge-success">${res.record.method}</span></div>
    `;

    showToast(`Present: ${res.student.name}!`, 'success');

  } catch (err) {
    SoundFX.playError();
    statusPanel.className = 'status-panel error';
    statusPanel.style.display = 'block';
    statusIcon.textContent = '❌';
    statusTitle.textContent = 'Verification Failed';
    statusTitle.style.color = '#f87171';
    statusDesc.textContent = err.message;
    statusDetails.innerHTML = `
      <div style="color: #fca5a5;">Please make sure to scan the live rotating code from the classroom projector before it expires.</div>
    `;
    showToast(err.message, 'error');
  }
}

// Manual token submit
async function submitManualToken() {
  const token = document.getElementById('manualQrInput').value.trim();
  const rollNo = document.getElementById('studentSelect').value;
  if (!rollNo) return showToast('Please select your Student Roll Number', 'warning');
  if (!token) return showToast('Please enter QR token string', 'warning');

  await processAttendanceMarking(token, rollNo, 'Dynamic QR');
}

// 1-Click Simulation: Fetches current active QR token directly and submits
async function simulateActiveScan() {
  const rollNo = document.getElementById('studentSelect').value;
  if (!rollNo) return showToast('Please select your Student Roll Number', 'warning');

  try {
    const sessionRes = await apiFetch('/api/session/active');
    if (!sessionRes.active || !sessionRes.session) {
      return showToast('No active session currently open in Faculty dashboard!', 'warning');
    }

    const qrRes = await apiFetch(`/api/session/dynamic-qr/${sessionRes.session.id}`);
    document.getElementById('manualQrInput').value = qrRes.payload;
    showToast('Simulating live scanner capture...', 'info');

    await processAttendanceMarking(qrRes.payload, rollNo, 'Dynamic QR');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
