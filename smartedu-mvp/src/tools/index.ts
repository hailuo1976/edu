// 工具注册入口 - 导入所有工具并注册

import { toolRegistry } from './registry';
import { allFileOpsTools } from './definitions/fileOps';
import { validateHtmlTool } from './definitions/htmlValidator';
import { searchEducationalContentTool } from './definitions/search';
import { saveCourseHtmlTool } from './definitions/courseSaver';

export { toolRegistry } from './registry';
export { executeTools } from './executor';
export type { ToolDefinition, ToolCall, ToolResult, ToolContext } from './types';
export { toOpenAITools } from './types';

/** 注册所有默认工具 */
export function registerAllTools(): void {
  // 文件操作工具（用于渐进式构建）
  toolRegistry.registerMany(allFileOpsTools);

  // 业务工具
  toolRegistry.register(validateHtmlTool);
  toolRegistry.register(searchEducationalContentTool);
  toolRegistry.register(saveCourseHtmlTool);

  // 注：以下工具已废弃，不再注册（减少 prompt 噪音）：
  // - generateSvgTool / generateSvgDiagramTool: 只有死模板，AI 可直接生成 SVG
  // - generateHtmlComponentTool: 返回零碎片段，不适合渐进式构建
}

// 自动注册
registerAllTools();
