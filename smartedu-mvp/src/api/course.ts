import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { CourseService } from '../services/courseService';
import { AgentProgress } from '../agent/core';

const router = Router();
const courseService = new CourseService();

const GenerateSchema = z.object({
  user_question: z.string().min(1, '问题不能为空').max(500, '问题不能超过500字'),
  subject: z.enum(['数学', '语文', '英语', '科学'], {
    errorMap: () => ({ message: '学科必须是: 数学、语文、英语、科学' }),
  }),
  grade_level: z.number().int().min(1).max(6),
  stream: z.boolean().optional(),
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * 将 AgentProgress 转换为前端期望的 SSE 事件格式
 * 前端 handleProgress 期望的字段: stage, message, retryCount, ai_input, ai_output, tool_call, draft_content, promptPreview
 */
function transformProgress(progress: AgentProgress, topic: string): any[] {
  const events: any[] = [];

  switch (progress.stage) {
    case 'streaming':
      events.push({
        stage: 'ai_stream',
        message: progress.message,
        retryCount: progress.iteration,
      });
      break;

    case 'thinking':
      events.push({
        stage: 'api_call',
        message: progress.message,
        retryCount: progress.iteration,
        ai_input: progress.ai_input,
        ai_output: progress.ai_output,
      });
      break;

    case 'tool_call':
      // 发送 AI 输出（工具调用意图）
      events.push({
        stage: 'api_call',
        message: progress.message,
        retryCount: progress.iteration,
        ai_output: `准备调用工具: ${progress.toolCalls?.map(tc => tc.toolName).join(', ')}`,
      });
      // 逐个发送工具调用
      for (const tc of progress.toolCalls || []) {
        events.push({
          stage: 'tool_call',
          message: `调用 ${tc.toolName}`,
          retryCount: progress.iteration,
          tool_call: {
            name: tc.toolName,
            arguments: tc.args,
            success: undefined, // 还在执行中
          },
        });
      }
      break;

    case 'tool_result':
      // 逐个发送工具结果
      for (const tr of progress.toolResults || []) {
        events.push({
          stage: 'tool_result',
          message: `${tr.toolName}: ${tr.success ? '成功' : '失败'}`,
          retryCount: progress.iteration,
          tool_call: {
            name: tr.toolName,
            success: tr.success,
            result: summarizeResult(tr),
            error: tr.error,
          },
        });

        // 提取草稿内容（SVG/HTML）
        const draft = extractDraft(tr);
        if (draft) {
          events.push({
            stage: 'tool_result',
            message: `生成内容: ${tr.toolName}`,
            draft_content: draft,
          });
        }
      }
      break;

    case 'complete':
      events.push({
        stage: progress.message.includes('退出') ? 'complete' : 'complete',
        message: progress.message,
        retryCount: progress.iteration,
      });
      break;

    case 'error':
      events.push({
        stage: 'error',
        message: progress.message,
        retryCount: progress.iteration,
      });
      break;
  }

  return events;
}

/** 截断工具结果用于前端展示 */
function summarizeResult(tr: any): any {
  if (!tr.result) return null;
  // 对大结果只返回摘要
  const str = JSON.stringify(tr.result);
  if (str.length > 500) {
    return { summary: `${tr.toolName} 执行成功`, size: str.length };
  }
  return tr.result;
}

/** 从工具结果中提取可展示的草稿内容 */
function extractDraft(tr: any): { type: string; title: string; content: string } | null {
  if (!tr.success || !tr.result) return null;

  const name = tr.toolName;
  const result = tr.result;

  if (name === 'generate_svg' || name === 'generate_svg_diagram') {
    const svg = result.svg || result.html || result.content || '';
    if (svg) return { type: 'svg', title: 'SVG 图形', content: svg };
  }

  if (name === 'generate_html_component') {
    const html = result.html || result.content || '';
    if (html) return { type: 'html', title: 'HTML 组件', content: html };
  }

  if (name === 'search_educational_content') {
    const text = result.results || result.content || '';
    if (text) return { type: 'search', title: '搜索结果', content: typeof text === 'string' ? text : JSON.stringify(text, null, 2) };
  }

  if (name === 'save_course_html') {
    return { type: 'html', title: '保存课件', content: `课件已保存 (${result.content_length || 0} 字符)` };
  }

  return null;
}

router.post('/generate', async (req: Request, res: Response) => {
  const useStream = req.body.stream === true || req.query.stream === 'true';

  if (useStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }

  try {
    const validated = GenerateSchema.parse(req.body);

    const startTime = Date.now();

    const sendEvent = (data: any) => {
      if (useStream && res.writable) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    // 初始事件：提示词预览
    sendEvent({
      stage: 'prompt',
      message: '正在准备生成课件...',
      promptPreview: `主题: ${validated.user_question}\n学科: ${validated.subject}\n年级: ${validated.grade_level}`,
    });

    // 包装 onProgress，转换为前端格式
    const onProgress = (progress: AgentProgress) => {
      const events = transformProgress(progress, validated.user_question);
      for (const event of events) {
        sendEvent(event);
      }
    };

    const course = await courseService.generateCourse({
      topic: validated.user_question,
      subject: validated.subject,
      gradeLevel: validated.grade_level,
      onProgress,
    });

    const totalDuration = Date.now() - startTime;

    sendEvent({
      stage: 'complete',
      message: '生成完成!',
      timestamp: Date.now(),
      totalDuration,
      course_id: course.id,
      html_content: course.html,
      retryCount: course.toolCalls?.length || 0,
    });

    if (useStream) {
      res.end();
    } else {
      res.json({
        success: true,
        course_id: course.id,
        html_content: course.html,
      });
    }
  } catch (error: any) {
    if (useStream && res.writable) {
      res.write(`data: ${JSON.stringify({ stage: 'error', message: error.message, timestamp: Date.now() })}\n\n`);
      res.end();
    } else {
      res.status(400).json({ success: false, error: error.message });
    }
  }
});

router.get('/list', async (_req: Request, res: Response) => {
  try {
    const courses = await courseService.listCourses();
    res.json({ success: true, courses, total: courses.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:courseId', async (req: Request, res: Response) => {
  try {
    const course = await courseService.getCourse(req.params.courseId);
    if (!course) {
      res.status(404).json({ success: false, error: '课程不存在' });
      return;
    }
    res.json({ success: true, course });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
