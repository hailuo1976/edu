import { ToolConfig } from '../types';

/**
 * 默认工具配置
 */
export const DEFAULT_TOOLS: ToolConfig[] = [
  {
    id: 'generate-svg',
    name: '生成SVG图形',
    version: '1.0.0',
    tool: {
      name: 'generate_svg',
      description: '生成SVG矢量图形，用于可视化数学概念。返回SVG字符串。',
      inputSchema: {
        type: 'object',
        properties: {
          shape_type: {
            type: 'string',
            description: '图形类型: square(正方形), circle(圆形), triangle(三角形), rectangle(长方形), trapezoid(梯形)'
          },
          dimensions: {
            type: 'object',
            description: '图形的尺寸参数',
            default: {}
          },
          label: {
            type: 'string',
            description: '图形上的标签文字'
          },
          style: {
            type: 'string',
            description: '图形样式描述'
          }
        },
        required: ['shape_type', 'dimensions']
      }
    },
    description: '用于生成数学概念的SVG图形',
    tags: ['图形', '可视化', 'SVG'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: 'system'
  },
  {
    id: 'generate-html-component',
    name: '生成HTML组件',
    version: '1.0.0',
    tool: {
      name: 'generate_html_component',
      description: '生成HTML组件代码，如公式卡片、步骤展示、练习题等。',
      inputSchema: {
        type: 'object',
        properties: {
          component_type: {
            type: 'string',
            description: '组件类型: formula_card(公式卡片), step_list(步骤列表), exercise(练习题), concept_box(概念框)'
          },
          content: {
            type: 'object',
            description: '组件内容',
            default: {}
          },
          style: {
            type: 'string',
            description: '组件样式描述'
          }
        },
        required: ['component_type', 'content']
      }
    },
    description: '用于生成课件中的HTML组件',
    tags: ['HTML', '组件', '界面'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: 'system'
  },
  {
    id: 'validate-html',
    name: '验证HTML',
    version: '1.0.0',
    tool: {
      name: 'validate_html',
      description: '验证HTML代码的有效性和完整性。',
      inputSchema: {
        type: 'object',
        properties: {
          html_code: {
            type: 'string',
            description: '要验证的HTML代码'
          }
        },
        required: ['html_code']
      }
    },
    description: '用于验证生成的HTML代码',
    tags: ['验证', 'HTML', '质量控制'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: 'system'
  },
  {
    id: 'search-educational-content',
    name: '搜索教育内容',
    version: '1.0.0',
    tool: {
      name: 'search_educational_content',
      description: '搜索相关的教育教学内容作为参考。',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词'
          },
          grade_level: {
            type: 'number',
            description: '年级(1-6)'
          },
          subject: {
            type: 'string',
            description: '学科: 数学、语文、英语、科学'
          }
        },
        required: ['query']
      }
    },
    description: '用于搜索相关的教育教学内容',
    tags: ['搜索', '教育内容', '参考资料'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: 'system'
  },
  {
    id: 'save-course-html',
    name: '保存课程HTML',
    version: '1.0.0',
    tool: {
      name: 'save_course_html',
      description: '保存生成的课件HTML文件到指定目录。',
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: '文件名(不含路径)'
          },
          html_content: {
            type: 'string',
            description: 'HTML内容'
          },
          course_id: {
            type: 'string',
            description: '课程ID'
          }
        },
        required: ['filename', 'html_content']
      }
    },
    description: '用于保存生成的课件HTML文件',
    tags: ['保存', '文件', '课程'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: 'system'
  }
];
