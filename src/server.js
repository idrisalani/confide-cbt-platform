/**
 * Confide CBT Platform - Express Server with Brevo Email Notifications
 * Features: Authentication, Assessments, Dashboard, PDFs, Email to Instructor
 * ✅ INSTRUCTOR EMAIL: Sends certificate + report via Brevo when student completes all 3 courses
 * Version: Production Ready with Brevo (300 emails/day - SIMPLEST SETUP!)
 */

import express from 'express';
import session from 'express-session';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import fetch from 'node-fetch';
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
const DATABASE_PATH = process.env.DATABASE_PATH || './data/cbt_platform.db';

// ✅ Configure Brevo (super simple!)
const BREVO_API_KEY = process.env.BREVO_API_KEY;

if (BREVO_API_KEY) {
  console.log('✅ Brevo configured successfully');
  console.log(`📧 Instructor email: ${INSTRUCTOR_EMAIL}`);
} else {
  console.log('⚠️ BREVO_API_KEY not set - emails will not send');
}

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
        score INTEGER NOT NULL,
        correct_answers INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        time_remaining INTEGER,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `, (err) => {
      if (err) console.error('Assessments table error:', err);
      else console.log('✅ Assessments table ready');
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF GENERATION FUNCTIONS (Certificate & Performance Report)
// ═══════════════════════════════════════════════════════════════════════════

function generateCertificatePDF(studentName, assessments) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4',
        layout: 'landscape',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });
      
      let buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      const pageWidth = 842;
      const pageHeight = 595;
      const centerX = pageWidth / 2;

      // DECORATIVE BORDER (gold)
      doc.lineWidth(6)
         .strokeColor('#f39c12')
         .rect(25, 25, pageWidth - 50, pageHeight - 50)
         .stroke();

      // INNER BORDER (subtle)
      doc.lineWidth(1)
         .strokeColor('#daa520')
         .rect(35, 35, pageWidth - 70, pageHeight - 70)
         .stroke();

      // ORNAMENTAL TOP
      doc.fontSize(14).fillColor('#f39c12').font('Helvetica')
         .text('* * *', centerX - 30, 60, { width: 60, align: 'center' });

      // CERTIFICATE TITLE
      doc.fontSize(40).fillColor('#667eea').font('Helvetica-Bold')
         .text('Certificate of Completion', centerX - 280, 100, { 
           width: 560, 
           align: 'center' 
         });

      // SUBTITLE
      doc.fontSize(11).fillColor('#666666').font('Helvetica')
         .text('CONFIDE COMPUTER ACADEMY', centerX - 180, 150, { 
           width: 360, 
           align: 'center' 
         });

      // DECORATIVE LINE
      doc.moveTo(centerX - 100, 170).lineTo(centerX + 100, 170)
         .strokeColor('#f39c12').lineWidth(2).stroke();

      // CERTIFICATE BODY
      doc.fontSize(14).fillColor('#666666').font('Helvetica')
         .text('This is to certify that', centerX - 150, 195, { 
           width: 300, 
           align: 'center' 
         });

      // STUDENT NAME (large, prominent)
      doc.fontSize(34).fillColor('#667eea').font('Helvetica-Bold')
         .text(studentName, centerX - 300, 225, { 
           width: 600, 
           align: 'center' 
         });

      // ACCOMPLISHMENT TEXT
      doc.fontSize(14).fillColor('#666666').font('Helvetica')
         .text('has successfully completed the', centerX - 200, 270, { 
           width: 400, 
           align: 'center' 
         });

      doc.fontSize(16).fillColor('#1a1a1a').font('Helvetica-Bold')
         .text('Confide Computer Academy', centerX - 200, 293, { 
           width: 400, 
           align: 'center' 
         });

      doc.fontSize(16).fillColor('#764ba2').font('Helvetica-Bold')
         .text('Web Development Program', centerX - 200, 315, { 
           width: 400, 
           align: 'center' 
         });

      doc.fontSize(13).fillColor('#666666').font('Helvetica')
         .text('Comprising HTML, CSS, and JavaScript Courses', centerX - 200, 340, { 
           width: 400, 
           align: 'center' 
         });

      // STATISTICS BOX
      const boxY = 370;
      const boxHeight = 60;
      
      doc.roundedRect(centerX - 280, boxY, 560, boxHeight, 5)
         .fillAndStroke('#f7f9fc', '#667eea');

      // Calculate stats
      const avgScore = Math.round(assessments.reduce((sum, a) => sum + a.score, 0) / assessments.length);
      const totalCorrect = assessments.reduce((sum, a) => sum + a.correct_answers, 0);
      const totalQuestions = assessments.reduce((sum, a) => sum + a.total_questions, 0);
      const completionDate = new Date().toLocaleDateString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric'
      });

      // Stat 1: Overall Score
      doc.fontSize(26).fillColor('#667eea').font('Helvetica-Bold')
         .text(`${avgScore}%`, centerX - 230, boxY + 10, { width: 140, align: 'center' });
      doc.fontSize(9).fillColor('#666666').font('Helvetica')
         .text('OVERALL SCORE', centerX - 230, boxY + 42, { width: 140, align: 'center' });

      // Vertical separator
      doc.moveTo(centerX - 70, boxY + 10).lineTo(centerX - 70, boxY + 50)
         .strokeColor('#e0e0e0').lineWidth(1).stroke();

      // Stat 2: Correct Answers
      doc.fontSize(26).fillColor('#667eea').font('Helvetica-Bold')
         .text(`${totalCorrect}/${totalQuestions}`, centerX - 70, boxY + 10, { width: 140, align: 'center' });
      doc.fontSize(9).fillColor('#666666').font('Helvetica')
         .text('CORRECT ANSWERS', centerX - 70, boxY + 42, { width: 140, align: 'center' });

      // Vertical separator
      doc.moveTo(centerX + 90, boxY + 10).lineTo(centerX + 90, boxY + 50)
         .strokeColor('#e0e0e0').lineWidth(1).stroke();

      // Stat 3: Date Issued
      doc.fontSize(22).fillColor('#667eea').font('Helvetica-Bold')
         .text(completionDate, centerX + 90, boxY + 13, { width: 140, align: 'center' });
      doc.fontSize(9).fillColor('#666666').font('Helvetica')
         .text('DATE ISSUED', centerX + 90, boxY + 42, { width: 140, align: 'center' });

      // SIGNATURES
      const footerY = 470;
      const fullDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      // Left Signature Block
      const signaturePath = path.join(__dirname, '../user-data/uploads/eSignature-27012026.png');
      if (fs.existsSync(signaturePath)) {
        try {
          doc.image(signaturePath, 105, footerY - 40, {
            width: 110,
            height: 35,
            align: 'center'
          });
        } catch (err) {
          console.log('Could not load signature image:', err);
        }
      }
      
      doc.moveTo(90, footerY).lineTo(230, footerY)
         .strokeColor('#667eea').lineWidth(1.5).stroke();
      doc.fontSize(12).fillColor('#667eea').font('Helvetica-Bold')
         .text('Idris Alamutu', 90, footerY + 8, { width: 140, align: 'center' });
      doc.fontSize(9).fillColor('#666666').font('Helvetica')
         .text('Founder & Director', 90, footerY + 24, { width: 140, align: 'center' });

      // Center Date Block
      doc.fontSize(11).fillColor('#666666').font('Helvetica')
         .text('Issued on', centerX - 70, footerY - 5, { width: 140, align: 'center' });
      doc.fontSize(10).fillColor('#1a1a1a').font('Helvetica-Bold')
         .text(fullDate, centerX - 70, footerY + 10, { width: 140, align: 'center' });

      // Right Signature Block with Academy Seal
      const sealPath = path.join(__dirname, '../user-data/uploads/academy-seal.png');
      if (fs.existsSync(sealPath)) {
        try {
          doc.image(sealPath, pageWidth - 205, footerY - 90, {
            width: 90,
            height: 90,
            align: 'center'
          });
        } catch (err) {
          console.log('Could not load academy seal image:', err);
        }
      }
      
      doc.moveTo(pageWidth - 230, footerY).lineTo(pageWidth - 90, footerY)
         .strokeColor('#667eea').lineWidth(1.5).stroke();
      doc.fontSize(12).fillColor('#667eea').font('Helvetica-Bold')
         .text('Academy Seal', pageWidth - 230, footerY + 8, { width: 140, align: 'center' });
      doc.fontSize(9).fillColor('#666666').font('Helvetica')
         .text('Confide Academy', pageWidth - 230, footerY + 24, { width: 140, align: 'center' });

      // Footer URL
      doc.fontSize(7).fillColor('#999999').font('Helvetica')
         .text('confide-cbt-platform.onrender.com', centerX - 100, footerY + 60, { 
           width: 200, 
           align: 'center' 
         });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function generateReportPDF(studentName, studentEmail, assessments) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4',
        layout: 'portrait',
        margins: { top: 35, bottom: 35, left: 40, right: 40 }
      });
      
      let buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      const pageWidth = 515;
      const startX = 40;
      let y = 40;

      // HEADER
      doc.fontSize(26).fillColor('#667eea').font('Helvetica-Bold')
         .text('Performance Report', startX, y, { width: pageWidth, align: 'center' });
      
      y += 32;
      doc.fontSize(10).fillColor('#999999').font('Helvetica')
         .text('Confide Computer Academy', startX, y, { width: pageWidth, align: 'center' });
      
      y += 22;
      doc.moveTo(startX, y).lineTo(startX + pageWidth, y).strokeColor('#667eea').lineWidth(2).stroke();
      y += 18;

      const avgScore = Math.round(assessments.reduce((sum, a) => sum + a.score, 0) / assessments.length);
      const totalCorrect = assessments.reduce((sum, a) => sum + a.correct_answers, 0);
      const totalQuestions = assessments.reduce((sum, a) => sum + a.total_questions, 0);
      const passRate = ((totalCorrect / totalQuestions) * 100).toFixed(1);
      const reportDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      const col1Width = (pageWidth - 15) / 2;
      const col2X = startX + col1Width + 15;

      doc.roundedRect(startX, y, col1Width, 28, 3)
         .fillAndStroke('#f7f9fc', '#667eea');
      doc.fontSize(8).fillColor('#667eea').font('Helvetica-Bold')
         .text('STUDENT NAME', startX + 10, y + 5, { width: col1Width - 20 });
      doc.fontSize(11).fillColor('#1a1a1a').font('Helvetica')
         .text(studentName, startX + 10, y + 16, { width: col1Width - 20 });

      doc.roundedRect(col2X, y, col1Width, 28, 3)
         .fillAndStroke('#f7f9fc', '#667eea');
      doc.fontSize(8).fillColor('#667eea').font('Helvetica-Bold')
         .text('EMAIL ADDRESS', col2X + 10, y + 5, { width: col1Width - 20 });
      doc.fontSize(10).fillColor('#1a1a1a').font('Helvetica')
         .text(studentEmail, col2X + 10, y + 16, { width: col1Width - 20 });

      y += 33;

      doc.roundedRect(startX, y, pageWidth, 22, 3)
         .fillAndStroke('#f7f9fc', '#667eea');
      doc.fontSize(8).fillColor('#667eea').font('Helvetica-Bold')
         .text('REPORT DATE', startX + 10, y + 4, { width: pageWidth - 20 });
      doc.fontSize(10).fillColor('#1a1a1a').font('Helvetica')
         .text(reportDate, startX + 10, y + 14, { width: pageWidth - 20 });

      y += 30;

      const statBoxWidth = (pageWidth - 15) / 2;
      const statBoxHeight = 38;

      doc.roundedRect(startX, y, statBoxWidth, statBoxHeight, 4)
         .fillAndStroke('#667eea', '#667eea');
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
         .text(`${avgScore}%`, startX + 10, y + 7, { width: statBoxWidth - 20, align: 'center' });
      doc.fontSize(8).fillColor('#ffffff').font('Helvetica')
         .text('OVERALL SCORE', startX + 10, y + 27, { width: statBoxWidth - 20, align: 'center' });

      doc.roundedRect(col2X, y, statBoxWidth, statBoxHeight, 4)
         .fillAndStroke('#764ba2', '#764ba2');
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
         .text(`${totalCorrect}/${totalQuestions}`, col2X + 10, y + 7, { width: statBoxWidth - 20, align: 'center' });
      doc.fontSize(8).fillColor('#ffffff').font('Helvetica')
         .text('CORRECT ANSWERS', col2X + 10, y + 27, { width: statBoxWidth - 20, align: 'center' });

      y += statBoxHeight + 5;

      doc.roundedRect(startX, y, statBoxWidth, statBoxHeight, 4)
         .fillAndStroke('#667eea', '#667eea');
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
         .text(`${totalQuestions}`, startX + 10, y + 7, { width: statBoxWidth - 20, align: 'center' });
      doc.fontSize(8).fillColor('#ffffff').font('Helvetica')
         .text('TOTAL QUESTIONS', startX + 10, y + 27, { width: statBoxWidth - 20, align: 'center' });

      doc.roundedRect(col2X, y, statBoxWidth, statBoxHeight, 4)
         .fillAndStroke('#764ba2', '#764ba2');
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
         .text(`${passRate}%`, col2X + 10, y + 7, { width: statBoxWidth - 20, align: 'center' });
      doc.fontSize(8).fillColor('#ffffff').font('Helvetica')
         .text('PASS RATE', col2X + 10, y + 27, { width: statBoxWidth - 20, align: 'center' });

      y += statBoxHeight + 20;

      doc.fontSize(11).fillColor('#667eea').font('Helvetica-Bold')
         .text('COURSE RESULTS', startX, y, { width: pageWidth });
      
      y += 18;

      const courseNames = { 'html': 'HTML', 'css': 'CSS', 'javascript': 'JavaScript' };
      const courseColors = { 'html': '#FFB84D', 'css': '#4A90E2', 'javascript': '#A4D965' };
      
      const courseBoxWidth = (pageWidth - 30) / 3;
      
      assessments.forEach((assessment, index) => {
        const courseName = courseNames[assessment.course] || assessment.course.toUpperCase();
        const courseColor = courseColors[assessment.course] || '#667eea';
        const accuracy = ((assessment.correct_answers / assessment.total_questions) * 100).toFixed(1);
        const status = assessment.score >= 60 ? 'PASSED' : 'FAILED';
        
        const courseX = startX + (index * (courseBoxWidth + 15));
        const courseBoxHeight = 62;
        
        doc.roundedRect(courseX, y, courseBoxWidth, courseBoxHeight, 4)
           .fillAndStroke('#f7f9fc', courseColor);
        
        doc.fontSize(10).fillColor(courseColor).font('Helvetica-Bold')
           .text(courseName, courseX + 8, y + 7, { width: courseBoxWidth - 16 });
        
        doc.fontSize(15).fillColor('#1a1a1a').font('Helvetica-Bold')
           .text(`${assessment.score}%`, courseX + 8, y + 22, { width: courseBoxWidth - 16 });
        
        doc.fontSize(8).fillColor('#666666').font('Helvetica')
           .text(`${accuracy}% Accuracy`, courseX + 8, y + 41, { width: courseBoxWidth - 16 });
        
        const statusColor = assessment.score >= 60 ? '#28a745' : '#dc3545';
        doc.fontSize(7).fillColor(statusColor).font('Helvetica-Bold')
           .text(status, courseX + 8, y + 52, { width: courseBoxWidth - 16 });
      });

      y += 80;

      let congratsMessage = '';
      let congratsColor = '#28a745';
      let congratsBgColor = '#d4edda';
      
      if (avgScore >= 85) {
        congratsMessage = `CONGRATULATIONS - EXCELLENT PERFORMANCE!\n\nYour outstanding achievement demonstrates exceptional mastery of Web Development fundamentals. Your ${avgScore}% overall score places you among the top performers. This level of excellence shows both dedication and natural aptitude for programming.\n\nWe encourage you to pursue advanced training in Backend Web Development to complement your frontend skills. Our Backend course covers server-side technologies, databases, and APIs - essential skills for full-stack development.`;
      } else if (avgScore >= 75) {
        congratsMessage = `CONGRATULATIONS - GOOD PERFORMANCE!\n\nYour solid performance shows strong understanding of Web Development concepts. A ${avgScore}% overall score demonstrates you have built a good foundation in HTML, CSS, and JavaScript.\n\nConsider advancing to our Backend Web Development course to expand your skill set. Learning server-side programming will make you a more versatile developer and open up more career opportunities.`;
        congratsColor = '#667eea';
        congratsBgColor = '#e8f0fe';
      } else if (avgScore >= 60) {
        congratsMessage = `CONGRATULATIONS - YOU PASSED!\n\nYou have demonstrated competency in Web Development fundamentals with a ${avgScore}% overall score. This is a solid start to your programming journey. Keep practicing and revisit challenging topics to strengthen your skills.\n\nYou can still consider to pursue our Backend Web Development course when you're ready to expand your capabilities. Building on this foundation with backend skills will enhance your career prospects.`;
        congratsColor = '#f39c12';
        congratsBgColor = '#fff8e1';
      }

      if (congratsMessage) {
        const boxHeight = 90;
        doc.roundedRect(startX, y, pageWidth, boxHeight, 5)
           .fillAndStroke(congratsBgColor, congratsColor);
        
        doc.fontSize(9).fillColor(congratsColor).font('Helvetica')
           .text(congratsMessage, startX + 15, y + 10, { 
             width: pageWidth - 30,
             lineGap: 3
           });
        
        y += boxHeight + 15;
      }

      doc.fontSize(8).fillColor('#999999').font('Helvetica')
         .text('This report was generated by Confide Computer Academy CBT Platform', 
               startX, y, { width: pageWidth, align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
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
// ASSESSMENT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.get('/assessment-session', (req, res) => {
  if (!req.session.user_id) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../frontend/assessment-session.html'));
});

