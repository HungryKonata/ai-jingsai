const express = require('express');
const { getDb } = require('../services/db');

const router = express.Router();

// 获取分类列表
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const categories = db.prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM knowledge_items k WHERE k.category_id = c.id AND k.is_active = 1) as item_count
      FROM categories c 
      ORDER BY c.sort_order, c.id
    `).all();
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('获取分类列表失败:', error);
    res.status(500).json({ success: false, message: '获取分类列表失败' });
  }
});

// 新增分类
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { name, icon = 'folder', sort_order = 0 } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: '分类名称为必填项' });
    }
    
    // 检查是否已存在
    const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
    if (existing) {
      return res.status(400).json({ success: false, message: '分类名称已存在' });
    }
    
    const result = db.prepare(`
      INSERT INTO categories (name, icon, sort_order)
      VALUES (?, ?, ?)
    `).run(name, icon, sort_order);
    
    const newCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    
    res.json({
      success: true,
      data: newCategory,
      message: '分类创建成功'
    });
  } catch (error) {
    console.error('创建分类失败:', error);
    res.status(500).json({ success: false, message: '创建分类失败' });
  }
});

// 更新分类
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { name, icon, sort_order } = req.body;
    
    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: '分类不存在' });
    }
    
    const updates = [];
    const params = [];
    
    if (name !== undefined) {
      const existing = db.prepare('SELECT id FROM categories WHERE name = ? AND id != ?').get(name, req.params.id);
      if (existing) {
        return res.status(400).json({ success: false, message: '分类名称已存在' });
      }
      updates.push('name = ?');
      params.push(name);
    }
    if (icon !== undefined) {
      updates.push('icon = ?');
      params.push(icon);
    }
    if (sort_order !== undefined) {
      updates.push('sort_order = ?');
      params.push(sort_order);
    }
    
    if (updates.length === 0) {
      return res.json({ success: true, message: '没有需要更新的内容' });
    }
    
    params.push(req.params.id);
    db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    
    const updatedCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: updatedCategory, message: '更新成功' });
  } catch (error) {
    console.error('更新分类失败:', error);
    res.status(500).json({ success: false, message: '更新分类失败' });
  }
});

// 删除分类
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    
    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: '分类不存在' });
    }
    
    // 检查是否有知识条目使用此分类
    const itemCount = db.prepare('SELECT COUNT(*) as count FROM knowledge_items WHERE category_id = ?').get(req.params.id).count;
    if (itemCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `该分类下还有 ${itemCount} 条知识条目，无法删除` 
      });
    }
    
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    
    res.json({ success: true, message: '分类删除成功' });
  } catch (error) {
    console.error('删除分类失败:', error);
    res.status(500).json({ success: false, message: '删除分类失败' });
  }
});

module.exports = router;