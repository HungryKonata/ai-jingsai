// 主应用逻辑

// 状态管理
const state = {
  currentPage: 'home',
  categories: [],
  knowledgeList: [],
  currentItemId: null,
  currentPageNum: 1,
  pageSize: 10,
};

// ============ 页面导航 ============
function navigateTo(page) {
  state.currentPage = page;
  
  // 隐藏所有页面
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  
  // 显示目标页面
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) {
    pageEl.classList.remove('hidden');
  }
  
  // 更新导航按钮状态
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const navBtn = document.getElementById(`nav-${page}`);
  if (navBtn) {
    navBtn.classList.add('active');
  }
  
  // 加载对应页面数据
  if (page === 'home') {
    loadHomePage();
  } else if (page === 'list') {
    loadListPage();
  } else if (page === 'admin') {
    loadAdminPage();
  } else if (page === 'settings') {
    loadSettingsPage();
  }
}

// ============ 首页 ============
async function loadHomePage() {
  try {
    // 加载统计数据
    const stats = await getQueryStats();
    if (stats.success) {
      document.getElementById('stat-total').textContent = stats.data.total_queries || 0;
      document.getElementById('stat-hits').textContent = stats.data.knowledge_hits || 0;
      document.getElementById('stat-ai').textContent = stats.data.ai_fallback || 0;
    }
  } catch (error) {
    console.error('加载统计失败:', error);
  }
}

// 快速提问
function quickAsk(question) {
  document.getElementById('search-input').value = question;
  handleSearch();
}

// 处理搜索
async function handleSearch() {
  const input = document.getElementById('search-input');
  const question = input.value.trim();
  
  if (!question) {
    showToast('请输入您的问题', 'error');
    return;
  }
  
  // 显示加载状态
  document.getElementById('result-area').classList.add('hidden');
  document.getElementById('loading-area').classList.remove('hidden');
  
  try {
    const result = await askQuestion(question);
    
    // 隐藏加载状态
    document.getElementById('loading-area').classList.add('hidden');
    
    // 显示结果
    displayResult(question, result);
  } catch (error) {
    document.getElementById('loading-area').classList.add('hidden');
    showToast('查询失败：' + error.message, 'error');
    // 在结果区显示持久错误卡片（避免 toast 一闪而过用户没看清）
    const resultArea = document.getElementById('result-area');
    resultArea.classList.remove('hidden');
    document.getElementById('result-question').textContent = question;
    const badge = document.getElementById('result-source-badge');
    badge.className = 'badge badge-source';
    badge.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i><span style="color:#dc2626;">服务异常</span>';
    document.getElementById('result-confidence').classList.add('hidden');
    document.getElementById('result-note').classList.add('hidden');
    document.getElementById('related-results').classList.add('hidden');
    document.getElementById('similar-questions').classList.add('hidden');
    document.getElementById('result-answer').innerHTML = `
      <div class="bg-red-50 border border-red-200 rounded-lg p-5 text-red-700">
        <p class="font-semibold mb-2"><i class="fas fa-exclamation-circle mr-1"></i>无法获取答案</p>
        <p class="text-sm mb-2">查询过程中发生错误：<span class="font-mono">${error.message || '未知错误'}</span></p>
        <p class="text-sm text-red-500 mb-3">可能原因：后端服务未启动 / 网络中断 / 服务器内部异常。<br>请检查服务状态后重试。</p>
        <button onclick="handleSearch()" class="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition">
          <i class="fas fa-redo mr-1"></i>重新查询
        </button>
      </div>`;
  }
}

