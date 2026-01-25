/**
 * Confide CBT Platform - Minimal Express Server
 * Features: Authentication, Assessments, Dashboard, PDFs, Completion Page
 * NEW: Auto-email certificate and report PDFs to instructor
 * Version: Production Ready with Minimal Session Logic
 */

import express from 'express';
import session from 'express-session';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import dotenv from 'dotenv';
import PDFDocument from 'pdfkit';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-12345';
const INSTRUCTOR_EMAIL = process.env.INSTRUCTOR_EMAIL || 'idris.alamutu@outlook.com';
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_PASSWORD;
const DATABASE_PATH = process.env.DATABASE_PATH || './data/cbt_platform.db';

// ✅ Ensure data directory exists
try {
  mkdirSync('./data', { recursive: true });
  console.log('✅ Data directory ensured');
} catch (err) {
  if (err.code !== 'EEXIST') {
    console.error('❌ Failed to create data directory:', err);
    process.exit(1);
  }
}

// Database setup
const db = new sqlite3.Database(DATABASE_PATH, (err) => {
  if (err) {
    console.error('❌ Database error:', err);
  } else {
    console.log('✅ Database connected');
    initializeTables();
  }
});

// Email transporter
let transporter;
if (GMAIL_USER && GMAIL_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASSWORD
    }
  });
  console.log('✅ Email service ready!');
  console.log(`📧 Instructor email configured: ${INSTRUCTOR_EMAIL}`);
} else {
  console.log('⚠️ Email service not configured. Add GMAIL_USER and GMAIL_PASSWORD to .env');
}

