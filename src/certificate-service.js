const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class CertificateService {
  static generateCertificate(studentName, courses, completionDate) {
    return new Promise((resolve, reject) => {
      try {
        // Create certificates directory if it doesn't exist
        const certDir = path.join(__dirname, '..', 'data', 'certificates');
        if (!fs.existsSync(certDir)) {
          fs.mkdirSync(certDir, { recursive: true });
        }

        // Create PDF document
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50
        });

        // Generate filename
        const timestamp = Date.now();
        const filename = `certificate_${studentName.replace(/\s+/g, '_')}_${timestamp}.pdf`;
        const filepath = path.join(certDir, filename);

        // Pipe to file
        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);

        // Certificate border
        doc.rect(30, 30, 535, 737)
          .stroke('#667eea');
        doc.rect(35, 35, 525, 727)
          .stroke('#667eea');

        // Header
        doc.fontSize(36)
          .font('Helvetica-Bold')
          .text('CERTIFICATE OF COMPLETION', 0, 100, { align: 'center' });

        doc.fontSize(14)
          .font('Helvetica')
          .fillColor('#667eea')
          .text('Confide Computer Academy', 0, 150, { align: 'center' });

        // Main text
        doc.fontSize(12)
          .fillColor('#333')
          .font('Helvetica')
          .text('This is to certify that', 0, 200, { align: 'center' });

        doc.fontSize(20)
          .font('Helvetica-Bold')
          .text(studentName, 0, 225, { align: 'center' });

        doc.fontSize(12)
          .font('Helvetica')
          .text('has successfully completed the assessment in:', 0, 260, { align: 'center' });

        // Course list
        let yPos = 290;
        const courseNames = {
          'html': 'HTML Fundamentals',
          'css': 'CSS Styling',
          'javascript': 'JavaScript Essentials'
        };

        courses.forEach(course => {
          doc.fontSize(11)
            .fillColor('#667eea')
            .text(`✓ ${courseNames[course.course] || course.course}`, 150, yPos);
          doc.fontSize(10)
            .fillColor('#666')
            .text(`Score: ${course.score}%`, 250, yPos);
          yPos += 25;
        });

        // Completion date
        doc.fontSize(12)
          .fillColor('#333')
          .text('Completion Date:', 0, yPos + 30, { align: 'center' });

        doc.fontSize(14)
          .font('Helvetica-Bold')
          .text(completionDate, 0, yPos + 50, { align: 'center' });

        // Footer
        doc.fontSize(10)
          .fillColor('#999')
          .font('Helvetica')
          .text('This certificate acknowledges successful completion of the required assessments.', 0, 680, { align: 'center' });

        // Signature area
        doc.fontSize(12)
          .fillColor('#333')
          .text('_______________________', 100, 700);
        doc.fontSize(10)
          .text('Authorized Signature', 100, 725);

        // End document
        doc.end();

        // Return file path when finished
        stream.on('finish', () => {
          resolve(filepath);
        });

        stream.on('error', (err) => {
          reject(err);
        });

      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = CertificateService;