app.get('/assessment/:course', (req, res) => {
  if (!req.session.user_id) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../frontend/assessment.html'));
});

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

// ✅ SAVE TO DATABASE AND CHECK FOR COMPLETION → TRIGGER BREVO EMAIL
app.post('/api/submit-assessment/:course', (req, res) => {
  console.log('📝 SUBMIT RECEIVED FOR:', req.params.course);
  
  if (!req.session.user_id) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userId = req.session.user_id;
  const course = req.params.course;
  const { score, correct, total, time_remaining } = req.body;

  console.log(`💾 SAVING: user=${userId}, course=${course}, score=${score}`);

  db.run(
    'INSERT INTO assessments (user_id, course, score, correct_answers, total_questions, time_remaining) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, course, score, correct, total, time_remaining],
    function(err) {
      if (err) {
        console.error('❌ DATABASE ERROR:', err);
        return res.status(500).json({ error: 'Save failed' });
      }
      
      console.log('✅ SAVED SUCCESSFULLY!');
      
      db.all(
        'SELECT course, score, correct_answers, total_questions FROM assessments WHERE user_id = ? ORDER BY id DESC',
        [userId],
        (err, assessments) => {
          if (err) {
            console.error('❌ Error checking completion:', err);
            return res.json({
              success: true,
              redirect: `/results?course=${course}&score=${score}&correct=${correct}&total=${total}&passed=${score >= 60}`
            });
          }

          const uniqueCourses = [...new Set(assessments.map(a => a.course))];
          
          console.log(`📊 Student has completed ${uniqueCourses.length}/3 unique courses:`, uniqueCourses);
          
          // ✅ If all 3 courses complete, send instructor email via Brevo
          if (uniqueCourses.length === 3 && uniqueCourses.includes('html') && uniqueCourses.includes('css') && uniqueCourses.includes('javascript')) {
            console.log('🎉 ALL 3 COURSES COMPLETE! Sending email via Brevo...');
            
            if (!BREVO_API_KEY) {
              console.error('❌ BREVO_API_KEY not configured!');
              console.error('   Set BREVO_API_KEY in environment variables');
            } else {
              db.get('SELECT full_name, email FROM users WHERE id = ?', [userId], async (err, user) => {
                if (err || !user) {
                  console.error('❌ Error getting user info:', err);
                } else {
                  console.log(`📧 Preparing to email instructor about: ${user.full_name} (${user.email})`);
                  
                  try {
                    const latestAssessments = {};
                    assessments.forEach(a => {
                      if (!latestAssessments[a.course]) {
                        latestAssessments[a.course] = a;
                      }
                    });
                    
                    const assessmentArray = Object.values(latestAssessments);
                    console.log('📊 Assessment data:', assessmentArray);
                    
                    console.log('📄 Generating certificate PDF...');
                    const certificatePDF = await generateCertificatePDF(user.full_name, assessmentArray);
                    
                    console.log('📄 Generating performance report PDF...');
                    const reportPDF = await generateReportPDF(user.full_name, user.email, assessmentArray);
                    
                    const avgScore = Math.round(assessmentArray.reduce((sum, a) => sum + a.score, 0) / assessmentArray.length);
                    const totalCorrect = assessmentArray.reduce((sum, a) => sum + a.correct_answers, 0);
                    const totalQuestions = assessmentArray.reduce((sum, a) => sum + a.total_questions, 0);
                    const completionDate = new Date().toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric'
                    });
                    
                    const emailHtml = `
                      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px;">
                        <div style="border-bottom: 3px solid #667eea; padding-bottom: 20px; margin-bottom: 20px;">
                          <h1 style="color: #667eea; margin: 0;">🎓 Student Assessment Completed</h1>
                          <p style="color: #999; margin: 5px 0 0 0;">Confide Computer Academy CBT Platform</p>
                        </div>
                        
                        <div style="margin-bottom: 25px;">
                          <h2 style="color: #333; font-size: 16px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">📋 Student Information</h2>
                          <p style="margin: 8px 0;"><strong style="color: #667eea;">Name:</strong> ${user.full_name}</p>
                          <p style="margin: 8px 0;"><strong style="color: #667eea;">Email:</strong> ${user.email}</p>
                          <p style="margin: 8px 0;"><strong style="color: #667eea;">Completion Date:</strong> ${completionDate}</p>
                        </div>
                        
                        <div style="margin-bottom: 25px;">
                          <h2 style="color: #333; font-size: 16px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">📊 Performance Summary</h2>
                          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 15px;">
                            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 8px; text-align: center;">
                              <div style="font-size: 24px; font-weight: bold;">${avgScore}%</div>
                              <div style="font-size: 12px; opacity: 0.9;">Overall Score</div>
                            </div>
                            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 8px; text-align: center;">
                              <div style="font-size: 24px; font-weight: bold;">${totalCorrect}/${totalQuestions}</div>
                              <div style="font-size: 12px; opacity: 0.9;">Correct Answers</div>
                            </div>
                          </div>
                        </div>
                        
                        <div style="margin-bottom: 25px;">
                          <h2 style="color: #333; font-size: 16px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">📚 Course Results</h2>
                          ${assessmentArray.map(a => {
                            const courseName = a.course.charAt(0).toUpperCase() + a.course.slice(1);
                            const status = a.score >= 60 ? '<span style="color: #28a745; font-weight: bold;">✓ PASSED</span>' : '<span style="color: #dc3545; font-weight: bold;">✗ FAILED</span>';
                            const accuracy = ((a.correct_answers / a.total_questions) * 100).toFixed(1);
                            return `
                              <div style="background: #f9f9f9; padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid #667eea;">
                                <div style="font-weight: 600; color: #333;">${courseName} - ${a.score}% ${status}</div>
                                <div style="font-size: 12px; color: #666; margin-top: 5px;">
                                  Correct Answers: ${a.correct_answers}/${a.total_questions} (${accuracy}% Accuracy)
                                </div>
                              </div>
                            `;
                          }).join('')}
                        </div>
                        
                        <div style="margin-bottom: 25px;">
                          <h2 style="color: #333; font-size: 16px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">📎 Attachments</h2>
                          <p style="color: #333; font-size: 13px;">Two PDF documents are attached to this email:</p>
                          <ul style="font-size: 13px; color: #666;">
                            <li><strong>Certificate.pdf</strong> - Official completion certificate</li>
                            <li><strong>Performance-Report.pdf</strong> - Detailed performance analysis</li>
                          </ul>
                        </div>
                        
                        <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #f0f0f0; padding-top: 15px;">
                          <p style="margin: 5px 0;">This is an automated notification from the Confide Computer Academy CBT Platform.</p>
                          <p style="margin: 5px 0;">confide-cbt-platform.onrender.com</p>
                        </div>
                      </div>
                    `;
                    
                    console.log(`📧 Sending to instructor: ${INSTRUCTOR_EMAIL}`);
                    
                    // ✅ Send via Brevo (super simple!)
                    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                      method: 'POST',
                      headers: {
                        'accept': 'application/json',
                        'api-key': BREVO_API_KEY,
                        'content-type': 'application/json'
                      },
                      body: JSON.stringify({
                        sender: {
                          name: 'Confide Computer Academy',
                          email: INSTRUCTOR_EMAIL  // ✅ Use verified email from environment variable
                        },
                        to: [
                          {
                            email: INSTRUCTOR_EMAIL,
                            name: 'Instructor'
                          }
                        ],
                        subject: `🎓 Student Assessment Complete - ${user.full_name}`,
                        htmlContent: emailHtml,
                        attachment: [
                          {
                            content: certificatePDF.toString('base64'),
                            name: `certificate-${user.full_name.replace(/\s+/g, '_')}.pdf`
                          },
                          {
                            content: reportPDF.toString('base64'),
                            name: `performance-report-${user.full_name.replace(/\s+/g, '_')}.pdf`
                          }
                        ]
                      })
                    });
                    
                    const brevoData = await brevoResponse.json();
                    
                    if (brevoResponse.ok) {
                      console.log('✅✅✅ EMAIL SENT VIA BREVO! ✅✅✅');
                      console.log(`📧 Sent to: ${INSTRUCTOR_EMAIL}`);
                      console.log('📎 Attachments: certificate.pdf, performance-report.pdf');
                      console.log('📬 Brevo Message ID:', brevoData.messageId);
                      console.log('🔍 Check delivery status at: https://app.brevo.com/statistics/email');
                      console.log('💡 If email not received: Check spam folder or verify sender email');
                    } else {
                      console.error('❌ Brevo API error:', brevoData);
                      console.error('🔧 Common fixes:');
                      console.error('   1. Verify sender email at: https://app.brevo.com/senders');
                      console.error('   2. Check API key is valid');
                      console.error('   3. Ensure account is activated');
                    }
                    
                  } catch (error) {
                    console.error('❌ Email failed:', error.message);
                  }
                }
              });
            }
          } else {
            console.log('ℹ️ Not all courses complete yet. Waiting for more assessments.');
          }
          
          res.json({
            success: true,
            redirect: `/results?course=${course}&score=${score}&correct=${correct}&total=${total}&passed=${score >= 60}`
          });
        }
      );
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

