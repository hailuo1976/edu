import { ToolDefinition, ToolCall, ToolResult, ToolContext } from './types';
import { toolRegistry } from './registry';
import { retry } from '../utils/retry';
import { logger } from '../utils/logger';

/**
 * 执行单个工具调用
 */
async function executeOne(
  tool: ToolDefinition,
  args: Record<string, any>,
  ctx: ToolContext
): Promise<{ result?: any; error?: string }> {
  try {
    const result = await tool.execute(args, ctx);
    return { result };
  } catch (error: any) {
    return { error: error.message || String(error) };
  }
}

/**
 * 执行一组工具调用
 */
export async function executeTools(
  toolCalls: ToolCall[],
  ctx: ToolContext,
  maxRetries = 1
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  for (const tc of toolCalls) {
    const tool = toolRegistry.get(tc.name);
    const startTime = Date.now();

    if (!tool) {
      results.push({
        toolCallId: tc.id,
        toolName: tc.name,
        success: false,
        error: `未知工具: ${tc.name}`,
      });
      continue;
    }

    // 参数验证
    const required = tool.parameters.required || [];
    const missing = required.filter(p => tc.arguments[p] === undefined || tc.arguments[p] === null);
    if (missing.length > 0) {
      results.push({
        toolCallId: tc.id,
        toolName: tc.name,
        success: false,
        error: `缺少必填参数: ${missing.join(', ')}`,
      });
      continue;
    }

    // 执行（带重试）
    const argsPreview = JSON.stringify(tc.arguments);
    logger.info(`工具调用: ${tc.name}, 参数: ${argsPreview.length > 300 ? argsPreview.substring(0, 300) + '...' : argsPreview}`);
    try {
      const { result, error } = await retry(
        () => executeOne(tool, tc.arguments, ctx),
        { maxAttempts: maxRetries, delayMs: 1000 }
      );

      const duration = Date.now() - startTime;
      results.push({
        toolCallId: tc.id,
        toolName: tc.name,
        success: !error,
        result: result,
        error: error,
        duration,
      });

      logger.info(`工具 ${tc.name}: ${error ? '失败 (' + error + ')' : '成功'} (${duration}ms)`);
      if (result) {
        const resultStr = JSON.stringify(result);
        logger.debug(`工具 ${tc.name} 结果: ${resultStr.length > 1000 ? resultStr.substring(0, 1000) + `...[${resultStr.length}字符]` : resultStr}`);
      }
    } catch (error: any) {
      results.push({
        toolCallId: tc.id,
        toolName: tc.name,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
    }
  }

  return results;
}
