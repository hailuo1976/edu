---
name: "primary-edu-courseware"
description: "Generate interactive HTML courseware for primary school education (grades 1-6). Invoke when user requests to create teaching tools, learning materials, or interactive courseware for primary school subjects."
---

# 小学教育课件生成指南

本skill用于指导生成小学教育交互式HTML课件，确保课件具有统一的设计规范、交互模式和教学效果。

## 一、课件核心特征

### 1.1 技术栈
- **单文件架构**: 所有代码（HTML/CSS/JS）集成在单个HTML文件中
- **无外部依赖**: 仅使用CDN引入Google Fonts，无需npm/webpack等构建工具
- **Canvas绑定**: 使用HTML5 Canvas进行图形绘制和动画
- **响应式设计**: 支持桌面端和移动端自适应

### 1.2 设计原则
- **教学优先**: 每个功能模块都服务于教学目标
- **交互驱动**: 通过交互帮助学生理解抽象概念
- **即时反馈**: 用户操作后立即给予视觉或文字反馈
- **渐进式学习**: 从简单到复杂，逐步引导

## 二、标准结构模板

### 2.1 HTML结构层次
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <!-- 1. 元信息 -->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[年级][学科][主题]教学工具</title>
    
    <!-- 2. 字体引入 -->
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
    
    <!-- 3. 样式定义 -->
    <style>
        /* CSS变量定义 */
        /* 全局样式 */
        /* 组件样式 */
        /* 响应式样式 */
    </style>
</head>
<body>
    <!-- 4. 页面头部 -->
    <div class="header">
        <h1>课件标题</h1>
        <p>课件描述</p>
    </div>
    
    <!-- 5. 导航标签 -->
    <div class="nav-tabs">
        <button class="nav-tab active">模块1</button>
        <button class="nav-tab">模块2</button>
        <!-- 更多模块 -->
    </div>
    
    <!-- 6. 主内容区 -->
    <div class="main-content">
        <!-- 各模块内容 -->
    </div>
    
    <!-- 7. JavaScript脚本 -->
    <script>
        // 初始化
        // 事件监听
        // 核心功能函数
        // 辅助函数
    </script>
</body>
</html>
```

### 2.2 CSS变量规范
```css
:root {
    --primary: #3b82f6;        /* 主色调 */
    --primary-dark: #1d4ed8;   /* 主色深 */
    --secondary: #8b5cf6;      /* 次要色 */
    --accent: #f59e0b;         /* 强调色 */
    --success: #10b981;        /* 成功色 */
    --error: #ef4444;          /* 错误色 */
    --bg: #f8fafc;             /* 背景色 */
    --card-bg: #ffffff;        /* 卡片背景 */
    --text: #1e293b;           /* 主文字 */
    --text-secondary: #64748b; /* 次要文字 */
    --border: #e2e8f0;         /* 边框色 */
}
```

## 三、功能模块设计

### 3.1 必备模块类型

#### A. 概念演示模块
- **目的**: 直观展示抽象概念
- **元素**: Canvas可视化、动画、交互控件
- **示例**: 分数可视化、几何图形展示

#### B. 操作练习模块
- **目的**: 提供动手操作机会
- **元素**: 输入框、按钮、滑块、拖拽
- **示例**: 分数运算、图形变换

#### C. 测试评估模块
- **目的**: 检验学习效果
- **元素**: 题目生成、答案提交、即时评分
- **示例**: 选择题、填空题、判断题

### 3.2 模块命名规范
```javascript
// 使用语义化的函数名
function init[ModuleName]() {}      // 初始化模块
function update[Feature]() {}       // 更新功能
function draw[Shape]() {}           // 绘制图形
function generate[Question]() {}    // 生成题目
function check[Answer]() {}         // 检查答案
function reset[State]() {}          // 重置状态
```

## 四、Canvas绘制规范

### 4.1 绘制流程
```javascript
function drawShape() {
    // 1. 获取Canvas和上下文
    const canvas = document.getElementById('canvas-id');
    const ctx = canvas.getContext('2d');
    
    // 2. 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 3. 设置样式
    ctx.fillStyle = '#color';
    ctx.strokeStyle = '#color';
    ctx.lineWidth = 2;
    
    // 4. 绘制路径
    ctx.beginPath();
    // ... 绘制操作
    ctx.closePath();
    
    // 5. 填充和描边
    ctx.fill();
    ctx.stroke();
}
```

### 4.2 3D效果实现
```javascript
// 使用透视投影
const perspective = 0.5; // 透视系数
const rx = r * Math.abs(cosAngle); // 水平半径随角度变化
const ry = r * perspective; // 垂直半径固定透视

// 绘制顺序：先画背面，再画前面
// 1. 背面（较暗颜色）
// 2. 前面（较亮颜色）
// 3. 顶面/底面
// 4. 轮廓线
// 5. 指示器/标注
```

### 4.3 动画实现
```javascript
// 使用requestAnimationFrame
let animationId = null;

function animate() {
    // 更新状态
    updateState();
    
    // 重绘
    draw();
    
    // 循环
    animationId = requestAnimationFrame(animate);
}

function startAnimation() {
    if (!animationId) {
        animate();
    }
}

