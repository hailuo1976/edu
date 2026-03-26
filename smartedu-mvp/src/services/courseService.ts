import { courseAgent, CourseAgent } from './courseAgent';
import { buildCoursePrompt, QUALITY_GUIDELINES } from '../skills/coursePrompt';
import { CourseContent, CourseHtmlContent, GenerateCourseRequest } from '../types/course';
import { getMockCourse, generateMockCourseId } from './mockData';
import { GenerationProgress, GenerationErrorType } from '../types/generation';
import { QualityScore } from '../types/refinement';
import { RefinementLoop } from './refinementLoop';
import * as fs from 'fs';
import * as path from 'path';

export class CourseService {
  private agent: CourseAgent;

  constructor() {
    this.agent = courseAgent;
  }

  private isMockMode(): boolean {
    const key = process.env.OPENCODE_API_KEY;
    console.log('[CourseService] 检查API密钥:', key ? '已配置' : '未配置');
    return !key;
  }

  async generateCourseHtml(
    params: GenerateCourseRequest,
    onProgress?: (progress: GenerationProgress) => void,
    options?: { enableRefinement?: boolean }
  ): Promise<CourseHtmlContent & { qualityScore?: QualityScore }> {
    const { user_question, subject, grade_level } = params;
    const useMock = this.isMockMode();
    const enableRefinement = options?.enableRefinement !== false;

    console.log(`[CourseService] 开始生成HTML课件: ${user_question}`);
    console.log(`[CourseService] 学科: ${subject}, 年级: ${grade_level}`);
    
    if (useMock) {
      console.log(`[CourseService] 运行模式: 🔧 MOCK`);
    } else if (enableRefinement) {
      console.log(`[CourseService] 运行模式: 🎯 AI (多轮调优模式)`);
      console.log(QUALITY_GUIDELINES);
    } else {
      console.log(`[CourseService] 运行模式: 🚀 AI (基础模式)`);
    }

    if (useMock) {
      const mockResult = this.generateMockCourseHtml(user_question, subject, grade_level);
      return { ...mockResult, qualityScore: undefined };
    }

    const courseId = this.generateCourseId(user_question);
    
    try {
      const prompt = buildCoursePrompt({
        user_question,
        subject,
        grade_level,
        duration_minutes: 25,
      });

      let result;
      if (enableRefinement) {
        result = await this.agent.generateWithRefinement(prompt, onProgress, courseId);
      } else {
        result = await this.agent.generate(prompt, onProgress, courseId);
      }

      if (!result.success) {
        if (result.error?.type === GenerationErrorType.VALIDATION_ERROR) {
          throw new Error(`课件验证失败: ${result.error.message}`);
        }
        if (result.error?.type === GenerationErrorType.API_ERROR && !result.error.retryable) {
          throw new Error(`API错误: ${result.error.message}`);
        }
        
        console.warn(`[CourseService] AI生成失败(${result.attempts}次尝试)，降级到MOCK模式`);
        const mockResult = this.generateMockCourseHtml(user_question, subject, grade_level);
        return { ...mockResult, qualityScore: undefined };
      }

      console.log(`[CourseService] ✅ HTML课件生成成功`);
      console.log(`[CourseService]   - 迭代次数: ${result.attempts}`);
      console.log(`[CourseService]   - 耗时: ${result.duration}ms`);
      
      if (result.qualityScore) {
        console.log(`[CourseService]   - 质量评分: ${result.qualityScore.overall}/100`);
        console.log(RefinementLoop.formatScoreReport(result.qualityScore));
      }

      if (result.validation && !result.validation.isValid) {
        const errors = result.validation.errors.map(e => e.message).join('; ');
        console.warn(`[CourseService] 验证警告: ${errors}`);
      }

      return {
        course_id: result.courseId || courseId,
        html_content: result.html,
        qualityScore: result.qualityScore,
        metadata: {
          subject,
          grade: grade_level,
          topic: user_question.substring(0, 20),
        },
      };
    } catch (error: any) {
      console.error('[CourseService] ❌ HTML课件生成失败:', error.message);
      throw error;
    }
  }

