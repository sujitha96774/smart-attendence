const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'attendance_db.json');

// Default initial seed data for demo/testing
const DEFAULT_DATA = {
  students: [
    { id: '1', rollNo: 'CS2101', name: 'Srihariharan R', department: 'Computer Science', email: 'srihariharan@univ.edu' },
    { id: '2', rollNo: 'CS2102', name: 'Priya Sharma', department: 'Computer Science', email: 'priya.s@univ.edu' },
    { id: '3', rollNo: 'CS2103', name: 'Rahul Verma', department: 'Information Technology', email: 'rahul.v@univ.edu' },
    { id: '4', rollNo: 'CS2104', name: 'Ananya Iyer', department: 'Computer Science', email: 'ananya.i@univ.edu' },
    { id: '5', rollNo: 'CS2105', name: 'Karthik Raja', department: 'Information Technology', email: 'karthik.r@univ.edu' },
    { id: '6', rollNo: 'CS2106', name: 'Sneha Patel', department: 'Electronics & Comm', email: 'sneha.p@univ.edu' },
    { id: '7', rollNo: 'CS2107', name: 'Mohammed Zaid', department: 'Computer Science', email: 'zaid.m@univ.edu' },
    { id: '8', rollNo: 'CS2108', name: 'Divya Nair', department: 'Artificial Intelligence', email: 'divya.n@univ.edu' }
  ],
  courses: [
    { id: 'c1', code: 'CS301', name: 'Web Technologies & Cloud', faculty: 'Dr. Ramesh Kumar', room: 'Lab 4' },
    { id: 'c2', code: 'CS302', name: 'Data Structures & Algorithms', faculty: 'Prof. Anitha Sundar', room: 'Hall 201' },
    { id: 'c3', code: 'CS303', name: 'Database Management Systems', faculty: 'Dr. Rajesh Sen', room: 'Lab 2' },
    { id: 'c4', code: 'CS304', name: 'Artificial Intelligence & ML', faculty: 'Prof. Meenakshi V', room: 'Seminar Hall' }
  ],
  sessions: [],
  attendance: []
};

// Ensure data directory and DB file exist
function initDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
  }
}

