// API封装模块
const API_BASE = '/api';

// 通用请求方法
async function request(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `请求失败: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// ============ 知识条目接口 ============
async function getKnowledgeItems(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  return request(`/knowledge?${queryString}`);
}

async function getKnowledgeItem(id) {
  return request(`/knowledge/${id}`);
}

async function createKnowledgeItem(data) {
  return request('/knowledge', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

async function updateKnowledgeItem(id, data) {
  return request(`/knowledge/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

async function deleteKnowledgeItem(id) {
  return request(`/knowledge/${id}`, {
    method: 'DELETE'
  });
}

async function importKnowledgeContent(content) {
  return request('/knowledge/import', {
    method: 'POST',
    body: JSON.stringify({ content })
  });
}

// ============ 分类接口 ============
async function getCategories() {
  return request('/categories');
}

async function createCategory(data) {
  return request('/categories', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

async function updateCategory(id, data) {
  return request(`/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

async function deleteCategory(id) {
  return request(`/categories/${id}`, {
    method: 'DELETE'
  });
}

// ============ 问答接口 ============
async function askQuestion(question) {
  return request('/query', {
    method: 'POST',
    body: JSON.stringify({ question })
  });
}

async function getQueryHistory(limit = 50) {
  return request(`/query/history?limit=${limit}`);
}

async function getQueryStats() {
  return request('/query/stats');
}

// ============ AI配置接口 ============
async function getAIConfig() {
  return request('/ai/config');
}

async function updateAIConfig(data) {
  return request('/ai/config', {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

async function testAIConnection() {
  return request('/ai/test', {
    method: 'POST'
  });
}

// ============ 健康检查 ============
async function healthCheck() {
  return fetch('/api/health').then(res => res.json());
}