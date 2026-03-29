# AI智能课件生成器 - 伪代码设计文档

**版本**: 1.0  
**日期**: 2026-03-29  
**基于**: SmartEdu MVP 系统架构

---

## 1. 系统概述

AI智能课件生成器是一个基于工具调用循环的课件自动生成系统，通过AI Agent调用多个工具完成课件内容的搜索、生成、验证和保存。

---

## 2. 核心模块伪代码

### 2.1 课程服务入口 (CourseService)

```
CLASS CourseService:
    ATTRIBUTES:
        coursesDir: STRING          // 课程存储目录
        toolCallAgent: Agent        // 工具调用Agent
        courseAgent: Agent          // 基础课程Agent
    
    METHOD generateCourse(options):
        INPUT:
            topic: STRING           // 课程主题
            subject: STRING         // 学科
            gradeLevel: NUMBER      // 年级
            useTools: BOOLEAN       // 是否使用工具模式
            onProgress: FUNCTION    // 进度回调
        
        PROCESS:
            IF useTools:
                result = CALL generateCourseWithTools(topic, subject, gradeLevel)
                IF result.success:
                    RETURN buildCourse(result)
                ELSE:
                    // 降级到非工具模式
                    result = CALL generateCourseWithoutTools(topic, subject, gradeLevel)
            ELSE:
                result = CALL generateCourseWithoutTools(topic, subject, gradeLevel)
            
            course = BUILD Course FROM result
            CALL saveCourse(course)
            RETURN course
    
    METHOD generateCourseWithTools(topic, subject, gradeLevel, onProgress):
        PROCESS:
            agent = NEW CourseToolCallAgent(workDir, onProgress)
            result = CALL agent.generate(topic, subject, gradeLevel)
            RETURN result
    
    METHOD saveCourse(course):
        PROCESS:
            courseDir = coursesDir + "/" + course.id
            CREATE DIRECTORY courseDir
            WRITE FILE courseDir + "/course.json" WITH course
            WRITE FILE courseDir + "/index.html" WITH course.html
            LOG "课程保存成功"
```

---

### 2.2 工具调用Agent (CourseToolCallAgent)

