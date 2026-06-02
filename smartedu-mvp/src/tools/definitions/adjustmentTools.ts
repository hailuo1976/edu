import { ToolDefinition, ToolContext } from '../types';
import { AdjustmentSession, LogMessage } from '../../types/adjustment';

export interface AdjustmentToolCallbacks {
  onProgress?: (progress: any) => void;
  onLog?: (log: LogMessage) => void;
}

export interface AdjustmentToolsResult {
  tools: ToolDefinition[];
  getCapturedHtml: () => string;
}

/**
 * 创建课件调整专用工具集（闭包工厂）
 * 捕获 session 引用，工具执行时直接操作 session.files
 */
export function createAdjustmentTools(
  session: AdjustmentSession,
  mergeFilesToHtml: (files: any[]) => string,
  _callbacks?: AdjustmentToolCallbacks,
): AdjustmentToolsResult {
  let capturedHtml = '';

  const saveCourseHtmlTool: ToolDefinition = {
    name: 'save_course_html',
    description: '保存修改后的完整HTML课件内容。修改完成后必须调用此工具保存结果。',
    parameters: {
      type: 'object',
      properties: {
        html_content: {
          type: 'string',
          description: '完整的HTML课件内容',
        },
        changes_summary: {
          type: 'string',
          description: '修改内容摘要',
        },
      },
      required: ['html_content'],
    },
    async execute(args: any, _ctx: ToolContext) {
      capturedHtml = args.html_content;
      return {
        success: true,
        message: 'HTML内容已保存',
        content_length: args.html_content.length,
      };
    },
  };

  const saveFileTool: ToolDefinition = {
    name: 'save_file',
    description: '保存或更新课件中的一个文件。用于多文件管理场景。',
    parameters: {
      type: 'object',
      properties: {
        file_id: { type: 'string', description: '文件ID（更新已有文件时传入）' },
        file_name: { type: 'string', description: '文件名' },
        file_type: { type: 'string', description: '文件类型', enum: ['main', 'section', 'style', 'script'] },
        html_content: { type: 'string', description: '文件HTML内容' },
        description: { type: 'string', description: '文件描述' },
        order: { type: 'number', description: '文件排序' },
      },
      required: ['file_name', 'file_type', 'html_content'],
    },
    async execute(args: any, _ctx: ToolContext) {
      const fileId = args.file_id || `file_${Date.now()}`;
      const fileObj = {
        id: fileId,
        name: args.file_name,
        type: args.file_type,
        html: args.html_content,
        description: args.description || '',
        order: args.order || 0,
        size: args.html_content.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const existingIndex = session.files.findIndex(f => f.id === fileId);
      if (existingIndex >= 0) {
        session.files[existingIndex] = fileObj;
      } else {
        session.files.push(fileObj);
      }

      session.activeFileId = fileId;
      capturedHtml = mergeFilesToHtml(session.files);

      return {
        success: true,
        file_id: fileId,
        file_name: args.file_name,
        message: `文件 ${args.file_name} 保存成功`,
        content_length: args.html_content.length,
      };
    },
  };

  const splitFileTool: ToolDefinition = {
    name: 'split_file',
    description: '将一个大文件拆分为多个小文件。',
    parameters: {
      type: 'object',
      properties: {
        file_id: { type: 'string', description: '要拆分的文件ID' },
        split_points: { type: 'array', description: '拆分点列表', items: { type: 'string' } },
        strategy: { type: 'string', description: '拆分策略（如 by_section, by_topic）' },
      },
      required: ['file_id', 'split_points'],
    },
    async execute(args: any, _ctx: ToolContext) {
      const fileToSplit = session.files.find(f => f.id === args.file_id);
      if (!fileToSplit) {
        return { success: false, error: `文件不存在: ${args.file_id}` };
      }

      const newFiles = args.split_points.map((point: string, index: number) => ({
        id: `file_${Date.now()}_${index}`,
        name: `${point}.html`,
        type: 'section' as const,
        html: `<!-- ${point} 的内容 -->\n<div class="section" id="${point}">\n  <!-- 从原文件拆分的内容 -->\n</div>`,
        description: `拆分出的文件: ${point}`,
        order: index + 1,
        size: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      session.files = session.files.filter(f => f.id !== args.file_id);
      session.files.push(...newFiles);
      session.activeFileId = newFiles[0].id;
      capturedHtml = mergeFilesToHtml(session.files);

      return {
        success: true,
        original_file_id: args.file_id,
        new_files: newFiles.map((f: any) => ({ id: f.id, name: f.name })),
        message: `文件已成功拆分为 ${newFiles.length} 个小文件`,
      };
    },
  };

  const mergeFilesTool: ToolDefinition = {
    name: 'merge_files',
    description: '将多个文件合并为一个文件。',
    parameters: {
      type: 'object',
      properties: {
        file_ids: {
          type: 'array',
          description: '要合并的文件ID列表',
          items: { type: 'string' },
        },
        output_name: { type: 'string', description: '合并后的文件名' },
      },
      required: ['file_ids', 'output_name'],
    },
    async execute(args: any, _ctx: ToolContext) {
      const missing = args.file_ids.filter((id: string) => !session.files.find(f => f.id === id));
      if (missing.length > 0) {
        return { success: false, error: `以下文件不存在: ${missing.join(', ')}` };
      }

      const filesToMerge = args.file_ids.map((id: string) => session.files.find(f => f.id === id));
      const mergedHtml = mergeFilesToHtml(filesToMerge);

      const mergedFile = {
        id: `merged_${Date.now()}`,
        name: args.output_name,
        type: 'main' as const,
        html: mergedHtml,
        description: `合并 ${args.file_ids.length} 个文件的结果`,
        order: 0,
        size: mergedHtml.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      session.files = session.files.filter(f => !args.file_ids.includes(f.id));
      session.files.push(mergedFile);
      session.activeFileId = mergedFile.id;
      capturedHtml = mergedHtml;

      return {
        success: true,
        merged_file_id: mergedFile.id,
        message: `${args.file_ids.length} 个文件已成功合并为 ${args.output_name}`,
      };
    },
  };

  const listSessionFilesTool: ToolDefinition = {
    name: 'list_session_files',
    description: '列出当前课件会话中的所有文件。',
    parameters: {
      type: 'object',
      properties: {
        file_type: {
          type: 'string',
          description: '筛选文件类型（all/main/section/style/script）',
          enum: ['all', 'main', 'section', 'style', 'script'],
        },
      },
      required: [],
    },
    async execute(args: any, _ctx: ToolContext) {
      let filtered = session.files;
      if (args.file_type && args.file_type !== 'all') {
        filtered = session.files.filter(f => f.type === args.file_type);
      }
      return {
        success: true,
        files: filtered.map(f => ({
          id: f.id,
          name: f.name,
          type: f.type,
          size: f.size,
          description: f.description,
        })),
        total: filtered.length,
      };
    },
  };

  return {
    tools: [saveCourseHtmlTool, saveFileTool, splitFileTool, mergeFilesTool, listSessionFilesTool],
    getCapturedHtml: () => capturedHtml,
  };
}
