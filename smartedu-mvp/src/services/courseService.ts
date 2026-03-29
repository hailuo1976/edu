import * as fs from 'fs';
import * as path from 'path';
import { Course, CourseSection } from '../types/course';
import { CourseToolCallAgent } from './courseToolCallAgent';
import { CourseAgent } from './courseAgent';
import { toolManager } from './toolManager';

export interface GenerateCourseOptions {
  topic: string;
  subject: string;
  gradeLevel: number;
  useTools?: boolean;
  onProgress?: (progress: any) => void;
}

export class CourseService {
  private coursesDir: string;
  private courseToolCallAgent: CourseToolCallAgent;
  private courseAgent: CourseAgent;

  constructor() {
    this.coursesDir = path.join(__dirname, '../../courses');
    this.ensureCoursesDirExists();
    this.courseToolCallAgent = new CourseToolCallAgent({ workDir: this.coursesDir });
    this.courseAgent = new CourseAgent();
  }

  private ensureCoursesDirExists(): void {
    if (!fs.existsSync(this.coursesDir)) {
      fs.mkdirSync(this.coursesDir, { recursive: true });
      console.log(`[CourseService] 创建课程目录: ${this.coursesDir}`);
    }
  }

  async generateCourse(options: GenerateCourseOptions): Promise<Course> {
    const { topic, subject, gradeLevel, useTools = true, onProgress } = options;
    
    console.log(`[CourseService] 生成课程: ${topic} (${subject}, 年级 ${gradeLevel})`);
    
    try {
      if (useTools) {
        return await this.generateCourseWithTools(topic, subject, gradeLevel, onProgress);
      } else {
        return await this.generateCourseWithoutTools(topic, subject, gradeLevel, onProgress);
      }
    } catch (error: any) {
      console.error(`[CourseService] 课程生成失败:`, error);
      
      // 降级到非工具生成模式
      if (useTools) {
        console.log(`[CourseService] 降级到非工具生成模式`);
        return await this.generateCourseWithoutTools(topic, subject, gradeLevel, onProgress);
      }
      
      throw error;
    }
  }

  private async generateCourseWithTools(
    topic: string, 
    subject: string, 
    gradeLevel: number, 
    onProgress?: (progress: any) => void
  ): Promise<Course> {
    console.log(`[CourseService] 使用工具生成课程`);
    
    // 创建新的CourseToolCallAgent实例，传递onProgress回调
    const courseToolCallAgent = new CourseToolCallAgent({
      workDir: this.coursesDir,
      onProgress
    });
    
    const result = await courseToolCallAgent.generate(topic, subject, gradeLevel);
    
    console.log(`[CourseService] 工具生成结果: 成功=${result.success}, 迭代次数=${result.iterations}`);
    
    if (!result.success) {
      console.warn(`[CourseService] 工具生成失败，降级到非工具生成模式`);
      return await this.generateCourseWithoutTools(topic, subject, gradeLevel, onProgress);
    }
    
    const course: Course = {
      id: result.courseId,
      topic,
      subject,
      gradeLevel,
      createdAt: new Date().toISOString(),
      html: result.html,
      toolCalls: result.toolCalls,
      sections: this.extractSectionsFromHtml(result.html),
    };
    
    await this.saveCourse(course);
    return course;
  }

  private async generateCourseWithoutTools(
    topic: string, 
    subject: string, 
    gradeLevel: number, 
    onProgress?: (progress: any) => void
  ): Promise<Course> {
    console.log(`[CourseService] 非工具生成课程`);
    
    const result = await this.courseAgent.generate(topic, onProgress);
    
    const course: Course = {
      id: result.courseId || `course_${Date.now()}`,
      topic,
      subject,
      gradeLevel,
      createdAt: new Date().toISOString(),
      html: result.html,
      toolCalls: [],
      sections: this.extractSectionsFromHtml(result.html),
    };
    
    await this.saveCourse(course);
    return course;
  }

