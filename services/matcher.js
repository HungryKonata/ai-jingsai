// 关键词匹配服务
const { getDb } = require('./db');
const config = require('../config');

// 拆分复合问题为子问题（支持 ①②③ 编号、分号、问号分隔）
function splitSubQueries(query) {
  // 优先按 ①②③④⑤⑥⑦⑧⑨⑩ 编号拆分
  let parts = query.split(/[①②③④⑤⑥⑦⑧⑨⑩]/).map(s => s.trim()).filter(s => s.length > 4);
  if (parts.length > 1) return parts;
  // 按分号拆分
  parts = query.split(/[；;]/).map(s => s.trim()).filter(s => s.length > 6);
  if (parts.length > 1) return parts;
  return [query];
}

// 计算两个字符串的相似度（基于Levenshtein距离和关键词匹配）
function calculateSimilarity(query, item) {
  const queryLower = query.toLowerCase();
  const questionLower = item.question.toLowerCase();
  const answerLower = item.answer.toLowerCase();
  const keywords = JSON.parse(item.keywords || '[]');
  
  let score = 0;
  
  // 1. 精确匹配问题（最高权重）
  if (questionLower === queryLower) {
    score = 1.0;
    return { score, matchedType: 'exact' };
  }
  
  // 2. 问题包含查询
  if (questionLower.includes(queryLower)) {
    score = 0.85;
    return { score, matchedType: 'question_contains' };
  }
  
  // 3. 查询包含问题
  if (queryLower.includes(questionLower)) {
    score = 0.75;
    return { score, matchedType: 'query_contains' };
  }
  
  // 4. 关键词匹配
  const queryWords = queryLower.split(/[\s,，。？？、；;!！]+/).filter(w => w.length > 0);
  let keywordMatches = 0;
  
  // 检查预定义关键词
  for (const keyword of keywords) {
    if (queryLower.includes(keyword.toLowerCase())) {
      keywordMatches += 2; // 关键词匹配权重加倍
    }
  }
  
  // 检查问题中的关键短语
  const questionWords = questionLower.split(/[\s,，。？？、；;!！]+/).filter(w => w.length >= 2);
  let wordMatches = 0;
  
  for (const qWord of queryWords) {
    if (questionLower.includes(qWord) || answerLower.includes(qWord)) {
      wordMatches += 1;
    }
  }
  
  // 关键词和词匹配加权计算
  const totalWords = Math.max(queryWords.length, 1);
  score = (keywordMatches + wordMatches) / (totalWords * 2);
  
  // 5. 模糊匹配（编辑距离）
  if (config.matching.fuzzyMatch && score < 0.3) {
    const distance = levenshteinDistance(
      queryLower.substring(0, 20), 
      questionLower.substring(0, 20)
    );
    const maxLength = Math.max(queryLower.length, questionLower.length);
    const fuzzyScore = 1 - (distance / maxLength);
    score = Math.max(score, fuzzyScore * 0.6);
  }
  
  return { 
    score: Math.min(score, 0.95), // 限制最高分避免与精确匹配混淆
    matchedType: score >= 0.7 ? 'keyword' : 'partial'
  };
}

// Levenshtein距离计算
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 替换
          matrix[i][j - 1] + 1,     // 插入
          matrix[i - 1][j] + 1      // 删除
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// 在知识库中搜索匹配项
function searchKnowledge(query, options = {}) {
  const db = getDb();
  const { minScore = config.matching.minScore, topK = config.matching.topK, categoryId = null } = options;
  
  // 获取所有启用的知识条目
  let items;
  if (categoryId) {
    items = db.prepare(`
      SELECT k.*, c.name as category_name 
      FROM knowledge_items k 
      LEFT JOIN categories c ON k.category_id = c.id 
      WHERE k.is_active = 1 AND k.category_id = ?
    `).all(categoryId);
  } else {
    items = db.prepare(`
      SELECT k.*, c.name as category_name 
      FROM knowledge_items k 
      LEFT JOIN categories c ON k.category_id = c.id 
      WHERE k.is_active = 1
    `).all();
  }
  
  // 计算每个条目的相似度
  // 对含编号/多子句的长复合问题，拆分为子问题分别匹配，取最高分（避免长文本稀释）
  const subQueries = splitSubQueries(query);
  const scoredItems = items.map(item => {
    if (subQueries.length > 1) {
      // 复合问题：取各子问题中的最高分
      let maxScore = 0;
      let bestType = 'partial';
      for (const sq of subQueries) {
        const r = calculateSimilarity(sq, item);
        if (r.score > maxScore) { maxScore = r.score; bestType = r.matchedType; }
      }
      return { ...item, score: maxScore, matchedType: bestType };
    }
    const { score, matchedType } = calculateSimilarity(query, item);
    return { ...item, score, matchedType };
  });
  
  // 过滤低于阈值的结果并排序
  const results = scoredItems
    .filter(item => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  
  return results;
}

// 执行查询并返回结果
function executeQuery(query, options = {}) {
  const results = searchKnowledge(query, options);
  
  // 记录查询日志
  const db = getDb();
  const topResult = results[0] || null;
  
  db.prepare(`
    INSERT INTO query_logs (query, source, result_id)
    VALUES (?, ?, ?)
  `).run(
    query,
    topResult ? 'knowledge' : 'none',
    topResult ? topResult.id : null
  );
  
  return {
    hasMatch: results.length > 0,
    results: results.map(r => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      category: r.category_name,
      score: r.score,
      confidence: getConfidenceLevel(r.score)
    }))
  };
}

// 获取置信度等级
function getConfidenceLevel(score) {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

module.exports = {
  searchKnowledge,
  executeQuery,
  calculateSimilarity
};