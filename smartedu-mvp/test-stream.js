const http = require('http');

const data = JSON.stringify({
  user_question: "正方形的面积怎么算？",
  subject: "数学",
  grade_level: 3,
  enable_refinement: true
});

console.log('发送数据:', data);

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/course/generate?stream=true',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data)
  }
};

const startTime = Date.now();

const req = http.request(options, (res) => {
  console.log('响应状态:', res.statusCode);
  console.log('---流式响应---');
  
  res.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const d = JSON.parse(line.slice(6));
          const time = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[${time}s] [${d.stage}] ${d.message}`);
        } catch (e) {}
      }
    }
  });

  res.on('end', () => {
    console.log('---响应结束---');
    console.log('总耗时:', ((Date.now() - startTime) / 1000).toFixed(1) + 's');
  });
});

req.on('error', (e) => {
  console.error('请求错误:', e.message);
});

req.write(data);
req.end();