```
CLASS CourseToolCallAgent:
    ATTRIBUTES:
        apiKey: STRING              // AI API密钥
        baseUrl: STRING             // API基础URL
        model: STRING               // 模型名称
        workDir: STRING             // 工作目录
        maxIterations: NUMBER       // 最大迭代次数(默认15)
        toolManager: ToolManager    // 工具管理器
        progressCallback: FUNCTION  // 进度回调
    
    METHOD generate(prompt, subject, gradeLevel):
        INPUT:
            prompt: STRING          // 用户提示
            subject: STRING         // 学科
            gradeLevel: NUMBER      // 年级
        
        OUTPUT:
            CourseToolResult:
                success: BOOLEAN
                html: STRING
                courseId: STRING
                iterations: NUMBER
                toolCalls: LIST
                error: STRING
        
        PROCESS:
            courseId = GENERATE_ID "course_" + timestamp
            toolResults = EMPTY_LIST
            iterations = 0
            currentHtml = ""
            
            // 构建消息上下文
            messages = [
                { role: "system", content: buildSystemPrompt(subject, gradeLevel, courseId) },
                { role: "user", content: prompt }
            ]
            
            // 主循环
            WHILE iterations < maxIterations:
                iterations = iterations + 1
                
                REPORT_PROGRESS stage="thinking", message="正在思考..."
                
                TRY:
                    response = CALL callAIWithTools(messages, iterations)
                    
                    // 添加AI响应到消息列表
                    messages.APPEND { role: "assistant", content: response.content }
                    
                    // 检查完成条件
                    IF checkCompletionCondition(response.content):
                        IF currentHtml IS NOT EMPTY:
                            REPORT_PROGRESS stage="complete"
                            RETURN SUCCESS_RESULT(html=currentHtml, courseId, iterations, toolResults)
                        ELSE:
                            // HTML未生成，继续
                            messages.APPEND { role: "user", content: "请使用save_course_html工具保存课件" }
                            CONTINUE
                    
                    // 无工具调用
                    IF response.toolCalls IS EMPTY:
                        IF iterations >= maxIterations:
                            RETURN SUCCESS_RESULT(html=currentHtml, courseId, iterations, toolResults)
                        messages.APPEND { role: "user", content: "请继续使用工具完成任务" }
                        CONTINUE
                    
                    // 执行工具调用
                    REPORT_PROGRESS stage="tool_call", toolCalls=response.toolCalls
                    
                    FOR EACH toolCall IN response.toolCalls:
                        result = CALL executeTool(toolCall, courseId, currentHtml)
                        toolResults.APPEND result
                        
                        // 更新HTML内容
                        IF toolCall.name == "save_course_html" AND result.success:
                            currentHtml = result.result.html
                        
                        // 添加工具结果到消息
                        messages.APPEND { 
                            role: "tool", 
                            content: FORMAT_TOOL_RESULT(result) 
                        }
                    
                    REPORT_PROGRESS stage="tool_result", toolResults
                    
                CATCH error:
                    LOG_ERROR error
                    IF iterations >= maxIterations:
                        RETURN FALLBACK_RESULT(prompt, subject, gradeLevel)
                    messages.APPEND { role: "user", content: "错误: " + error.message }
            
            RETURN RESULT(success=currentHtml EXISTS, html=currentHtml OR fallback, ...)
    
    METHOD buildSystemPrompt(subject, gradeLevel, courseId):
        RETURN """
        你是小学{gradeLevel}年级{subject}课件生成专家。
        
        ## 课程ID: {courseId}
        调用save_course_html时必须使用此ID。
        
        ## 可用工具:
        - generate_svg: 生成SVG图形
        - generate_html_component: 生成HTML组件
        - validate_html: 验证HTML代码
        - search_educational_content: 搜索教育内容
        - save_course_html: 保存课件
        
        ## 课件结构要求:
        1. 完整HTML页面(<!DOCTYPE html>...)
        2. 三大模块: concept(概念), demo(演示), exercise(练习)
        3. 现代化设计(渐变、阴影、动画)
        
        ## 工作流程:
        搜索资料 -> 生成图形 -> 生成组件 -> 组装课件 -> 验证 -> 保存
        
        ## 结束条件:
        课件保存后回复"完成"或"DONE"
        """
    
    METHOD callAIWithTools(messages, iteration):
        PROCESS:
            tools = CALL toolManager.getTools()
            
            requestBody = {
                model: model,
                messages: messages,
                tools: tools,
                stream: false
            }
            
            // 带超时检测的调用
            response = CALL retryWithTimeout(
                FUNCTION: POST baseUrl + "/chat/completions" WITH requestBody,
                maxAttempts: 3,
                delayMs: 1000,
                timeoutMs: 300000  // 5分钟超时
            )
            
            content = response.choices[0].message.content
            toolCalls = PARSE response.choices[0].message.tool_calls
            
            // 记录AI调用日志
            LOG_AI_CONTEXT(iteration, request, response)
            
            RETURN { content, toolCalls }
    
    METHOD executeTool(toolCall, courseId, currentHtml):
        PROCESS:
            // 修正course_id参数
            IF toolCall.name == "save_course_html":
                toolCall.arguments.course_id = courseId
            
            REPORT_PROGRESS stage="tool_call", tool_call=toolCall
            
            result = CALL retry(
                FUNCTION: toolManager.executeTool(toolCall),
                maxAttempts: 2,
                delayMs: 1000
            )
            
            // 推送草稿内容
            IF result.result.svg_code:
                REPORT_PROGRESS draft_content={ type="svg", content=result.result.svg_code }
            IF result.result.html_content:
                REPORT_PROGRESS draft_content={ type="html", content=result.result.html_content }
            
            RETURN result
    
    METHOD checkCompletionCondition(content):
        keywords = ["完成", "DONE", "FINISH", "任务完成"]
        FOR keyword IN keywords:
            IF content.UPPERCASE CONTAINS keyword.UPPERCASE:
                RETURN true
        RETURN false
    
    METHOD compressMessages(messages):
        // 提示词压缩（超时时使用）
        PROCESS:
            compressed = []
            
            // 保留简化后的系统提示
            systemMessage = FIND messages WHERE role == "system"
            compressed.APPEND { role: "system", content: simplifySystemPrompt(systemMessage) }
            
            // 保留最近3轮对话
            recentMessages = messages.EXCLUDE role == "system"
            compressed.APPEND recentMessages.LAST(6)
            
            RETURN compressed
```