function readDb() {
  initDb();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading database, falling back to default:', err);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

function writeDb(data) {
  initDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Student operations
function getStudents() {
  return readDb().students;
}

function getStudentByRoll(rollNo) {
  if (!rollNo) return null;
  const db = readDb();
  return db.students.find(s => s.rollNo.trim().toUpperCase() === rollNo.trim().toUpperCase()) || null;
}

function addStudent({ rollNo, name, department, email }) {
  const db = readDb();
  const existing = db.students.find(s => s.rollNo.trim().toUpperCase() === rollNo.trim().toUpperCase());
  if (existing) {
    throw new Error(`Student with Roll No ${rollNo} already exists`);
  }
  const newStudent = {
    id: Date.now().toString(),
    rollNo: rollNo.trim().toUpperCase(),
    name: name.trim(),
    department: department ? department.trim() : 'General',
    email: email ? email.trim() : `${rollNo.toLowerCase()}@univ.edu`
  };
  db.students.push(newStudent);
  writeDb(db);
  return newStudent;
}

// Course operations
function getCourses() {
  return readDb().courses;
}

function getCourseById(id) {
  const db = readDb();
  return db.courses.find(c => c.id === id || c.code === id) || null;
}

function addCourse({ code, name, faculty, room }) {
  const db = readDb();
  const newCourse = {
    id: 'c_' + Date.now(),
    code: code.trim().toUpperCase(),
    name: name.trim(),
    faculty: faculty ? faculty.trim() : 'Faculty Member',
    room: room ? room.trim() : 'Room 101'
  };
  db.courses.push(newCourse);
  writeDb(db);
  return newCourse;
}

// Session operations
function getSessions() {
  return readDb().sessions;
}

function getSessionById(sessionId) {
  const db = readDb();
  return db.sessions.find(s => s.id === sessionId) || null;
}

function getActiveSession() {
  const db = readDb();
  return db.sessions.slice().reverse().find(s => s.active === true) || null;
}

function createSession({ courseId, durationMinutes = 45 }) {
  const db = readDb();
  // Close any previously active session
  db.sessions.forEach(s => {
    if (s.active) s.active = false;
  });

  const course = db.courses.find(c => c.id === courseId || c.code === courseId);
  if (!course) {
    throw new Error('Invalid course ID');
  }

  const now = new Date();
  const newSession = {
    id: 'sess_' + Date.now(),
    courseId: course.id,
    courseCode: course.code,
    courseName: course.name,
    faculty: course.faculty,
    room: course.room,
    date: now.toISOString().split('T')[0],
    startTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    createdAt: now.toISOString(),
    durationMinutes: Number(durationMinutes) || 45,
    active: true,
    secretKey: require('crypto').randomBytes(16).toString('hex')
  };

  db.sessions.push(newSession);
  writeDb(db);
  return newSession;
}

function endSession(sessionId) {
  const db = readDb();
  const session = db.sessions.find(s => s.id === sessionId);
  if (session) {
    session.active = false;
    session.endedAt = new Date().toISOString();
    writeDb(db);
  }
  return session;
}

// Attendance operations
function getAttendance(sessionId = null) {
  const db = readDb();
  if (sessionId) {
    return db.attendance.filter(a => a.sessionId === sessionId);
  }
  return db.attendance;
}

function markAttendance({ sessionId, rollNo, method = 'Dynamic QR' }) {
  const db = readDb();
  
  const session = db.sessions.find(s => s.id === sessionId);
  if (!session) {
    throw new Error('Attendance session not found');
  }
  if (!session.active) {
    throw new Error('This attendance session is now closed');
  }

  const student = db.students.find(s => s.rollNo.toUpperCase() === rollNo.trim().toUpperCase());
  if (!student) {
    throw new Error(`Student with Roll No "${rollNo}" is not registered in the system`);
  }

  // Prevent duplicate attendance for this session
  const existingRecord = db.attendance.find(
    a => a.sessionId === sessionId && a.studentRollNo.toUpperCase() === student.rollNo.toUpperCase()
  );
  if (existingRecord) {
    return {
      status: 'already_marked',
      message: `${student.name} (${student.rollNo}) is already marked Present at ${existingRecord.timeFormatted}`,
      record: existingRecord,
      student
    };
  }

  const now = new Date();
  const record = {
    id: 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    sessionId: session.id,
    courseCode: session.courseCode,
    courseName: session.courseName,
    studentRollNo: student.rollNo,
    studentName: student.name,
    department: student.department,
    timestamp: now.toISOString(),
    timeFormatted: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    date: session.date,
    status: 'Present',
    method: method // 'Dynamic QR' or 'ID Badge'
  };

  db.attendance.push(record);
  writeDb(db);

  return {
    status: 'success',
    message: `Attendance marked successfully for ${student.name}!`,
    record,
    student
  };
}

// Analytics and reporting data
function getAnalytics() {
  const db = readDb();
  const totalStudents = db.students.length;
  const totalCourses = db.courses.length;
  const totalSessions = db.sessions.length;
  const totalAttendanceRecords = db.attendance.length;

  const studentStats = db.students.map(s => {
    const attended = db.attendance.filter(a => a.studentRollNo.toUpperCase() === s.rollNo.toUpperCase()).length;
    const percentage = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 0;
    return {
      rollNo: s.rollNo,
      name: s.name,
      department: s.department,
      attended,
      totalSessions,
      percentage
    };
  });

  const courseStats = db.courses.map(c => {
    const sessions = db.sessions.filter(s => s.courseId === c.id || s.courseCode === c.code);
    const sessionIds = sessions.map(s => s.id);
    const totalAttendances = db.attendance.filter(a => sessionIds.includes(a.sessionId)).length;
    return {
      code: c.code,
      name: c.name,
      sessionsCount: sessions.length,
      totalAttendances
    };
  });

  return {
    totalStudents,
    totalCourses,
    totalSessions,
    totalAttendanceRecords,
    studentStats,
    courseStats
  };
}

module.exports = {
  getStudents,
  getStudentByRoll,
  addStudent,
  getCourses,
  getCourseById,
  addCourse,
  getSessions,
  getSessionById,
  getActiveSession,
  createSession,
  endSession,
  getAttendance,
  markAttendance,
  getAnalytics
};
