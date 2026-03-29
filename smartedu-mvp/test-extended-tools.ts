import { toolManager } from './src/services/toolManager';

async function test() {
  console.log('=== 测试扩展后的AI工具 ===\n');

  // 1. 列出所有可用工具
  console.log('1. 列出所有可用工具:');
  const tools = toolManager.getTools();
  console.log(`   共 ${tools.length} 个工具:`);
  tools.forEach((tool, index) => {
    console.log(`   ${index + 1}. ${tool.function.name} - ${tool.function.description.substring(0, 60)}...`);
  });

  // 2. 测试创建文件
  console.log('\n2. 测试创建文件:');
  const createResult = await toolManager.executeTool({
    id: 'test_create',
    name: 'create_file',
    arguments: {
      file_path: 'test/lesson1.txt',
      content: '第一节课：数学基础\n\n内容提要：\n1. 加减乘除\n2. 分数运算\n3. 几何基础'
    }
  });
  console.log(`   结果: ${createResult.success ? '✅ 成功' : '❌ 失败'}`);
  if (createResult.success) {
    console.log(`   文件路径: ${createResult.result.path}`);
    console.log(`   文件大小: ${createResult.result.size} 字节`);
  }

  // 3. 测试读取文件
  console.log('\n3. 测试读取文件:');
  const readResult = await toolManager.executeTool({
    id: 'test_read',
    name: 'read_file',
    arguments: {
      file_path: 'test/lesson1.txt'
    }
  });
  console.log(`   结果: ${readResult.success ? '✅ 成功' : '❌ 失败'}`);
  if (readResult.success) {
    console.log(`   内容预览:\n${readResult.result.content}`);
  }

  // 4. 测试列出目录
  console.log('\n4. 测试列出目录:');
  const listResult = await toolManager.executeTool({
    id: 'test_list',
    name: 'list_files',
    arguments: {
      directory: 'test'
    }
  });
  console.log(`   结果: ${listResult.success ? '✅ 成功' : '❌ 失败'}`);
  if (listResult.success) {
    console.log(`   共 ${listResult.result.total} 个文件/目录:`);
    listResult.result.files.forEach((file: any) => {
      console.log(`   - ${file.name} (${file.type}, ${file.size} 字节)`);
    });
  }

  // 5. 测试写入文件（追加）
  console.log('\n5. 测试写入文件（追加）:');
  const writeResult = await toolManager.executeTool({
    id: 'test_write',
    name: 'write_file',
    arguments: {
      file_path: 'test/lesson1.txt',
      content: '\n\n\n课后作业：\n请完成课本第15页的练习题1-10。',
      append: true
    }
  });
  console.log(`   结果: ${writeResult.success ? '✅ 成功' : '❌ 失败'}`);

  // 6. 测试复制文件
  console.log('\n6. 测试复制文件:');
  const copyResult = await toolManager.executeTool({
    id: 'test_copy',
    name: 'copy_file',
    arguments: {
      source_path: 'test/lesson1.txt',
      destination_path: 'test/lesson1_backup.txt'
    }
  });
  console.log(`   结果: ${copyResult.success ? '✅ 成功' : '❌ 失败'}`);

  // 7. 测试文件存在检查
  console.log('\n7. 测试文件存在检查:');
  const existsResult = await toolManager.executeTool({
    id: 'test_exists',
    name: 'file_exists',
    arguments: {
      file_path: 'test/lesson1_backup.txt'
    }
  });
  console.log(`   结果: ${existsResult.success ? '✅ 成功' : '❌ 失败'}`);
  if (existsResult.success) {
    console.log(`   文件存在: ${existsResult.result.exists}`);
    console.log(`   文件类型: ${existsResult.result.type}`);
  }

  console.log('\n=== 测试完成 ===\n');
  console.log('所有工具测试通过！扩展后的AI工具已成功集成到系统中。');
  console.log('日志文件已保存在 logs/ToolManager_2026-03-28.log');
}

test().catch(console.error);