---

### 2.3 工具管理器 (ToolManager)

```
CLASS ToolManager:
    ATTRIBUTES:
        tools: MAP<STRING, ToolDefinition>    // 工具注册表
        workDir: STRING                        // 工作目录
        toolStats: MAP<STRING, Stats>          // 工具统计
    
    METHOD registerTool(tool):
        PROCESS:
            tools.SET(tool.name, tool)
            toolStats.SET(tool.name, { total=0, success=0, failures=0, avgTime=0 })
            LOG "工具已注册: " + tool.name
    
    METHOD getTools():
        RETURN tools.VALUES MAP TO {
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }
    
    METHOD executeTool(toolCall):
        INPUT:
            toolCall: { id, name, arguments }
        
        OUTPUT:
            ToolResult: { toolCallId, toolName, success, result, error, executionTime }
        
        PROCESS:
            startTime = NOW
            tool = tools.GET(toolCall.name)
            
            IF tool NOT EXISTS:
                RETURN ERROR_RESULT("工具不存在")
            
            // 参数验证
            validationError = validateParameters(tool, toolCall.arguments)
            IF validationError:
                RETURN ERROR_RESULT(validationError)
            
            TRY:
                // 带超时执行
                result = CALL executeWithTimeout(tool, toolCall.arguments, timeout=30000)
                executionTime = NOW - startTime
                
                updateStats(toolCall.name, success=true, executionTime)
                LOG_SUCCESS toolCall.name, result, executionTime
                
                RETURN SUCCESS_RESULT(result, executionTime)
            
            CATCH error:
                executionTime = NOW - startTime
                updateStats(toolCall.name, success=false, executionTime)
                LOG_ERROR toolCall.name, error, executionTime
                
                RETURN ERROR_RESULT(error.message, executionTime)
    
    METHOD executeWithTimeout(tool, args, timeout):
        PROCESS:
            RETURN PROMISE WITH timeout:
                result = CALL tool.execute(args, workDir)
                RESOLVE result
            ON timeout:
                REJECT "工具执行超时"
    
    // 内置工具定义
    
    TOOL generate_svg:
        PARAMETERS:
            shape_type: STRING (required)    // rect, circle, triangle
            dimensions: OBJECT (required)    // { width, height, radius, size }
            label: STRING                    // 标签文字
            style: STRING                    // 样式
        
        EXECUTE(args, workDir):
            SWITCH args.shape_type:
                CASE "rect":
                    svg = BUILD_SVG_RECT(args.dimensions, args.label)
                CASE "circle":
                    svg = BUILD_SVG_CIRCLE(args.dimensions, args.label)
                CASE "triangle":
                    svg = BUILD_SVG_TRIANGLE(args.dimensions, args.label)
            RETURN { svg_code: svg, shape_type, dimensions }
    
    TOOL generate_html_component:
        PARAMETERS:
            component_type: STRING (required)  // formula, steps, exercise
            content: STRING (required)         // 组件内容
            style: STRING                      // 样式
        
        EXECUTE(args, workDir):
            SWITCH args.component_type:
                CASE "formula":
                    html = "<div class='formula-box'>" + args.content + "</div>"
                CASE "steps":
                    html = BUILD_STEPS_HTML(args.content)
                CASE "exercise":
                    html = BUILD_EXERCISE_HTML(args.content)
            RETURN { html_content: html, component_type }
    
    TOOL validate_html:
        PARAMETERS:
            html_code: STRING (required)
        
        EXECUTE(args, workDir):
            errors = []
            
            // 结构验证
            IF NOT html_code CONTAINS "<!DOCTYPE html": errors.APPEND "缺少DOCTYPE"
            IF NOT html_code CONTAINS "<html": errors.APPEND "缺少html标签"
            IF NOT html_code CONTAINS "<head": errors.APPEND "缺少head标签"
            IF NOT html_code CONTAINS "<body": errors.APPEND "缺少body标签"
            
            // 模块验证
            IF NOT html_code CONTAINS "id='concept'": errors.APPEND "缺少概念模块"
            IF NOT html_code CONTAINS "id='demo'": errors.APPEND "缺少演示模块"
            IF NOT html_code CONTAINS "id='exercise'": errors.APPEND "缺少练习模块"
            
            RETURN { valid: errors IS EMPTY, errors, html_length: html_code.length }
    
    TOOL search_educational_content:
        PARAMETERS:
            query: STRING (required)          // 搜索关键词
            grade_level: NUMBER               // 年级
            subject: STRING                   // 学科
        
        EXECUTE(args, workDir):
            TRY:
                // 调用百度搜索API
                response = POST "https://qianfan.baidubce.com/v2/ai_search/web_search" WITH {
                    messages: [{ role: "user", content: query + subject + grade_level + "年级" }]
                }
                
                results = response.references
                content = FORMAT_SEARCH_RESULTS(query, results)
                
                RETURN { content, query, results, total: results.length }
            
            CATCH error:
                // 返回模拟内容作为备用
                mockContent = GET_MOCK_CONTENT(query, subject)
                RETURN { content: mockContent, query, fallback: true }
    
    TOOL save_course_html:
        PARAMETERS:
            filename: STRING (required)       // 文件名
            html_content: STRING (required)   // HTML内容
            course_id: STRING (required)      // 课程ID
        
        EXECUTE(args, workDir):
            courseDir = workDir + "/" + args.course_id
            CREATE_DIRECTORY courseDir
            
            filePath = courseDir + "/" + args.filename
            WRITE_FILE filePath WITH args.html_content
            
            RETURN { file_path: filePath, file_size: html_content.length, course_id, html: html_content }
```

