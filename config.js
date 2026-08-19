// 应用配置
const path = require('path');

module.exports = {
  // 服务器配置
  server: {
    port: process.env.PORT || 3000,
    host: '0.0.0.0'
  },
  
  // 数据库配置
  database: {
    path: path.join(__dirname, 'data', 'knowledge.db')
  },
  
  // 文件上传配置
  upload: {
    dir: path.join(__dirname, 'uploads'),
    maxSize: 5 * 1024 * 1024 // 5MB
  },
  
  // AI服务默认配置
  ai: {
    defaultProvider: 'mock',
    providers: {
      mock: {
        name: '模拟AI',
        enabled: true
      },
      deepseek: {
        name: 'DeepSeek',
        apiUrl: 'https://api.deepseek.com/v1/chat/completions',
        defaultModel: 'deepseek-chat'
      },
      doubao: {
        name: '豆包',
        apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
        defaultModel: 'doubao-pro-32k'
      },
      qwen: {
        name: '通义千问',
        apiUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
        defaultModel: 'qwen-turbo'
      }
    }
  },
  
  // 匹配配置
  matching: {
    minScore: 0.3, // 最低匹配分数
    topK: 3, // 返回前K个结果
    fuzzyMatch: true // 启用模糊匹配
  }
};