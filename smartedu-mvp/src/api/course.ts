import { Router, Request, Response } from 'express';
import { z } from 'zod';
import path from 'path';
import { CourseService } from '../services/courseService';
import { ToolCallAgent } from '../services/toolCallAgent';
import { GenerateCourseRequest, GenerateCourseResponse } from '../types/course';
import { GenerationProgress } from '../types/generation';
import { AgentProgress } from '../types/agent';
import { QUALITY_GUIDELINES } from '../skills/coursePrompt';

const router = Router();
const courseService = new CourseService();

const GenerateCourseSchema = z.object({
  user_question: z.string().min(1, '问题不能为空').max(500, '问题不能超过500字'),
  subject: z.enum(['数学', '语文', '英语', '科学'], {
    errorMap: () => ({ message: '学科必须是: 数学、语文、英语、科学' }),
  }),
  grade_level: z.number().int().min(1).max(6),
  stream: z.boolean().optional(),
  enable_refinement: z.boolean().optional().describe('启用多轮调优模式'),
  use_tools: z.boolean().optional().describe('启用工具调用模式'),
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
  const useTools = req.body.use_tools === true;
  
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
  console.log('[API] use_tools 参数:', useTools);

  if (enableRefinement) {
    console.log('[API] 多轮调优模式: 已启用');
  }
  if (useTools) {
    console.log('[API] 工具调用模式: 已启用');
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
    
    let htmlResult;
    if (useTools) {
      htmlResult = await courseService.generateCourse({
        topic: validated.user_question,
        subject: validated.subject,
        gradeLevel: validated.grade_level,
        useTools: true,
        onProgress: sendProgress
      });
    } else {
      htmlResult = await courseService.generateCourse({
        topic: validated.user_question,
        subject: validated.subject,
        gradeLevel: validated.grade_level,
        useTools: false,
        onProgress: sendProgress
      });
    }
    
    response.success = true;
    response.course_id = htmlResult.id;
    response.html_content = htmlResult.html;

    console.log(`[API] HTML课件生成成功: ${htmlResult.id}`);
    
    if (useStream) {
      res.write(`data: ${JSON.stringify({ 
        stage: 'complete', 
        message: '生成完成!', 
        timestamp: Date.now(),
        course_id: htmlResult.id,
      })}\n\n`);
      res.end();
    } else {
      res.json(response);
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

router.get('/list', async (req: Request, res: Response) => {
  try {
    const courses = await courseService.listCourses();
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

router.get('/:courseId', async (req: Request, res: Response) => {
  try {
    const course = await courseService.getCourse(req.params.courseId);
    
    if (!course) {
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

const AgentTaskSchema = z.object({
  prompt: z.string().min(1, '提示不能为空').max(5000, '提示不能超过5000字'),
  work_dir: z.string().optional().describe('工作目录，默认为./courses'),
  max_iterations: z.number().int().min(1).max(50).optional().describe('最大迭代次数'),
  stream: z.boolean().optional(),
});

router.post('/agent/execute', async (req: Request, res: Response) => {
  const useStream = req.body.stream === true || req.query.stream === 'true';
  
  if (useStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }

  try {
    const validated = AgentTaskSchema.parse(req.body);
    
    const workDir = validated.work_dir || path.join(__dirname, '../../courses');
    const maxIterations = validated.max_iterations || 15;

    const sendProgress = (progress: AgentProgress) => {
      if (useStream && res.writable) {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      }
    };

    console.log('[Agent API] 开始执行工具调用Agent...');
    console.log('[Agent API] 工作目录:', workDir);
    console.log('[Agent API] 最大迭代:', maxIterations);

    const agent = new ToolCallAgent({
      workDir,
      onProgress: sendProgress,
      config: {
        maxIterations,
        timeoutMs: 300000,
      },
    });

    const result = await agent.execute(validated.prompt);

    const response = {
      success: result.success,
      iterations: result.iterations,
      toolCallCount: result.toolCalls.length,
      finalOutput: result.finalOutput,
      messages: result.messages.length,
      error: result.error,
    };

    if (useStream) {
      res.write(`data: ${JSON.stringify({ 
        stage: 'complete', 
        message: result.success ? '任务完成' : '任务失败',
        timestamp: Date.now(),
        ...response,
      })}\n\n`);
      res.end();
    } else {
      res.json(response);
    }

    console.log('[Agent API] 执行完成:', result.success ? '成功' : '失败');
    console.log('[Agent API] 迭代次数:', result.iterations);
    console.log('[Agent API] 工具调用:', result.toolCalls.length);

  } catch (error: any) {
    console.error('[Agent API] 执行失败:', error.message);
    
    if (useStream) {
      res.write(`data: ${JSON.stringify({ 
        stage: 'error', 
        message: error.message, 
        timestamp: Date.now()
      })}\n\n`);
      res.end();
    } else {
      res.status(400).json({
        success: false,
        error: error.message,
        error_type: error.name || 'Error',
      });
    }
  }
});

export default router;
