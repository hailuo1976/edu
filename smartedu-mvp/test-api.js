const http = require('http');

const postData = JSON.stringify({
  user_question: "正方形的面积怎么算？",
  subject: "数学",
  grade_level: 3,
  enable_refinement: true
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/course/generate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data.substring(0, 500));
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(postData);
req.end();
