const fs = require('fs');
const path = require('path');

const CourseReviewer = require('./dist/services/courseReviewer').CourseReviewer;

const html = fs.readFileSync(
  path.join(__dirname, 'courses/course_1oyy5h_1774458887560.html'),
  'utf-8'
);

const reviewer = new CourseReviewer();
const score = reviewer.review(html, '正方形的面积怎么计算？');

console.log('='.repeat(50));
console.log('生成的修复提示:');
console.log('='.repeat(50));
console.log(reviewer.generateFixPrompt(html, score));
console.log('='.repeat(50));
