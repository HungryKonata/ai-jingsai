const express = require('express');
const { executeQuery } = require('../services/matcher');
const { getAIAnswer } = require('../services/aiService');

const router = express.Router();

// 智能问答接口
router.post('/', async (req, res) => {
  try {
    const { question } = req.body;
    
    if (!question || !question.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: '请输入您的问题' 
      });
    }
    
    const trimmedQuestion = question.trim();
    
    // 1. 先在知识库中搜索匹配（取 top 10 以支持跨文档综合召回）
    const searchResult = executeQuery(trimmedQuestion, { topK: 10 });
    
    // 2. 如果找到匹配，返回知识库答案
    if (searchResult.hasMatch && searchResult.results[0].score >= 0.5) {
      const bestMatch = searchResult.results[0];
      
      // 跨文档综合召回：收集其他高相关条目作为参考（含同文档不同知识点）
      const relatedResults = searchResult.results
        .slice(1)
        .filter(r => r.score >= 0.5)
        .map(r => ({
          id: r.id,
          question: r.question,
          answer: r.answer,
          source_doc: r.category,
          score: r.score,
          confidence: r.confidence
        }));
      
      // 综合性问题：当存在多条高相关参考时，合并为综合答案（避免单条 best match 偏离）
      let answer = bestMatch.answer;
      let matchedQuestion = bestMatch.question;
      let sourceDoc = bestMatch.category;
      
      if (relatedResults.length >= 2) {
        const allItems = [bestMatch, ...relatedResults];
        answer = `该问题涉及多个知识点，系统从知识库综合召回 ${allItems.length} 条相关内容：\n\n` +
          allItems.map((r, i) =>
            `【${i + 1}】来源：《${r.source_doc || r.category}》\n问：${r.question}\n答：${r.answer}`
          ).join('\n\n');
        matchedQuestion = '（综合召回 ' + allItems.length + ' 条）';
        sourceDoc = '多文档综合';
      }
      
      return res.json({
        success: true,
        source: 'knowledge',
        answer: answer,
        matched_question: matchedQuestion,
        matched_item_id: bestMatch.id,
        category: bestMatch.category,
        source_doc: sourceDoc,
        confidence: bestMatch.confidence,
        score: bestMatch.score,
        related_results: relatedResults,
        similar_questions: searchResult.results.slice(1, 4).map(r => ({
          id: r.id,
          question: r.question,
          source_doc: r.category,
          score: r.score
        }))
      });
    }
    
    // 3. 没有找到匹配，调用AI兜底
    try {
      const aiResult = await getAIAnswer(trimmedQuestion);
      
      return res.json({
        success: true,
        source: aiResult.source,
        is_mock: aiResult.isMock,
        answer: aiResult.answer,
        message: aiResult.message,
        note: searchResult.hasMatch ? '知识库匹配度较低，使用AI生成' : '知识库中未找到相关内容，AI兜底回答'
      });
    } catch (aiError) {
      // AI也失败了，返回友好提示
      return res.json({
        success: false,
        source: 'none',
        answer: '抱歉，系统暂时无法回答您的问题。',
        message: '知识库中未找到相关内容，AI服务也暂不可用。请稍后重试或联系管理员。',
        error_detail: aiError.message
      });
    }
  } catch (error) {
    console.error('问答处理失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '系统处理您的问题时出现错误，请稍后重试' 
    });
  }
});

// 获取查询历史
router.get('/history', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const db = require('../services/db').getDb();
    
    const history = db.prepare(`
      SELECT * FROM query_logs 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(limit);
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('获取查询历史失败:', error);
    res.status(500).json({ success: false, message: '获取查询历史失败' });
  }
});

// 获取查询统计
router.get('/stats', (req, res) => {
  try {
    const db = require('../services/db').getDb();
    
    const stats = {
      total_queries: db.prepare('SELECT COUNT(*) as count FROM query_logs').get().count,
      knowledge_hits: db.prepare("SELECT COUNT(*) as count FROM query_logs WHERE source = 'knowledge'").get().count,
      ai_fallback: db.prepare("SELECT COUNT(*) as count FROM query_logs WHERE source = 'ai'").get().count,
      recent_queries: db.prepare(`
        SELECT query, source, created_at 
        FROM query_logs 
        ORDER BY created_at DESC 
        LIMIT 10
      `).all()
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({ success: false, message: '获取统计数据失败' });
  }
});

module.exports = router;