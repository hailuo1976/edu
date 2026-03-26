import { CourseParser } from '../src/utils/parser';

describe('CourseParser', () => {
  describe('parse', () => {
    it('should parse valid course JSON', () => {
      const mockResponse = JSON.stringify({
        course_id: 'TEST_001',
        metadata: {
          subject: '数学',
          grade: 3,
          topic: '分数加减',
          estimated_minutes: 25,
          difficulty: 'medium'
        },
        sections: [
          {
            type: 'intro',
            title: '导入',
            content: '小明把一个苹果切成两半...'
          },
          {
            type: 'concept',
            title: '认识分数',
            content: '分数由分子和分母组成...'
          }
        ],
        knowledge_tags: ['分数', '加减法']
      });

      const result = CourseParser.parse(mockResponse);
      
      expect(result.metadata.subject).toBe('数学');
      expect(result.metadata.grade).toBe(3);
      expect(result.sections.length).toBe(2);
      expect(result.knowledge_tags).toContain('分数');
    });

    it('should handle JSON with markdown code blocks', () => {
      const mockResponse = '```json\n{"metadata": {"subject": "数学", "grade": 3}, "sections": [{"type": "intro", "title": "test", "content": "test"}], "knowledge_tags": []}\n```';
      
      const result = CourseParser.parse(mockResponse);
      
      expect(result.metadata.subject).toBe('数学');
      expect(result.sections.length).toBe(1);
    });

    it('should throw error for invalid JSON', () => {
      const invalidResponse = 'this is not json';
      
      expect(() => CourseParser.parse(invalidResponse)).toThrow();
    });
  });

  describe('generateCourseId', () => {
    it('should generate course id with correct format', () => {
      const id = CourseParser.generateCourseId('fraction');
      
      expect(id).toMatch(/^COURSE_\w+_\d{8}_\d{3}$/);
    });

    it('should handle empty topic', () => {
      const id = CourseParser.generateCourseId();
      
      expect(id).toContain('COURSE_');
    });

    it('should handle Chinese topic', () => {
      const id = CourseParser.generateCourseId('分数加减法');
      
      expect(id).toContain('COURSE_');
      expect(id).toContain('分数');
    });
  });
});

describe('Course API Validation', () => {
  it('should validate required fields', () => {
    const validRequest = {
      user_question: '分数怎么算？',
      subject: '数学',
      grade_level: 3
    };

    expect(validRequest.user_question).toBeDefined();
    expect(validRequest.subject).toBe('数学');
    expect(validRequest.grade_level).toBeGreaterThanOrEqual(1);
    expect(validRequest.grade_level).toBeLessThanOrEqual(6);
  });
});
