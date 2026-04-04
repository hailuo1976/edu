import { ToolDefinition, ToolContext } from '../types';

export const generateHtmlComponentTool: ToolDefinition = {
  name: 'generate_html_component',
  description: '生成 HTML 组件代码，如公式卡片、步骤展示、练习题等',
  parameters: {
    type: 'object',
    properties: {
      component_type: { type: 'string', description: '组件类型: formula, steps, exercise 等' },
      content: { type: 'string', description: '组件内容' },
      style: { type: 'string', description: '样式描述' },
    },
    required: ['component_type', 'content'],
  },
  async execute(args, _ctx: ToolContext) {
    const { component_type, content, style } = args;
    const css = style || '';
    let html = '';

    switch (component_type) {
      case 'formula':
        html = `<div class="formula-box" style="${css}">${content}</div>`;
        break;
      case 'steps': {
        const steps = content.split('\n').filter((s: string) => s.trim());
        html = `<div class="steps-container" style="${css}">${steps.map((step: string, i: number) => `<div class="step"><div class="step-num">${i + 1}</div><div class="step-content">${step}</div></div>`).join('')}</div>`;
        break;
      }
      case 'exercise':
        html = `<div class="exercise-item" style="${css}"><p>${content}</p><input type="text" class="exercise-input"><button class="btn-check">检查</button><div class="feedback"></div></div>`;
        break;
      default:
        html = `<div class="component" style="${css}">${content}</div>`;
    }

    return { html_content: html, component_type };
  },
};
