/**
 * 测试课件生成服务的上下文优化效果
 */

import { CourseToolCallAgent } from '../src/services/courseToolCallAgent';

async function testContextOptimization() {
  console.log('========================================');
  console.log('开始测试课件生成服务的上下文优化');
  console.log('========================================\n');

  const agent = new CourseToolCallAgent({
    model: 'glm-5',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
    maxIterations: 3,  // 只测试3轮迭代
  });

  console.log('测试1: 模拟课件生成过程');
  try {
    const result = await agent.generate(
      '立体几何的全面复习',
      '数学',
      6
    );

    console.log(`✓ 课件生成完成`);
    console.log(`  成功: ${result.success}`);
    console.log(`  迭代次数: ${result.iterations}`);
    console.log(`  工具调用次数: ${result.toolCalls.length}`);
    console.log(`  HTML长度: ${result.html?.length || 0} 字符`);
    
    if (result.success) {
      console.log(`  课程ID: ${result.courseId}`);
    } else {
      console.log(`  错误: ${result.error}`);
    }
    console.log('');
  } catch (error: any) {
    console.error(`✗ 测试1失败: ${error.message}\n`);
  }

  console.log('========================================');
  console.log('课件生成服务上下文优化测试完成');
  console.log('========================================');
  console.log('\n预期效果:');
  console.log('1. 搜索结果会被压缩，只保留关键信息');
  console.log('2. 历史消息会被智能压缩，避免重复');
  console.log('3. 每次迭代会显示Token优化效果');
  console.log('4. 大课件会被建议拆分为多个文件');
}

// 运行测试
testContextOptimization().catch(console.error);