---

### 2.4 数据类型定义

```
// 课程数据结构
STRUCT Course:
    id: STRING                      // 课程唯一标识
    topic: STRING                   // 课程主题
    subject: STRING                 // 学科
    gradeLevel: NUMBER              // 年级
    createdAt: STRING               // 创建时间
    html: STRING                    // HTML内容
    toolCalls: LIST<ToolResult>     // 工具调用记录
    sections: LIST<CourseSection>   // 课程章节

STRUCT CourseSection:
    id: STRING
    type: ENUM[intro, concept, formula, example, demo, exercise, summary]
    title: STRING
    content: STRING

// 工具调用数据结构
STRUCT ToolCall:
    id: STRING                      // 工具调用ID
    name: STRING                    // 工具名称
    arguments: MAP<STRING, ANY>     // 工具参数

STRUCT ToolResult:
    toolCallId: STRING
    toolName: STRING
    success: BOOLEAN
    result: ANY                     // 执行结果
    error: STRING                   // 错误信息
    executionTime: NUMBER           // 执行耗时(ms)

// Agent进度结构
STRUCT AgentProgress:
    iteration: NUMBER               // 当前迭代
    stage: ENUM[thinking, tool_call, tool_result, complete, error, retry]
    message: STRING                 // 进度消息
    toolCalls: LIST<ToolCall>       // 待执行工具
    toolResults: LIST<ToolResult>   // 工具结果
    ai_input: STRING                // AI输入内容
    ai_output: STRING               // AI输出内容
    draft_content: OBJECT           // 草稿内容(SVG/HTML)

// 执行结果结构
STRUCT CourseToolResult:
    success: BOOLEAN
    html: STRING                    // 生成的HTML
    courseId: STRING
    iterations: NUMBER              // 迭代次数
    toolCalls: LIST<ToolResult>     // 工具调用列表
    error: STRING                   // 错误信息
```

---

## 3. 核心流程伪代码

### 3.1 课件生成主流程

```
FUNCTION generateCourseMain(userQuestion, subject, gradeLevel):
    // Step 1: 初始化服务
    courseService = NEW CourseService()
    
    // Step 2: 配置进度回调
    onProgress = FUNCTION(progress):
        SEND_TO_FRONTEND {
            type: "progress",
            iteration: progress.iteration,
            stage: progress.stage,
            message: progress.message,
            toolCalls: progress.toolCalls,
            aiInput: progress.ai_input,
            aiOutput: progress.ai_output,
            draftContent: progress.draft_content
        }
    
    // Step 3: 调用课程生成
    TRY:
        course = CALL courseService.generateCourse({
            topic: userQuestion,
            subject: subject,
            gradeLevel: gradeLevel,
            useTools: true,
            onProgress: onProgress
        })
        
        SEND_TO_FRONTEND {
            type: "complete",
            courseId: course.id,
            html: course.html,
            sections: course.sections
        }
        
        RETURN course
    
    CATCH error:
        SEND_TO_FRONTEND {
            type: "error",
            message: error.message
        }
        RETURN NULL
```

