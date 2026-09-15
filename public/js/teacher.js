// Teacher Dashboard Controller

let currentSessionId = null;
let pollTimer = null;
let courseChartInstance = null;
let studentChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadCourses();
  await refreshActiveSession();
  await loadAnalytics();
  await loadStudents();

  // Event Listeners
  document.getElementById('btnStartSession').addEventListener('click', startSession);
  document.getElementById('btnEndSession').addEventListener('click', endSession);
  document.getElementById('btnExportExcel').addEventListener('click', () => exportAttendance('xlsx'));
  document.getElementById('btnExportCsv').addEventListener('click', () => exportAttendance('csv'));

  // Modal listeners
  const modal = document.getElementById('addStudentModal');
  document.getElementById('btnOpenAddStudent').addEventListener('click', () => {
    modal.style.display = 'flex';
  });
  document.getElementById('btnCloseAddStudent').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  document.getElementById('btnCancelAddStudent').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  document.getElementById('addStudentForm').addEventListener('submit', handleAddStudent);
});

// Load Courses into Select dropdown
async function loadCourses() {
  try {
    const courses = await apiFetch('/api/courses');
    const select = document.getElementById('courseSelect');
    select.innerHTML = '';
    courses.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.code} - ${c.name} (${c.room})`;
      select.appendChild(opt);
    });
    document.getElementById('statTotalCourses').textContent = courses.length;
  } catch (err) {
    showToast('Failed to load courses: ' + err.message, 'error');
  }
}

// Refresh Active Session state
async function refreshActiveSession() {
  try {
    const data = await apiFetch('/api/session/active');
    const noSessionView = document.getElementById('noActiveSessionView');
    const activeSessionView = document.getElementById('activeSessionView');
    const badge = document.getElementById('sessionBadge');
    const statActive = document.getElementById('statActiveSession');

    if (data.active && data.session) {
      currentSessionId = data.session.id;
      noSessionView.style.display = 'none';
      activeSessionView.style.display = 'block';

      badge.className = 'badge badge-success';
      badge.textContent = 'Active Session';
      statActive.textContent = data.session.courseCode;
      statActive.style.color = '#34d399';

      document.getElementById('activeCourseTitle').textContent = `${data.session.courseCode}: ${data.session.courseName}`;
      document.getElementById('activeFacultyRoom').textContent = `Faculty: ${data.session.faculty} | Location: ${data.session.room}`;
      document.getElementById('activeStartTime').textContent = `Started: ${data.session.startTime} (Duration: ${data.session.durationMinutes} mins)`;

      // Start live polling for attendance
      loadLiveAttendance();
      if (!pollTimer) {
        pollTimer = setInterval(loadLiveAttendance, 2500);
      }
    } else {
      currentSessionId = null;
      noSessionView.style.display = 'block';
      activeSessionView.style.display = 'none';

      badge.className = 'badge badge-warning';
      badge.textContent = 'Inactive';
      statActive.textContent = 'None';
      statActive.style.color = '#94a3b8';

      document.getElementById('statPresentCount').textContent = '0';
      document.getElementById('liveAttendanceCount').textContent = '0 Marked';
      document.getElementById('liveAttendanceTableBody').innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            No active session. Start a session above to begin capturing attendance.
          </td>
        </tr>
      `;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }
  } catch (err) {
    console.error('Error checking active session:', err);
  }
}

// Start Session
async function startSession() {
  try {
    const courseId = document.getElementById('courseSelect').value;
    const durationMinutes = document.getElementById('durationInput').value;

    if (!courseId) {
      return showToast('Please select a course', 'warning');
    }

    const res = await apiFetch('/api/session/create', {
      method: 'POST',
      body: JSON.stringify({ courseId, durationMinutes })
    });

    if (res.success) {
      SoundFX.playSuccess();
      showToast('Attendance session started successfully!', 'success');
      await refreshActiveSession();
      await loadAnalytics();
    }
  } catch (err) {
    SoundFX.playError();
    showToast(err.message, 'error');
  }
}

