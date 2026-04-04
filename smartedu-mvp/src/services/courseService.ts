import * as fs from 'fs';
import * as path from 'path';
import { generateCourse as agentGenerateCourse } from '../agent/strategies/courseGeneration';
import type { CourseGenerationResult } from '../agent/strategies/courseGeneration';
import { logger } from '../utils/logger';
import { config } from '../config';

// --- Types ---
export interface Course {
  id: string;
  topic: string;
  subject: string;
  gradeLevel: number;
  createdAt: string;
  html: string;
  toolCalls: any[];
  sections: CourseSection[];
}

export interface CourseSection {
  id?: string;
  type: 'concept' | 'demo' | 'exercise' | string;
  title: string;
  content: string;
}

export interface GenerateOptions {
  topic: string;
  subject: string;
  gradeLevel: number;
  useTools?: boolean;
  onProgress?: (progress: any) => void;
}

// --- Course Storage ---
const COURSES_DIR = path.resolve(config.paths.courses);

function ensureCoursesDir() {
  if (!fs.existsSync(COURSES_DIR)) {
    fs.mkdirSync(COURSES_DIR, { recursive: true });
  }
}
ensureCoursesDir();

function saveCourse(course: Course): void {
  const dir = path.join(COURSES_DIR, course.id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'course.json'), JSON.stringify(course, null, 2));
  fs.writeFileSync(path.join(dir, 'index.html'), course.html);
  logger.info(`课程保存: ${course.id}`);
}

function loadCourse(id: string): Course | null {
  const p = path.join(COURSES_DIR, id, 'course.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function extractSections(html: string): CourseSection[] {
  const sections: CourseSection[] = [];
  const patterns = [
    { id: 'concept', type: 'concept' as const, title: '概念讲解' },
    { id: 'demo', type: 'demo' as const, title: '图形演示' },
    { id: 'exercise', type: 'exercise' as const, title: '练习测试' },
  ];
  for (const p of patterns) {
    const match = html.match(new RegExp(`<div[^>]*id=["']${p.id}["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i'));
    if (match) {
      sections.push({ id: `section_${Date.now()}_${p.type}`, type: p.type, title: p.title, content: match[1] });
    }
  }
  return sections;
}

// --- Public API ---

export class CourseService {
  async generateCourse(options: GenerateOptions): Promise<Course> {
    const { topic, subject, gradeLevel, onProgress } = options;

    logger.info(`生成课程: ${topic} (${subject}, ${gradeLevel}年级)`);

    try {
      const result: CourseGenerationResult = await agentGenerateCourse(topic, subject, gradeLevel, {
        workDir: COURSES_DIR,
        onProgress,
      });

      const course: Course = {
        id: result.courseId,
        topic,
        subject,
        gradeLevel,
        createdAt: new Date().toISOString(),
        html: result.html,
        toolCalls: result.toolResults,
        sections: extractSections(result.html),
      };

      saveCourse(course);
      return course;
    } catch (error: any) {
      logger.error(`课程生成失败: ${error.message}`);
      throw error;
    }
  }

  async getCourse(id: string): Promise<Course | null> {
    return loadCourse(id);
  }

  async listCourses(): Promise<Course[]> {
    if (!fs.existsSync(COURSES_DIR)) return [];
    const dirs = fs.readdirSync(COURSES_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    const courses: Course[] = [];
    for (const id of dirs) {
      const c = loadCourse(id);
      if (c) courses.push(c);
    }
    return courses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

}
