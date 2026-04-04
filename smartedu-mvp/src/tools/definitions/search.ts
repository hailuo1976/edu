import axios from 'axios';
import { config } from '../../config';
import { ToolDefinition, ToolContext } from '../types';
import { logger } from '../../utils/logger';

export const searchEducationalContentTool: ToolDefinition = {
  name: 'search_educational_content',
  description: '搜索相关的教育教学内容作为参考',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' },
      grade_level: { type: 'number', description: '年级' },
      subject: { type: 'string', description: '学科' },
    },
    required: ['query'],
  },
  async execute(args, _ctx: ToolContext) {
    const { query, grade_level, subject = '未知学科' } = args;

    // 如果有百度 API Key，使用真实搜索
    if (config.search.baiduApiKey) {
      try {
        const response = await axios.post(
          'https://qianfan.baidubce.com/v2/ai_search/web_search',
          { messages: [{ role: 'user', content: `${query} ${subject} ${grade_level || ''}年级` }] },
          {
            headers: {
              'Authorization': `Bearer ${config.search.baiduApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          }
        );

        const results = response.data.references || [];
        let content = `# ${query}\n\n## 搜索结果\n`;
        for (const r of results) {
          content += `### ${r.title || '无标题'}\n${r.content || '无内容'}\n\n`;
        }

        return { content, query, grade_level, subject, total: results.length };
      } catch (error: any) {
        logger.warn(`搜索 API 调用失败: ${error.message}，使用备用内容`);
      }
    }

    // 备用：内置教学要点
    const fallback: Record<string, string> = {
      '正方形面积': '正方形面积 S = a²，其中 a 为边长。教学重点：理解面积概念，掌握公式，解决实际问题。',
      '分数加减法': '同分母分数相加减，分母不变，分子相加减。异分母需先通分。例：1/2 + 1/4 = 3/4',
      '圆的周长': '圆的周长 C = 2πr 或 C = πd，其中 r 为半径，d 为直径，π≈3.14。',
      '三角形面积': '三角形面积 S = ½ah，其中 a 为底边长，h 为对应的高。',
    };

    const content = fallback[query] || `${query}是${subject}学科中的重要概念。教学重点：理解基本概念，掌握计算方法，解决实际问题。`;

    return { content, query, grade_level, subject, total: 0 };
  },
};
