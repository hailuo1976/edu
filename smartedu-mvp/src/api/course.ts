import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { courseService } from '../services/courseService';
import { GenerateCourseRequest, GenerateCourseResponse } from '../types/course';
import { GenerationProgress } from '../types/generation';
import { QUALITY_GUIDELINES } from '../skills/coursePrompt';

const router = Router();

const GenerateCourseSchema = z.object({
  user_question: z.string().min(1, '问题不能为空').max(500, '问题不能超过500字'),
  subject: z.enum(['数学', '语文', '英语', '科学'], {
    errorMap: () => ({ message: '学科必须是: 数学、语文、英语、科学' }),
  }),
  grade_level: z.number().int().min(1).max(6),
  stream: z.boolean().optional(),
  enable_refinement: z.boolean().optional().describe('启用多轮调优模式'),
});

router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mock_mode: !process.env.OPENCODE_API_KEY,
    refinement_mode: 'available',
  });
});

router.get('/quality-info', (req: Request, res: Response) => {
  res.json({
    description: 'Claude Code Solo Mode 多轮调优机制',
    guidelines: QUALITY_GUIDELINES,
    thresholds: {
      overall: 75,
      pedagogy: 70,
      content: 70,
      interaction: 60,
      safety: 100,
      format: 60,
    },
    max_refinement_attempts: 3,
    features: [
      '多轮生成-审查-修复循环',
      '自动质量评分',
      '问题分类和严重性标记',
      '智能修复建议',
    ],
  });
});

router.post('/generate', async (req: Request, res: Response) => {
  const useStream = req.body.stream === true || req.query.stream === 'true';
  const enableRefinement = req.body.enable_refinement === true;
  
  if (useStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }

  const response: GenerateCourseResponse = {
    success: false,
  };

  console.log('[API] 环境变量检查 - API Key:', process.env.OPENCODE_API_KEY ? '已配置' : '未配置');
  console.log('[API] 请求体:', JSON.stringify(req.body));
  console.log('[API] enable_refinement 参数:', req.body.enable_refinement, typeof req.body.enable_refinement);
  if (enableRefinement) {
    console.log('[API] 多轮调优模式: 已启用');
  } else {
    console.log('[API] 多轮调优模式: 未启用');
  }

  const sendProgress = (progress: GenerationProgress) => {
    if (useStream && res.writable) {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    }
  };

  try {
    const validated = GenerateCourseSchema.parse(req.body);
    
    console.log('[API] 开始生成HTML课件...');
    sendProgress({ stage: 'prompt', message: '正在准备生成课件...', timestamp: Date.now() });
    
    const htmlResult = await courseService.generateCourseHtml(
      validated as GenerateCourseRequest,
      sendProgress,
      { enableRefinement }
    );
    
    await courseService.saveCourseHtml(htmlResult);

    response.success = true;
    response.course_id = htmlResult.course_id;
    response.html_content = htmlResult.html_content;

    if (htmlResult.qualityScore) {
      console.log(`[API] 质量评分: ${htmlResult.qualityScore.overall}/100`);
    }

    console.log(`[API] HTML课件生成成功: ${htmlResult.course_id}`);
    
    if (useStream) {
      res.write(`data: ${JSON.stringify({ 
        stage: 'complete', 
        message: '生成完成!', 
        timestamp: Date.now(),
        course_id: htmlResult.course_id,
        quality_score: htmlResult.qualityScore?.overall
      })}\n\n`);
      res.end();
    } else {
      res.json({
        ...response,
        quality_score: htmlResult.qualityScore?.overall,
      });
    }
  } catch (error: any) {
    console.error('[API] HTML课件生成失败:', error.message);
    response.success = false;
    response.error = error.message;
    response.error_type = error.name || 'Error';
    
    if (useStream) {
      res.write(`data: ${JSON.stringify({ 
        stage: 'error', 
        message: error.message, 
        timestamp: Date.now()
      })}\n\n`);
      res.end();
    } else {
      res.status(400).json(response);
    }
  }
});

router.get('/list', (req: Request, res: Response) => {
  try {
    const courses = courseService.listCourses();
    res.json({
      success: true,
      courses,
      total: courses.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/:courseId', (req: Request, res: Response) => {
  try {
    const course = courseService.loadCourse(req.params.courseId);
    
    if (!course) {
      const htmlCourse = courseService.loadCourseHtml(req.params.courseId);
      if (htmlCourse) {
        res.json({
          success: true,
          course: htmlCourse,
        });
        return;
      }
      
      res.status(404).json({
        success: false,
        error: '课程不存在',
      });
      return;
    }

    res.json({
      success: true,
      course,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
