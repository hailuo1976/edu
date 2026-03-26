import { CourseContent } from '../types/course';

export const MOCK_COURSES: Record<string, CourseContent> = {
  '分数的加减法': {
    course_id: 'COURSE_分数加减_20260323_001',
    metadata: {
      subject: '数学',
      grade: 3,
      topic: '分数的加减法',
      estimated_minutes: 25,
      difficulty: 'medium',
    },
    sections: [
      {
        type: 'intro',
        title: '分蛋糕的故事',
        content: `🌟 **小明的生日派对** 🌟

今天是小明的生日！他邀请了3个好朋友来家里庆祝。

妈妈买了一个大蛋糕，平均分成了4份。

小明想：每个人能吃到多少蛋糕呢？

**让我们一起来帮小明算一算吧！**`,
      },
      {
        type: 'concept',
        title: '认识分数',
        content: `📚 **什么是分数？**

当我们把一个东西平均分成几份，取其中的一份或几份，就用**分数**来表示。

分数有两个重要的部分：

1. **分子**（上面的数字）：表示取了其中的几份
2. **分母**（下面的数字）：表示一共分成了几份

比如：把蛋糕分成4份，吃了1份，就是 **1/4**（读作：四分之一）

✨ **小技巧**：分母越大，每一份就越小哦！`,
      },
      {
        type: 'example',
        title: '跟着老师做',
        content: `📝 **例题1：同分母分数加法**

1/4 + 2/4 = ?

**步骤：**
1. 分子相加：1 + 2 = 3
2. 分母不变：还是4
3. 答案：3/4

🎉 我们一共吃了蛋糕的3/4！

---

📝 **例题2：同分母分数减法**

3/4 - 1/4 = ?

**步骤：**
1. 分子相减：3 - 1 = 2
2. 分母不变：还是4
3. 答案：2/4

💡 2/4可以化简成1/2，以后我们会学到！`,
      },
      {
        type: 'exercise',
        title: '牛刀小试',
        content: `✏️ **来挑战一下吧！**

**第一题（简单）**
1/5 + 2/5 = ?
答案：（3/5）

**第二题（中等）**
2/6 + 3/6 = ?
答案：（5/6）

**第三题（稍难）**
5/7 - 2/7 = ?
答案：（3/7）

**第四题（动脑筋）**
小明有3/10块饼干，吃了1/10，还剩多少？
答案：（2/10 = 1/5）

🌟 你做对了几道呢？`,
      },
      {
        type: 'summary',
        title: '今日收获',
        content: `🎊 **今天我们学习了分数的加减法！**

✅ **重点记住：**
- 同分母分数相加减，分母不变，分子相加减
- 分子相加的结果写在分子位置
- 分子相减的结果写在分子位置

🌟 **小口诀：**
*"分母不变记心间，分子相加记清楚"*

你真棒！💪 继续加油，下一节课我们会学习更难的分数哦！`,
      },
    ],
    knowledge_tags: ['分数', '分子', '分母', '同分母加减法'],
  },
};

export function getMockCourse(topic: string): CourseContent | null {
  for (const key in MOCK_COURSES) {
    if (topic.includes(key) || key.includes(topic)) {
      return MOCK_COURSES[key];
    }
  }
  return null;
}

export function generateMockCourseId(topic: string): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = String(Math.floor(Math.random() * 999)).padStart(3, '0');
  const topicCode = topic.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 10);
  return `COURSE_${topicCode}_${dateStr}_${random}`;
}
