const express = require('express');
const { getAIConfig, saveAIConfig, testConnection } = require('../services/aiService');
const config = require('../config');

const router = express.Router();

// 获取AI配置
router.get('/config', (req, res) => {
  try {
    const aiConfig = getAIConfig();
    
    // 隐藏API Key（只返回前4位和后4位）
    const safeConfig = {
      ...aiConfig,
      api_key: aiConfig.api_key ? maskApiKey(aiConfig.api_key) : ''
    };
    
    res.json({
      success: true,
      data: safeConfig,
      available_providers: Object.keys(config.ai.providers).map(key => ({
        id: key,
        name: config.ai.providers[key].name
      }))
    });
  } catch (error) {
    console.error('获取AI配置失败:', error);
    res.status(500).json({ success: false, message: '获取AI配置失败' });
  }
});

// 更新AI配置
router.put('/config', (req, res) => {
  try {
    const { provider, api_key, base_url, model, is_enabled } = req.body;
    
    // 验证provider
    if (provider && !config.ai.providers[provider]) {
      return res.status(400).json({ 
        success: false, 
        message: `不支持的AI服务提供商: ${provider}` 
      });
    }
    
    // 如果API Key被遮盖，保留原值
    let finalApiKey = api_key;
    if (api_key && api_key.includes('****')) {
      const currentConfig = getAIConfig();
      finalApiKey = currentConfig.api_key;
    }
    
    const newConfig = saveAIConfig({
      provider: provider || 'mock',
      api_key: finalApiKey || '',
      base_url: base_url || '',
      model: model || '',
      is_enabled: is_enabled !== undefined ? is_enabled : true
    });
    
    res.json({
      success: true,
      data: {
        ...newConfig,
        api_key: newConfig.api_key ? maskApiKey(newConfig.api_key) : ''
      },
      message: 'AI配置保存成功'
    });
  } catch (error) {
    console.error('保存AI配置失败:', error);
    res.status(500).json({ success: false, message: '保存AI配置失败' });
  }
});

// 测试AI连接
router.post('/test', async (req, res) => {
  try {
    const result = await testConnection();
    
    res.json({
      success: result.success,
      message: result.message,
      data: result
    });
  } catch (error) {
    console.error('AI连接测试失败:', error);
    res.json({
      success: false,
      message: `连接测试失败: ${error.message}`,
      isMock: true
    });
  }
});

// 掩码API Key
function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length < 8) {
    return '****';
  }
  return apiKey.substring(0, 4) + '****' + apiKey.substring(apiKey.length - 4);
}

module.exports = router;