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
// HELPER FUNCTION: Generate Certificate PDF as Buffer (LANDSCAPE)
// ═══════════════════════════════════════════════════════════════════════════

function generateCertificatePDF(studentName, assessments) {
  return new Promise((resolve, reject) => {
    try {
      // LANDSCAPE LAYOUT
      const doc = new PDFDocument({ 
        size: 'A4',
        layout: 'landscape',
        margins: { top: 40, bottom: 40, left: 60, right: 60 }
      });
      
      let buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const centerX = pageWidth / 2;

      // GOLD BORDER
      doc.lineWidth(8)
         .strokeColor('#f39c12')
         .rect(30, 30, pageWidth - 60, doc.page.height - 60)
         .stroke();

      // TROPHY ICONS
      doc.fontSize(40).fillColor('#f39c12')
         .text('🏆', 50, 50, { width: 50 });
      doc.fontSize(40).fillColor('#f39c12')
         .text('🏆', pageWidth - 100, 50, { width: 50 });

      // ORNAMENTAL DIVIDER
      doc.fontSize(20).fillColor('#f39c12')
         .text('✦ ✦ ✦', centerX - 50, 80, { width: 100, align: 'center' });

      // CERTIFICATE TITLE
      doc.fontSize(42).fillColor('#667eea').font('Helvetica-Bold')
         .text('Certificate of Completion', centerX - 250, 120, { 
           width: 500, 
           align: 'center' 
         });

      // SUBTITLE
      doc.fontSize(11).fillColor('#666666').font('Helvetica')
         .text('CONFIDE COMPUTER ACADEMY', centerX - 200, 170, { 
           width: 400, 
           align: 'center' 
         });

      // CERTIFICATE BODY
      doc.fontSize(14).fillColor('#666666')
         .text('This is to certify that', centerX - 150, 210, { 
           width: 300, 
           align: 'center' 
         });

      // STUDENT NAME (LARGE & BOLD)
      doc.fontSize(36).fillColor('#667eea').font('Helvetica-Bold')
         .text(studentName, centerX - 300, 240, { 
           width: 600, 
           align: 'center' 
         });

      // ACCOMPLISHMENT TEXT
      doc.fontSize(14).fillColor('#666666').font('Helvetica')
         .text('has successfully completed the', centerX - 200, 290, { 
           width: 400, 
           align: 'center' 
         });

      doc.fontSize(16).fillColor('#1a1a1a').font('Helvetica-Bold')
         .text('Confide Computer Academy', centerX - 200, 315, { 
           width: 400, 
           align: 'center' 
         });

      doc.fontSize(16).fillColor('#764ba2').font('Helvetica-Bold')
         .text('Web Development Program', centerX - 200, 340, { 
           width: 400, 
           align: 'center' 
         });

      doc.fontSize(13).fillColor('#666666').font('Helvetica')
         .text('Comprising HTML, CSS, and JavaScript Courses', centerX - 200, 365, { 
           width: 400, 
           align: 'center' 
         });

      // STATISTICS BOX
      const boxY = 400;
      const boxHeight = 70;
      
      // Background box
      doc.roundedRect(centerX - 300, boxY, 600, boxHeight, 5)
         .fillAndStroke('#f0f9f9', '#667eea');

      // Calculate stats
      const avgScore = Math.round(assessments.reduce((sum, a) => sum + a.score, 0) / assessments.length);
      const totalCorrect = assessments.reduce((sum, a) => sum + a.correct_answers, 0);
      const totalQuestions = assessments.reduce((sum, a) => sum + a.total_questions, 0);
      const completionDate = new Date().toLocaleDateString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric'
      });

      // Stat 1: Overall Score
      doc.fontSize(28).fillColor('#667eea').font('Helvetica-Bold')
         .text(`${avgScore}%`, centerX - 250, boxY + 15, { width: 150, align: 'center' });
      doc.fontSize(10).fillColor('#666666').font('Helvetica')
         .text('OVERALL SCORE', centerX - 250, boxY + 50, { width: 150, align: 'center' });

      // Stat 2: Correct Answers
      doc.fontSize(28).fillColor('#667eea').font('Helvetica-Bold')
         .text(`${totalCorrect}/${totalQuestions}`, centerX - 75, boxY + 15, { width: 150, align: 'center' });
      doc.fontSize(10).fillColor('#666666').font('Helvetica')
         .text('CORRECT ANSWERS', centerX - 75, boxY + 50, { width: 150, align: 'center' });

      // Stat 3: Date Issued
      doc.fontSize(22).fillColor('#667eea').font('Helvetica-Bold')
         .text(completionDate, centerX + 100, boxY + 18, { width: 150, align: 'center' });
      doc.fontSize(10).fillColor('#666666').font('Helvetica')
         .text('DATE ISSUED', centerX + 100, boxY + 50, { width: 150, align: 'center' });

      // FOOTER SECTION
      const footerY = doc.page.height - 100;
      const fullDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      // Left Signature
      doc.moveTo(100, footerY).lineTo(250, footerY).strokeColor('#667eea').stroke();
      doc.fontSize(12).fillColor('#667eea').font('Helvetica-Bold')
         .text('Idris Alamutu', 100, footerY + 8, { width: 150, align: 'center' });
      doc.fontSize(9).fillColor('#666666').font('Helvetica')
         .text('Founder & Director', 100, footerY + 25, { width: 150, align: 'center' });

      // Center Date
      doc.fontSize(11).fillColor('#666666').font('Helvetica')
         .text('Issued on', centerX - 75, footerY, { width: 150, align: 'center' });
      doc.fontSize(10).fillColor('#666666')
         .text(fullDate, centerX - 75, footerY + 15, { width: 150, align: 'center' });

      // Right Signature
      doc.moveTo(pageWidth - 250, footerY).lineTo(pageWidth - 100, footerY).strokeColor('#667eea').stroke();
      doc.fontSize(12).fillColor('#667eea').font('Helvetica-Bold')
         .text('Academy Seal', pageWidth - 250, footerY + 8, { width: 150, align: 'center' });
      doc.fontSize(9).fillColor('#666666').font('Helvetica')
         .text('Confide Academy', pageWidth - 250, footerY + 25, { width: 150, align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTION: Generate Performance Report PDF as Buffer (PORTRAIT)
// ═══════════════════════════════════════════════════════════════════════════

function generateReportPDF(studentName, studentEmail, assessments) {
  return new Promise((resolve, reject) => {
    try {
      // PORTRAIT LAYOUT
      const doc = new PDFDocument({ 
        size: 'A4',
        layout: 'portrait',
        margins: { top: 30, bottom: 30, left: 30, right: 30 }
      });
      
      let buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      const pageWidth = doc.page.width - 60;
      const startX = 30;
      let currentY = 30;

      // HEADER
      doc.fontSize(30).fillColor('#667eea').font('Helvetica-Bold')
         .text('📊 Performance Report', startX, currentY, { width: pageWidth, align: 'center' });
      
      currentY += 35;
      doc.fontSize(10).fillColor('#999999').font('Helvetica')
         .text('Confide Computer Academy', startX, currentY, { width: pageWidth, align: 'center' });
      
      currentY += 25;
      doc.moveTo(startX, currentY).lineTo(startX + pageWidth, currentY).strokeColor('#667eea').lineWidth(2).stroke();
      currentY += 15;

      // STUDENT INFORMATION BOXES
      const boxWidth = (pageWidth - 20) / 2;
      
      // Left Column Start
      let leftY = currentY;
      
      // Student Name Box
      doc.roundedRect(startX, leftY, boxWidth, 30, 3)
         .fillAndStroke('#f0f9f9', '#667eea');
      doc.fontSize(8).fillColor('#667eea').font('Helvetica-Bold')
         .text('STUDENT NAME', startX + 10, leftY + 5, { width: boxWidth - 20 });
      doc.fontSize(11).fillColor('#1a1a1a').font('Helvetica')
         .text(studentName, startX + 10, leftY + 16, { width: boxWidth - 20 });
      
      leftY += 35;
      
      // Email Box
      doc.roundedRect(startX, leftY, boxWidth, 30, 3)
         .fillAndStroke('#f0f9f9', '#667eea');
      doc.fontSize(8).fillColor('#667eea').font('Helvetica-Bold')
         .text('EMAIL', startX + 10, leftY + 5, { width: boxWidth - 20 });
      doc.fontSize(10).fillColor('#1a1a1a').font('Helvetica')
         .text(studentEmail, startX + 10, leftY + 16, { width: boxWidth - 20 });
      
      leftY += 35;
      
      // Report Date Box
      const reportDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
      doc.roundedRect(startX, leftY, boxWidth, 30, 3)
         .fillAndStroke('#f0f9f9', '#667eea');
      doc.fontSize(8).fillColor('#667eea').font('Helvetica-Bold')
         .text('REPORT DATE', startX + 10, leftY + 5, { width: boxWidth - 20 });
      doc.fontSize(11).fillColor('#1a1a1a').font('Helvetica')
         .text(reportDate, startX + 10, leftY + 16, { width: boxWidth - 20 });
      
      leftY += 35;

      // Calculate Statistics
      const avgScore = Math.round(assessments.reduce((sum, a) => sum + a.score, 0) / assessments.length);
      const totalCorrect = assessments.reduce((sum, a) => sum + a.correct_answers, 0);
      const totalQuestions = assessments.reduce((sum, a) => sum + a.total_questions, 0);
      const passRate = ((totalCorrect / totalQuestions) * 100).toFixed(1);

      // SUMMARY STATISTICS (2x2 Grid in Left Column)
      const statBoxWidth = (boxWidth - 10) / 2;
      const statBoxHeight = 40;

      // Overall Score
      doc.roundedRect(startX, leftY, statBoxWidth, statBoxHeight, 3)
         .fillAndStroke('#667eea', '#667eea');
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
         .text(`${avgScore}%`, startX + 5, leftY + 8, { width: statBoxWidth - 10, align: 'center' });
      doc.fontSize(8).fillColor('#ffffff').font('Helvetica')
         .text('OVERALL SCORE', startX + 5, leftY + 28, { width: statBoxWidth - 10, align: 'center' });

      // Correct Answers
      doc.roundedRect(startX + statBoxWidth + 10, leftY, statBoxWidth, statBoxHeight, 3)
         .fillAndStroke('#764ba2', '#764ba2');
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
         .text(`${totalCorrect}/${totalQuestions}`, startX + statBoxWidth + 15, leftY + 8, { width: statBoxWidth - 10, align: 'center' });
      doc.fontSize(8).fillColor('#ffffff').font('Helvetica')
         .text('CORRECT', startX + statBoxWidth + 15, leftY + 28, { width: statBoxWidth - 10, align: 'center' });

      leftY += statBoxHeight + 5;

      // Total Questions
      doc.roundedRect(startX, leftY, statBoxWidth, statBoxHeight, 3)
         .fillAndStroke('#667eea', '#667eea');
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
         .text(`${totalQuestions}`, startX + 5, leftY + 8, { width: statBoxWidth - 10, align: 'center' });
      doc.fontSize(8).fillColor('#ffffff').font('Helvetica')
         .text('TOTAL Q\'S', startX + 5, leftY + 28, { width: statBoxWidth - 10, align: 'center' });

      // Pass Rate
      doc.roundedRect(startX + statBoxWidth + 10, leftY, statBoxWidth, statBoxHeight, 3)
         .fillAndStroke('#764ba2', '#764ba2');
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
         .text(`${passRate}%`, startX + statBoxWidth + 15, leftY + 8, { width: statBoxWidth - 10, align: 'center' });
      doc.fontSize(8).fillColor('#ffffff').font('Helvetica')
         .text('PASS RATE', startX + statBoxWidth + 15, leftY + 28, { width: statBoxWidth - 10, align: 'center' });

      // RIGHT COLUMN - Course Results
      const rightX = startX + boxWidth + 20;
      let rightY = currentY;

      doc.fontSize(10).fillColor('#667eea').font('Helvetica-Bold')
         .text('📚 Course Results', rightX, rightY, { width: boxWidth });
      
      rightY += 20;

      // Course breakdown
      const courseNames = { 'html': 'HTML', 'css': 'CSS', 'javascript': 'JavaScript' };
      const courseColors = { 'html': '#FFB84D', 'css': '#4A90E2', 'javascript': '#A4D965' };
      
      assessments.forEach((assessment) => {
        const courseName = courseNames[assessment.course] || assessment.course.toUpperCase();
        const courseColor = courseColors[assessment.course] || '#667eea';
        const accuracy = ((assessment.correct_answers / assessment.total_questions) * 100).toFixed(1);
        const status = assessment.score >= 60 ? 'PASSED ✓' : 'FAILED ✗';
        const statusColor = assessment.score >= 60 ? '#28a745' : '#dc3545';
        
        const courseBoxHeight = 55;
        
        // Course Box
        doc.roundedRect(rightX, rightY, boxWidth, courseBoxHeight, 3)
           .fillAndStroke('#f0f9f9', courseColor);
        
        // Course Name
        doc.fontSize(10).fillColor(courseColor).font('Helvetica-Bold')
           .text(courseName, rightX + 10, rightY + 8, { width: boxWidth - 20 });
        
        // Score
        doc.fontSize(14).fillColor('#1a1a1a').font('Helvetica-Bold')
           .text(`${assessment.score}%`, rightX + 10, rightY + 22, { width: boxWidth - 20 });
        
        // Accuracy
        doc.fontSize(9).fillColor('#666666').font('Helvetica')
           .text(`${accuracy}% accuracy`, rightX + 10, rightY + 38, { width: boxWidth - 80 });
        
        // Status Badge
        doc.roundedRect(rightX + boxWidth - 70, rightY + 35, 60, 15, 3)
           .fillAndStroke(statusColor, statusColor);
        doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold')
           .text(status, rightX + boxWidth - 70, rightY + 39, { width: 60, align: 'center' });
        
        rightY += courseBoxHeight + 8;
      });

      // RECOMMENDATION BOX
      rightY += 10;
      
      let recommendationTitle = '';
      let recommendationText = '';
      let recommendationColor = '';
      
      if (avgScore >= 90) {
        recommendationTitle = '🌟 OUTSTANDING PERFORMANCE';
        recommendationText = `Exceptional score of ${avgScore}%! You demonstrate mastery of web development fundamentals. You are well-prepared for advanced topics and real-world projects.`;
        recommendationColor = '#28a745';
      } else if (avgScore >= 80) {
        recommendationTitle = '🎯 EXCELLENT WORK';
        recommendationText = `Great score of ${avgScore}%! You show strong understanding of web development concepts. Continue building projects to solidify your expertise.`;
        recommendationColor = '#28a745';
      } else if (avgScore >= 70) {
        recommendationTitle = '👍 GOOD JOB';
        recommendationText = `Solid score of ${avgScore}%. You have a good foundation in web development. Practice more complex projects to enhance your skills further.`;
        recommendationColor = '#667eea';
      } else if (avgScore >= 60) {
        recommendationTitle = '📚 PASSED - KEEP LEARNING';
        recommendationText = `You passed with ${avgScore}%. Review challenging topics and practice more to strengthen your understanding of web development concepts.`;
        recommendationColor = '#f39c12';
      } else {
        recommendationTitle = '💪 NEEDS IMPROVEMENT';
        recommendationText = `Score of ${avgScore}% indicates need for review. We recommend revisiting course materials and practicing fundamentals before advancing.`;
        recommendationColor = '#dc3545';
      }
      
      const recBoxHeight = 70;
      doc.roundedRect(rightX, rightY, boxWidth, recBoxHeight, 3)
         .fillAndStroke('#f0fff4', recommendationColor);
      
      doc.fontSize(9).fillColor(recommendationColor).font('Helvetica-Bold')
         .text(recommendationTitle, rightX + 10, rightY + 8, { width: boxWidth - 20 });
      
      doc.fontSize(9).fillColor('#1a1a1a').font('Helvetica')
         .text(recommendationText, rightX + 10, rightY + 22, { 
           width: boxWidth - 20, 
           lineGap: 2 
         });

      // FOOTER
      const footerY = doc.page.height - 80;
      
      doc.moveTo(startX, footerY).lineTo(startX + pageWidth, footerY).strokeColor('#f0f0f0').lineWidth(1).stroke();
      
      const footerBoxWidth = (pageWidth - 40) / 3;
      
      // Left Signature
      doc.moveTo(startX + 10, footerY + 15).lineTo(startX + footerBoxWidth - 10, footerY + 15).strokeColor('#667eea').stroke();
      doc.fontSize(10).fillColor('#667eea').font('Helvetica-Bold')
         .text('Idris Alamutu', startX, footerY + 20, { width: footerBoxWidth, align: 'center' });
      doc.fontSize(8).fillColor('#666666').font('Helvetica')
         .text('Founder & Director', startX, footerY + 32, { width: footerBoxWidth, align: 'center' });
      
      // Center
      doc.fontSize(9).fillColor('#666666').font('Helvetica')
         .text('Generated by Confide CBT Platform', startX + footerBoxWidth, footerY + 20, { 
           width: footerBoxWidth, 
           align: 'center' 
         });
      
      // Right Date
      const shortDate = new Date().toLocaleDateString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric'
      });
      doc.moveTo(startX + 2 * footerBoxWidth + 10, footerY + 15).lineTo(startX + pageWidth - 10, footerY + 15).strokeColor('#667eea').stroke();
      doc.fontSize(10).fillColor('#667eea').font('Helvetica-Bold')
         .text(shortDate, startX + 2 * footerBoxWidth, footerY + 20, { width: footerBoxWidth, align: 'center' });
      doc.fontSize(8).fillColor('#666666').font('Helvetica')
         .text('Date', startX + 2 * footerBoxWidth, footerY + 32, { width: footerBoxWidth, align: 'center' });

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
          } else {
            // Get unique courses
            const uniqueCourses = [...new Set(assessments.map(a => a.course))];
            
            console.log(`📊 Student has completed ${uniqueCourses.length}/3 courses:`, uniqueCourses);
            
            // ✅ If all 3 courses complete, send instructor email
            if (uniqueCourses.length === 3 && uniqueCourses.includes('html') && uniqueCourses.includes('css') && uniqueCourses.includes('javascript')) {
              console.log('🎉 ALL 3 COURSES COMPLETE! Sending instructor email...');
              
              // Get student info
              db.get('SELECT full_name, email FROM users WHERE id = ?', [userId], (err, user) => {
                if (err || !user) {
                  console.error('❌ Error getting user info:', err);
                } else {
                  // Get latest score for each course
                  const latestAssessments = {};
                  assessments.forEach(a => {
                    if (!latestAssessments[a.course]) {
                      latestAssessments[a.course] = a;
                    }
                  });
                  
                  const assessmentArray = Object.values(latestAssessments);
                  
                  // 📧 Send email asynchronously (don't wait for it)
                  sendInstructorEmail(user.full_name, user.email, assessmentArray)
                    .then(() => {
                      console.log('✅ Instructor email sent successfully!');
                    })
                    .catch(error => {
                      console.error('❌ Instructor email failed:', error);
                    });
                }
              });
            }
          }
        }
      );
      
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