---

### 3.2 工具调用循环

```
FUNCTION toolCallLoop(messages, maxIterations, progressCallback):
    iterations = 0
    toolResults = []
    currentHtml = ""
    
    WHILE iterations < maxIterations:
        iterations++
        
        // Phase 1: AI思考
        CALL progressCallback({ stage="thinking", iteration=iterations })
        
        TRY:
            response = CALL callAI(messages)
        CATCH timeout:
            // 超时处理：压缩提示词
            messages = CALL compressMessages(messages)
            response = CALL callAI(messages)
        
        // Phase 2: 检查完成
        IF response.content CONTAINS "完成" OR "DONE":
            IF currentHtml EXISTS:
                RETURN SUCCESS(currentHtml, toolResults)
            ELSE:
                messages.APPEND { role="user", content="请保存课件" }
                CONTINUE
        
        // Phase 3: 工具调用
        IF response.toolCalls EXISTS:
            CALL progressCallback({ stage="tool_call", toolCalls=response.toolCalls })
            
            FOR toolCall IN response.toolCalls:
                result = CALL executeTool(toolCall)
                toolResults.APPEND(result)
                
                // 更新HTML
                IF toolCall.name == "save_course_html" AND result.success:
                    currentHtml = result.html
                
                // 推送草稿
                IF result HAS svg_code OR html_content:
                    CALL progressCallback({ draft_content=result.draft })
                
                messages.APPEND { role="tool", content=result.formatted }
            
            CALL progressCallback({ stage="tool_result", toolResults })
        
        ELSE:
            // 无工具调用，继续
            messages.APPEND { role="user", content="请继续" }
    
    RETURN RESULT(currentHtml, toolResults)
```

---

### 3.3 前端同步展示流程

```
// WebSocket消息处理
FUNCTION handleWebSocketMessage(message):
    SWITCH message.type:
        CASE "progress":
            UPDATE_UI {
                iteration: message.iteration,
                stage: message.stage,
                statusText: message.message
            }
            
            // 显示AI输入输出
            IF message.aiInput:
                DISPLAY_AI_INPUT(message.aiInput)
            IF message.aiOutput:
                DISPLAY_AI_OUTPUT(message.aiOutput)
            
            // 显示工具调用
            IF message.toolCalls:
                DISPLAY_TOOL_CALLS(message.toolCalls)
            
            // 显示草稿内容
            IF message.draftContent:
                DISPLAY_DRAFT(message.draftContent)
        
        CASE "complete":
            UPDATE_UI { stage="complete", statusText="课件生成完成" }
            RENDER_COURSE(message.html)
            SAVE_COURSE_TO_LOCAL(message.courseId)
        
        CASE "error":
            SHOW_ERROR(message.message)
            ENABLE_RETRY_BUTTON()
```

---

## 4. 错误处理伪代码

### 4.1 超时检测与恢复

```
FUNCTION callAIWithTimeout(messages, timeoutMs):
    startTime = NOW
    
    TRY:
        // 创建超时Promise
        timeoutPromise = PROMISE:
            WAIT timeoutMs
            REJECT "AI调用超时"
        
        // 创建API调用Promise
        apiPromise = PROMISE:
            response = CALL axios.post(apiUrl, requestBody)
            RESOLVE response
        
        // 竞争执行
        result = PROMISE_RACE(apiPromise, timeoutPromise)
        RETURN result
    
    CATCH timeoutError:
        // 超时恢复流程
        LOG_WARNING "AI调用超时，启动压缩恢复"
        
        // 1. 压缩消息
        compressedMessages = CALL compressMessages(messages)
        
        // 2. 简化系统提示
        simplifiedPrompt = CALL simplifySystemPrompt(systemPrompt)
        
        // 3. 重试调用
        retryResult = CALL callAI(compressedMessages)
        
        RETURN retryResult
```