function stopAnimation() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}
```

## 五、交互设计规范

### 5.1 输入验证
```javascript
function validateInput(value, min, max) {
    const num = parseFloat(value);
    if (isNaN(num)) {
        showError('请输入有效数字');
        return null;
    }
    if (num < min || num > max) {
        showError(`请输入${min}到${max}之间的数`);
        return null;
    }
    return num;
}
```

### 5.2 即时反馈
```javascript
function showFeedback(isCorrect, message) {
    const feedbackEl = document.getElementById('feedback');
    if (isCorrect) {
        feedbackEl.className = 'feedback success';
        feedbackEl.textContent = '✓ ' + message;
    } else {
        feedbackEl.className = 'feedback error';
        feedbackEl.textContent = '✗ ' + message;
    }
    // 3秒后自动消失
    setTimeout(() => {
        feedbackEl.className = 'feedback';
    }, 3000);
}
```

### 5.3 状态管理
```javascript
// 使用全局变量管理状态
let currentState = {
    selectedTab: 'tab1',
    score: 0,
    attempts: 0,
    // ... 其他状态
};

function updateState(key, value) {
    currentState[key] = value;
    // 触发UI更新
    renderUI();
}
```

## 六、测试题目生成规范

### 6.1 题目类型
```javascript
const questionTypes = {
    CHOICE: 'choice',       // 选择题
    FILL_BLANK: 'fill',     // 填空题
    TRUE_FALSE: 'tf',       // 判断题
    SHORT_ANSWER: 'short'   // 简答题
};
```

### 6.2 难度分级
```javascript
const difficultyLevels = {
    EASY: { level: 1, points: 1 },
    MEDIUM: { level: 2, points: 2 },
    HARD: { level: 3, points: 3 }
};
```

### 6.3 题目生成模板
```javascript
function generateQuestion(type, difficulty) {
    const question = {
        id: generateId(),
        type: type,
        difficulty: difficulty,
        content: '',
        options: [], // 选择题选项
        answer: '',
        explanation: '',
        knowledgePoints: []
    };
    
    // 根据类型和难度生成题目
    // ...
    
    return question;
}
```

## 七、响应式设计规范

### 7.1 断点设置
```css
/* 移动端优先 */
.container {
    padding: 16px;
}

/* 平板端 */
@media (min-width: 768px) {
    .container {
        padding: 24px;
    }
}

/* 桌面端 */
@media (min-width: 1024px) {
    .container {
        padding: 32px;
        max-width: 1200px;
        margin: 0 auto;
    }
}
```

### 7.2 触摸优化
```css
/* 增大点击区域 */
.btn {
    min-height: 44px;
    min-width: 44px;
    padding: 12px 20px;
}

/* 防止双击缩放 */
* {
    touch-action: manipulation;
}
```

## 八、性能优化建议

### 8.1 Canvas优化
- 使用离屏Canvas缓存静态内容
- 减少不必要的重绘
- 使用整数坐标避免抗锯齿

### 8.2 事件优化
```javascript
// 使用防抖
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// 使用节流
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
```

## 九、代码注释规范

### 9.1 函数注释
```javascript
/**
 * 函数功能描述
 * @param {类型} 参数名 - 参数说明
 * @returns {类型} 返回值说明
 */
function functionName(param) {
    // 实现
}
```

### 9.2 复杂逻辑注释
```javascript
// 计算旋转后的椭圆参数
// 使用透视投影公式：rx = r * |cos(θ)|, ry = r * perspective
const rx = r * Math.abs(Math.cos(angle));
const ry = r * 0.5; // 透视系数为0.5
```

## 十、验收清单

### 10.1 功能验收
- [ ] 所有模块可正常切换
- [ ] Canvas绑定正确显示
- [ ] 交互控件响应灵敏
- [ ] 测试题目生成正确
- [ ] 评分系统准确无误

### 10.2 UI/UX验收
- [ ] 颜色搭配和谐
- [ ] 字体大小适中
- [ ] 按钮易于点击
- [ ] 反馈信息清晰
- [ ] 响应式布局正常

### 10.3 性能验收
- [ ] 页面加载 < 3秒
- [ ] 动画流畅 (60fps)
- [ ] 无内存泄漏
- [ ] 移动端流畅

### 10.4 兼容性验收
- [ ] Chrome浏览器正常
- [ ] Safari浏览器正常
- [ ] Edge浏览器正常
- [ ] 移动端浏览器正常

## 十一、示例课件参考

### 11.1 分数教学工具 (fraction-tool.html)
- **模块**: 概念演示、分数运算、分数比较、练习测试
- **特点**: 分数可视化、步骤演示、即时反馈
- **适用**: 五年级数学

### 11.2 立体几何工具 (geometry-tool.html)
- **模块**: 长方体/正方体、圆柱/圆锥、展开图、三视图、练习测试
- **特点**: 3D可视化、旋转交互、动态演示
- **适用**: 五年级数学

### 11.3 几何教学工具 (index.html)
- **模块**: 图形展示、属性计算、变换操作
- **特点**: 侧边栏导航、Canvas绑定、实时计算
- **适用**: 小学几何

## 十二、开发流程建议

### 12.1 需求分析
1. 明确教学目标和知识点
2. 确定目标年级和学生水平
3. 列出功能模块清单

### 12.2 设计阶段
1. 设计UI布局和配色方案
2. 规划交互流程
3. 设计题目生成逻辑

### 12.3 开发阶段
1. 搭建HTML骨架
2. 实现CSS样式
3. 开发JavaScript功能
4. 添加Canvas绑定

### 12.4 测试阶段
1. 功能测试
2. 兼容性测试
3. 性能测试
4. 用户测试

### 12.5 优化阶段
1. 修复bug
2. 优化性能
3. 改进UI/UX
4. 完善文档

---

**使用本skill时，请确保生成的课件符合以上规范，并根据具体教学需求进行适当调整。**
