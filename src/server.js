/**
 * Confide CBT Platform - Express Server with Email Notifications
 * Features: Authentication, Assessments, Dashboard, PDFs, Email to Instructor
 * ✅ INSTRUCTOR EMAIL: Sends certificate + report when student completes all 3 courses
 * Version: Production Ready with Email Trigger
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
// HELPER FUNCTION: Generate Certificate PDF as Buffer (LANDSCAPE - SINGLE PAGE)
// Professional design WITHOUT emojis (PDFKit doesn't support them)
// ═══════════════════════════════════════════════════════════════════════════

function generateCertificatePDF(studentName, assessments) {
  return new Promise((resolve, reject) => {
    try {
      // LANDSCAPE LAYOUT - A4 = 842 x 595 points
      const doc = new PDFDocument({ 
        size: 'A4',
        layout: 'landscape',
        margins: { top: 40, bottom: 40, left: 50, right: 50 }
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

      // STATISTICS BOX (professional)
      const boxY = 370;
      const boxHeight = 60;
      
      // Background with gradient effect (using rectangles)
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

      // SPACE BEFORE SIGNATURES (60 points of space)
      const footerY = 470;
      const fullDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      // Left Signature Block
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

      // Right Signature Block
      doc.moveTo(pageWidth - 230, footerY).lineTo(pageWidth - 90, footerY)
         .strokeColor('#667eea').lineWidth(1.5).stroke();
      doc.fontSize(12).fillColor('#667eea').font('Helvetica-Bold')
         .text('Academy Seal', pageWidth - 230, footerY + 8, { width: 140, align: 'center' });
      doc.fontSize(9).fillColor('#666666').font('Helvetica')
         .text('Confide Academy', pageWidth - 230, footerY + 24, { width: 140, align: 'center' });

      // Footer URL (small)
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

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTION: Generate Performance Report PDF as Buffer (PORTRAIT - SINGLE PAGE)
// Professional design WITHOUT emojis, proper spacing, signatures at bottom
// ═══════════════════════════════════════════════════════════════════════════

function generateReportPDF(studentName, studentEmail, assessments) {
  return new Promise((resolve, reject) => {
    try {
      // PORTRAIT LAYOUT - A4 = 595 x 842 points
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

      const pageWidth = 515; // 595 - 80 (margins)
      const startX = 40;
      let y = 40; // Current Y position

      // HEADER (professional, no emoji)
      doc.fontSize(26).fillColor('#667eea').font('Helvetica-Bold')
         .text('Performance Report', startX, y, { width: pageWidth, align: 'center' });
      
      y += 32;
      doc.fontSize(10).fillColor('#999999').font('Helvetica')
         .text('Confide Computer Academy', startX, y, { width: pageWidth, align: 'center' });
      
      y += 22;
      doc.moveTo(startX, y).lineTo(startX + pageWidth, y).strokeColor('#667eea').lineWidth(2).stroke();
      y += 18;

      // Calculate statistics
      const avgScore = Math.round(assessments.reduce((sum, a) => sum + a.score, 0) / assessments.length);
      const totalCorrect = assessments.reduce((sum, a) => sum + a.correct_answers, 0);
      const totalQuestions = assessments.reduce((sum, a) => sum + a.total_questions, 0);
      const passRate = ((totalCorrect / totalQuestions) * 100).toFixed(1);
      const reportDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      // STUDENT INFORMATION (side-by-side with proper spacing)
      const col1Width = (pageWidth - 15) / 2;
      const col2X = startX + col1Width + 15;

      // Name
      doc.roundedRect(startX, y, col1Width, 28, 3)
         .fillAndStroke('#f7f9fc', '#667eea');
      doc.fontSize(8).fillColor('#667eea').font('Helvetica-Bold')
         .text('STUDENT NAME', startX + 10, y + 5, { width: col1Width - 20 });
      doc.fontSize(11).fillColor('#1a1a1a').font('Helvetica')
         .text(studentName, startX + 10, y + 16, { width: col1Width - 20 });

      // Email
      doc.roundedRect(col2X, y, col1Width, 28, 3)
         .fillAndStroke('#f7f9fc', '#667eea');
      doc.fontSize(8).fillColor('#667eea').font('Helvetica-Bold')
         .text('EMAIL ADDRESS', col2X + 10, y + 5, { width: col1Width - 20 });
      doc.fontSize(10).fillColor('#1a1a1a').font('Helvetica')
         .text(studentEmail, col2X + 10, y + 16, { width: col1Width - 20 });

      y += 33;

      // Date (full width with spacing)
      doc.roundedRect(startX, y, pageWidth, 22, 3)
         .fillAndStroke('#f7f9fc', '#667eea');
      doc.fontSize(8).fillColor('#667eea').font('Helvetica-Bold')
         .text('REPORT DATE', startX + 10, y + 4, { width: pageWidth - 20 });
      doc.fontSize(10).fillColor('#1a1a1a').font('Helvetica')
         .text(reportDate, startX + 10, y + 14, { width: pageWidth - 20 });

      y += 30;

      // SUMMARY STATISTICS (4 boxes, 2x2 grid, proper spacing)
      const statBoxWidth = (pageWidth - 15) / 2;
      const statBoxHeight = 38;

      // Row 1
      // Overall Score
      doc.roundedRect(startX, y, statBoxWidth, statBoxHeight, 4)
         .fillAndStroke('#667eea', '#667eea');
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
         .text(`${avgScore}%`, startX + 10, y + 7, { width: statBoxWidth - 20, align: 'center' });
      doc.fontSize(8).fillColor('#ffffff').font('Helvetica')
         .text('OVERALL SCORE', startX + 10, y + 27, { width: statBoxWidth - 20, align: 'center' });

      // Correct Answers
      doc.roundedRect(col2X, y, statBoxWidth, statBoxHeight, 4)
         .fillAndStroke('#764ba2', '#764ba2');
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
         .text(`${totalCorrect}/${totalQuestions}`, col2X + 10, y + 7, { width: statBoxWidth - 20, align: 'center' });
      doc.fontSize(8).fillColor('#ffffff').font('Helvetica')
         .text('CORRECT ANSWERS', col2X + 10, y + 27, { width: statBoxWidth - 20, align: 'center' });

      y += statBoxHeight + 5;

      // Row 2
      // Total Questions
      doc.roundedRect(startX, y, statBoxWidth, statBoxHeight, 4)
         .fillAndStroke('#667eea', '#667eea');
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
         .text(`${totalQuestions}`, startX + 10, y + 7, { width: statBoxWidth - 20, align: 'center' });
      doc.fontSize(8).fillColor('#ffffff').font('Helvetica')
         .text('TOTAL QUESTIONS', startX + 10, y + 27, { width: statBoxWidth - 20, align: 'center' });

      // Pass Rate
      doc.roundedRect(col2X, y, statBoxWidth, statBoxHeight, 4)
         .fillAndStroke('#764ba2', '#764ba2');
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
         .text(`${passRate}%`, col2X + 10, y + 7, { width: statBoxWidth - 20, align: 'center' });
      doc.fontSize(8).fillColor('#ffffff').font('Helvetica')
         .text('PASS RATE', col2X + 10, y + 27, { width: statBoxWidth - 20, align: 'center' });

      y += statBoxHeight + 20;

      // COURSE RESULTS TITLE (no emoji)
      doc.fontSize(11).fillColor('#667eea').font('Helvetica-Bold')
         .text('COURSE RESULTS', startX, y, { width: pageWidth });
      
      y += 18;

      // Course breakdown (side-by-side, proper spacing)
      const courseNames = { 'html': 'HTML', 'css': 'CSS', 'javascript': 'JavaScript' };
      const courseColors = { 'html': '#FFB84D', 'css': '#4A90E2', 'javascript': '#A4D965' };
      
      const courseBoxWidth = (pageWidth - 30) / 3;
      
      assessments.forEach((assessment, index) => {
        const courseName = courseNames[assessment.course] || assessment.course.toUpperCase();
        const courseColor = courseColors[assessment.course] || '#667eea';
        const accuracy = ((assessment.correct_answers / assessment.total_questions) * 100).toFixed(1);
        const status = assessment.score >= 60 ? 'PASSED' : 'FAILED';
        const statusColor = assessment.score >= 60 ? '#28a745' : '#dc3545';
        
        const courseX = startX + (index * (courseBoxWidth + 15));
        const courseBoxHeight = 62;
        
        // Course Box
        doc.roundedRect(courseX, y, courseBoxWidth, courseBoxHeight, 4)
           .fillAndStroke('#f7f9fc', courseColor);
        
        // Course Name
        doc.fontSize(10).fillColor(courseColor).font('Helvetica-Bold')
           .text(courseName, courseX + 8, y + 7, { width: courseBoxWidth - 16 });
        
        // Score
        doc.fontSize(15).fillColor('#1a1a1a').font('Helvetica-Bold')
           .text(`${assessment.score}%`, courseX + 8, y + 22, { width: courseBoxWidth - 16 });
        
        // Accuracy
        doc.fontSize(8).fillColor('#666666').font('Helvetica')
           .text(`${accuracy}% accuracy`, courseX + 8, y + 40, { width: courseBoxWidth - 50 });
        
        // Status Badge
        doc.roundedRect(courseX + courseBoxWidth - 50, y + 46, 42, 13, 2)
           .fillAndStroke(statusColor, statusColor);
        doc.fontSize(7).fillColor('#ffffff').font('Helvetica-Bold')
           .text(status, courseX + courseBoxWidth - 50, y + 49, { width: 42, align: 'center' });
      });

      y += 68;

      // RECOMMENDATION BOX (no emoji, proper spacing)
      let recommendationTitle = '';
      let recommendationText = '';
      let recommendationColor = '';
      
      if (avgScore >= 90) {
        recommendationTitle = 'OUTSTANDING PERFORMANCE';
        recommendationText = `Exceptional score of ${avgScore}%! Demonstrates mastery of web development. Well-prepared for advanced topics.`;
        recommendationColor = '#28a745';
      } else if (avgScore >= 80) {
        recommendationTitle = 'EXCELLENT WORK';
        recommendationText = `Great score of ${avgScore}%! Strong understanding shown. Continue building projects to solidify expertise.`;
        recommendationColor = '#28a745';
      } else if (avgScore >= 70) {
        recommendationTitle = 'GOOD JOB';
        recommendationText = `Solid score of ${avgScore}%. Good foundation established. Practice complex projects to enhance skills further.`;
        recommendationColor = '#667eea';
      } else if (avgScore >= 60) {
        recommendationTitle = 'PASSED - KEEP LEARNING';
        recommendationText = `Passed with ${avgScore}%. Review challenging topics and practice more to strengthen understanding.`;
        recommendationColor = '#f39c12';
      } else {
        recommendationTitle = 'NEEDS IMPROVEMENT';
        recommendationText = `Score of ${avgScore}% indicates need for review. Revisit course materials and practice fundamentals.`;
        recommendationColor = '#dc3545';
      }
      
      const recBoxHeight = 55;
      doc.roundedRect(startX, y, pageWidth, recBoxHeight, 4)
         .fillAndStroke('#f9fff9', recommendationColor);
      
      doc.fontSize(9).fillColor(recommendationColor).font('Helvetica-Bold')
         .text(recommendationTitle, startX + 12, y + 8, { width: pageWidth - 24 });
      
      doc.fontSize(9).fillColor('#1a1a1a').font('Helvetica')
         .text(recommendationText, startX + 12, y + 22, { 
           width: pageWidth - 24, 
           lineGap: 2 
         });

      y += recBoxHeight + 25;

      // FOOTER WITH SIGNATURES (at bottom with proper spacing)
      const footerY = 730; // Fixed position near bottom
      
      doc.moveTo(startX, footerY).lineTo(startX + pageWidth, footerY)
         .strokeColor('#e0e0e0').lineWidth(1).stroke();
      
      const footerBoxWidth = (pageWidth - 40) / 3;
      
      // Left Signature
      doc.moveTo(startX + 15, footerY + 12).lineTo(startX + footerBoxWidth - 15, footerY + 12)
         .strokeColor('#667eea').lineWidth(1.5).stroke();
      doc.fontSize(10).fillColor('#667eea').font('Helvetica-Bold')
         .text('Idris Alamutu', startX, footerY + 17, { width: footerBoxWidth, align: 'center' });
      doc.fontSize(8).fillColor('#666666').font('Helvetica')
         .text('Founder & Director', startX, footerY + 30, { width: footerBoxWidth, align: 'center' });
      
      // Center
      doc.fontSize(8).fillColor('#666666').font('Helvetica')
         .text('Generated by', startX + footerBoxWidth, footerY + 17, { 
           width: footerBoxWidth, 
           align: 'center' 
         });
      doc.fontSize(7).fillColor('#999999')
         .text('Confide CBT Platform', startX + footerBoxWidth, footerY + 28, { 
           width: footerBoxWidth, 
           align: 'center' 
         });
      
      // Right Date
      const shortDate = new Date().toLocaleDateString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric'
      });
      doc.moveTo(startX + 2 * footerBoxWidth + 15, footerY + 12)
         .lineTo(startX + pageWidth - 15, footerY + 12)
         .strokeColor('#667eea').lineWidth(1.5).stroke();
      doc.fontSize(10).fillColor('#667eea').font('Helvetica-Bold')
         .text(shortDate, startX + 2 * footerBoxWidth, footerY + 17, { 
           width: footerBoxWidth, 
           align: 'center' 
         });
      doc.fontSize(8).fillColor('#666666').font('Helvetica')
         .text('Date', startX + 2 * footerBoxWidth, footerY + 30, { 
           width: footerBoxWidth, 
           align: 'center' 
         });

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

// ✅ SAVE TO DATABASE AND CHECK FOR COMPLETION → TRIGGER EMAIL
app.post('/api/submit-assessment/:course', (req, res) => {
  console.log('📝 SUBMIT RECEIVED FOR:', req.params.course);
  
  if (!req.session.user_id) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userId = req.session.user_id;
  const course = req.params.course;
  const { score, correct, total, time_remaining } = req.body;

  console.log(`💾 SAVING: user=${userId}, course=${course}, score=${score}`);

  // SAVE TO DATABASE
  db.run(
    'INSERT INTO assessments (user_id, course, score, correct_answers, total_questions, time_remaining) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, course, score, correct, total, time_remaining],
    function(err) {
      if (err) {
        console.error('❌ DATABASE ERROR:', err);
        return res.status(500).json({ error: 'Save failed' });
      }
      
      console.log('✅ SAVED SUCCESSFULLY!');
      
      // 🎯 CHECK IF ALL 3 COURSES ARE NOW COMPLETE
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

          // Get unique courses
          const uniqueCourses = [...new Set(assessments.map(a => a.course))];
          
          console.log(`📊 Student has completed ${uniqueCourses.length}/3 unique courses:`, uniqueCourses);
          
          // ✅ If all 3 courses complete, send instructor email
          if (uniqueCourses.length === 3 && uniqueCourses.includes('html') && uniqueCourses.includes('css') && uniqueCourses.includes('javascript')) {
            console.log('🎉 ALL 3 COURSES COMPLETE! Checking email configuration...');
            
            if (!transporter) {
              console.error('❌ EMAIL SERVICE NOT CONFIGURED!');
              console.error('   Please set GMAIL_USER and GMAIL_PASSWORD in .env file');
              console.error('   Current GMAIL_USER:', GMAIL_USER || 'NOT SET');
              console.error('   Current GMAIL_PASSWORD:', GMAIL_PASSWORD ? 'SET (hidden)' : 'NOT SET');
            } else {
              console.log('✅ Email service configured. Proceeding to send email...');
              
              // Get student info
              db.get('SELECT full_name, email FROM users WHERE id = ?', [userId], (err, user) => {
                if (err || !user) {
                  console.error('❌ Error getting user info:', err);
                } else {
                  console.log(`📧 Preparing to email instructor about: ${user.full_name} (${user.email})`);
                  
                  // Get latest score for each course
                  const latestAssessments = {};
                  assessments.forEach(a => {
                    if (!latestAssessments[a.course]) {
                      latestAssessments[a.course] = a;
                    }
                  });
                  
                  const assessmentArray = Object.values(latestAssessments);
                  
                  console.log('📊 Assessment data to send:', assessmentArray);
                  console.log(`📧 Sending to instructor: ${INSTRUCTOR_EMAIL}`);
                  
                  // 📧 Send email asynchronously (don't wait for it)
                  sendInstructorEmail(user.full_name, user.email, assessmentArray)
                    .then(() => {
                      console.log('✅✅✅ INSTRUCTOR EMAIL SENT SUCCESSFULLY! ✅✅✅');
                    })
                    .catch(error => {
                      console.error('❌❌❌ INSTRUCTOR EMAIL FAILED! ❌❌❌');
                      console.error('Error details:', error);
                      if (error.response) {
                        console.error('SMTP Response:', error.response);
                      }
                    });
                }
              });
            }
          } else {
            console.log('ℹ️ Not all courses complete yet. Waiting for more assessments.');
          }
          
          // Always send response
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

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL TEST ENDPOINT (for debugging)
// ═══════════════════════════════════════════════════════════════════════════

app.get('/test-email', async (req, res) => {
  if (!transporter) {
    return res.status(500).json({
      error: 'Email service not configured',
      details: {
        GMAIL_USER: GMAIL_USER || 'NOT SET',
        GMAIL_PASSWORD: GMAIL_PASSWORD ? 'SET' : 'NOT SET',
        INSTRUCTOR_EMAIL: INSTRUCTOR_EMAIL
      }
    });
  }

  try {
    console.log('🧪 Testing email configuration...');
    
    const testMail = {
      from: GMAIL_USER,
      to: INSTRUCTOR_EMAIL,
      subject: '🧪 Test Email - Confide CBT Platform',
      html: '<h2>Test Successful!</h2><p>Your email configuration is working correctly.</p>'
    };

    await transporter.sendMail(testMail);
    
    console.log('✅ Test email sent successfully!');
    res.json({
      success: true,
      message: 'Test email sent successfully',
      sentTo: INSTRUCTOR_EMAIL
    });
  } catch (error) {
    console.error('❌ Test email failed:', error);
    res.status(500).json({
      error: 'Email send failed',
      details: error.message
    });
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
║  🌐 LIVE DEMO: https://confide-cbt-platform.onrender.com                ║
║                                                                          ║
║  📚 FEATURES:                                                            ║
║     • Sequential Assessment System (HTML → CSS → JavaScript)             ║
║     • Professional Results Page with Progress Tracking                   ║
║     • Assessment Session with Real-time Data from Database               ║
║     • Dashboard with Assessment History & Scores                         ║
║     • Professional Completion Page with Certificate & Report             ║
║     • ✅ AUTO-EMAIL PDFs TO INSTRUCTOR ON COMPLETION ✨                  ║
║     • Session Management & User Authentication                           ║
║     • SQLite Database with Automatic Table Creation                      ║
║                                                                          ║
║  📧 EMAIL NOTIFICATION SYSTEM:                                          ║
║     Instructor Email: ${INSTRUCTOR_EMAIL}                                ║
║     Status: ${transporter ? '✅ CONFIGURED' : '⚠️ NOT CONFIGURED'}      ║
║     Trigger: When student completes all 3 courses                        ║
║     Includes: Certificate PDF + Performance Report PDF                   ║
║                                                                          ║
║  🚀 READY FOR SALES:                                                    ║
║     1. Share live demo: https://confide-cbt-platform.onrender.com       ║
║     2. Prospects can register & test immediately                         ║
║     3. Complete all 3 assessments                                        ║
║     4. Instructor receives email with PDFs automatically!                ║
║                                                                          ║
║  📊 DATABASE: ${DATABASE_PATH}                                          ║
║  🔐 SESSION_SECRET: ${SESSION_SECRET.substring(0, 10)}***               ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
  `);
});

export default app;