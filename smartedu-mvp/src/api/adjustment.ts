import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { CourseAdjustmentService } from '../services/courseAdjustmentService';
import { AdjustmentProgress, LogMessage } from '../types/adjustment';

const router = Router();
const adjustmentService = new CourseAdjustmentService();

const ListCoursesSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
  subject: z.string().optional(),
  search: z.string().optional(),
});

const CreateSessionSchema = z.object({
  courseId: z.string().min(1, '课件ID不能为空'),
});

const AdjustmentRequestSchema = z.object({
  sessionId: z.string().optional(),
  courseId: z.string().min(1, '课件ID不能为空'),
  userRequest: z.string().min(1, '修改请求不能为空').max(2000, '修改请求不能超过2000字'),
  stream: z.boolean().optional().default(false),
});

const RollbackSchema = z.object({
  sessionId: z.string().min(1, '会话ID不能为空'),
  adjustmentId: z.string().min(1, '调整ID不能为空'),
});

const ValidateSchema = z.object({
  html: z.string().min(1, 'HTML内容不能为空'),
});

const SaveFinalSchema = z.object({
  sessionId: z.string().min(1, '会话ID不能为空'),
});

/**
 * GET /api/adjustment/courses
 * 列出所有可调整的课件
 */
router.get('/courses', async (req: Request, res: Response) => {
  try {
    const result = await adjustmentService.listCourses();
    res.json(result);
  } catch (error: any) {
    console.error('[API] 列出课件失败:', error);
    res.status(500).json({
      success: false,
      courses: [],
      total: 0,
      error: error.message,
    });
  }
});

/**
 * GET /api/adjustment/courses/:courseId
 * 获取单个课件详情
 */
router.get('/courses/:courseId', async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const result = await adjustmentService.listCourses();
    const course = result.courses.find(c => c.id === courseId);
    
    if (!course) {
      return res.status(404).json({
        success: false,
        error: '课件不存在',
      });
    }
    
    res.json({
      success: true,
      course,
    });
  } catch (error: any) {
    console.error('[API] 获取课件详情失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/adjustment/sessions
 * 创建新的调整会话
 */
router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const validated = CreateSessionSchema.parse(req.body);
    const session = await adjustmentService.createSession(validated.courseId);
    
    res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        courseId: session.courseId,
        courseInfo: session.courseInfo,
        createdAt: session.createdAt,
        status: session.status,
      },
    });
  } catch (error: any) {
    console.error('[API] 创建会话失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/adjustment/sessions/:sessionId
 * 获取会话详情
 */
router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = await adjustmentService.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: '会话不存在',
      });
    }
    
    res.json({
      success: true,
      session,
    });
  } catch (error: any) {
    console.error('[API] 获取会话失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/adjustment/adjust
 * 提交调整请求（支持流式和非流式）
 */
router.post('/adjust', async (req: Request, res: Response) => {
  try {
    const validated = AdjustmentRequestSchema.parse(req.body);
    const useStream = validated.stream;

    if (useStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
    }

    const sendProgress = (progress: AdjustmentProgress) => {
      if (useStream && res.writable) {
        res.write(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`);
      }
    };

    const sendLog = (log: LogMessage) => {
      if (useStream && res.writable) {
        res.write(`data: ${JSON.stringify({ type: 'log', log })}\n\n`);
      }
    };

    const result = await adjustmentService.processAdjustment(validated, useStream ? sendProgress : undefined, useStream ? sendLog : undefined);

    if (useStream) {
      res.write(`data: ${JSON.stringify({ type: 'result', ...result })}\n\n`);
      res.end();
    } else {
      res.json(result);
    }
  } catch (error: any) {
    console.error('[API] 处理调整请求失败:', error);
    
    if (req.body.stream && res.writable) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({
        success: false,
        sessionId: '',
        error: error.message,
      });
    }
  }
});

/**
 * POST /api/adjustment/rollback
 * 回滚到指定调整
 */
router.post('/rollback', async (req: Request, res: Response) => {
  try {
    const validated = RollbackSchema.parse(req.body);
    const result = await adjustmentService.rollback(validated.sessionId, validated.adjustmentId);
    res.json(result);
  } catch (error: any) {
    console.error('[API] 回滚失败:', error);
    res.status(500).json({
      success: false,
      html: '',
      message: '',
      error: error.message,
    });
  }
});

/**
 * POST /api/adjustment/validate
 * 验证HTML内容
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const validated = ValidateSchema.parse(req.body);
    const result = await adjustmentService.validateHtml(validated.html);
    res.json(result);
  } catch (error: any) {
    console.error('[API] 验证失败:', error);
    res.status(500).json({
      success: false,
      isValid: false,
      issues: [],
      suggestions: [],
      error: error.message,
    });
  }
});

/**
 * POST /api/adjustment/save-final
 * 保存最终课件
 */
router.post('/save-final', async (req: Request, res: Response) => {
  try {
    const validated = SaveFinalSchema.parse(req.body);
    const result = await adjustmentService.saveFinalCourse(validated.sessionId);
    res.json(result);
  } catch (error: any) {
    console.error('[API] 保存最终课件失败:', error);
    res.status(500).json({
      success: false,
      filePath: '',
      error: error.message,
    });
  }
});

/**
 * GET /api/adjustment/health
 * 健康检查
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'course-adjustment',
    timestamp: new Date().toISOString(),
  });
});

export default router;
