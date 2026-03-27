import * as fs from 'fs';
import * as path from 'path';
import {
  ToolDefinition,
  ToolCall,
  ToolResult,
  AgentConfig,
} from '../types/agent';

export const createFileTool: ToolDefinition = {
  name: 'create_file',
  description: '创建新文件。如果文件已存在，会返回错误。适用于首次创建文件。',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '文件路径，可以是绝对路径或相对于当前工作目录的路径',
      },
      content: {
        type: 'string',
        description: '文件内容',
      },
    },
    required: ['file_path', 'content'],
  },
};

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: '写入或覆盖文件。如果文件不存在会创建，如果存在会覆盖。适用于更新已有文件。',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '文件路径，可以是绝对路径或相对于当前工作目录的路径',
      },
      content: {
        type: 'string',
        description: '文件内容',
      },
      append: {
        type: 'boolean',
        description: '是否追加模式，默认为false（覆盖）',
        default: false,
      },
    },
    required: ['file_path', 'content'],
  },
};

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: '读取文件内容。返回文件的完整内容。',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '文件路径，可以是绝对路径或相对于当前工作目录的路径',
      },
      encoding: {
        type: 'string',
        description: '文件编码，默认utf-8',
        default: 'utf-8',
      },
      max_length: {
        type: 'number',
        description: '最大读取长度（字符数），超过会被截断',
        default: 50000,
      },
    },
    required: ['file_path'],
  },
};

export const listFilesTool: ToolDefinition = {
  name: 'list_files',
  description: '列出目录下的文件。返回文件列表。',
  inputSchema: {
    type: 'object',
    properties: {
      directory: {
        type: 'string',
        description: '目录路径，默认为当前工作目录',
        default: '.',
      },
      pattern: {
        type: 'string',
        description: '文件匹配模式，如*.html, *.json',
      },
    },
    required: [],
  },
};

export const fileExistsTool: ToolDefinition = {
  name: 'file_exists',
  description: '检查文件或目录是否存在。',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '文件或目录路径',
      },
    },
    required: ['file_path'],
  },
};

export const createDirectoryTool: ToolDefinition = {
  name: 'create_directory',
  description: '创建目录。如果父目录不存在，会自动创建。',
  inputSchema: {
    type: 'object',
    properties: {
      directory_path: {
        type: 'string',
        description: '目录路径',
      },
    },
    required: ['directory_path'],
  },
};

export class FileToolExecutor {
  private workDir: string;

  constructor(workDir: string = './') {
    this.workDir = path.resolve(workDir);
  }

  setWorkDir(dir: string) {
    this.workDir = path.resolve(dir);
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.workDir, filePath);
  }

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const { name, arguments: args } = toolCall;

    try {
      switch (name) {
        case 'create_file':
          return this.createFile(toolCallId, args);
        case 'write_file':
          return this.writeFile(toolCallId, args);
        case 'read_file':
          return this.readFile(toolCallId, args);
        case 'list_files':
          return this.listFiles(toolCallId, args);
        case 'file_exists':
          return this.fileExists(toolCallId, args);
        case 'create_directory':
          return this.createDirectory(toolCallId, args);
        default:
          return {
            toolCallId,
            toolName: name,
            success: false,
            error: `未知工具: ${name}`,
          };
      }
    } catch (error: any) {
      return {
        toolCallId,
        toolName: name,
        success: false,
        error: error.message || String(error),
      };
    }
  }

  private createFile(toolCallId: string, args: any): ToolResult {
    const filePath = this.resolvePath(args.file_path);

    if (fs.existsSync(filePath)) {
      return {
        toolCallId,
        toolName: 'create_file',
        success: false,
        error: `文件已存在: ${filePath}`,
      };
    }

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, args.content, 'utf-8');

    return {
      toolCallId,
      toolName: 'create_file',
      success: true,
      result: {
        message: `文件创建成功`,
        path: filePath,
        size: args.content.length,
      },
    };
  }

  private writeFile(toolCallId: string, args: any): ToolResult {
    const filePath = this.resolvePath(args.file_path);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (args.append) {
      fs.appendFileSync(filePath, args.content, 'utf-8');
    } else {
      fs.writeFileSync(filePath, args.content, 'utf-8');
    }

    const stats = fs.statSync(filePath);

    return {
      toolCallId,
      toolName: 'write_file',
      success: true,
      result: {
        message: args.append ? '内容追加成功' : '文件写入成功',
        path: filePath,
        size: stats.size,
        append: args.append || false,
      },
    };
  }

  private readFile(toolCallId: string, args: any): ToolResult {
    const filePath = this.resolvePath(args.file_path);

    if (!fs.existsSync(filePath)) {
      return {
        toolCallId,
        toolName: 'read_file',
        success: false,
        error: `文件不存在: ${filePath}`,
      };
    }

    let content: string = fs.readFileSync(filePath, args.encoding || 'utf-8') as any;
    const maxLength = args.max_length || 50000;

    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + `\n\n[内容已截断，原始长度: ${content.length} 字符]`;
    }

    const stats = fs.statSync(filePath);

    return {
      toolCallId,
      toolName: 'read_file',
      success: true,
      result: {
        content,
        path: filePath,
        size: stats.size,
        truncated: content.length > maxLength,
      },
    };
  }

  private listFiles(toolCallId: string, args: any): ToolResult {
    const directory = this.resolvePath(args.directory || '.');

    if (!fs.existsSync(directory)) {
      return {
        toolCallId,
        toolName: 'list_files',
        success: false,
        error: `目录不存在: ${directory}`,
      };
    }

    let files = fs.readdirSync(directory);

    if (args.pattern) {
      const regex = new RegExp(args.pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
      files = files.filter(f => regex.test(f));
    }

    const fileInfos = files.map(f => {
      const fullPath = path.join(directory, f);
      const stats = fs.statSync(fullPath);
      return {
        name: f,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        modified: stats.mtime.toISOString(),
      };
    });

    return {
      toolCallId,
      toolName: 'list_files',
      success: true,
      result: {
        directory,
        files: fileInfos,
        total: fileInfos.length,
      },
    };
  }

  private fileExists(toolCallId: string, args: any): ToolResult {
    const filePath = this.resolvePath(args.file_path);
    const exists = fs.existsSync(filePath);

    return {
      toolCallId,
      toolName: 'file_exists',
      success: true,
      result: {
        exists,
        path: filePath,
        type: exists ? (fs.statSync(filePath).isDirectory() ? 'directory' : 'file') : null,
      },
    };
  }

  private createDirectory(toolCallId: string, args: any): ToolResult {
    const dirPath = this.resolvePath(args.directory_path);

    if (fs.existsSync(dirPath)) {
      return {
        toolCallId,
        toolName: 'create_directory',
        success: false,
        error: `目录已存在: ${dirPath}`,
      };
    }

    fs.mkdirSync(dirPath, { recursive: true });

    return {
      toolCallId,
      toolName: 'create_directory',
      success: true,
      result: {
        message: '目录创建成功',
        path: dirPath,
      },
    };
  }
}

export const FILE_TOOLS: ToolDefinition[] = [
  createFileTool,
  writeFileTool,
  readFileTool,
  listFilesTool,
  fileExistsTool,
  createDirectoryTool,
];

export const fileToolExecutor = new FileToolExecutor();