app.get('/completion', (req, res) => {
  if (!req.session.user_id) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../frontend/completion.html'));
});

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
║  🌐 LIVE DEMO: https://confide-cbt-platform.onrender.com                ║
║                                                                          ║
║  📚 FEATURES:                                                            ║
║     • Sequential Assessment System (HTML → CSS → JavaScript)             ║
║     • Professional Results Page with Progress Tracking                   ║
║     • Assessment Session with Real-time Data from Database               ║
║     • Dashboard with Assessment History & Scores                         ║
║     • Professional Completion Page with Certificate & Report             ║
║     • ✅ BREVO EMAIL TO INSTRUCTOR ON COMPLETION ✨                     ║
║     • Session Management & User Authentication                           ║
║     • SQLite Database with Automatic Table Creation                      ║
║                                                                          ║
║  📧 EMAIL NOTIFICATION SYSTEM (Brevo):                                  ║
║     Instructor Email: ${INSTRUCTOR_EMAIL}                                ║
║     Status: ${BREVO_API_KEY ? '✅ CONFIGURED' : '⚠️ NOT CONFIGURED'}      ║
║     Trigger: When student completes all 3 courses                        ║
║     Includes: Certificate PDF + Performance Report PDF                   ║
║     Free Tier: 300 emails/day - SIMPLEST SETUP!                         ║
║                                                                          ║
║  🚀 READY FOR SALES:                                                    ║
║     1. Share live demo: https://confide-cbt-platform.onrender.com       ║
║     2. Prospects can register & test immediately                         ║
║     3. Complete all 3 assessments                                        ║
║     4. Instructor receives email with PDFs via Brevo!                    ║
║                                                                          ║
║  📊 DATABASE: ${DATABASE_PATH}                                          ║
║  🔐 SESSION_SECRET: ${SESSION_SECRET.substring(0, 10)}***               ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
  `);
});

export default app;