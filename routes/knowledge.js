const express = require('express');
const { getDb } = require('../services/db');

const router = express.Router();

// 获取知识条目列表
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { category_id, search, page = 1, page_size = 20 } = req.query;
    const offset = (page - 1) * page_size;
    
    let query = `
      SELECT k.*, c.name as category_name 
      FROM knowledge_items k 
      LEFT JOIN categories c ON k.category_id = c.id 
      WHERE k.is_active = 1
    `;
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM knowledge_items k 
      WHERE k.is_active = 1
    `;
    const params = [];
    
    if (category_id) {
      query += ' AND k.category_id = ?';
      countQuery += ' AND k.category_id = ?';
      params.push(category_id);
    }
    
    if (search) {
      query += ' AND (k.question LIKE ? OR k.answer LIKE ? OR k.keywords LIKE ?)';
      countQuery += ' AND (k.question LIKE ? OR k.answer LIKE ? OR k.keywords LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    query += ' ORDER BY k.updated_at DESC LIMIT ? OFFSET ?';
    const queryParams = [...params, parseInt(page_size), offset];
    const countParams = [...params];
    
    const items = db.prepare(query).all(...queryParams);
    const total = db.prepare(countQuery).get(...countParams).total;
    
    // 解析keywords JSON
    items.forEach(item => {
      try {
        item.keywords = JSON.parse(item.keywords || '[]');
      } catch (e) {
        item.keywords = [];
      }
    });
    
    res.json({
      success: true,
      data: items,
      pagination: {
        page: parseInt(page),
        page_size: parseInt(page_size),
        total,
        total_pages: Math.ceil(total / page_size)
      }
    });
  } catch (error) {
    console.error('获取知识条目失败:', error);
    res.status(500).json({ success: false, message: '获取知识条目失败' });
  }
});

// 获取单个知识条目
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare(`
      SELECT k.*, c.name as category_name 
      FROM knowledge_items k 
      LEFT JOIN categories c ON k.category_id = c.id 
      WHERE k.id = ?
    `).get(req.params.id);
    
    if (!item) {
      return res.status(404).json({ success: false, message: '知识条目不存在' });
    }
    
    try {
      item.keywords = JSON.parse(item.keywords || '[]');
    } catch (e) {
      item.keywords = [];
    }
    
    res.json({ success: true, data: item });
  } catch (error) {
    console.error('获取知识条目失败:', error);
    res.status(500).json({ success: false, message: '获取知识条目失败' });
  }
});

// 新增知识条目
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { question, answer, category_id, keywords = [] } = req.body;
    
    if (!question || !answer) {
      return res.status(400).json({ 
        success: false, 
        message: '问题和答案为必填项' 
      });
    }
    
    const result = db.prepare(`
      INSERT INTO knowledge_items (question, answer, category_id, keywords)
      VALUES (?, ?, ?, ?)
    `).run(
      question,
      answer,
      category_id || null,
      JSON.stringify(keywords)
    );
    
    const newItem = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(result.lastInsertRowid);
    
    res.json({ 
      success: true, 
      data: newItem,
      message: '知识条目创建成功' 
    });
  } catch (error) {
    console.error('创建知识条目失败:', error);
    res.status(500).json({ success: false, message: '创建知识条目失败' });
  }
});

// 更新知识条目
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { question, answer, category_id, keywords, is_active } = req.body;
    
    const item = db.prepare('SELECT id FROM knowledge_items WHERE id = ?').get(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: '知识条目不存在' });
    }
    
    const updates = [];
    const params = [];
    
    if (question !== undefined) {
      updates.push('question = ?');
      params.push(question);
    }
    if (answer !== undefined) {
      updates.push('answer = ?');
      params.push(answer);
    }
    if (category_id !== undefined) {
      updates.push('category_id = ?');
      params.push(category_id);
    }
    if (keywords !== undefined) {
      updates.push('keywords = ?');
      params.push(JSON.stringify(keywords));
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }
    
    if (updates.length === 0) {
      return res.json({ success: true, message: '没有需要更新的内容' });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);
    
    db.prepare(`UPDATE knowledge_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    
    const updatedItem = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: updatedItem, message: '更新成功' });
  } catch (error) {
    console.error('更新知识条目失败:', error);
    res.status(500).json({ success: false, message: '更新知识条目失败' });
  }
});

// 删除知识条目
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    
    const item = db.prepare('SELECT id FROM knowledge_items WHERE id = ?').get(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: '知识条目不存在' });
    }
    
    // 软删除（禁用）
    db.prepare('UPDATE knowledge_items SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(req.params.id);
    
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除知识条目失败:', error);
    res.status(500).json({ success: false, message: '删除知识条目失败' });
  }
});

// 导入Markdown文件
router.post('/import', (req, res) => {
  try {
    const db = getDb();
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ success: false, message: '请提供要导入的内容' });
    }
    
    // 解析Markdown格式的问答对
    const items = parseMarkdownContent(content);
    let importedCount = 0;
    
    const insertMany = db.transaction((itemsToInsert) => {
      for (const item of itemsToInsert) {
        // 查找或创建分类
        let categoryId = null;
        if (item.category) {
          const category = db.prepare('SELECT id FROM categories WHERE name = ?').get(item.category);
          if (category) {
            categoryId = category.id;
          } else {
            const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(item.category);
            categoryId = result.lastInsertRowid;
          }
        }
        
        db.prepare(`
          INSERT INTO knowledge_items (question, answer, category_id, keywords)
          VALUES (?, ?, ?, ?)
        `).run(item.question, item.answer, categoryId, JSON.stringify(item.keywords || []));
        
        importedCount++;
      }
    });
    
    insertMany(items);
    
    res.json({
      success: true,
      message: `成功导入 ${importedCount} 条知识条目`,
      importedCount
    });
  } catch (error) {
    console.error('导入失败:', error);
    res.status(500).json({ success: false, message: '导入失败' });
  }
});

// 解析Markdown内容
function parseMarkdownContent(content) {
  const items = [];
  const lines = content.split('\n');
  let currentItem = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 检查是否是问题行（以# 或 ## 开头）
    if (line.startsWith('# ')) {
      // 保存上一个条目
      if (currentItem) {
        items.push(currentItem);
      }
      currentItem = {
        question: line.substring(2).trim(),
        answer: '',
        category: '',
        keywords: []
      };
    } else if (line.startsWith('## ')) {
      // 二级标题作为分类
      if (currentItem) {
        currentItem.category = line.substring(3).trim();
      }
    } else if (currentItem) {
      // 答案内容
      if (line.startsWith('- ') || line.startsWith('* ')) {
        currentItem.answer += line.substring(2) + '\n';
      } else if (line.startsWith('关键词：') || line.startsWith('Keywords:')) {
        const keywordsStr = line.split(/[:：]/)[1] || '';
        currentItem.keywords = keywordsStr.split(/[,，、]/).map(k => k.trim()).filter(k => k);
      } else {
        currentItem.answer += line + '\n';
      }
    }
  }
  
  // 保存最后一个条目
  if (currentItem) {
    currentItem.answer = currentItem.answer.trim();
    if (currentItem.question && currentItem.answer) {
      items.push(currentItem);
    }
  }
  
  return items;
}

module.exports = router;