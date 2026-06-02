import { buildDesignSystemPrompt, buildDesignUserPrompt, buildModuleSystemPrompt, buildModuleUserPrompt } from '../src/skills/coursePrompt';

const testCases = [
  {
    user_question: '分数的加减法怎么做？',
    subject: '数学',
    grade_level: 3,
  },
  {
    user_question: '什么是面积？',
    subject: '数学',
    grade_level: 3,
  },
  {
    user_question: '怎么比较大小？',
    subject: '数学',
    grade_level: 2,
  },
  {
    user_question: '什么是乘法？',
    subject: '数学',
    grade_level: 2,
  },
  {
    user_question: '除法怎么算？',
    subject: '数学',
    grade_level: 3,
  },
];

async function testPrompt() {
  console.log('='.repeat(60));
  console.log('Prompt 测试脚本（编程智能体模式）');
  console.log('='.repeat(60));

  console.log('\n📋 阶段1 设计 Prompt 预览:\n');
  const designSystem = buildDesignSystemPrompt();
  console.log(designSystem.substring(0, 500) + '...\n');

  console.log('='.repeat(60));

  console.log('\n📋 阶段2 模块生成 Prompt 预览:\n');
  const moduleSystem = buildModuleSystemPrompt(3, '数学');
  console.log(moduleSystem.substring(0, 500) + '...\n');

  console.log('='.repeat(60));

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n🧪 测试用例 ${i + 1}: ${testCase.user_question}`);
    console.log(`   学科: ${testCase.subject}, 年级: ${testCase.grade_level}年级`);

    const designUserPrompt = buildDesignUserPrompt(
      testCase.user_question,
      testCase.subject,
      testCase.grade_level,
    );
    console.log(`\n📝 设计 User Prompt 长度: ${designUserPrompt.length} 字符`);
    console.log('-'.repeat(40));
    console.log(designUserPrompt.substring(0, 500) + '...');
    console.log('='.repeat(60));
  }

  console.log('\n✅ 测试用例生成完成');
  console.log('\n💡 下一步: 使用API密钥调用进行实际测试');
  console.log('   命令: npm run dev');
  console.log('   然后访问: http://localhost:3000/web/test.html\n');
}

testPrompt().catch(console.error);
