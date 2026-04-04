import { ToolDefinition, ToolContext } from '../types';

export const validateHtmlTool: ToolDefinition = {
  name: 'validate_html',
  description: '验证 HTML 代码的有效性和完整性',
  parameters: {
    type: 'object',
    properties: {
      html_code: { type: 'string', description: '要验证的 HTML 代码' },
    },
    required: ['html_code'],
  },
  async execute(args, _ctx: ToolContext) {
    const { html_code } = args;
    const errors: string[] = [];

    const checks = [
      ['<!DOCTYPE html>', '缺少 DOCTYPE 声明'],
      ['<html', '缺少 html 标签'],
      ['</html>', '缺少 html 结束标签'],
      ['<head', '缺少 head 标签'],
      ['</head>', '缺少 head 结束标签'],
      ['<body', '缺少 body 标签'],
      ['</body>', '缺少 body 结束标签'],
      ['id="concept"', '缺少概念讲解模块 (id="concept")'],
      ['id="demo"', '缺少图形演示模块 (id="demo")'],
      ['id="exercise"', '缺少练习测试模块 (id="exercise")'],
    ] as const;

    for (const [token, msg] of checks) {
      if (!html_code.includes(token)) errors.push(msg);
    }

    return { valid: errors.length === 0, errors, html_length: html_code.length };
  },
};