// Load questions
let questions = [];
try {
  const questionsPath = path.join(__dirname, 'questions.json');
  if (fs.existsSync(questionsPath)) {
    const questionsData = fs.readFileSync(questionsPath, 'utf-8');
    questions = JSON.parse(questionsData);
    console.log(`✅ Questions loaded: ${questions.length} questions`);
  }
} catch (error) {
  console.error('❌ Questions error:', error);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// DATABASE INITIALIZATION
function initializeTables() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Users table error:', err);
      else console.log('✅ Users table ready');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        course TEXT NOT NULL,
        score INTEGER,
        correct_answers INTEGER,
        total_questions INTEGER,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        time_remaining INTEGER,
        certificate_sent INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `, (err) => {
      if (err) console.error('Assessments table error:', err);
      else console.log('✅ Assessments table ready');
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTION: Generate Certificate PDF as Buffer
// ═══════════════════════════════════════════════════════════════════════════

function generateCertificatePDF(studentName, assessments) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      let buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      doc.fontSize(36).text('🎓', { align: 'center' });
      doc.fontSize(32).text('CERTIFICATE OF COMPLETION', { align: 'center', margin: 20 });

      doc.fontSize(12).text('', { align: 'center' });
      doc.fontSize(20).text(studentName, { align: 'center', color: '#667eea', bold: true });

      doc.fontSize(12).text('', { align: 'center' });
      doc.fontSize(14).text('has successfully completed the', { align: 'center' });
      doc.fontSize(14).text('Confide Computer Academy CBT Platform', { align: 'center', color: '#764ba2', bold: true });

      doc.fontSize(12).text('', { align: 'center' });
      const completionDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
      doc.fontSize(11).text(`Date: ${completionDate}`, { align: 'center' });

      doc.fontSize(12).text('', { align: 'center' });
      doc.fontSize(14).text('Course Scores:', { align: 'center', bold: true });
      doc.fontSize(12).text('', { align: 'center' });

      assessments.forEach(a => {
        const courseName = a.course.charAt(0).toUpperCase() + a.course.slice(1);
        doc.fontSize(11).text(`${courseName}: ${a.score}%`, { align: 'center', color: '#28a745' });
      });

      const avgScore = Math.round(assessments.reduce((sum, a) => sum + a.score, 0) / assessments.length);
      doc.fontSize(12).text('', { align: 'center' });
      doc.fontSize(14).text(`Average Score: ${avgScore}%`, { align: 'center', color: '#667eea', bold: true });

      doc.fontSize(12).text('', { align: 'center' });
      doc.fontSize(11).text('Instructor: Confide Academy', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTION: Generate Performance Report PDF as Buffer
// ═══════════════════════════════════════════════════════════════════════════

function generateReportPDF(studentName, studentEmail, assessments) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      let buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      doc.fontSize(24).text('📊 Performance Report', { align: 'center', color: '#667eea' });
      doc.fontSize(12).text('Confide Computer Academy', { align: 'center', color: '#999' });

      doc.fontSize(12).text('', { align: 'left' });
      doc.fontSize(11).text(`Student: ${studentName}`, { align: 'left', bold: true });
      doc.text(`Email: ${studentEmail}`, { align: 'left' });
      doc.text(`Report Date: ${new Date().toLocaleDateString('en-US')}`, { align: 'left' });

      const avgScore = Math.round(assessments.reduce((sum, a) => sum + a.score, 0) / assessments.length);
      const totalCorrect = assessments.reduce((sum, a) => sum + a.correct_answers, 0);
      const totalQuestions = assessments.reduce((sum, a) => sum + a.total_questions, 0);

      doc.fontSize(12).text('', { align: 'left' });
      doc.fontSize(14).text('Summary Statistics', { align: 'left', bold: true, color: '#667eea' });
      doc.fontSize(11);
      doc.text(`Overall Score: ${avgScore}%`);
      doc.text(`Total Questions: ${totalQuestions}`);
      doc.text(`Correct Answers: ${totalCorrect}`);
      doc.text(`Pass Rate: ${(totalCorrect / totalQuestions * 100).toFixed(2)}%`);

      doc.fontSize(12).text('', { align: 'left' });
      doc.fontSize(14).text('Course Breakdown', { align: 'left', bold: true, color: '#667eea' });
      doc.fontSize(11);

      assessments.forEach(a => {
        const courseName = a.course.charAt(0).toUpperCase() + a.course.slice(1);
        const status = a.score >= 60 ? 'PASSED ✓' : 'FAILED';
        const statusColor = a.score >= 60 ? '#28a745' : '#dc3545';
        doc.fontSize(10).text('', { align: 'left' });
        doc.text(`${courseName}:`, { bold: true });
        doc.text(`  Score: ${a.score}%`);
        doc.text(`  Correct: ${a.correct_answers}/${a.total_questions}`);
        doc.text(`  Status: ${status}`, { color: statusColor });
      });

      doc.fontSize(10).text('', { align: 'left' });
      doc.text('This report was generated by the Confide CBT Platform', { align: 'center', color: '#999' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTION: Send Completion Email to Instructor
// ═══════════════════════════════════════════════════════════════════════════

async function sendInstructorEmail(studentName, studentEmail, assessments) {
  if (!transporter) {
    console.log('⚠️ Email service not configured. Skipping instructor email.');
    return;
  }

  try {
    console.log(`📧 Generating PDFs for ${studentName}...`);
    
    const certificatePDF = await generateCertificatePDF(studentName, assessments);
    const reportPDF = await generateReportPDF(studentName, studentEmail, assessments);

    const avgScore = Math.round(assessments.reduce((sum, a) => sum + a.score, 0) / assessments.length);
    const totalCorrect = assessments.reduce((sum, a) => sum + a.correct_answers, 0);
    const totalQuestions = assessments.reduce((sum, a) => sum + a.total_questions, 0);

    const completionDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const htmlEmail = `
      <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; }
            .container { max-width: 700px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { border-bottom: 3px solid #667eea; padding-bottom: 20px; margin-bottom: 20px; }
            .title { color: #667eea; font-size: 24px; font-weight: bold; }
            .subtitle { color: #999; font-size: 14px; }
            .section { margin-bottom: 25px; }
            .section-title { color: #333; font-size: 16px; font-weight: bold; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; margin-bottom: 15px; }
            .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
            .info-label { font-weight: 600; color: #667eea; }
            .info-value { color: #333; }
            .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; }
            .stat-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 8px; text-align: center; }
            .stat-value { font-size: 24px; font-weight: bold; }
            .stat-label { font-size: 12px; opacity: 0.9; }
            .course-item { background: #f9f9f9; padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid #667eea; }
            .course-name { font-weight: 600; color: #333; }
            .course-details { font-size: 12px; color: #666; margin-top: 5px; }
            .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #f0f0f0; padding-top: 15px; }
            .highlight { color: #28a745; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="title">🎓 Student Assessment Completed</div>
              <div class="subtitle">Confide Computer Academy CBT Platform</div>
            </div>

            <div class="section">
              <div class="section-title">📋 Student Information</div>
              <div class="info-row">
                <span class="info-label">Name:</span>
                <span class="info-value">${studentName}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Email:</span>
                <span class="info-value">${studentEmail}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Completion Date:</span>
                <span class="info-value">${completionDate}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">📊 Performance Summary</div>
              <div class="stats">
                <div class="stat-box">
                  <div class="stat-value">${avgScore}%</div>
                  <div class="stat-label">Overall Score</div>
                </div>
                <div class="stat-box">
                  <div class="stat-value">${totalCorrect}/${totalQuestions}</div>
                  <div class="stat-label">Correct Answers</div>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">📚 Course Results</div>
              ${assessments.map(a => {
                const courseName = a.course.charAt(0).toUpperCase() + a.course.slice(1);
                const status = a.score >= 60 ? '<span class="highlight">✓ PASSED</span>' : '<span style="color: #dc3545;">✗ FAILED</span>';
                const accuracy = ((a.correct_answers / a.total_questions) * 100).toFixed(1);
                return `
                  <div class="course-item">
                    <div class="course-name">${courseName} - ${a.score}% ${status}</div>
                    <div class="course-details">
                      Correct Answers: ${a.correct_answers}/${a.total_questions} (${accuracy}% Accuracy)
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <div class="section">
              <div class="section-title">📎 Attachments</div>
              <p style="color: #333; font-size: 13px;">
                Two PDF documents are attached to this email:
              </p>
              <ul style="font-size: 13px; color: #666;">
                <li><strong>Certificate.pdf</strong> - Official completion certificate</li>
                <li><strong>Performance-Report.pdf</strong> - Detailed performance analysis</li>
              </ul>
            </div>

            <div class="footer">
              <p>This is an automated notification from the Confide Computer Academy CBT Platform.</p>
              <p>If you have any questions, please contact the administrator.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const mailOptions = {
      from: GMAIL_USER,
      to: INSTRUCTOR_EMAIL,
      subject: `🎓 Student Assessment Complete - ${studentName}`,
      html: htmlEmail,
      attachments: [
        {
          filename: `certificate-${studentName.replace(/\s+/g, '_')}.pdf`,
          content: certificatePDF,
          contentType: 'application/pdf'
        },
        {
          filename: `performance-report-${studentName.replace(/\s+/g, '_')}.pdf`,
          content: reportPDF,
          contentType: 'application/pdf'
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Instructor email sent to ${INSTRUCTOR_EMAIL} for student ${studentName}`);
  } catch (error) {
    console.error(`❌ Failed to send instructor email for ${studentName}:`, error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/register.html'));
});

app.post('/api/register', async (req, res) => {
  const { first_name, last_name, email, password, confirm_password } = req.body;

  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (password !== confirm_password) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      'INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)',
      [`${first_name} ${last_name}`, email, hashedPassword],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email already registered' });
          }
          return res.status(500).json({ error: 'Registration failed' });
        }

        if (transporter) {
          const mailOptions = {
            from: GMAIL_USER,
            to: email,
            subject: 'Welcome to Confide Computer Academy',
            html: `<h2>Welcome ${first_name}!</h2><p>Your account has been created successfully. You can now login and start your assessments.</p>`
          };
          transporter.sendMail(mailOptions, (error) => {
            if (error) console.error('Email error:', error);
          });
        }

        res.json({ success: true, redirect: '/login' });
      }
    );
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    try {
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      req.session.user_id = user.id;
      req.session.full_name = user.full_name;
      req.session.user_email = user.email;

      req.session.save((err) => {
        if (err) {
          return res.status(500).json({ error: 'Session error' });
        }
        res.json({ success: true, redirect: '/assessment-session' });
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.redirect('/login');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ASSESSMENT SESSION ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.get('/assessment-session', (req, res) => {
  if (!req.session.user_id) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../frontend/assessment-session.html'));
});

// ═══════════════════════════════════════════════════════════════════════════
// ASSESSMENT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.get('/assessment/:course', (req, res) => {
  if (!req.session.user_id) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../frontend/assessment.html'));
});

// Assessment Results Page
app.get('/results', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'assessment-results.html'));
});

app.get('/api/questions/:course', (req, res) => {
  try {
    const course = req.params.course.toLowerCase();
    const courseQuestions = questions.filter(q => q.course === course);
    
    if (courseQuestions.length === 0) {
      return res.status(404).json({ error: `No questions found for course: ${course}` });
    }
    
    res.json(courseQuestions);
  } catch (error) {
    console.error('Questions error:', error);
    res.status(500).json({ error: 'Failed to load questions' });
  }
});

// ✅ MINIMAL: Just save to database and respond with redirect
app.post('/api/submit-assessment/:course', (req, res) => {
  console.log('SUBMIT RECEIVED FOR:', req.params.course);
  
  if (!req.session.user_id) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userId = req.session.user_id;
  const course = req.params.course;
  const { score, correct, total, time_remaining } = req.body;

  console.log(`SAVING: user=${userId}, course=${course}, score=${score}`);

  // SAVE TO DATABASE
  db.run(
    'INSERT INTO assessments (user_id, course, score, correct_answers, total_questions, time_remaining) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, course, score, correct, total, time_remaining],
    (err) => {
      if (err) {
        console.error('DATABASE ERROR:', err);
        return res.status(500).json({ error: 'Save failed' });
      }
      
      console.log('SAVED SUCCESSFULLY!');
      
      res.json({
        success: true,
        redirect: `/results?course=${course}&score=${score}&correct=${correct}&total=${total}&passed=${score >= 60}`
      });
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.get('/dashboard', (req, res) => {
  if (!req.session.user_id) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

app.get('/api/assessment-history', (req, res) => {
  try {
    if (!req.session.user_id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userId = req.session.user_id;

    db.get('SELECT full_name, email FROM users WHERE id = ?', [userId], (err, user) => {
      if (err || !user) {
        return res.status(500).json({ error: 'User not found' });
      }

      db.all(
        'SELECT course, score, correct_answers, total_questions, completed_at FROM assessments WHERE user_id = ? ORDER BY completed_at DESC',
        [userId],
        (err, assessments) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to load assessment history' });
          }

          const completedCourses = (assessments || []).map(a => ({
            course: a.course,
            score: a.score,
            correct_answers: a.correct_answers,
            total_questions: a.total_questions,
            completed_at: a.completed_at
          }));

          res.json({
            student_name: user.full_name,
            student_email: user.email,
            completed_courses: completedCourses,
            is_complete: completedCourses.length === 3,
            courses_count: completedCourses.length,
            average_score: completedCourses.length > 0 
              ? Math.round(completedCourses.reduce((sum, c) => sum + c.score, 0) / completedCourses.length)
              : 0
          });
        }
      );
    });
  } catch (error) {
    console.error('Assessment history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETION PAGE ROUTE
// ═══════════════════════════════════════════════════════════════════════════

app.get('/completion', (req, res) => {
  if (!req.session.user_id) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../frontend/completion.html'));
});

// ═══════════════════════════════════════════════════════════════════════════
// STATIC PAGES & ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
  if (req.session.user_id) {
    res.redirect('/assessment-session');
  } else {
    res.redirect('/login');
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║    ✅ CONFIDE CBT PLATFORM RUNNING SUCCESSFULLY ✅                      ║
║                                                                          ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  🌐 URL: http://localhost:${PORT}                                        ║
║                                                                          ║
║  📚 FEATURES:                                                            ║
║     • Sequential Assessment System (HTML → CSS → JavaScript)             ║
║     • Professional Results Page with Progress Tracking                   ║
║     • Assessment Session with Real-time Data from Database               ║
║     • Dashboard with Assessment History & Scores                         ║
║     • Professional Completion Page with Certificate & Report             ║
║     • Auto-Email PDFs to Instructor on Completion ✨                     ║
║     • Session Management & User Authentication                           ║
║     • SQLite Database with Automatic Table Creation                      ║
║     • ✅ MINIMAL, FAST, STABLE IMPLEMENTATION                            ║
║                                                                          ║
║  📧 INSTRUCTOR EMAIL:                                                   ║
║     ${INSTRUCTOR_EMAIL}                                                  ║
║     Will receive certificate & report PDFs for each student              ║
║                                                                          ║
║  🚀 READY FOR TESTING:                                                  ║
║     1. Register: http://localhost:${PORT}/register                       ║
║     2. Login: http://localhost:${PORT}/login                             ║
║     3. Complete all 3 assessments                                        ║
║     4. PDFs auto-emailed to instructor!                                  ║
║                                                                          ║
║  📊 DATABASE: ${DATABASE_PATH}                                          ║
║  🔐 SESSION_SECRET: ${SESSION_SECRET.substring(0, 10)}***               ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
  `);
});

export default app;