  private extractSectionsFromHtml(html: string): CourseSection[] {
    const sections: CourseSection[] = [];
    
    // 提取概念讲解模块
    const conceptMatch = html.match(/<div[^>]*id=["']concept["'][^>]*>([\s\S]*?)<\/div>/i);
    if (conceptMatch) {
      sections.push({
        id: `section_${Date.now()}_1`,
        type: 'concept',
        title: '概念讲解',
        content: conceptMatch[1],
      });
    }
    
    // 提取图形演示模块
    const demoMatch = html.match(/<div[^>]*id=["']demo["'][^>]*>([\s\S]*?)<\/div>/i);
    if (demoMatch) {
      sections.push({
        id: `section_${Date.now()}_2`,
        type: 'demo',
        title: '图形演示',
        content: demoMatch[1],
      });
    }
    
    // 提取练习测试模块
    const exerciseMatch = html.match(/<div[^>]*id=["']exercise["'][^>]*>([\s\S]*?)<\/div>/i);
    if (exerciseMatch) {
      sections.push({
        id: `section_${Date.now()}_3`,
        type: 'exercise',
        title: '练习测试',
        content: exerciseMatch[1],
      });
    }
    
    return sections;
  }

  private async saveCourse(course: Course): Promise<void> {
    const courseDir = path.join(this.coursesDir, course.id);
    
    if (!fs.existsSync(courseDir)) {
      fs.mkdirSync(courseDir, { recursive: true });
    }
    
    // 保存课程JSON文件
    const courseJsonPath = path.join(courseDir, 'course.json');
    fs.writeFileSync(courseJsonPath, JSON.stringify(course, null, 2));
    
    // 保存HTML文件
    const htmlPath = path.join(courseDir, 'index.html');
    fs.writeFileSync(htmlPath, course.html);
    
    console.log(`[CourseService] 课程保存成功: ${course.id}`);
  }

  async getCourse(id: string): Promise<Course | null> {
    const courseDir = path.join(this.coursesDir, id);
    const courseJsonPath = path.join(courseDir, 'course.json');
    
    if (!fs.existsSync(courseJsonPath)) {
      return null;
    }
    
    const courseJson = fs.readFileSync(courseJsonPath, 'utf8');
    return JSON.parse(courseJson);
  }

  async listCourses(): Promise<Course[]> {
    if (!fs.existsSync(this.coursesDir)) {
      return [];
    }
    
    const courseDirs = fs.readdirSync(this.coursesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    const courses: Course[] = [];
    
    for (const courseId of courseDirs) {
      const course = await this.getCourse(courseId);
      if (course) {
        courses.push(course);
      }
    }
    
    // 按创建时间倒序排序
    return courses.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async deleteCourse(id: string): Promise<boolean> {
    const courseDir = path.join(this.coursesDir, id);
    
    if (!fs.existsSync(courseDir)) {
      return false;
    }
    
    try {
      fs.rmSync(courseDir, { recursive: true, force: true });
      console.log(`[CourseService] 课程删除成功: ${id}`);
      return true;
    } catch (error) {
      console.error(`[CourseService] 课程删除失败:`, error);
      return false;
    }
  }

  async validateCourseHtml(html: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      // 使用工具管理器验证HTML
      const toolCall = {
        id: `validate_${Date.now()}`,
        name: 'validate_html',
        arguments: { html_code: html }
      };
      
      const result = await toolManager.executeTool(toolCall);
      
      if (result.success && result.result) {
        return {
          valid: result.result.valid || false,
          errors: result.result.errors || []
        };
      } else {
        return {
          valid: false,
          errors: [result.error || 'HTML验证失败']
        };
      }
    } catch (error: any) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  async searchEducationalContent(query: string, gradeLevel: number, subject: string): Promise<{ content: string }> {
    try {
      // 使用工具管理器搜索教育内容
      const toolCall = {
        id: `search_${Date.now()}`,
        name: 'search_educational_content',
        arguments: { query, grade_level: gradeLevel, subject }
      };
      
      const result = await toolManager.executeTool(toolCall);
      
      if (result.success && result.result) {
        return {
          content: result.result.content || '未找到相关内容'
        };
      } else {
        return {
          content: result.error || '搜索失败'
        };
      }
    } catch (error: any) {
      return {
        content: `搜索失败: ${error.message}`
      };
    }
  }
}
