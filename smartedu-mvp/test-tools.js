const http = require('http');

const postData = JSON.stringify({
  user_question: "正方形的面积怎么算？",
  subject: "数学",
  grade_level: 3,
  use_tools: true
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

console.log('开始测试工具调用模式课件生成...\n');
console.log('使用OpenAI兼容接口 + qwen-plus模型\n');

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const result = JSON.parse(data);
      if (result.success) {
        console.log('✅ 课件生成成功!');
        console.log('Course ID:', result.course_id);
        console.log('HTML长度:', result.html_content?.length || 0, '字符');
      } else {
        console.log('❌ 生成失败:', result.error);
      }
    } catch (e) {
      console.log('Response:', data.substring(0, 1000));
    }
  });
});

req.on('error', (e) => {
  console.error('请求错误:', e.message);
});

req.write(postData);
req.end();

console.log('请求已发送，等待响应...\n');
