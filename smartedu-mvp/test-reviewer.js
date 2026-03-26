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
console.log('          课件质量评分报告');
console.log('='.repeat(50));
console.log(`总分: ${score.overall}/100 ${score.passed ? '✅ 通过' : '❌ 未通过'}`);
console.log('');
console.log('【各维度得分】');
console.log(`├─ 教学设计: ${score.dimensions.pedagogy}/100`);
console.log(`├─ 内容质量: ${score.dimensions.content}/100`);
console.log(`├─ 交互设计: ${score.dimensions.interaction}/100`);
console.log(`├─ 安全合规: ${score.dimensions.safety}/100`);
console.log(`└─ 格式规范: ${score.dimensions.format}/100`);
console.log('');

const critical = score.issues.filter(i => i.severity === 'critical');
const warnings = score.issues.filter(i => i.severity === 'warning');
const infos = score.issues.filter(i => i.severity === 'info');

if (critical.length > 0) {
  console.log(`🔴 严重问题 (${critical.length}):`);
  critical.forEach((issue, i) => {
    console.log(`   ${i + 1}. [${issue.category}] ${issue.message}`);
  });
  console.log('');
}

if (warnings.length > 0) {
  console.log(`🟡 警告问题 (${warnings.length}):`);
  warnings.forEach((issue, i) => {
    console.log(`   ${i + 1}. [${issue.category}] ${issue.message}`);
  });
  console.log('');
}

if (infos.length > 0) {
  console.log(`🔵 建议 (${infos.length}):`);
  infos.forEach((issue, i) => {
    console.log(`   ${i + 1}. [${issue.category}] ${issue.message}`);
  });
  console.log('');
}

if (score.issues.length === 0) {
  console.log('✅ 没有发现问题！');
}

console.log('='.repeat(50));
