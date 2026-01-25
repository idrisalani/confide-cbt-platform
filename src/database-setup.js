/**
 * Database Setup for Confide CBT Platform (ES Module Version)
 * Initializes all tables for assessment sessions, history, users, etc.
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'cbt_platform.db');
const db = new sqlite3.Database(dbPath);

// Initialize database
db.serialize(() => {
  console.log('📊 Initializing CBT Platform Database...\n');

  // ============================================================
  // USERS TABLE
  // ============================================================
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, () => console.log('✅ Users table initialized'));

  // ============================================================
  // ASSESSMENT SESSIONS TABLE
  // Tracks one session per student per day
  // ============================================================
  db.run(`
    CREATE TABLE IF NOT EXISTS assessment_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_date DATE NOT NULL,
      
      -- HTML Course
      html_score INTEGER,
      html_status TEXT,
      html_correct INTEGER,
      html_completed_at DATETIME,
      
      -- CSS Course
      css_score INTEGER,
      css_status TEXT,
      css_correct INTEGER,
      css_completed_at DATETIME,
      
      -- JavaScript Course
      js_score INTEGER,
      js_status TEXT,
      js_correct INTEGER,
      js_completed_at DATETIME,
      
      -- Overall Session
      cumulative_score DECIMAL(5,2),
      session_status TEXT DEFAULT 'IN_PROGRESS',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, session_date)
    )
  `, () => console.log('✅ Assessment Sessions table initialized'));

  // ============================================================
  // ASSESSMENT HISTORY TABLE
  // Detailed records of each course taken with timestamps
  // ============================================================
  db.run(`
    CREATE TABLE IF NOT EXISTS assessment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_id INTEGER,
      course TEXT NOT NULL,
      score INTEGER NOT NULL,
      correct_answers INTEGER NOT NULL,
      total_questions INTEGER DEFAULT 34,
      status TEXT NOT NULL,
      time_used INTEGER,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (session_id) REFERENCES assessment_sessions(id)
    )
  `, () => console.log('✅ Assessment History table initialized'));

  // ============================================================
  // COURSE TIME TRACKING TABLE
  // Tracks time budget per student per course
  // ============================================================
  db.run(`
    CREATE TABLE IF NOT EXISTS course_time_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      course TEXT NOT NULL,
      session_date DATE,
      total_time_allocated INTEGER DEFAULT 1200,
      total_time_used INTEGER DEFAULT 0,
      time_remaining INTEGER DEFAULT 1200,
      attempt_count INTEGER DEFAULT 0,
      last_attempt_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, course, session_date)
    )
  `, () => console.log('✅ Course Time Tracking table initialized'));

  console.log('\n🎉 Database initialization complete!\n');
});

db.close(() => {
  console.log('✅ Database connection closed');
});

export default db;