  async generateCourseWithRefinement(
    params: GenerateCourseRequest,
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<CourseHtmlContent & { qualityScore?: QualityScore }> {
    return this.generateCourseHtml(params, onProgress, { enableRefinement: true });
  }

  private generateCourseId(question: string): string {
    const hash = question.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    return `course_${Math.abs(hash).toString(36)}_${Date.now()}`;
  }

  private generateMockCourseHtml(question: string, subject: string, grade: number): CourseHtmlContent {
    console.log('[CourseService] 生成模拟HTML课件...');
    
    const topic = question.includes('正方形') ? '正方形面积' :
                  question.includes('分数') ? '分数加减' :
                  question.includes('三角形') ? '三角形面积' :
                  question.includes('圆形') || question.includes('圆') ? '圆周长计算' : '数学基础';
    
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${grade}年级 ${subject} - ${topic}</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #3b82f6;
            --primary-dark: #1d4ed8;
            --secondary: #8b5cf6;
            --accent: #f59e0b;
            --success: #10b981;
            --error: #ef4444;
            --bg: #f8fafc;
            --card-bg: #ffffff;
            --text: #1e293b;
            --text-secondary: #64748b;
            --border: #e2e8f0;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: "Noto Sans SC", sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
        .header { background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; padding: 24px 32px; text-align: center; }
        .header h1 { font-size: 2rem; margin-bottom: 8px; }
        .header p { opacity: 0.9; }
        .nav-tabs { display: flex; justify-content: center; gap: 8px; padding: 16px; background: white; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
        .nav-tab { padding: 12px 24px; border: none; background: var(--bg); color: var(--text-secondary); font-size: 0.95rem; font-weight: 500; border-radius: 8px; cursor: pointer; transition: all 0.3s; }
        .nav-tab:hover { background: #dbeafe; color: var(--primary); }
        .nav-tab.active { background: var(--primary); color: white; }
        .main-content { max-width: 1200px; margin: 0 auto; padding: 24px; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .card { background: var(--card-bg); border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06); }
        .card-title { font-size: 1.25rem; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        .canvas-container { display: flex; justify-content: center; margin: 20px 0; }
        canvas { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .controls { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; padding: 16px; background: #f1f5f9; border-radius: 12px; margin-bottom: 20px; }
        .control-group { display: flex; align-items: center; gap: 8px; }
        .control-group label { font-weight: 500; }
        .control-group input { padding: 8px 12px; border: 2px solid var(--border); border-radius: 8px; width: 100px; }
        .btn { padding: 10px 20px; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 500; cursor: pointer; transition: all 0.3s; }
        .btn-primary { background: var(--primary); color: white; }
        .btn-primary:hover { background: var(--primary-dark); }
        .formula-box { background: #f0f9ff; border-left: 4px solid var(--primary); padding: 16px 20px; border-radius: 8px; margin: 16px 0; font-size: 1.2rem; text-align: center; }
        .steps { margin: 20px 0; }
        .step { display: flex; gap: 12px; margin-bottom: 12px; padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 4px solid var(--primary); }
        .step-num { width: 28px; height: 28px; background: var(--primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; flex-shrink: 0; }
        .exercise-item { background: var(--card-bg); border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid var(--border); }
        .exercise-item h4 { margin-bottom: 12px; color: var(--text); }
        .exercise-item input { padding: 8px 12px; border: 2px solid var(--border); border-radius: 8px; margin-right: 12px; width: 120px; }
        .feedback { padding: 12px 16px; border-radius: 8px; margin-top: 12px; font-weight: 500; display: none; }
        .feedback.correct { background: #dcfce7; color: var(--success); display: block; }
        .feedback.wrong { background: #fee2e2; color: var(--error); display: block; }
        .score-board { background: linear-gradient(135deg, var(--accent) 0%, #d97706 100%); color: white; padding: 16px 24px; border-radius: 12px; text-align: center; margin-bottom: 20px; }
        .score-board h3 { font-size: 1.5rem; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📐 ${topic}</h1>
        <p>${grade}年级 ${subject} - 互动课件</p>
    </div>
    
    <div class="nav-tabs">
        <button class="nav-tab active" onclick="switchTab('concept')">📚 概念讲解</button>
        <button class="nav-tab" onclick="switchTab('demo')">🎨 图形演示</button>
        <button class="nav-tab" onclick="switchTab('exercise')">✏️ 练习测试</button>
    </div>
    
    <div class="main-content">
        <div id="concept" class="tab-content active">
            <div class="card">
                <div class="card-title">📖 ${topic}</div>
                <p style="line-height: 1.8; margin-bottom: 16px;">
                    欢迎来到数学课堂！今天我们来学习${topic}。
                    ${question}
                </p>
                <div class="formula-box">
                    <strong>S = a × a</strong><br>
                    <small>（S表示面积，a表示边长）</small>
                </div>
            </div>
        </div>
        
        <div id="demo" class="tab-content">
            <div class="card">
                <div class="card-title">🎨 交互式图形演示</div>
                <div class="controls">
                    <div class="control-group">
                        <label>边长 (a):</label>
                        <input type="number" id="sideLength" value="5" min="1" max="20">
                    </div>
                    <button class="btn btn-primary" onclick="drawSquare()">绘制图形</button>
                    <button class="btn btn-primary" onclick="animateSquare()">✨ 动画演示</button>
                </div>
                <div class="canvas-container">
                    <canvas id="mainCanvas" width="400" height="400"></canvas>
                </div>
                <div class="formula-box" id="resultBox">
                    输入边长后点击绘制
                </div>
            </div>
        </div>
        
        <div id="exercise" class="tab-content">
            <div class="card">
                <div class="score-board">
                    <h3>🏆 得分: <span id="score">0</span> / <span id="total">3</span></h3>
                </div>
                <div class="card-title">✏️ 牛刀小试</div>
                <div class="exercise-item">
                    <h4>练习1: 正方形的边长为6厘米，面积是多少？</h4>
                    <input type="number" id="answer1" placeholder="答案">
                    <button class="btn btn-primary" onclick="checkAnswer(1, 36)">提交答案</button>
                    <div class="feedback" id="feedback1"></div>
                </div>
                <div class="exercise-item">
                    <h4>练习2: 正方形的边长为8厘米，面积是多少？</h4>
                    <input type="number" id="answer2" placeholder="答案">
                    <button class="btn btn-primary" onclick="checkAnswer(2, 64)">提交答案</button>
                    <div class="feedback" id="feedback2"></div>
                </div>
                <div class="exercise-item">
                    <h4>练习3: 面积是25平方厘米的正方形，边长是多少？</h4>
                    <input type="number" id="answer3" placeholder="答案">
                    <button class="btn btn-primary" onclick="checkAnswer(3, 5)">提交答案</button>
                    <div class="feedback" id="feedback3"></div>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        let score = 0;
        
        function switchTab(tabId) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            event.target.classList.add('active');
            
            if (tabId === 'demo') {
                setTimeout(drawSquare, 100);
            }
        }
        
        function drawSquare() {
            const canvas = document.getElementById('mainCanvas');
            const ctx = canvas.getContext('2d');
            const side = parseInt(document.getElementById('sideLength').value) || 5;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const maxSize = 300;
            const squareSize = Math.min(side * 15, maxSize);
            const x = (canvas.width - squareSize) / 2;
            const y = (canvas.height - squareSize) / 2;
            
            ctx.fillStyle = '#dbeafe';
            ctx.fillRect(x, y, squareSize, squareSize);
            
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, squareSize, squareSize);
            
            ctx.fillStyle = '#3b82f6';
            ctx.font = 'bold 16px "Noto Sans SC"';
            ctx.textAlign = 'center';
            ctx.fillText('a = ' + side + ' cm', canvas.width / 2, y - 10);
            ctx.fillText('S = ' + side + ' × ' + side + ' = ' + (side * side) + ' cm²', canvas.width / 2, y + squareSize + 30);
            
            document.getElementById('resultBox').innerHTML = '<strong>计算结果:</strong> S = ' + side + ' × ' + side + ' = <strong>' + (side * side) + ' 平方厘米</strong>';
        }
        
        let animating = false;
        function animateSquare() {
            if (animating) return;
            animating = true;
            
            const canvas = document.getElementById('mainCanvas');
            const ctx = canvas.getContext('2d');
            const targetSide = parseInt(document.getElementById('sideLength').value) || 5;
            
            let currentSide = 0;
            const maxSize = 300;
            
            function animate() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                const squareSize = Math.min(currentSide * 15, maxSize);
                const x = (canvas.width - squareSize) / 2;
                const y = (canvas.height - squareSize) / 2;
                
                ctx.fillStyle = '#dbeafe';
                ctx.fillRect(x, y, squareSize, squareSize);
                
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, squareSize, squareSize);
                
                if (currentSide > 0) {
                    ctx.fillStyle = '#3b82f6';
                    ctx.font = 'bold 16px "Noto Sans SC"';
                    ctx.textAlign = 'center';
                    ctx.fillText('a = ' + currentSide, canvas.width / 2, y - 10);
                    ctx.fillText('S = ' + currentSide + '² = ' + (currentSide * currentSide), canvas.width / 2, y + squareSize + 30);
                }
                
                if (currentSide < targetSide) {
                    currentSide += 0.5;
                    requestAnimationFrame(animate);
                } else {
                    animating = false;
                }
            }
            
            animate();
        }
        
        function checkAnswer(num, correct) {
            const answer = parseInt(document.getElementById('answer' + num).value);
            const feedback = document.getElementById('feedback' + num);
            
            if (answer === correct) {
                feedback.textContent = '✓ 回答正确！太棒了！';
                feedback.className = 'feedback correct';
                if (!feedback.dataset.counted) {
                    score++;
                    document.getElementById('score').textContent = score;
                    feedback.dataset.counted = 'true';
                }
            } else {
                feedback.textContent = '✗ 回答错误，正确答案是 ' + correct + '，再想想！';
                feedback.className = 'feedback wrong';
            }
        }
        
        drawSquare();
    </script>
</body>
</html>`;

    return {
      course_id: generateMockCourseId(question),
      html_content: html,
      metadata: {
        subject,
        grade,
        topic,
      },
    };
  }

  async generateCourse(params: GenerateCourseRequest): Promise<CourseContent> {
    const htmlResult = await this.generateCourseHtml(params);
    
    return {
      course_id: htmlResult.course_id,
      metadata: {
        subject: htmlResult.metadata.subject,
        grade: htmlResult.metadata.grade,
        topic: htmlResult.metadata.topic,
        estimated_minutes: 25,
        difficulty: 'medium',
      },
      sections: [],
      knowledge_tags: [],
    };
  }

  async saveCourseHtml(course: CourseHtmlContent, saveDir: string = './courses'): Promise<string> {
    const fileName = `${course.course_id}.html`;
    const filePath = path.join(saveDir, fileName);
    
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, course.html_content, 'utf-8');
    console.log(`[CourseService] 💾 HTML课件已保存: ${filePath}`);
    
    return filePath;
  }

  loadCourseHtml(courseId: string, saveDir: string = './courses'): CourseHtmlContent | null {
    const filePath = path.join(saveDir, `${courseId}.html`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const metadata = this.extractMetadataFromHtml(content);
    
    return {
      course_id: courseId,
      html_content: content,
      metadata,
    };
  }

  private extractMetadataFromHtml(html: string): { subject: string; grade: number; topic: string } {
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : '未知课件';
    
    return {
      subject: title.includes('数学') ? '数学' : title.includes('语文') ? '语文' : '数学',
      grade: parseInt(title.match(/(\d)年级/)?.[1] || '3'),
      topic: title.replace(/^\d年级\s+\S+\s+-\s*/, '').replace(/\s+课件$/, '') || '数学基础',
    };
  }

  async saveCourse(course: CourseContent, saveDir: string = './courses'): Promise<string> {
    const fileName = `${course.course_id}.json`;
    const filePath = path.join(saveDir, fileName);
    
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(course, null, 2), 'utf-8');
    console.log(`[CourseService] 💾 课程已保存: ${filePath}`);
    
    return filePath;
  }

  loadCourse(courseId: string, saveDir: string = './courses'): CourseContent | null {
    const filePath = path.join(saveDir, `${courseId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }

  listCourses(saveDir: string = './courses'): string[] {
    if (!fs.existsSync(saveDir)) {
      return [];
    }
    
    return fs.readdirSync(saveDir)
      .filter(file => file.endsWith('.json') || file.endsWith('.html'))
      .map(file => file.replace(/\.(json|html)$/, ''));
  }
}

export const courseService = new CourseService();
