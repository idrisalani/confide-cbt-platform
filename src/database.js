/**
 * Database Module for Confide CBT Platform (ES Module Version)
 * Handles SQLite database connection and initialization
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path
const dbPath = path.join(__dirname, 'cbt_platform.db');

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Database connected successfully');
    initializeTables();
  }
});

// Initialize database tables
function initializeTables() {
  db.serialize(() => {
    // USERS TABLE
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
    `, (err) => {
      if (err) console.error('Error creating users table:', err);
      else console.log('✅ Users table ready');
    });

    // ASSESSMENT SESSIONS TABLE
    db.run(`
      CREATE TABLE IF NOT EXISTS assessment_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_date DATE NOT NULL,
        
        html_score INTEGER,
        html_status TEXT,
        html_correct INTEGER,
        html_completed_at DATETIME,
        
        css_score INTEGER,
        css_status TEXT,
        css_correct INTEGER,
        css_completed_at DATETIME,
        
        js_score INTEGER,
        js_status TEXT,
        js_correct INTEGER,
        js_completed_at DATETIME,
        
        cumulative_score DECIMAL(5,2),
        session_status TEXT DEFAULT 'IN_PROGRESS',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        certificate_sent INTEGER DEFAULT 0,
        
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, session_date)
      )
    `, (err) => {
      if (err) console.error('Error creating assessment_sessions table:', err);
      else console.log('✅ Assessment Sessions table ready');
    });

    // ASSESSMENT HISTORY TABLE
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
    `, (err) => {
      if (err) console.error('Error creating assessment_history table:', err);
      else console.log('✅ Assessment History table ready');
    });

    // COURSE TIME TRACKING TABLE
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
    `, (err) => {
      if (err) console.error('Error creating course_time_tracking table:', err);
      else console.log('✅ Course Time Tracking table ready');
    });

    console.log('✅ All database tables initialized');
  });
}

// Database helper functions
export const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

export const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

// Export the database connection
export default db;