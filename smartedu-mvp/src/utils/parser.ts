import { CourseContent } from '../types/course';

export class CourseParser {
  static parse(rawResponse: string): CourseContent {
    let jsonStr = rawResponse.trim();
    
    jsonStr = jsonStr.replace(/^```json\s*/i, '');
    jsonStr = jsonStr.replace(/^```\s*/i, '');
    jsonStr = jsonStr.replace(/\s*```$/i, '');
    
    try {
      const parsed = JSON.parse(jsonStr);
      return this.validateAndNormalize(parsed);
    } catch (error: any) {
      console.error('JSON解析失败:', error.message);
      console.error('原始响应:', jsonStr.substring(0, 500));
      throw new Error(`课程JSON解析失败: ${error.message}`);
    }
  }

  private static validateAndNormalize(data: any): CourseContent {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的课程数据格式');
    }

    const course: CourseContent = {
      course_id: data.course_id || this.generateCourseId(data.metadata?.topic),
      metadata: {
        subject: data.metadata?.subject || '未知',
        grade: data.metadata?.grade || 3,
        topic: data.metadata?.topic || '未知主题',
        estimated_minutes: data.metadata?.estimated_minutes || 25,
        difficulty: data.metadata?.difficulty || 'medium',
      },
      sections: Array.isArray(data.sections) ? data.sections : [],
      knowledge_tags: Array.isArray(data.knowledge_tags) ? data.knowledge_tags : [],
    };

    if (course.sections.length === 0) {
      throw new Error('课程内容为空');
    }

    course.sections = course.sections.map((section, index) => ({
      type: this.normalizeSectionType(section.type) || 'concept',
      title: section.title || `第${index + 1}节`,
      content: section.content || '',
    }));

    return course;
  }

  private static normalizeSectionType(type: string | undefined): 
    'intro' | 'concept' | 'example' | 'exercise' | 'summary' | undefined {
    const typeMap: Record<string, 'intro' | 'concept' | 'example' | 'exercise' | 'summary'> = {
      'intro': 'intro',
      'introduction': 'intro',
      '导入': 'intro',
      '概念': 'concept',
      'concept': 'concept',
      '讲解': 'concept',
      'example': 'example',
      'examples': 'example',
      '实例': 'example',
      '练习': 'exercise',
      'exercise': 'exercise',
      '总结': 'summary',
      'summary': 'summary',
      '小结': 'summary',
    };
    return type ? typeMap[type.toLowerCase()] || undefined : undefined;
  }

  static generateCourseId(topic?: string): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const random = String(Math.floor(Math.random() * 999)).padStart(3, '0');
    const topicCode = topic 
      ? topic.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 10)
      : 'COURSE';
    return `COURSE_${topicCode}_${dateStr}_${random}`;
  }
}
