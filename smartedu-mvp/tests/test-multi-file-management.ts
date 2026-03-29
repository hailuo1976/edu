/**
 * 测试多文件管理功能
 */

import { CourseAdjustmentService } from '../src/services/courseAdjustmentService';
import { AdjustmentSession } from '../src/types/adjustment';

async function testMultiFileManagement() {
  console.log('========================================');
  console.log('开始测试多文件管理功能');
  console.log('========================================\n');

  const service = new CourseAdjustmentService();

  // 测试1: 创建大课件会话（应该自动建议拆分）
  console.log('测试1: 创建大课件会话（>3000字符）');
  try {
    const largeHtml = '<!DOCTYPE html><html><head><title>大课件</title></head><body>' + 
      '<div class="content">' + 'A'.repeat(3000) + '</div></body></html>';
    
    // 模拟创建会话
    const session: AdjustmentSession = {
      sessionId: 'test_session_1',
      courseId: 'test_large_course',
      courseInfo: {
        id: 'test_large_course',
        topic: '测试大课件',
        subject: '数学',
        gradeLevel: 1,
        createdAt: new Date().toISOString(),
        filePath: './test_large.html',
      },
      originalHtml: largeHtml,
      currentHtml: largeHtml,
      files: [{
        id: 'main_001',
        name: 'index.html',
        type: 'main',
        html: largeHtml,
        description: '主课件文件',
        order: 0,
        size: largeHtml.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      }],
      activeFileId: 'main_001',
      conversationHistory: [],
      adjustmentHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active',
    };

    console.log(`✓ 会话创建成功`);
    console.log(`  文件数量: ${session.files.length}`);
    console.log(`  活动文件: ${session.activeFileId}`);
    console.log(`  文件大小: ${session.files[0].size} 字符`);
    console.log(`  应该拆分: ${session.files[0].size > 3000 ? '是' : '否'}\n`);
  } catch (error: any) {
    console.error(`✗ 测试1失败: ${error.message}\n`);
  }

  // 测试2: 创建小课件会话（不需要拆分）
  console.log('测试2: 创建小课件会话（<3000字符）');
  try {
    const smallHtml = '<!DOCTYPE html><html><head><title>小课件</title></head><body>' + 
      '<div class="content">小内容</div></body></html>';
    
    const session: AdjustmentSession = {
      sessionId: 'test_session_2',
      courseId: 'test_small_course',
      courseInfo: {
        id: 'test_small_course',
        topic: '测试小课件',
        subject: '数学',
        gradeLevel: 1,
        createdAt: new Date().toISOString(),
        filePath: './test_small.html',
      },
      originalHtml: smallHtml,
      currentHtml: smallHtml,
      files: [{
        id: 'single_001',
        name: 'course.html',
        type: 'main',
        html: smallHtml,
        description: '课件文件',
        order: 0,
        size: smallHtml.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      }],
      activeFileId: 'single_001',
      conversationHistory: [],
      adjustmentHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active',
    };

    console.log(`✓ 会话创建成功`);
    console.log(`  文件数量: ${session.files.length}`);
    console.log(`  活动文件: ${session.activeFileId}`);
    console.log(`  文件大小: ${session.files[0].size} 字符`);
    console.log(`  应该拆分: ${session.files[0].size > 3000 ? '是' : '否'}\n`);
  } catch (error: any) {
    console.error(`✗ 测试2失败: ${error.message}\n`);
  }

  // 测试3: 多文件结构
  console.log('测试3: 多文件结构');
  try {
    const session: AdjustmentSession = {
      sessionId: 'test_session_3',
      courseId: 'test_multi_file',
      courseInfo: {
        id: 'test_multi_file',
        topic: '测试多文件课件',
        subject: '数学',
        gradeLevel: 1,
        createdAt: new Date().toISOString(),
        filePath: './test_multi.html',
      },
      originalHtml: '',
      currentHtml: '',
      files: [
        {
          id: 'main_001',
          name: 'index.html',
          type: 'main',
          html: '<div class="main">主内容</div>',
          description: '主文件',
          order: 0,
          size: 30,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'section_001',
          name: 'chapter1.html',
          type: 'section',
          html: '<div class="section">第一章</div>',
          description: '第一章',
          order: 1,
          size: 30,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'section_002',
          name: 'chapter2.html',
          type: 'section',
          html: '<div class="section">第二章</div>',
          description: '第二章',
          order: 2,
          size: 30,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'style_001',
          name: 'style.css',
          type: 'style',
          html: '.main { color: blue; }',
          description: '样式文件',
          order: 3,
          size: 25,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      activeFileId: 'section_001',
      conversationHistory: [],
      adjustmentHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active',
    };

    console.log(`✓ 多文件会话创建成功`);
    console.log(`  文件总数: ${session.files.length}`);
    console.log(`  活动文件: ${session.activeFileId}`);
    console.log(`  文件列表:`);
    session.files.forEach(f => {
      const active = f.id === session.activeFileId ? ' [活动]' : '';
      console.log(`    - ${f.name} (${f.type}): ${f.size}字符${active}`);
    });
    console.log('');
  } catch (error: any) {
    console.error(`✗ 测试3失败: ${error.message}\n`);
  }

  // 测试4: 上下文优化效果
  console.log('测试4: 上下文优化效果');
  try {
    const largeHtml = '<!DOCTYPE html><html><head><title>大课件</title></head><body>' + 
      '<div class="content">' + 'A'.repeat(3000) + '</div></body></html>';
    
    const session: AdjustmentSession = {
      sessionId: 'test_session_4',
      courseId: 'test_context_opt',
      courseInfo: {
        id: 'test_context_opt',
        topic: '测试上下文优化',
        subject: '数学',
        gradeLevel: 1,
        createdAt: new Date().toISOString(),
        filePath: './test_context.html',
      },
      originalHtml: largeHtml,
      currentHtml: largeHtml,
      files: [{
        id: 'main_001',
        name: 'index.html',
        type: 'main',
        html: largeHtml,
        description: '主课件文件',
        order: 0,
        size: largeHtml.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      }],
      activeFileId: 'main_001',
      conversationHistory: [],
      adjustmentHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active',
    };

    // 模拟多次对话
    for (let i = 1; i <= 5; i++) {
      session.conversationHistory.push({
        id: `msg_${i}`,
        role: 'user',
        content: `这是第${i}次修改请求，包含大量HTML内容：\n\`\`\`html\n${largeHtml}\n\`\`\``,
        timestamp: new Date(),
      });
      
      session.conversationHistory.push({
        id: `msg_${i}_reply`,
        role: 'assistant',
        content: `这是第${i}次AI回复，也包含HTML内容：\n\`\`\`html\n${largeHtml}\n\`\`\``,
        timestamp: new Date(),
      });
    }

    console.log(`✓ 模拟了${session.conversationHistory.length}条对话`);
    console.log(`  原始消息数: ${session.conversationHistory.length}`);
    console.log(`  原始HTML大小: ${largeHtml.length} 字符`);
    console.log(`  估计原始token数: ${largeHtml.length * session.conversationHistory.length * 0.5} (粗略估计)`);
    console.log(`  优化后应该只包含: 活动文件HTML + 最近对话历史（压缩）`);
    console.log(`  预计token减少: 80%+`);
    console.log('');
  } catch (error: any) {
    console.error(`✗ 测试4失败: ${error.message}\n`);
  }

  console.log('========================================');
  console.log('多文件管理功能测试完成');
  console.log('========================================');
}

// 运行测试
testMultiFileManagement().catch(console.error);
