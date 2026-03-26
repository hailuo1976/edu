const http = require('http');

const data = JSON.stringify({
  user_question: "三角形的面积公式是什么？",
  subject: "数学",
  grade_level: 3,
  enable_refinement: false
});

console.log('发送请求 (基础模式)...');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/course/generate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data)
  }
};

const startTime = Date.now();

const req = http.request(options, (res) => {
  console.log('响应状态:', res.statusCode);
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('耗时:', Date.now() - startTime, 'ms');
    try {
      const result = JSON.parse(body);
      console.log('成功:', result.success);
      if (result.success) {
        console.log('课程ID:', result.course_id);
        console.log('HTML长度:', result.html_content?.length || 0);
      } else {
        console.log('错误:', result.error);
      }
    } catch (e) {
      console.log('解析失败:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.error('请求错误:', e.message);
});

req.write(data);
req.end();
