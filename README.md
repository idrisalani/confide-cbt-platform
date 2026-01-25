# Confide Computer Academy - CBT Platform
  
  Professional Computer-Based Testing (CBT) platform for Confide Computer Academy.
  
  ## Features
  
  - Sequential assessment system (HTML → CSS → JavaScript)
  - User authentication with bcrypt password hashing
  - Automatic score calculation
  - Dashboard with progress tracking
  - Professional certificate generation
  - Performance reports
  - Email notifications to instructor
  - SQLite database
  
  ## Technology Stack
  
  - **Backend:** Node.js, Express.js
  - **Frontend:** HTML5, CSS3, JavaScript
  - **Database:** SQLite3
  - **Authentication:** bcryptjs
  - **Email:** Nodemailer
  - **PDF Generation:** PDFKit
  
  ## Installation
  
  1. Clone repository:
     ```bash
     git clone https://github.com/YOUR-USERNAME/confide-cbt-platform.git
     cd confide-cbt-platform
     ```
  
  2. Install dependencies:
     ```bash
     npm install
     ```
  
  3. Create .env file:
     ```
     DATABASE_PATH=./data/cbt_platform.db
     SESSION_SECRET=your-secret-key
     GMAIL_USER=your-email@gmail.com
     GMAIL_PASSWORD=your-app-password
     INSTRUCTOR_EMAIL=idris.alamutu@outlook.com
     PORT=5000
     NODE_ENV=development
     ```
  
  4. Start server:
     ```bash
     npm start
     ```
  
  5. Open browser: http://localhost:5000
  
  ## Assessment Structure
  
  - **HTML:** 34 questions
  - **CSS:** 33 questions
  - **JavaScript:** 35 questions
  - **Total:** 102 questions
  
  ## Scoring
  
  - Pass threshold: 60%
  - Students must complete courses in order
  - Automatic certificate generation on completion
  - Performance report with recommendations
  
  ## Author
  
  Confide Computer Academy
  
  ## License
  
  All rights reserved © 2026 Confide Computer Academy
