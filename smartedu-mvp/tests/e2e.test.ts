describe('SmartEdu MVP 全面测试', () => {
  const API_BASE = 'http://localhost:3000';

  describe('API健康检查', () => {
    it('健康检查接口正常', async () => {
      const response = await fetch(`${API_BASE}/api/course/health`);
      const data: any = await response.json();
      expect(data.status).toBe('ok');
    });
  });

  describe('课程生成API', () => {
    it('生成数学课程成功', async () => {
      const response = await fetch(`${API_BASE}/api/course/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_question: '测试问题',
          subject: '数学',
          grade_level: 3
        })
      });
      const data: any = await response.json();
      expect(data.success).toBe(true);
      expect(data.course).toBeDefined();
    });

    it('课程结构完整', async () => {
      const response = await fetch(`${API_BASE}/api/course/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_question: '测试课程结构',
          subject: '数学',
          grade_level: 3
        })
      });
      const data: any = await response.json();
      expect(data.course.metadata).toBeDefined();
      expect(data.course.sections).toBeDefined();
      expect(data.course.knowledge_tags).toBeDefined();
      expect(data.course.sections.length).toBeGreaterThan(0);
    });

    it('课程元信息正确', async () => {
      const response = await fetch(`${API_BASE}/api/course/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_question: '测试元信息',
          subject: '语文',
          grade_level: 4
        })
      });
      const data: any = await response.json();
      expect(data.course.metadata.subject).toBe('语文');
      expect(data.course.metadata.grade).toBe(4);
    });
  });

  describe('课程列表API', () => {
    it('返回课程列表', async () => {
      const response = await fetch(`${API_BASE}/api/course/list`);
      const data: any = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.courses)).toBe(true);
      expect(data.total).toBeGreaterThan(0);
    });
  });

  describe('课程详情API', () => {
    it('获取课程详情成功', async () => {
      const listResponse = await fetch(`${API_BASE}/api/course/list`);
      const listData: any = await listResponse.json();
      const courseId = listData.courses[0];

      const detailResponse = await fetch(`${API_BASE}/api/course/${courseId}`);
      const detailData: any = await detailResponse.json();
      expect(detailData.success).toBe(true);
      expect(detailData.course).toBeDefined();
    });

    it('获取不存在的课程返回错误', async () => {
      const response = await fetch(`${API_BASE}/api/course/NONEXISTENT_ID`);
      const data: any = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('输入验证', () => {
    it('空问题返回错误', async () => {
      const response = await fetch(`${API_BASE}/api/course/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_question: '',
          subject: '数学',
          grade_level: 3
        })
      });
      const data: any = await response.json();
      expect(data.success).toBe(false);
    });

    it('无效年级返回错误', async () => {
      const response = await fetch(`${API_BASE}/api/course/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_question: '测试',
          subject: '数学',
          grade_level: 10
        })
      });
      const data: any = await response.json();
      expect(data.success).toBe(false);
    });
  });
});
