import { ToolDefinition, ToolContext } from '../types';

export const generateSvgTool: ToolDefinition = {
  name: 'generate_svg',
  description: '生成 SVG 矢量图形，用于可视化数学概念',
  parameters: {
    type: 'object',
    properties: {
      shape_type: { type: 'string', description: '图形类型: rect, circle, triangle 等' },
      dimensions: { type: 'object', description: '尺寸参数 { width, height, radius, size }' },
      label: { type: 'string', description: '标注文字' },
      style: { type: 'string', description: '样式描述' },
    },
    required: ['shape_type', 'dimensions'],
  },
  async execute(args, _ctx: ToolContext) {
    const { shape_type, dimensions, label } = args;
    let svg = '';

    switch (shape_type) {
      case 'rect': {
        const w = dimensions.width || 100, h = dimensions.height || 100;
        svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/>${label ? `<text x="${w/2}" y="${h/2}" text-anchor="middle" fill="white" font-size="14">${label}</text>` : ''}</svg>`;
        break;
      }
      case 'circle': {
        const r = dimensions.radius || 50;
        svg = `<svg width="${r*2}" height="${r*2}" xmlns="http://www.w3.org/2000/svg"><circle cx="${r}" cy="${r}" r="${r-2}" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/>${label ? `<text x="${r}" y="${r+5}" text-anchor="middle" fill="white" font-size="14">${label}</text>` : ''}</svg>`;
        break;
      }
      case 'triangle': {
        const s = dimensions.size || 100;
        svg = `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg"><polygon points="${s/2},0 ${s},${s} 0,${s}" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/>${label ? `<text x="${s/2}" y="${s/2}" text-anchor="middle" fill="white" font-size="14">${label}</text>` : ''}</svg>`;
        break;
      }
      default: {
        const w = dimensions.width || 100, h = dimensions.height || 100;
        svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/>${label ? `<text x="${w/2}" y="${h/2}" text-anchor="middle" fill="white" font-size="14">${label}</text>` : ''}</svg>`;
      }
    }

    return { svg_code: svg, shape_type, dimensions };
  },
};

export const generateSvgDiagramTool: ToolDefinition = {
  name: 'generate_svg_diagram',
  description: '根据描述生成 SVG 图形',
  parameters: {
    type: 'object',
    properties: {
      description: { type: 'string', description: '图形描述' },
      diagram_type: { type: 'string', description: '图形类型: rect, circle, triangle 等' },
    },
    required: ['description'],
  },
  async execute(args, _ctx: ToolContext) {
    const { description, diagram_type = 'rect' } = args;
    const templates: Record<string, string> = {
      circle: `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><circle cx="100" cy="100" r="90" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/><text x="100" y="100" text-anchor="middle" fill="white" font-size="12">${description}</text></svg>`,
      triangle: `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><polygon points="100,10 190,190 10,190" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/><text x="100" y="100" text-anchor="middle" fill="white" font-size="12">${description}</text></svg>`,
    };
    const svg = templates[diagram_type] || `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="180" height="180" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/><text x="100" y="100" text-anchor="middle" fill="white" font-size="12">${description}</text></svg>`;
    return { svg_code: svg, description, diagram_type };
  },
};
