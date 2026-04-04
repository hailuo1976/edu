// 工具注册入口 - 导入所有工具并注册

import { toolRegistry } from './registry';
import { allFileOpsTools } from './definitions/fileOps';
import { generateSvgTool, generateSvgDiagramTool } from './definitions/svg';
import { generateHtmlComponentTool } from './definitions/htmlComponent';
import { validateHtmlTool } from './definitions/htmlValidator';
import { searchEducationalContentTool } from './definitions/search';
import { saveCourseHtmlTool } from './definitions/courseSaver';

export { toolRegistry } from './registry';
export { executeTools } from './executor';
export type { ToolDefinition, ToolCall, ToolResult, ToolContext } from './types';
export { toOpenAITools } from './types';

/** 注册所有默认工具 */
export function registerAllTools(): void {
  toolRegistry.registerMany(allFileOpsTools);
  toolRegistry.register(generateSvgTool);
  toolRegistry.register(generateSvgDiagramTool);
  toolRegistry.register(generateHtmlComponentTool);
  toolRegistry.register(validateHtmlTool);
  toolRegistry.register(searchEducationalContentTool);
  toolRegistry.register(saveCourseHtmlTool);
}

// 自动注册
registerAllTools();