// 显示结果
function displayResult(question, result) {
  const resultArea = document.getElementById('result-area');
  resultArea.classList.remove('hidden');
  
  // 设置问题
  document.getElementById('result-question').textContent = question;
  
  // 设置答案（source='none' 即知识库未命中且AI也失败，用醒目警告样式）
  const answerEl = document.getElementById('result-answer');
  if (result.source === 'none' || result.success === false) {
    answerEl.innerHTML = `
      <div class="bg-amber-50 border border-amber-300 rounded-lg p-5 text-amber-800">
        <p class="font-semibold mb-2"><i class="fas fa-exclamation-triangle mr-1"></i>未找到匹配答案</p>
        <p class="text-sm mb-2">${result.answer || '暂无答案'}</p>
        ${result.message ? `<p class="text-xs text-amber-600 mt-2 border-t border-amber-200 pt-2">详情：${result.message}</p>` : ''}
        <p class="text-xs text-amber-500 mt-2">建议：尝试换一种问法，或联系管理员补充该问题的知识条目。</p>
      </div>`;
  } else {
    answerEl.textContent = result.answer || '暂无答案';
  }
  
  // 设置来源标签（含出处文档）
  const sourceBadge = document.getElementById('result-source-badge');
  
  if (result.source === 'knowledge') {
    sourceBadge.className = 'badge badge-source';
    const docLabel = result.source_doc ? ` ·《${result.source_doc}》` : '';
    sourceBadge.innerHTML = `<i class="fas fa-database mr-1"></i><span>知识库${docLabel}</span>`;
  } else if (result.source === 'ai') {
    sourceBadge.className = 'badge badge-source ai';
    sourceBadge.innerHTML = '<i class="fas fa-robot mr-1"></i><span>AI生成</span>';
  } else if (result.source === 'none' || result.success === false) {
    sourceBadge.className = 'badge badge-source';
    sourceBadge.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i><span style="color:#d97706;">未匹配</span>';
  } else {
    sourceBadge.className = 'badge badge-source';
    sourceBadge.innerHTML = '<i class="fas fa-info-circle mr-1"></i><span>系统</span>';
  }
  
  // 设置置信度
  const confidenceEl = document.getElementById('result-confidence');
  if (result.confidence) {
    confidenceEl.classList.remove('hidden');
    confidenceEl.className = `badge badge-confidence ${result.confidence}`;
    const confText = result.confidence === 'high' ? '高置信度' : 
                     result.confidence === 'medium' ? '中置信度' : '低置信度';
    confidenceEl.textContent = confText;
  } else {
    confidenceEl.classList.add('hidden');
  }
  
  // 设置备注信息
  const noteEl = document.getElementById('result-note');
  if (result.note) {
    noteEl.textContent = result.note;
    noteEl.classList.remove('hidden');
  } else {
    noteEl.classList.add('hidden');
  }
  
  // 跨文档参考结果（综合召回）
  const relatedArea = document.getElementById('related-results');
  if (relatedArea) {
    if (result.related_results && result.related_results.length > 0) {
      relatedArea.classList.remove('hidden');
      const escapeHtml = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      relatedArea.innerHTML = `
        <p class="text-sm font-medium text-gray-700 mb-2"><i class="fas fa-link text-blue-500 mr-1"></i>跨文档参考（综合召回 ${result.related_results.length} 条）</p>
        <div class="space-y-3">
          ${result.related_results.map(r => `
            <div class="bg-white border rounded-lg p-3">
              <div class="flex items-center gap-2 mb-1">
                <span class="badge badge-source" style="background-color:#dbeafe;color:#1e40af;"><i class="fas fa-file-alt mr-1"></i>《${escapeHtml(r.source_doc)}》</span>
                <span class="text-xs text-gray-400">相关度 ${(r.score*100).toFixed(0)}%</span>
              </div>
              <p class="text-sm font-medium text-gray-800 mb-1">${escapeHtml(r.question)}</p>
              <p class="text-sm text-gray-600 whitespace-pre-line">${escapeHtml(r.answer)}</p>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      relatedArea.classList.add('hidden');
    }
  }
  
  // 相似问题
  const similarArea = document.getElementById('similar-questions');
  const similarList = document.getElementById('similar-list');
  
  if (result.similar_questions && result.similar_questions.length > 0) {
    similarArea.classList.remove('hidden');
    similarList.innerHTML = result.similar_questions.map(q => 
      `<button onclick="quickAsk('${q.question.replace(/'/g, "\\'")}')" class="text-sm px-3 py-1 bg-white rounded-full border hover:bg-blue-50 hover:border-blue-300 transition">${q.question}</button>`
    ).join('');
  } else {
    similarArea.classList.add('hidden');
  }
  
  // 更新统计
  loadHomePage();
}

// 关闭结果
function closeResult() {
  document.getElementById('result-area').classList.add('hidden');
}

// ============ 知识列表页 ============
let listSearchTimeout = null;

async function loadListPage() {
  try {
    // 加载分类
    const catResult = await getCategories();
    if (catResult.success) {
      state.categories = catResult.data;
      const select = document.getElementById('list-category');
      select.innerHTML = '<option value="">全部分类</option>';
      catResult.data.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
      });
    }
    
    // 加载知识列表
    await loadKnowledgeList();
  } catch (error) {
    console.error('加载失败:', error);
    showToast('加载失败', 'error');
  }
}

