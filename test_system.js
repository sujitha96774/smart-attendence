// Automated system test for Smart QR Attendance System
const http = require('http');
const db = require('./db');

async function runTests() {
  console.log('🧪 Starting Automated System Tests...\n');

  // Test 1: Verify Students in DB
  console.log('1. Checking Students...');
  const students = db.getStudents();
  if (students.length < 5) throw new Error('Expected at least 5 default students');
  console.log(`   ✅ Found ${students.length} pre-seeded students (e.g. ${students[0].name})`);

  // Test 2: Verify Courses in DB
  console.log('2. Checking Courses...');
  const courses = db.getCourses();
  if (courses.length < 2) throw new Error('Expected at least 2 courses');
  console.log(`   ✅ Found ${courses.length} courses (e.g. ${courses[0].code}: ${courses[0].name})`);

  // Test 3: Create Active Session
  console.log('3. Testing Session Creation...');
  const session = db.createSession({ courseId: courses[0].id, durationMinutes: 60 });
  if (!session || !session.active) throw new Error('Failed to create active session');
  console.log(`   ✅ Created Session ${session.id} for course ${session.courseCode}`);

  // Test 4: Mark Attendance
  console.log('4. Testing Attendance Marking...');
  const student = students[0];
  const markResult = db.markAttendance({
    sessionId: session.id,
    rollNo: student.rollNo,
    method: 'Dynamic QR'
  });
  if (markResult.status !== 'success') throw new Error('Failed to mark attendance');
  console.log(`   ✅ Marked ${student.name} as Present at ${markResult.record.timeFormatted}`);

  // Test 5: Prevent Duplicate Attendance
  console.log('5. Testing Duplicate Attendance Prevention...');
  const dupResult = db.markAttendance({
    sessionId: session.id,
    rollNo: student.rollNo,
    method: 'Dynamic QR'
  });
  if (dupResult.status !== 'already_marked') throw new Error('Duplicate check failed, should be already_marked');
  console.log(`   ✅ Successfully detected duplicate: "${dupResult.message}"`);

  // Test 6: Mark Second Student via ID Badge
  console.log('6. Testing Kiosk / ID Badge Attendance...');
  const student2 = students[1];
  const badgeResult = db.markAttendance({
    sessionId: session.id,
    rollNo: student2.rollNo,
    method: 'Student ID Badge'
  });
  if (badgeResult.status !== 'success') throw new Error('Failed to mark badge attendance');
  console.log(`   ✅ Marked ${student2.name} via Student ID Badge`);

  // Test 7: Verify Session Attendance Records
  console.log('7. Verifying Session Records Count...');
  const sessionRecords = db.getAttendance(session.id);
  if (sessionRecords.length !== 2) throw new Error(`Expected 2 records, got ${sessionRecords.length}`);
  console.log(`   ✅ Session contains exactly ${sessionRecords.length} recorded attendances`);

  // Test 8: Analytics Verification
  console.log('8. Testing Analytics Calculations...');
  const analytics = db.getAnalytics();
  if (analytics.totalAttendanceRecords < 2) throw new Error('Analytics attendance count mismatch');
  console.log(`   ✅ Analytics summary: Total Students=${analytics.totalStudents}, Total Sessions=${analytics.totalSessions}, Records=${analytics.totalAttendanceRecords}`);

  // Test 9: End Session
  console.log('9. Testing Session Termination...');
  const ended = db.endSession(session.id);
  if (ended.active !== false) throw new Error('Failed to end session');
  console.log(`   ✅ Session ${session.id} successfully closed`);

  console.log('\n=============================================');
  console.log('🎉 ALL 9 SYSTEM TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('=============================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
