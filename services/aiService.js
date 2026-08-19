// AI服务封装
const { getDb } = require('./db');
const config = require('../config');
const https = require('https');
const http = require('http');

// 获取AI配置
function getAIConfig() {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ai_config ORDER BY id DESC LIMIT 1').get();
  return row || {
    provider: 'mock',
    api_key: '',
    base_url: '',
    model: '',
    is_enabled: 1
  };
}

// 保存AI配置
function saveAIConfig(config_data) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM ai_config ORDER BY id DESC LIMIT 1').get();
  
  if (existing) {
    db.prepare(`
      UPDATE ai_config 
      SET provider = ?, api_key = ?, base_url = ?, model = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      config_data.provider,
      config_data.api_key || '',
      config_data.base_url || '',
      config_data.model || '',
      config_data.is_enabled ? 1 : 0,
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO ai_config (provider, api_key, base_url, model, is_enabled)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      config_data.provider,
      config_data.api_key || '',
      config_data.base_url || '',
      config_data.model || '',
      config_data.is_enabled ? 1 : 0
    );
  }
  
  return getAIConfig();
}

// 调用AI接口（通用方法）
function callAI(provider, apiKey, baseUrl, model, messages) {
  return new Promise((resolve, reject) => {
    let url, body, headers;
    
    if (provider === 'mock') {
      // 模拟模式
      setTimeout(() => {
        resolve({
          content: generateMockAnswer(messages[messages.length - 1].content),
          isMock: true
        });
      }, 500 + Math.random() * 1000);
      return;
    }
    
    // 构建请求
    const providerConfig = config.ai.providers[provider];
    if (!providerConfig) {
      reject(new Error(`不支持的AI服务提供商: ${provider}`));
      return;
    }
    
    url = baseUrl || providerConfig.apiUrl;
    body = JSON.stringify({
      model: model || providerConfig.defaultModel,
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000
    });
    
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
    
    // 解析URL
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000 // 30秒超时
    };
    
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          // 处理不同AI提供商的响应格式
          if (response.choices && response.choices[0]) {
            resolve({
              content: response.choices[0].message.content,
              isMock: false
            });
          } else if (response.output && response.output.text) {
            // 通义千问格式
            resolve({
              content: response.output.text,
              isMock: false
            });
          } else {
            reject(new Error('AI响应格式错误'));
          }
        } catch (e) {
          reject(new Error(`解析AI响应失败: ${e.message}`));
        }
      });
    });
    
    req.on('error', (e) => {
      reject(new Error(`AI请求失败: ${e.message}`));
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('AI请求超时'));
    });
    
    req.write(body);
    req.end();
  });
}

// 生成模拟答案（当AI不可用时的兜底）
function generateMockAnswer(question) {
  const questionLower = question.toLowerCase();
  
  const mockResponses = [
    {
      patterns: ['报销', '发票', '费用'],
      answer: '关于报销问题，一般流程是：\n1. 准备好相关发票和凭证\n2. 填写报销申请单\n3. 提交部门经理审批\n4. 财务审核\n5. 款项到账\n\n如需更详细的流程说明，建议查看知识库中的"报销流程"分类，或联系财务部（分机：8002）。'
    },
    {
      patterns: ['请假', '休假', '年假'],
      answer: '关于请假流程：\n1. 登录OA系统\n2. 进入"考勤管理"→"请假申请"\n3. 选择请假类型和时间段\n4. 提交审批\n5. 等待审批通过\n\n如需了解详细规定，可查询"请假流程"分类下的相关知识条目。'
    },
    {
      patterns: ['权限', '账号', '系统'],
      answer: '关于系统权限：\n1. 新员工账号由HR在入职时统一申请\n2. 权限过期前7天系统会提醒\n3. 管理员权限需经过特殊审批流程\n\n如需申请或咨询，请联系IT部门（分机：8001）。'
    },
    {
      patterns: ['会议室', '预订'],
      answer: '会议室预订流程：\n1. 登录OA系统 → "会议室管理"\n2. 选择可用会议室和时间段\n3. 填写会议信息\n4. 提交预订申请\n\n大型会议室（10人以上）需部门经理审批。'
    },
    {
      patterns: ['VPN', '远程', '内网'],
      answer: 'VPN使用步骤：\n1. 下载并安装VPN客户端\n2. 使用OA账号登录\n3. 点击"连接"按钮\n4. 等待连接成功\n\n如遇问题请联系IT支持。'
    },
    {
      patterns: ['邮箱', '邮件', 'Outlook'],
      answer: '邮箱配置要点：\n- 服务器：mail.company.com\n- 账户类型：Exchange\n- 使用OA账号密码\n\n详细配置步骤可查看"IT支持"分类。'
    },
    {
      patterns: ['打印机', '打印'],
      answer: '添加打印机步骤：\n1. 控制面板 → 设备和打印机\n2. 添加网络打印机\n3. 选择公司打印机\n4. 安装驱动程序\n\n确保在公司网络或VPN环境下操作。'
    },
    {
      patterns: ['福利', '保险', '公积金'],
      answer: '公司福利：\n- 五险一金（养老、医疗、失业、工伤、生育保险+住房公积金）\n- 补充医疗保险\n- 节日福利\n- 年度体检\n\n详细福利政策可查看"福利待遇"分类。'
    }
  ];
  
  // 匹配最相关的模拟答案
  for (const response of mockResponses) {
    if (response.patterns.some(p => questionLower.includes(p))) {
      return `【AI兜底回答】\n\n${response.answer}\n\n💡 提示：此答案由AI生成，建议参考知识库中的标准答案或咨询相关部门获取准确信息。`;
    }
  }
  
  // 通用兜底回答
  return `【AI兜底回答】\n\n关于"${question}"的问题，根据常见情况，我建议您：\n\n1. 首先查看知识库是否有相关条目\n2. 如果未找到答案，可以：\n   - 咨询相关部门同事\n   - 联系行政/HR/IT等支持部门\n   - 在公司群里提问\n\n💡 提示：此答案由AI生成，可能不完全准确。如需官方答复，请咨询相关部门。`;
}

// 主入口：获取AI回答
async function getAIAnswer(question, context = []) {
  const aiConfig = getAIConfig();
  
  // 构建消息
  const messages = [
    {
      role: 'system',
      content: '你是一个专业的企业知识助手，请用简洁、准确的方式回答员工的问题。如果问题超出了你的知识范围，请建议用户咨询相关部门。'
    },
    ...context,
    {
      role: 'user',
      content: question
    }
  ];
  
  try {
    if (!aiConfig.is_enabled || aiConfig.provider === 'mock' || !aiConfig.api_key) {
      // 使用模拟模式
      return {
        source: 'ai',
        isMock: true,
        answer: generateMockAnswer(question),
        message: '当前使用AI模拟模式'
      };
    }
    
    // 调用真实AI
    const result = await callAI(
      aiConfig.provider,
      aiConfig.api_key,
      aiConfig.base_url,
      aiConfig.model,
      messages
    );
    
    return {
      source: 'ai',
      isMock: result.isMock || false,
      answer: result.content,
      message: result.isMock ? 'AI模拟回答' : 'AI真实回答'
    };
  } catch (error) {
    console.error('AI调用失败:', error.message);
    // AI调用失败时返回模拟答案
    return {
      source: 'ai',
      isMock: true,
      answer: generateMockAnswer(question),
      message: `AI服务暂不可用，已返回模拟答案（${error.message}）`
    };
  }
}

// 测试AI连接
async function testConnection() {
  const aiConfig = getAIConfig();
  
  if (!aiConfig.is_enabled || aiConfig.provider === 'mock' || !aiConfig.api_key) {
    return {
      success: true,
      message: '当前使用模拟AI模式（无需连接测试）',
      isMock: true
    };
  }
  
  try {
    const result = await callAI(
      aiConfig.provider,
      aiConfig.api_key,
      aiConfig.base_url,
      aiConfig.model,
      [{ role: 'user', content: '你好，请回复"连接成功"' }]
    );
    
    return {
      success: true,
      message: 'AI连接测试成功',
      response: result.content.substring(0, 100)
    };
  } catch (error) {
    return {
      success: false,
      message: `AI连接失败: ${error.message}`
    };
  }
}

module.exports = {
  getAIAnswer,
  testConnection,
  getAIConfig,
  saveAIConfig
};