async function loadKnowledgeList() {
  try {
    const search = document.getElementById('list-search')?.value || '';
    const categoryId = document.getElementById('list-category')?.value || '';
    
    const params = {
      page: state.currentPageNum,
      page_size: state.pageSize
    };
    if (search) params.search = search;
    if (categoryId) params.category_id = categoryId;
    
    const result = await getKnowledgeItems(params);
    
    if (result.success) {
      state.knowledgeList = result.data;
      renderKnowledgeList(result.data);
      renderPagination(result.pagination);
    }
  } catch (error) {
    console.error('加载知识列表失败:', error);
    const container = document.getElementById('knowledge-list');
    if (container) {
      container.innerHTML = `
        <div class="empty-state bg-white rounded-xl">
          <i class="fas fa-exclamation-circle text-red-400"></i>
          <p class="mt-2">列表加载失败</p>
          <p class="text-sm text-gray-400 mt-1">${error.message || '网络或服务异常'}</p>
          <button onclick="loadKnowledgeList()" class="mt-3 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition">
            <i class="fas fa-redo mr-1"></i>重新加载
          </button>
        </div>`;
    }
    document.getElementById('pagination').innerHTML = '';
  }
}

function renderKnowledgeList(items) {
  const container = document.getElementById('knowledge-list');
  
  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state bg-white rounded-xl">
        <i class="fas fa-box-open"></i>
        <p>暂无知识条目</p>
        <p class="text-sm text-gray-400 mt-1">没有找到匹配的内容，试试更换关键词或清除筛选条件</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = items.map(item => {
    const categoryName = item.category_name || '未分类';
    const categoryColors = {
      '报销流程': 'bg-blue-100 text-blue-700',
      '请假流程': 'bg-green-100 text-green-700',
      '系统权限': 'bg-purple-100 text-purple-700',
      '办公规范': 'bg-orange-100 text-orange-700',
      'IT支持': 'bg-cyan-100 text-cyan-700',
      '福利待遇': 'bg-pink-100 text-pink-700',
      '规章制度': 'bg-indigo-100 text-indigo-700',
    };
    const colorClass = categoryColors[categoryName] || 'bg-gray-100 text-gray-700';
    
    const answerPreview = item.answer.length > 100 
      ? item.answer.substring(0, 100) + '...' 
      : item.answer;
    
    const keywords = Array.isArray(item.keywords) ? item.keywords : [];
    
    return `
      <div class="knowledge-card bg-white rounded-xl p-5 shadow-sm">
        <div class="flex justify-between items-start mb-3">
          <span class="category-tag ${colorClass}">${categoryName}</span>
          <span class="text-xs text-gray-400">${new Date(item.updated_at).toLocaleDateString()}</span>
        </div>
        <h3 class="font-semibold text-gray-800 mb-2">${item.question}</h3>
        <p class="text-gray-600 text-sm mb-3 whitespace-pre-line">${answerPreview}</p>
        <div class="flex flex-wrap gap-1">
          ${keywords.map(k => `<span class="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">${k}</span>`).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderPagination(pagination) {
  const container = document.getElementById('pagination');
  if (!pagination || pagination.total_pages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  let html = '';
  html += `<button class="pagination-btn" onclick="goToPage(${pagination.page - 1})" ${pagination.page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
  
  for (let i = 1; i <= pagination.total_pages; i++) {
    if (i === 1 || i === pagination.total_pages || Math.abs(i - pagination.page) <= 2) {
      html += `<button class="pagination-btn ${i === pagination.page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    } else if (Math.abs(i - pagination.page) === 3) {
      html += '<span class="px-2">...</span>';
    }
  }
  
  html += `<button class="pagination-btn" onclick="goToPage(${pagination.page + 1})" ${pagination.page >= pagination.total_pages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
  
  container.innerHTML = html;
}

function goToPage(page) {
  state.currentPageNum = page;
  loadKnowledgeList();
}

function debounceSearch() {
  if (listSearchTimeout) {
    clearTimeout(listSearchTimeout);
  }
  listSearchTimeout = setTimeout(() => {
    state.currentPageNum = 1;
    loadKnowledgeList();
  }, 300);
}

// ============ 管理页面 ============
async function loadAdminPage() {
  try {
    // 加载分类用于下拉框
    const catResult = await getCategories();
    if (catResult.success) {
      state.categories = catResult.data;
      const select = document.getElementById('modal-category');
      select.innerHTML = '<option value="">未分类</option>';
      catResult.data.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
      });
    }
    
    // 加载知识条目
    const result = await getKnowledgeItems({ page_size: 50 });
    if (result.success) {
      renderAdminList(result.data);
    }
  } catch (error) {
    console.error('加载管理页面失败:', error);
    showToast('加载失败', 'error');
  }
}

function renderAdminList(items) {
  const tbody = document.getElementById('admin-list');
  
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">暂无数据</td></tr>';
    return;
  }
  
  tbody.innerHTML = items.map(item => {
    const statusBadge = item.is_active ? 
      '<span class="badge badge-confidence high">启用</span>' : 
      '<span class="badge badge-confidence low">已禁用</span>';
    
    return `
      <tr>
        <td class="px-4 py-3 max-w-md">
          <p class="font-medium text-gray-800 truncate">${item.question}</p>
        </td>
        <td class="px-4 py-3">
          <span class="text-sm text-gray-600">${item.category_name || '未分类'}</span>
        </td>
        <td class="px-4 py-3 text-sm text-gray-500">${new Date(item.updated_at).toLocaleString()}</td>
        <td class="px-4 py-3">${statusBadge}</td>
        <td class="px-4 py-3">
          <div class="flex gap-2">
            <button onclick="editKnowledgeItem(${item.id})" class="text-blue-600 hover:text-blue-800 text-sm">
              <i class="fas fa-edit"></i>
            </button>
            <button onclick="toggleKnowledgeItem(${item.id}, ${item.is_active ? 0 : 1})" class="text-yellow-600 hover:text-yellow-800 text-sm">
              <i class="fas fa-${item.is_active ? 'pause' : 'play'}"></i>
            </button>
            <button onclick="deleteKnowledgeItem(${item.id})" class="text-red-600 hover:text-red-800 text-sm">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// 打开知识条目弹窗
function openKnowledgeModal(itemId = null) {
  state.currentItemId = itemId;
  const modal = document.getElementById('knowledge-modal');
  const title = document.getElementById('modal-title');
  
  if (itemId) {
    title.textContent = '编辑知识条目';
    // 加载现有数据
    getKnowledgeItem(itemId).then(result => {
      if (result.success) {
        const item = result.data;
        document.getElementById('modal-question').value = item.question || '';
        document.getElementById('modal-answer').value = item.answer || '';
        document.getElementById('modal-category').value = item.category_id || '';
        const keywords = Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
        document.getElementById('modal-keywords').value = keywords;
      }
    });
  } else {
    title.textContent = '新增知识条目';
    document.getElementById('modal-question').value = '';
    document.getElementById('modal-answer').value = '';
    document.getElementById('modal-category').value = '';
    document.getElementById('modal-keywords').value = '';
  }
  
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeKnowledgeModal() {
  const modal = document.getElementById('knowledge-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  state.currentItemId = null;
}

function editKnowledgeItem(id) {
  openKnowledgeModal(id);
}

async function saveKnowledgeItem() {
  const question = document.getElementById('modal-question').value.trim();
  const answer = document.getElementById('modal-answer').value.trim();
  const categoryId = document.getElementById('modal-category').value;
  const keywordsStr = document.getElementById('modal-keywords').value;
  const keywords = keywordsStr.split(/[,，]/).map(k => k.trim()).filter(k => k);
  
  if (!question || !answer) {
    showToast('问题和答案为必填项', 'error');
    return;
  }
  
  try {
    let result;
    if (state.currentItemId) {
      result = await updateKnowledgeItem(state.currentItemId, {
        question, answer, category_id: categoryId || null, keywords
      });
    } else {
      result = await createKnowledgeItem({
        question, answer, category_id: categoryId || null, keywords
      });
    }
    
    if (result.success) {
      showToast(state.currentItemId ? '更新成功' : '创建成功');
      closeKnowledgeModal();
      loadAdminPage();
    } else {
      showToast(result.message || '操作失败', 'error');
    }
  } catch (error) {
    showToast(error.message || '操作失败', 'error');
  }
}

async function toggleKnowledgeItem(id, newStatus) {
  try {
    const result = await updateKnowledgeItem(id, { is_active: newStatus });
    if (result.success) {
      showToast(newStatus ? '已启用' : '已禁用');
      loadAdminPage();
    }
  } catch (error) {
    showToast(error.message || '操作失败', 'error');
  }
}

async function deleteKnowledgeItem(id) {
  if (!confirm('确定要删除此知识条目吗？')) return;
  
  try {
    const result = await deleteKnowledgeItem(id);
    if (result.success) {
      showToast('删除成功');
      loadAdminPage();
    }
  } catch (error) {
    showToast(error.message || '删除失败', 'error');
  }
}

// 文件上传
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const content = await readFileContent(file);
    const result = await importKnowledgeContent(content);
    
    if (result.success) {
      showToast(`成功导入 ${result.importedCount} 条知识`);
      loadAdminPage();
    } else {
      showToast(result.message || '导入失败', 'error');
    }
  } catch (error) {
    showToast(error.message || '文件读取失败', 'error');
  }
  
  event.target.value = '';
}

function readFileContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });
}

// ============ AI配置页面 ============
async function loadSettingsPage() {
  try {
    const result = await getAIConfig();
    if (result.success && result.data) {
      const config = result.data;
      document.getElementById('ai-enabled').checked = config.is_enabled || false;
      document.getElementById('ai-provider').value = config.provider || 'mock';
      document.getElementById('ai-api-key').value = config.api_key || '';
      document.getElementById('ai-base-url').value = config.base_url || '';
      document.getElementById('ai-model').value = config.model || '';
      
      updateProviderOptions();
    }
  } catch (error) {
    console.error('加载AI配置失败:', error);
  }
}

function updateProviderOptions() {
  const provider = document.getElementById('ai-provider').value;
  const details = document.getElementById('ai-config-details');
  
  if (provider === 'mock') {
    details.classList.add('hidden');
  } else {
    details.classList.remove('hidden');
    
    // 根据提供商设置默认模型
    const modelInput = document.getElementById('ai-model');
    const defaults = {
      deepseek: 'deepseek-chat',
      doubao: 'doubao-pro-32k',
      qwen: 'qwen-turbo'
    };
    if (!modelInput.value) {
      modelInput.value = defaults[provider] || '';
    }
  }
}

async function saveAIConfig() {
  const data = {
    provider: document.getElementById('ai-provider').value,
    api_key: document.getElementById('ai-api-key').value,
    base_url: document.getElementById('ai-base-url').value,
    model: document.getElementById('ai-model').value,
    is_enabled: document.getElementById('ai-enabled').checked
  };
  
  try {
    const result = await updateAIConfig(data);
    if (result.success) {
      showToast('AI配置保存成功');
    } else {
      showToast(result.message || '保存失败', 'error');
    }
  } catch (error) {
    showToast(error.message || '保存失败', 'error');
  }
}

async function testAIConnection() {
  const resultDiv = document.getElementById('test-result');
  resultDiv.innerHTML = '<div class="text-center py-2"><i class="fas fa-spinner fa-spin text-blue-500"></i> 正在测试连接...</div>';
  
  try {
    const result = await testAIConnection();
    if (result.success) {
      resultDiv.innerHTML = `<div class="bg-green-50 text-green-700 p-3 rounded-lg"><i class="fas fa-check-circle mr-1"></i>${result.message}</div>`;
      showToast('连接测试成功');
    } else {
      resultDiv.innerHTML = `<div class="bg-red-50 text-red-700 p-3 rounded-lg"><i class="fas fa-times-circle mr-1"></i>${result.message}</div>`;
      showToast(result.message || '连接失败', 'error');
    }
  } catch (error) {
    resultDiv.innerHTML = `<div class="bg-red-50 text-red-700 p-3 rounded-lg"><i class="fas fa-times-circle mr-1"></i>${error.message || '测试失败'}</div>`;
  }
}

// ============ 导出 ============
async function exportData() {
  try {
    const result = await getKnowledgeItems({ page_size: 1000 });
    if (result.success) {
      const items = result.data;
      const csv = generateCSV(items);
      downloadCSV(csv, `知识库导出_${new Date().toISOString().split('T')[0]}.csv`);
      showToast('导出成功');
    }
  } catch (error) {
    showToast(error.message || '导出失败', 'error');
  }
}

function generateCSV(items) {
  const headers = ['分类', '问题', '答案', '关键词', '状态', '更新时间'];
  const rows = items.map(item => [
    item.category_name || '',
    item.question,
    item.answer.replace(/[\r\n,]/g, ' '),
    Array.isArray(item.keywords) ? item.keywords.join('|') : '',
    item.is_active ? '启用' : '已禁用',
    new Date(item.updated_at).toLocaleString()
  ]);
  
  return '\ufeff' + [headers, ...rows].map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============ Toast提示 ============
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const msg = document.getElementById('toast-message');
  
  msg.textContent = message;
  icon.className = type === 'error' ? 'fas fa-times-circle text-red-400' : 
                   type === 'info' ? 'fas fa-info-circle text-blue-400' : 
                   'fas fa-check-circle text-green-400';
  
  toast.classList.remove('hidden');
  toast.classList.add('toast-enter');
  
  setTimeout(() => {
    toast.classList.add('hidden');
    toast.classList.remove('toast-enter');
  }, 3000);
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', () => {
  // 初始化页面
  navigateTo('home');
  
  // 添加回车键搜索支持
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    });
  }
  
  // ESC关闭弹窗
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeKnowledgeModal();
    }
  });
  
  console.log('部门常见问题知识库系统已启动');
});