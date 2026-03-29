import { AgentConfig } from '../types';

/**
 * 默认代理配置
 */
export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'course-generator',
    name: '课程生成代理',
    promptId: 'course-generation',
    toolIds: [
      'generate-svg',
      'generate-html-component',
      'validate-html',
      'search-educational-content',
      'save-course-html'
    ],
    description: '用于生成小学数学课件的AI代理',
    tags: ['课程生成', '数学', '小学'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: 'system'
  },
  {
    id: 'course-reviewer',
    name: '课程审查代理',
    promptId: 'course-refinement',
    toolIds: [
      'validate-html'
    ],
    description: '用于审查和优化课件质量的AI代理',
    tags: ['课程审查', '质量控制', '优化'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: 'system'
  }
];
