import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { ToolCallAgent } from '../src/services/toolCallAgent';
import { AgentProgress } from '../src/types/agent';

const workDir = path.join(__dirname, '..', 'courses');

async function onProgress(progress: AgentProgress) {
  console.log(`\n=== 第${progress.iteration}轮 ===`);
  console.log(`状态: ${progress.stage}`);
  console.log(`消息: ${progress.message}`);

  if (progress.toolCalls) {
    console.log('工具调用:');
    progress.toolCalls.forEach(tc => {
      console.log(`  - ${tc.name}:`, JSON.stringify(tc.arguments, null, 2));
    });
  }

  if (progress.toolResults) {
    console.log('工具结果:');
    progress.toolResults.forEach(r => {
      console.log(`  - ${r.toolName}: ${r.success ? '成功' : '失败'}`);
      if (r.success && r.result) {
        console.log(`    结果:`, JSON.stringify(r.result, null, 2));
      } else if (r.error) {
        console.log(`    错误: ${r.error}`);
      }
    });
  }
}

async function main() {
  const agent = new ToolCallAgent({
    workDir,
    onProgress,
    config: {
      maxIterations: 15,
      timeoutMs: 300000,
    },
  });

  const prompt = `请帮我生成一个小学数学课件，主题是"三角形的面积公式"。

要求：
1. 使用Canvas绘制三角形图形
2. 包含概念讲解、图形演示、练习测试三个模块
3. 生成完整的HTML代码
4. 先将HTML内容写入文件，然后告诉我文件路径`;

  console.log('开始执行AI课件生成任务...\n');
  console.log('='.repeat(50));
  console.log(`工作目录: ${workDir}`);
  console.log('='.repeat(50));

  const startTime = Date.now();

  try {
    const result = await agent.execute(prompt);

    console.log('\n' + '='.repeat(50));
    console.log('执行结果');
    console.log('='.repeat(50));
    console.log(`成功: ${result.success}`);
    console.log(`迭代次数: ${result.iterations}`);
    console.log(`工具调用次数: ${result.toolCalls.length}`);
    console.log(`耗时: ${Date.now() - startTime}ms`);

    if (result.error) {
      console.log(`错误: ${result.error}`);
    }

    if (result.finalOutput) {
      console.log('\n最终输出预览:');
      console.log('-'.repeat(50));
      console.log(result.finalOutput.substring(0, 500) + (result.finalOutput.length > 500 ? '...' : ''));
    }

  } catch (error: any) {
    console.error('执行失败:', error.message);
    process.exit(1);
  }
}

main();
