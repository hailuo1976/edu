import axios from 'axios';
import fs from 'fs';
import path from 'path';

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface WebSearchOptions {
  count?: number;
  safeSearch?: 'Strict' | 'Moderate' | 'Off';
}

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const SEARCH_LOG_FILE = path.join(LOG_DIR, `web_search_${new Date().toISOString().split('T')[0]}.log`);

function logSearch(level: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
  
  console.log(message);
  
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    fs.appendFileSync(SEARCH_LOG_FILE, logEntry, 'utf-8');
  } catch (e) {
    console.error('Failed to write search log:', e);
  }
}

export class WebSearchService {
  private apiKey: string;
  private endpoint: string;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(options?: { apiKey?: string; endpoint?: string }) {
    this.apiKey = options?.apiKey || process.env.BING_SEARCH_KEY || '';
    this.endpoint = options?.endpoint || 'https://api.bing.microsoft.com/v7.0/search';
    this.maxRetries = 3;
    this.retryDelayMs = 1000;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async search(query: string, options: WebSearchOptions = {}): Promise<SearchResult[]> {
    const { count = 5, safeSearch = 'Moderate' } = options;

    if (!this.isConfigured()) {
      logSearch('WARN', 'Web search not configured, skipping search');
      return [];
    }

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logSearch('SEARCH_START', `=== Web搜索开始 [尝试 ${attempt}] ===`, {
          query,
          count,
          endpoint: this.endpoint
        });

        const response = await axios.get(this.endpoint, {
          params: {
            q: query,
            count,
            safeSearch,
            textFormat: 'Raw'
          },
          headers: {
            'Ocp-Apim-Subscription-Key': this.apiKey
          },
          timeout: 10000
        });

        const results: SearchResult[] = (response.data.webPages?.value || []).map((item: any) => ({
          title: item.name || '',
          snippet: item.snippet || '',
          url: item.url || ''
        }));

        logSearch('SEARCH_SUCCESS', `=== Web搜索成功 ===`, {
          query,
          resultCount: results.length,
          results: results.map(r => ({ title: r.title, url: r.url }))
        });

        return results;

      } catch (error: any) {
        lastError = error;

        logSearch('SEARCH_ERROR', `=== Web搜索失败 [尝试 ${attempt}] ===`, {
          query,
          errorMessage: error.message,
          responseStatus: error.response?.status,
          responseData: error.response?.data
        });

        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
          logSearch('SEARCH_RETRY', `等待 ${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logSearch('SEARCH_EXHAUSTED', '搜索重试次数耗尽', { query, error: lastError?.message });
    return [];
  }

  async searchEducationalContent(topic: string, subject?: string): Promise<SearchResult[]> {
    const queries = subject 
      ? [`${topic} ${subject} 教学`, `${topic} ${subject} education`, `${topic} 知识点讲解`]
      : [`${topic} 教学`, `${topic} education`, `${topic} 知识点`];
    
    const allResults: SearchResult[] = [];
    const seenUrls = new Set<string>();

    for (const query of queries) {
      const results = await this.search(query, { count: 3 });
      
      for (const result of results) {
        if (!seenUrls.has(result.url)) {
          seenUrls.add(result.url);
          allResults.push(result);
        }
      }

      if (allResults.length >= 5) break;
    }

    return allResults.slice(0, 5);
  }
}

export const webSearchService = new WebSearchService();
