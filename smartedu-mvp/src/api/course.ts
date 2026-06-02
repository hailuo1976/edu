import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { CourseService } from '../services/courseService';

type AnyProgress = Record<string, any>;

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
 * 将生成进度转换为前端 SSE 事件
 * 新版 courseGeneration 直接传 { stage, message, ... } 格式
 */
function transformProgress(progress: AnyProgress): any[] {
  const events: any[] = [];
  const stage = progress.stage || 'thinking';
  const message = progress.message || '';

  if (stage === 'streaming' || stage === 'ai_stream') {
    events.push({ stage: 'ai_stream', message });
  } else if (stage === 'design') {
    events.push({ stage: 'api_call', message: message || '正在设计课件结构...' });
  } else if (stage === 'module_generate') {
    events.push({ stage: 'api_call', message: message || '正在生成模块...' });
  } else if (stage === 'integrate') {
    events.push({ stage: 'api_call', message: message || '正在集成课件...' });
  } else if (stage === 'plan' || stage === 'search' || stage === 'thinking') {
    events.push({ stage: 'api_call', message, ai_output: message });
  } else if (stage === 'generate') {
    events.push({ stage: 'api_call', message: '正在生成 HTML 课件...' });
  } else if (stage === 'validate') {
    events.push({ stage: 'api_call', message: '正在验证课件...' });
  } else if (stage === 'fix') {
    events.push({ stage: 'retry', message });
  } else if (stage === 'tool_call') {
    events.push({
      stage: 'tool_call',
      message,
      tool_call: { name: progress.toolCalls?.[0]?.toolName || '', success: undefined },
    });
  } else if (stage === 'tool_result') {
    for (const tr of progress.toolResults || []) {
      events.push({
        stage: 'tool_result',
        message: `${tr.toolName}: ${tr.success ? '成功' : '失败'}`,
      });
    }
  } else if (stage === 'complete') {
    events.push({ stage: 'complete', message });
  } else if (stage === 'error') {
    events.push({ stage: 'error', message });
  }

  return events;
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
    const onProgress = (progress: AnyProgress) => {
      const events = transformProgress(progress);
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
