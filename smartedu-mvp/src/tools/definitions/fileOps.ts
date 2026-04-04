import * as fs from 'fs';
import * as path from 'path';
import { ToolDefinition, ToolContext } from '../types';

function resolvePath(filePath: string, workDir: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(workDir, filePath);
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const createFileTool: ToolDefinition = {
  name: 'create_file',
  description: '创建新文件。如果文件已存在，会返回错误。',
  parameters: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: '文件路径（绝对或相对工作目录）' },
      content: { type: 'string', description: '文件内容' },
    },
    required: ['file_path', 'content'],
  },
  async execute(args, ctx: ToolContext) {
    const fp = resolvePath(args.file_path, ctx.workDir);
    if (fs.existsSync(fp)) throw new Error(`文件已存在: ${fp}`);
    ensureDir(fp);
    fs.writeFileSync(fp, args.content, 'utf-8');
    return { message: '文件创建成功', path: fp, size: args.content.length };
  },
};

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: '写入或覆盖文件。',
  parameters: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: '文件路径' },
      content: { type: 'string', description: '文件内容' },
      append: { type: 'boolean', description: '是否追加模式，默认覆盖' },
    },
    required: ['file_path', 'content'],
  },
  async execute(args, ctx: ToolContext) {
    const fp = resolvePath(args.file_path, ctx.workDir);
    ensureDir(fp);
    if (args.append) {
      fs.appendFileSync(fp, args.content, 'utf-8');
    } else {
      fs.writeFileSync(fp, args.content, 'utf-8');
    }
    const stats = fs.statSync(fp);
    return { message: args.append ? '追加成功' : '写入成功', path: fp, size: stats.size };
  },
};

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: '读取文件内容。',
  parameters: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: '文件路径' },
      max_length: { type: 'number', description: '最大读取长度，默认 50000' },
    },
    required: ['file_path'],
  },
  async execute(args, ctx: ToolContext) {
    const fp = resolvePath(args.file_path, ctx.workDir);
    if (!fs.existsSync(fp)) throw new Error(`文件不存在: ${fp}`);
    let content = fs.readFileSync(fp, 'utf-8');
    const max = args.max_length || 50000;
    if (content.length > max) {
      content = content.substring(0, max) + `\n[截断，原始 ${content.length} 字符]`;
    }
    return { content, path: fp, size: fs.statSync(fp).size };
  },
};

export const listFilesTool: ToolDefinition = {
  name: 'list_files',
  description: '列出目录下的文件。',
  parameters: {
    type: 'object',
    properties: {
      directory: { type: 'string', description: '目录路径，默认当前工作目录' },
      pattern: { type: 'string', description: '匹配模式，如 *.html' },
    },
    required: [],
  },
  async execute(args, ctx: ToolContext) {
    const dir = args.directory ? resolvePath(args.directory, ctx.workDir) : ctx.workDir;
    if (!fs.existsSync(dir)) throw new Error(`目录不存在: ${dir}`);
    let files = fs.readdirSync(dir);
    if (args.pattern) {
      const regex = new RegExp(args.pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
      files = files.filter(f => regex.test(f));
    }
    const infos = files.map(f => {
      const full = path.join(dir, f);
      const s = fs.statSync(full);
      return { name: f, type: s.isDirectory() ? 'directory' : 'file', size: s.size, modified: s.mtime.toISOString() };
    });
    return { directory: dir, files: infos, total: infos.length };
  },
};

export const fileExistsTool: ToolDefinition = {
  name: 'file_exists',
  description: '检查文件或目录是否存在。',
  parameters: {
    type: 'object',
    properties: { file_path: { type: 'string', description: '路径' } },
    required: ['file_path'],
  },
  async execute(args, ctx: ToolContext) {
    const fp = resolvePath(args.file_path, ctx.workDir);
    const exists = fs.existsSync(fp);
    return { exists, path: fp, type: exists ? (fs.statSync(fp).isDirectory() ? 'directory' : 'file') : null };
  },
};

export const createDirectoryTool: ToolDefinition = {
  name: 'create_directory',
  description: '创建目录（含父目录）。',
  parameters: {
    type: 'object',
    properties: { directory_path: { type: 'string', description: '目录路径' } },
    required: ['directory_path'],
  },
  async execute(args, ctx: ToolContext) {
    const dp = resolvePath(args.directory_path, ctx.workDir);
    if (fs.existsSync(dp)) throw new Error(`目录已存在: ${dp}`);
    fs.mkdirSync(dp, { recursive: true });
    return { message: '目录创建成功', path: dp };
  },
};

export const allFileOpsTools: ToolDefinition[] = [
  createFileTool,
  writeFileTool,
  readFileTool,
  listFilesTool,
  fileExistsTool,
  createDirectoryTool,
];
