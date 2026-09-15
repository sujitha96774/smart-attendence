const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const xlsx = require('xlsx');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Generate dynamic time-sliced token
// Refreshes every 10 seconds. Valid for current slice and previous slice (grace period).
const SLICE_DURATION_SEC = 10;

function getCurrentTimeSlice() {
  return Math.floor(Date.now() / (SLICE_DURATION_SEC * 1000));
}

function generateDynamicSignature(sessionId, timeSlice, secretKey) {
  const data = `${sessionId}:${timeSlice}`;
  return crypto.createHmac('sha256', secretKey).update(data).digest('hex').substring(0, 16);
}

function verifyDynamicToken(tokenString, session) {
  try {
    // Format: "SMART_ATTENDANCE:sessionId:timeSlice:sig"
    const parts = tokenString.split(':');
    if (parts.length !== 4 || parts[0] !== 'SMART_ATTENDANCE') {
      return { valid: false, reason: 'Invalid QR code format' };
    }

    const [prefix, tokenSessionId, sliceStr, signature] = parts;
    if (tokenSessionId !== session.id) {
      return { valid: false, reason: 'QR code belongs to a different session' };
    }

    const tokenSlice = parseInt(sliceStr, 10);
    const currentSlice = getCurrentTimeSlice();

    // Allow current slice or previous slice (up to 20 seconds total)
    if (tokenSlice !== currentSlice && tokenSlice !== (currentSlice - 1)) {
      return { valid: false, reason: 'QR code has expired! Please scan the live screen again.' };
    }

    // Verify cryptographic signature
    const expectedSig = generateDynamicSignature(session.id, tokenSlice, session.secretKey);
    if (signature !== expectedSig) {
      return { valid: false, reason: 'Tampered or invalid QR signature' };
    }

    return { valid: true, timeSlice: tokenSlice };
  } catch (err) {
    return { valid: false, reason: 'Malformed QR payload' };
  }
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// 1. Get active session or null
app.get('/api/session/active', (req, res) => {
  const session = db.getActiveSession();
  if (!session) {
    return res.json({ active: false, session: null });
  }
  const attendance = db.getAttendance(session.id);
  res.json({
    active: true,
    session,
    attendanceCount: attendance.length
  });
});

// 2. Create a new session
app.post('/api/session/create', (req, res) => {
  try {
    const { courseId, durationMinutes } = req.body;
    if (!courseId) {
      return res.status(400).json({ error: 'courseId is required' });
    }
    const session = db.createSession({ courseId, durationMinutes });
    res.json({ success: true, session });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. End session
app.post('/api/session/end', (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = db.endSession(sessionId);
    res.json({ success: true, session });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Generate dynamic QR code payload & image for active session
app.get('/api/session/dynamic-qr/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.getSessionById(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (!session.active) {
      return res.status(400).json({ error: 'Session is no longer active' });
    }

    const currentSlice = getCurrentTimeSlice();
    const signature = generateDynamicSignature(session.id, currentSlice, session.secretKey);
    const payload = `SMART_ATTENDANCE:${session.id}:${currentSlice}:${signature}`;

    // Time remaining until next slice (seconds)
    const elapsedMs = Date.now() % (SLICE_DURATION_SEC * 1000);
    const secondsRemaining = Math.max(1, Math.ceil((SLICE_DURATION_SEC * 1000 - elapsedMs) / 1000));

    // Generate high-resolution QR data URL
    const qrDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 380,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      }
    });

    res.json({
      payload,
      qrDataUrl,
      timeSlice: currentSlice,
      secondsRemaining,
      refreshIntervalSec: SLICE_DURATION_SEC
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Mark Attendance via Dynamic QR or ID Badge
app.post('/api/attendance/mark', (req, res) => {
  try {
    const { qrData, rollNo, method = 'Dynamic QR' } = req.body;

    if (!rollNo || !rollNo.trim()) {
      return res.status(400).json({ error: 'Roll number is required' });
    }

    // Check if there is an active session
    const activeSession = db.getActiveSession();
    if (!activeSession) {
      return res.status(400).json({ error: 'No active attendance session found at this moment' });
    }

    // Check student existence
    const student = db.getStudentByRoll(rollNo);
    if (!student) {
      return res.status(404).json({ error: `Student with Roll No "${rollNo}" is not registered.` });
    }

    // If verification method is Dynamic QR, validate the dynamic token
    if (method === 'Dynamic QR') {
      if (!qrData) {
        return res.status(400).json({ error: 'QR Code scan data is missing' });
      }
      const tokenCheck = verifyDynamicToken(qrData, activeSession);
      if (!tokenCheck.valid) {
        return res.status(400).json({ error: tokenCheck.reason });
      }
    } else if (method === 'Student ID Badge') {
      // In kiosk / student badge mode, qrData is "STUDENT_ID:rollNo"
      if (qrData && qrData.startsWith('STUDENT_ID:')) {
        const badgeRoll = qrData.split(':')[1];
        if (badgeRoll.toUpperCase() !== student.rollNo.toUpperCase()) {
          return res.status(400).json({ error: 'Badge QR does not match selected student' });
        }
      }
    }

    // Mark attendance in database
    const result = db.markAttendance({
      sessionId: activeSession.id,
      rollNo: student.rollNo,
      method
    });

    if (result.status === 'already_marked') {
      return res.status(200).json({
        success: true,
        alreadyMarked: true,
        message: result.message,
        student: result.student,
        record: result.record,
        session: activeSession
      });
    }

    res.json({
      success: true,
      alreadyMarked: false,
      message: result.message,
      student: result.student,
      record: result.record,
      session: activeSession
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Real-time Live Attendance List for an active session
app.get('/api/attendance/live/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const attendance = db.getAttendance(sessionId);
    const totalStudents = db.getStudents().length;
    res.json({
      session,
      attendance,
      count: attendance.length,
      totalStudents,
      percentage: totalStudents > 0 ? Math.round((attendance.length / totalStudents) * 100) : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Export Attendance to Excel (.xlsx) or CSV
app.get('/api/attendance/export/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const format = req.query.format || 'xlsx';
    const session = db.getSessionById(sessionId);
    if (!session) {
      return res.status(404).send('Session not found');
    }

    const attendanceRecords = db.getAttendance(sessionId);
    const allStudents = db.getStudents();

    // Map each registered student to their attendance status
    const exportData = allStudents.map((st, index) => {
      const match = attendanceRecords.find(a => a.studentRollNo.toUpperCase() === st.rollNo.toUpperCase());
      return {
        'S.No': index + 1,
        'Roll Number': st.rollNo,
        'Student Name': st.name,
        'Department': st.department,
        'Status': match ? 'PRESENT' : 'ABSENT',
        'Time In': match ? match.timeFormatted : '-',
        'Method': match ? match.method : '-',
        'Date': session.date,
        'Subject': session.courseName,
        'Course Code': session.courseCode
      };
    });

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Attendance');

    if (format === 'csv') {
      const csvData = xlsx.utils.sheet_to_csv(worksheet);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="Attendance_${session.courseCode}_${session.date}.csv"`);
      return res.send(csvData);
    }

    // Default: Excel .xlsx buffer
    const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Attendance_${session.courseCode}_${session.date}.xlsx"`);
    res.send(excelBuffer);
  } catch (err) {
    res.status(500).send('Error generating export: ' + err.message);
  }
});

// 8. Students CRUD & Badges
app.get('/api/students', (req, res) => {
  res.json(db.getStudents());
});

app.post('/api/students', (req, res) => {
  try {
    const { rollNo, name, department, email } = req.body;
    if (!rollNo || !name) {
      return res.status(400).json({ error: 'Roll No and Name are required' });
    }
    const student = db.addStudent({ rollNo, name, department, email });
    res.json({ success: true, student });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Student QR Badge Image generator
app.get('/api/students/badge-qr/:rollNo', async (req, res) => {
  try {
    const { rollNo } = req.params;
    const student = db.getStudentByRoll(rollNo);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const payload = `STUDENT_ID:${student.rollNo}:${student.name}`;
    const qrDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 260,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.json({ student, payload, qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Courses
app.get('/api/courses', (req, res) => {
  res.json(db.getCourses());
});

app.post('/api/courses', (req, res) => {
  try {
    const { code, name, faculty, room } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Course code and name are required' });
    }
    const course = db.addCourse({ code, name, faculty, room });
    res.json({ success: true, course });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 10. Overall Analytics
app.get('/api/analytics', (req, res) => {
  res.json(db.getAnalytics());
});

// Start server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Smart Attendance System running on port ${PORT}`);
  console.log(`👉 Access Web Portal: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
