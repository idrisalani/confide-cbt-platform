import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./data/cbt_platform.db');

console.log('\n📊 CHECKING ASSESSMENTS IN DATABASE...\n');

db.all('SELECT * FROM assessments ORDER BY id DESC', [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
    return;
  }

  console.log('Total assessments:', rows.length);
  console.log('\nAssessment details:');
  
  rows.forEach(row => {
    console.log(`ID: ${row.id} | User: ${row.user_id} | Course: "${row.course}" | Score: ${row.score} | Cert Sent: ${row.certificate_sent}`);
  });

  // Group by user
  const userCourses = {};
  rows.forEach(row => {
    if (!userCourses[row.user_id]) {
      userCourses[row.user_id] = [];
    }
    if (!userCourses[row.user_id].includes(row.course)) {
      userCourses[row.user_id].push(row.course);
    }
  });

  console.log('\n📈 COMPLETION STATUS:');
  Object.keys(userCourses).forEach(userId => {
    const courses = userCourses[userId];
    const isComplete = courses.length === 3 && 
                      courses.includes('html') && 
                      courses.includes('css') && 
                      courses.includes('javascript');
    
    console.log(`User ${userId}: ${courses.length}/3 courses (${courses.join(', ')}) - ${isComplete ? '✅ COMPLETE' : '❌ INCOMPLETE'}`);
  });

  db.close();
});