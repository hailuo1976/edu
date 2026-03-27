import dotenv from 'dotenv';
import path from 'path';
import { CourseService } from './src/services/courseService';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '.env') });

async function testCourseGeneration() {
  console.log('开始测试AI课件生成...');
  
  const courseService = new CourseService();
  
  try {
    console.log('测试参数:');
    console.log('- 主题: 正方形面积');
    console.log('- 学科: 数学');
    console.log('- 年级: 3');
    console.log('- 使用工具: 是');
    
    const startTime = Date.now();
    
    const course = await courseService.generateCourse({
      topic: '正方形面积',
      subject: '数学',
      gradeLevel: 3,
      useTools: true,
      onProgress: (progress: any) => {
        console.log(`[${progress.stage}] ${progress.message}`);
        if (progress.toolCalls) {
          progress.toolCalls.forEach((tc: any, index: number) => {
            console.log(`  工具 ${index + 1}: ${tc.name}`);
          });
        }
      }
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('\n生成结果:');
    console.log(`- 课程ID: ${course.id}`);
    console.log(`- 主题: ${course.topic}`);
    console.log(`- 学科: ${course.subject}`);
    console.log(`- 年级: ${course.gradeLevel}`);
    console.log(`- 生成时间: ${duration}ms`);
    console.log(`- 工具调用次数: ${course.toolCalls.length}`);
    console.log(`- 生成状态: ${course.toolCalls.length > 0 ? '使用工具生成' : '非工具生成'}`);
    
    // 验证生成的HTML是否包含必需的模块
    const hasConcept = course.html.includes('id="concept"');
    const hasDemo = course.html.includes('id="demo"');
    const hasExercise = course.html.includes('id="exercise"');
    
    console.log('\nHTML验证:');
    console.log(`- 概念讲解模块: ${hasConcept ? '✓' : '✗'}`);
    console.log(`- 图形演示模块: ${hasDemo ? '✓' : '✗'}`);
    console.log(`- 练习测试模块: ${hasExercise ? '✓' : '✗'}`);
    
    // 保存测试结果
    const fs = require('fs');
    const path = require('path');
    const testResultPath = path.join(__dirname, 'test-results', `${course.id}.html`);
    
    if (!fs.existsSync(path.join(__dirname, 'test-results'))) {
      fs.mkdirSync(path.join(__dirname, 'test-results'), { recursive: true });
    }
    
    fs.writeFileSync(testResultPath, course.html);
    console.log(`\n测试结果已保存到: ${testResultPath}`);
    
    console.log('\n测试完成!');
    
  } catch (error: any) {
    console.error('测试失败:', error.message);
  }
}

testCourseGeneration();
