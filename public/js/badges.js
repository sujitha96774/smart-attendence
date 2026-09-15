// Student ID Badges Controller

document.addEventListener('DOMContentLoaded', async () => {
  await loadBadges();
});

async function loadBadges() {
  const container = document.getElementById('badgesContainer');

  try {
    const students = await apiFetch('/api/students');

    if (students.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 3rem; grid-column: 1 / -1;">
          No students registered yet. Add students from the Faculty Dashboard.
        </div>
      `;
      return;
    }

    // Fetch badges in parallel
    const badgePromises = students.map(st => 
      apiFetch(`/api/students/badge-qr/${st.rollNo}`).catch(err => ({
        student: st,
        qrDataUrl: ''
      }))
    );

    const badgeData = await Promise.all(badgePromises);

    container.innerHTML = badgeData.map(({ student, qrDataUrl }) => {
      const initials = student.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

      return `
        <div class="id-card" id="${student.rollNo}">
          <div class="id-card-header">
            <h4>University Institute of Technology</h4>
            <span>Smart Campus Digital Identity Card</span>
          </div>

          <div class="id-card-body">
            <div class="student-avatar">${initials}</div>
            
            <h3 style="color: #fff; font-size: 1.2rem; margin-bottom: 2px;">${student.name}</h3>
            <div style="color: #818cf8; font-weight: 700; font-size: 1rem; margin-bottom: 2px;">${student.rollNo}</div>
            <div style="color: var(--text-muted); font-size: 0.85rem;">${student.department}</div>

            <div class="id-qr-box">
              <img src="${qrDataUrl}" alt="Student QR Badge">
            </div>

            <div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 0.75rem;">
              Present this code at classroom entrance
            </div>

            <div class="no-print" style="display: flex; gap: 0.5rem; width: 100%;">
              <a href="${qrDataUrl}" download="ID_Badge_${student.rollNo}.png" class="btn btn-outline btn-sm" style="flex: 1;">
                <i class="fa-solid fa-download"></i> Save QR
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Check if URL has hash to scroll to specific student
    if (window.location.hash) {
      const el = document.querySelector(window.location.hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        el.style.borderColor = '#10b981';
        el.style.boxShadow = '0 0 25px rgba(16, 185, 129, 0.5)';
      }
    }

  } catch (err) {
    console.error('Error loading badges:', err);
    container.innerHTML = `
      <div style="color: #f87171; text-align: center; grid-column: 1 / -1; padding: 2rem;">
        Failed to load student badges: ${err.message}
      </div>
    `;
  }
}
