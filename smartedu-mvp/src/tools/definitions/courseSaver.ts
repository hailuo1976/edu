import * as fs from 'fs';
import * as path from 'path';
import { ToolDefinition, ToolContext } from '../types';

export const saveCourseHtmlTool: ToolDefinition = {
  name: 'save_course_html',
  description: '保存生成的课件 HTML 文件',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件名' },
      html_content: { type: 'string', description: 'HTML 内容' },
      course_id: { type: 'string', description: '课程 ID' },
    },
    required: ['filename', 'html_content', 'course_id'],
  },
  async execute(args, ctx: ToolContext) {
    const { filename, html_content, course_id } = args;
    const filePath = path.join(ctx.workDir, filename);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, html_content, 'utf-8');

    return {
      file_path: filePath,
      file_size: html_content.length,
      course_id,
      html: html_content,
    };
  },
};