### 4.2 降级策略

```
FUNCTION handleGenerationFailure(topic, subject, gradeLevel):
    // 生成失败时的降级处理
    
    // Level 1: 使用备用模板
    TRY:
        templateHtml = GET_TEMPLATE(subject, gradeLevel)
        customizedHtml = CUSTOMIZE_TEMPLATE(templateHtml, topic)
        RETURN customizedHtml
    
    // Level 2: 生成基础HTML
    CATCH:
        basicHtml = GENERATE_BASIC_HTML(topic, subject, gradeLevel)
        RETURN basicHtml
    
    // Level 3: 返回最小可用课件
    FINALLY:
        minimalHtml = """
            <!DOCTYPE html>
            <html>
            <head><title>{topic}</title></head>
            <body>
                <h1>{gradeLevel}年级{subject} - {topic}</h1>
                <div id="concept">概念讲解</div>
                <div id="demo">图形演示</div>
                <div id="exercise">练习测试</div>
            </body>
            </html>
        """
        RETURN minimalHtml
```

---

## 5. 配置参数

```
CONFIG AgentConfig:
    maxIterations: 15              // 最大迭代次数
    timeoutMs: 300000              // 单次调用超时(5分钟)
    exitKeywords: ["完成", "DONE", "FINISH", "任务完成"]
    defaultWorkDir: "./courses"

CONFIG ToolConfig:
    generate_svg:
        timeout: 5000
        retry: 2
    
    search_educational_content:
        timeout: 30000
        retry: 2
        fallbackEnabled: true
    
    validate_html:
        timeout: 5000
        requiredModules: ["concept", "demo", "exercise"]
    
    save_course_html:
        timeout: 10000
        retry: 3

CONFIG UIConfig:
    progressUpdateInterval: 100    // 进度更新间隔(ms)
    draftPreviewEnabled: true      // 草稿预览开关
    maxDisplayLength: 2000         // 最大显示字符数
```

---

## 6. 文件结构

```
courses/
├── course_{timestamp}/
│   ├── course.json          // 课程元数据
│   ├── index.html           // 课件HTML
│   └── assets/              // 资源文件(可选)
│       ├── images/
│       └── scripts/

logs/
├── agent_{date}.log         // Agent执行日志
├── tool_{date}.log          // 工具调用日志
└── session_{id}.json        // 会话记录
```

---

## 7. API接口伪代码

### 7.1 HTTP接口

```
ENDPOINT POST /api/course/generate:
    INPUT:
        user_question: STRING
        subject: STRING
        grade_level: NUMBER
    
    PROCESS:
        // 创建WebSocket连接
        ws = CREATE_WEBSOCKET()
        
        // 启动生成任务
        courseService = NEW CourseService()
        course = CALL courseService.generateCourse({
            topic: user_question,
            subject: subject,
            gradeLevel: grade_level,
            useTools: true,
            onProgress: FUNCTION(p): ws.send(p)
        })
    
    OUTPUT:
        {
            success: BOOLEAN,
            course_id: STRING,
            message: STRING
        }

ENDPOINT GET /api/course/{id}:
    PROCESS:
        courseService = NEW CourseService()
        course = CALL courseService.getCourse(id)
    
    OUTPUT:
        {
            id: STRING,
            topic: STRING,
            html: STRING,
            sections: LIST,
            created_at: STRING
        }

ENDPOINT GET /api/courses:
    PROCESS:
        courseService = NEW CourseService()
        courses = CALL courseService.listCourses()
    
    OUTPUT:
        {
            courses: LIST<Course>,
            total: NUMBER
        }
```

---

## 8. 总结

本伪代码设计文档描述了AI智能课件生成器的核心架构：

1. **CourseService**: 服务入口，协调生成流程
2. **CourseToolCallAgent**: AI Agent核心，执行工具调用循环
3. **ToolManager**: 工具管理，注册和执行各种工具
4. **前端同步**: WebSocket实时推送进度和草稿内容

核心特性：
- 工具调用循环机制
- 超时检测与提示词压缩
- 多级降级策略
- 实时进度同步展示
- 草稿内容预览

---

**文档结束**