// End Session
async function endSession() {
  if (!currentSessionId) return;
  if (!confirm('Are you sure you want to end this attendance session?')) return;

  try {
    const res = await apiFetch('/api/session/end', {
      method: 'POST',
      body: JSON.stringify({ sessionId: currentSessionId })
    });

    if (res.success) {
      showToast('Attendance session ended.', 'info');
      await refreshActiveSession();
      await loadAnalytics();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Load Live Attendance table
async function loadLiveAttendance() {
  if (!currentSessionId) return;

  try {
    const data = await apiFetch(`/api/attendance/live/${currentSessionId}`);
    const tbody = document.getElementById('liveAttendanceTableBody');
    const records = data.attendance || [];

    document.getElementById('statPresentCount').textContent = records.length;
    document.getElementById('liveAttendanceCount').textContent = `${records.length} Marked`;

    if (records.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            Awaiting scans... Have students scan the live QR code!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = records.slice().reverse().map(rec => `
      <tr>
        <td><strong>${rec.studentRollNo}</strong></td>
        <td>${rec.studentName}</td>
        <td><span style="color: var(--text-muted);">${rec.department}</span></td>
        <td><span class="badge badge-info">${rec.timeFormatted}</span></td>
        <td><span style="font-size: 0.82rem; color: #a5b4fc;">${rec.method}</span></td>
        <td><span class="badge badge-success"><i class="fa-solid fa-check"></i> Present</span></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error fetching live attendance:', err);
  }
}

// Export attendance spreadsheet
function exportAttendance(format) {
  if (!currentSessionId) {
    return showToast('No active or selected session to export', 'warning');
  }
  window.open(`/api/attendance/export/${currentSessionId}?format=${format}`, '_blank');
}

// Load Students list
async function loadStudents() {
  try {
    const students = await apiFetch('/api/students');
    const analytics = await apiFetch('/api/analytics');
    const tbody = document.getElementById('studentRosterTableBody');

    document.getElementById('statTotalStudents').textContent = students.length;

    tbody.innerHTML = students.map(st => {
      const stat = analytics.studentStats.find(s => s.rollNo === st.rollNo);
      const pct = stat ? stat.percentage : 0;
      const pctColor = pct >= 75 ? '#34d399' : (pct >= 50 ? '#fbbf24' : '#f87171');

      return `
        <tr>
          <td><strong>${st.rollNo}</strong></td>
          <td>${st.name}</td>
          <td>${st.department}</td>
          <td style="color: var(--text-muted); font-size: 0.85rem;">${st.email}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div style="flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 999px; overflow: hidden; max-width: 80px;">
                <div style="width: ${pct}%; height: 100%; background: ${pctColor}; border-radius: 999px;"></div>
              </div>
              <span style="font-weight: 700; font-size: 0.85rem; color: ${pctColor};">${pct}%</span>
            </div>
          </td>
          <td>
            <a href="badges.html#${st.rollNo}" class="btn btn-outline btn-sm" title="View QR Badge">
              <i class="fa-solid fa-qrcode"></i> Badge
            </a>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading students:', err);
  }
}

// Add student form submit
async function handleAddStudent(e) {
  e.preventDefault();
  const rollNo = document.getElementById('newRollNo').value;
  const name = document.getElementById('newName').value;
  const department = document.getElementById('newDept').value;
  const email = document.getElementById('newEmail').value;

  try {
    const res = await apiFetch('/api/students', {
      method: 'POST',
      body: JSON.stringify({ rollNo, name, department, email })
    });

    if (res.success) {
      showToast(`Student ${res.student.name} registered!`, 'success');
      document.getElementById('addStudentModal').style.display = 'none';
      document.getElementById('addStudentForm').reset();
      await loadStudents();
      await loadAnalytics();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Load and render Analytics charts
async function loadAnalytics() {
  try {
    const data = await apiFetch('/api/analytics');

    // Chart 1: Course-wise Turnout
    const courseCtx = document.getElementById('courseChart').getContext('2d');
    const courseLabels = data.courseStats.map(c => c.code);
    const courseValues = data.courseStats.map(c => c.totalAttendances);

    if (courseChartInstance) {
      courseChartInstance.destroy();
    }

    courseChartInstance = new Chart(courseCtx, {
      type: 'doughnut',
      data: {
        labels: courseLabels,
        datasets: [{
          data: courseValues.length > 0 && courseValues.some(v => v > 0) ? courseValues : [1, 1, 1, 1],
          backgroundColor: ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b'],
          borderColor: '#1e293b',
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8' } }
        }
      }
    });

    // Chart 2: Student Attendance %
    const studentCtx = document.getElementById('studentChart').getContext('2d');
    const studentLabels = data.studentStats.map(s => s.rollNo);
    const studentPcts = data.studentStats.map(s => s.percentage);

    if (studentChartInstance) {
      studentChartInstance.destroy();
    }

    studentChartInstance = new Chart(studentCtx, {
      type: 'bar',
      data: {
        labels: studentLabels,
        datasets: [{
          label: 'Attendance %',
          data: studentPcts,
          backgroundColor: studentPcts.map(p => p >= 75 ? '#10b981' : (p >= 50 ? '#f59e0b' : '#ef4444')),
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          },
          x: {
            ticks: { color: '#94a3b8' },
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });

  } catch (err) {
    console.error('Error loading analytics:', err);
  }
}
