const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;


/* ================= FILE PATHS ================= */
const ATTENDANCE_LOG = path.join(__dirname, 'Attendance_Log.csv');
const ATTENDANCE_SESSION = path.join(__dirname, 'Attendance_Session.csv');
const STUDENTS_FILE = path.join(__dirname, 'Students.csv');
const STAFF_FILE = path.join(__dirname, 'Staff_Master.csv');
const TIMETABLE_FILE = path.join(__dirname, 'Time_Table.csv');

/* ================= HELPERS ================= */
function normalizeUID(v) {
  if (!v) return '';
  return v.toString().trim().replace(/\D/g, '').replace(/^0+/, '');
}

function clean(v) {
  return (v || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[-_ ]/g, '');
}

function timeToMinutes(t) {
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

/* ================= TIME (IST) ================= */
function getNowIST() {
  const d = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  );

  return {
    epoch: Math.floor(d.getTime() / 1000),
    date: d.toISOString().slice(0, 10),
    time: d.toTimeString().slice(0, 8),
    day: d.toLocaleString('en-US', { weekday: 'long' }),
    minutes: d.getHours() * 60 + d.getMinutes()
  };
}

/* ================= CSV LOADER ================= */
function loadCSV(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const headers = lines.shift().split(',').map(h => h.trim());

  return lines.map(line => {
    const obj = {};
    line.split(',').forEach((v, i) => {
      obj[headers[i]] = v.trim();
    });
    return obj;
  });
}

/* ================= FIND SESSION ================= */
function findSession(now) {
  if (!fs.existsSync(TIMETABLE_FILE)) return null;

  const lines = fs.readFileSync(TIMETABLE_FILE, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  lines.shift(); // header

  for (const line of lines) {
    const c = line.includes('\t') ? line.split('\t') : line.split(',');

    const day = clean(c[0]);
    const start = timeToMinutes(c[1]);
    const end = timeToMinutes(c[2]);

    if (
      day === clean(now.day) &&
      now.minutes >= start &&
      now.minutes <= end
    ) {
      return {
        session_type: clean(c[3]),
        class: clean(c[4]),
        batch: clean(c[5]),
        subject: c[6] || ''
      };
    }
  }
  return null;
}

/* ================= MAIN API ================= */
app.get('/log', (req, res) => {
  if (!req.query.card_no) return res.send('NO CARD');

  const uid = normalizeUID(req.query.card_no);
  const now = getNowIST();
  const session = findSession(now);

  if (!session) return res.send('NO SESSION');

  if (!['lecture', 'practical'].includes(session.session_type))
    return res.send('INVALID SESSION');

  const students = loadCSV(STUDENTS_FILE);
  const staff = loadCSV(STAFF_FILE);

  const student = students.find(s => normalizeUID(s.card_no) === uid);
  const staffM = staff.find(s =>
    normalizeUID(s.staff_card_no || s.card_no || s.uid) === uid
  );

  if (!student && !staffM) return res.send('UNKNOWN CARD');

  /* ===== STUDENT VALIDATION ===== */
  if (student) {
    if (clean(student.class) !== session.class)
      return res.send('STUDENT NOT IN THIS CLASS');

    if (
      session.batch !== 'all' &&
      clean(student.batch) !== session.batch
    )
      return res.send('STUDENT NOT IN THIS BATCH');
  }

  /* ===== STAFF VALIDATION ===== */
  // ✔ Staff exists + valid lecture/practical = PRESENT
  // No over-validation (data is unreliable)

  /* ===== CREATE SESSION CSV ===== */
  if (!fs.existsSync(ATTENDANCE_SESSION)) {
    fs.writeFileSync(
      ATTENDANCE_SESSION,
      'date,time,card_no,person_type,id,name,class,batch,subject,session_type\n'
    );
  }

  fs.appendFileSync(
    ATTENDANCE_SESSION,
    `${now.date},${now.time},${uid},` +
    `${student ? 'Student' : 'Staff'},` +
    `${student ? student.roll_no : staffM.staff_id},` +
    `${student ? student.student_name : staffM.staff_name},` +
    `${session.class},${session.batch},${session.subject},${session.session_type}\n`
  );

  fs.appendFileSync(
    ATTENDANCE_LOG,
    `${now.epoch},${uid}\n`
  );

  res.send('OK');
});

/* ================= START SERVER ================= */
app.listen(PORT, () => {
  console.log('Final timetable-aware server running on port 3000');
});
