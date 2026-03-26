import fs from 'fs';
import path from 'path';
import { SearchResult } from './webSearch';

interface KnowledgeItem {
  id: string;
  topic: string;
  subject: string;
  content: string;
  keywords: string[];
  url?: string;
}

export class LocalKnowledgeSearch {
  private knowledgeBase: KnowledgeItem[] = [];
  private dataPath: string;

  constructor(dataPath?: string) {
    this.dataPath = dataPath || path.join(__dirname, '..', '..', 'data', 'knowledge.json');
    this.loadKnowledgeBase();
  }

  private loadKnowledgeBase(): void {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = fs.readFileSync(this.dataPath, 'utf-8');
        this.knowledgeBase = JSON.parse(data);
        console.log(`[LocalSearch] 加载了 ${this.knowledgeBase.length} 条知识条目`);
      } else {
        this.knowledgeBase = this.getDefaultKnowledge();
        this.saveKnowledgeBase();
        console.log(`[LocalSearch] 初始化了 ${this.knowledgeBase.length} 条默认知识`);
      }
    } catch (error: any) {
      console.error('[LocalSearch] 加载知识库失败:', error.message);
      this.knowledgeBase = this.getDefaultKnowledge();
    }
  }

  private saveKnowledgeBase(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dataPath, JSON.stringify(this.knowledgeBase, null, 2), 'utf-8');
    } catch (error: any) {
      console.error('[LocalSearch] 保存知识库失败:', error.message);
    }
  }

  private getDefaultKnowledge(): KnowledgeItem[] {
    return [
      {
        id: 'math-square-area',
        topic: '正方形面积',
        subject: '数学',
        content: '正方形面积 = 边长 × 边长。公式：S = a²，其中a为边长。',
        keywords: ['正方形', '面积', '正方形面积', '边长', '平方']
      },
      {
        id: 'math-rectangle-area',
        topic: '长方形面积',
        subject: '数学',
        content: '长方形面积 = 长 × 宽。公式：S = a × b，其中a为长，b为宽。',
        keywords: ['长方形', '面积', '长方形面积', '长', '宽']
      },
      {
        id: 'math-triangle-area',
        topic: '三角形面积',
        subject: '数学',
        content: '三角形面积 = 底 × 高 ÷ 2。公式：S = ah/2，其中a为底，h为高。',
        keywords: ['三角形', '面积', '三角形面积', '底', '高']
      },
      {
        id: 'math-circle-area',
        topic: '圆形面积',
        subject: '数学',
        content: '圆形面积 = π × 半径²。公式：S = πr²，其中r为半径，π≈3.14。',
        keywords: ['圆形', '圆', '面积', '圆面积', '半径', 'π']
      },
      {
        id: 'math-circle-perimeter',
        topic: '圆形周长',
        subject: '数学',
        content: '圆形周长 = 2 × π × 半径。公式：C = 2πr，或 C = πd（d为直径）。',
        keywords: ['圆形', '圆', '周长', '圆周长', '半径', '直径']
      },
      {
        id: 'math-fraction-add',
        topic: '分数加法',
        subject: '数学',
        content: '分数相加：同分母分数相加，分母不变，分子相加；异分母分数相加，先通分再计算。',
        keywords: ['分数', '加法', '分数加法', '通分']
      },
      {
        id: 'math-fraction-sub',
        topic: '分数减法',
        subject: '数学',
        content: '分数相减：同分母分数相减，分母不变，分子相减；异分母分数相减，先通分再计算。',
        keywords: ['分数', '减法', '分数减法', '通分']
      },
      {
        id: 'math-percentage',
        topic: '百分数',
        subject: '数学',
        content: '百分数表示一个数是另一个数的百分之几。公式：百分数 = (部分/总数) × 100%。',
        keywords: ['百分数', '百分比', '百分号', '%']
      },
      {
        id: 'chinese-pinyin',
        topic: '拼音',
        subject: '语文',
        content: '汉语拼音是汉字的注音方法，包括声母、韵母和声调。',
        keywords: ['拼音', '声母', '韵母', '声调', '汉语拼音']
      },
      {
        id: 'english-alphabet',
        topic: '英文字母',
        subject: '英语',
        content: '英语字母表有26个字母，分为元音字母和辅音字母。元音字母：A、E、I、O、U。',
        keywords: ['英语', '字母', '英文字母', '26个字母', '元音', '辅音']
      },
      {
        id: 'science-plant',
        topic: '植物',
        subject: '科学',
        content: '植物的基本结构包括根、茎、叶、花、果实和种子。绿色植物通过光合作用制造养料。',
        keywords: ['植物', '光合作用', '根', '茎', '叶', '花']
      },
      {
        id: 'science-water-cycle',
        topic: '水循环',
        subject: '科学',
        content: '水循环包括蒸发、凝结、降水和径流等过程。太阳能驱动水在大气、陆地和海洋间循环。',
        keywords: ['水循环', '蒸发', '降水', '凝结', '自然现象']
      }
    ];
  }

  search(query: string, subject?: string, limit = 5): SearchResult[] {
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/[\s,，。.]+/).filter(k => k.length > 1);

    const scores: { item: KnowledgeItem; score: number }[] = [];

    for (const item of this.knowledgeBase) {
      if (subject && item.subject !== subject) continue;

      let score = 0;

      if (item.topic.toLowerCase().includes(queryLower)) score += 10;
      if (item.content.toLowerCase().includes(queryLower)) score += 5;

      for (const keyword of keywords) {
        if (item.keywords.some(k => k.includes(keyword))) score += 3;
        if (item.content.toLowerCase().includes(keyword)) score += 1;
      }

      if (score > 0) {
        scores.push({ item, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, limit).map(({ item }) => ({
      title: item.topic,
      snippet: item.content,
      url: item.url || `local://knowledge/${item.id}`
    }));
  }

  addKnowledge(item: Omit<KnowledgeItem, 'id'>): void {
    const id = `custom-${Date.now()}`;
    this.knowledgeBase.push({ ...item, id });
    this.saveKnowledgeBase();
    console.log(`[LocalSearch] 添加了新知识: ${item.topic}`);
  }

  getStats(): { total: number; bySubject: Record<string, number> } {
    const bySubject: Record<string, number> = {};
    for (const item of this.knowledgeBase) {
      bySubject[item.subject] = (bySubject[item.subject] || 0) + 1;
    }
    return { total: this.knowledgeBase.length, bySubject };
  }
}

export const localKnowledgeSearch = new LocalKnowledgeSearch();