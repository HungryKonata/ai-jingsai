const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');

let db = null;

// 初始化数据库
function initDatabase() {
  // 确保数据目录存在
  const dbDir = path.dirname(config.database.path);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  db = new Database(config.database.path);
  
  // 启用WAL模式以提高性能
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  
  // 创建表结构
  createTables();
  
  // 检查是否需要初始化示例数据
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
  if (categoryCount === 0) {
    seedCategories();
    seedKnowledge();
  }
  
  console.log('数据库初始化完成');
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT DEFAULT 'folder',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS knowledge_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category_id INTEGER,
      keywords TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
    
    CREATE TABLE IF NOT EXISTS query_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      source TEXT NOT NULL,
      result_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS ai_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT DEFAULT 'mock',
      api_key TEXT DEFAULT '',
      base_url TEXT DEFAULT '',
      model TEXT DEFAULT '',
      is_enabled INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_items(category_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_active ON knowledge_items(is_active);
    CREATE INDEX IF NOT EXISTS idx_query_logs_query ON query_logs(query);
  `);
  
  // 初始化AI配置默认记录
  const configCount = db.prepare('SELECT COUNT(*) as count FROM ai_config').get().count;
  if (configCount === 0) {
    db.prepare(`
      INSERT INTO ai_config (provider, api_key, base_url, model, is_enabled)
      VALUES ('mock', '', '', '', 1)
    `).run();
  }
}

// 预置分类
function seedCategories() {
  const categories = [
    { name: '报销流程', icon: 'money', sort_order: 1 },
    { name: '请假流程', icon: 'calendar', sort_order: 2 },
    { name: '系统权限', icon: 'lock', sort_order: 3 },
    { name: '办公规范', icon: 'file-text', sort_order: 4 },
    { name: 'IT支持', icon: 'computer', sort_order: 5 },
    { name: '福利待遇', icon: 'gift', sort_order: 6 },
    { name: '规章制度', icon: 'book', sort_order: 7 },
    // 三峡集团业务文档（分类名即来源文档名，用于出处标注）
    { name: '白鹤滩电站参数手册', icon: 'bolt', sort_order: 10 },
    { name: '监测巡检管理办法', icon: 'chart-line', sort_order: 11 },
    { name: '符合性初审工作指引', icon: 'gavel', sort_order: 12 },
    { name: '其他', icon: 'more', sort_order: 99 }
  ];
  
  const insert = db.prepare('INSERT INTO categories (name, icon, sort_order) VALUES (?, ?, ?)');
  const insertMany = db.transaction((cats) => {
    for (const cat of cats) {
      insert.run(cat.name, cat.icon, cat.sort_order);
    }
  });
  
  insertMany(categories);
  console.log('分类数据初始化完成');
}

// 预置知识条目
function seedKnowledge() {
  const knowledgeItems = [
    // 报销流程
    {
      question: '如何申请差旅报销？',
      answer: '差旅报销流程：\n1. 出差前填写《差旅申请单》并获得部门经理批准；\n2. 出差结束后5个工作日内提交报销申请；\n3. 登录财务系统，上传以下材料：\n   - 机票/火车票/汽车票等交通凭证\n   - 酒店住宿发票\n   - 餐饮发票（不超过标准）\n   - 差旅申请单扫描件\n4. 财务部门审核（3个工作日）；\n5. 报销款将在审核通过后3个工作日内到账。',
      category: '报销流程',
      keywords: ['差旅', '报销', '出差', '机票', '酒店']
    },
    {
      question: '报销需要哪些材料？',
      answer: '报销所需材料清单：\n1. 正规发票（抬头正确、内容清晰）；\n2. 费用明细说明；\n3. 相关审批单据（如差旅申请、采购申请等）；\n4. 支付凭证（如银行卡刷卡记录）；\n5. 特殊情况需提供补充说明。\n注意：所有材料请拍照或扫描为清晰的电子版本上传。',
      category: '报销流程',
      keywords: ['报销', '材料', '发票', '凭证', '提交']
    },
    {
      question: '报销审批流程是怎样的？',
      answer: '报销审批流程：\n1. 员工提交报销申请 → 部门经理审批（1个工作日）\n2. 部门经理审批通过 → 财务初审（2个工作日）\n3. 财务初审通过 → 财务经理复核（1个工作日）\n4. 复核通过 → 出纳付款（3个工作日）\n5. 付款完成 → 系统通知\n\n温馨提示：金额超过5000元需分管领导审批，超过20000元需总经理审批。',
      category: '报销流程',
      keywords: ['报销', '审批', '流程', '财务', '付款']
    },
    
    // 请假流程
    {
      question: '如何申请年假？',
      answer: '年假申请流程：\n1. 登录OA系统 → 选择"考勤管理" → "请假申请"\n2. 选择请假类型为"年假"\n3. 填写开始时间、结束时间、请假原因\n4. 提交审批（提前3个工作日申请）\n5. 部门经理审批通过后生效\n\n注意：\n- 工作满1年不满10年，年休假5天\n- 工作满10年不满20年，年休假10天\n- 工作满20年以上，年休假15天',
      category: '请假流程',
      keywords: ['年假', '请假', '休假', 'OA', '考勤']
    },
    {
      question: '病假需要什么证明？',
      answer: '病假所需证明：\n1. 病假1-3天：无需证明，事后补交即可\n2. 病假4-7天：需提供医院门诊病历或诊断证明\n3. 病假8天以上：需提供医院诊断证明、治疗记录\n4. 病假30天以上：需提供三甲医院诊断证明\n\n提交方式：OA系统请假申请中上传扫描件。',
      category: '请假流程',
      keywords: ['病假', '医院', '证明', '诊断', '考勤']
    },
    {
      question: '事假如何申请？',
      answer: '事假申请流程：\n1. 登录OA系统 → "请假申请" → 选择"事假"\n2. 填写请假时间及原因\n3. 提前提交审批（原则上提前1天）\n4. 审批流程：\n   - 1天以内：部门经理审批\n   - 1-3天：部门经理+分管领导审批\n   - 3天以上：部门经理+分管领导+总经理审批\n\n注意：事假期间扣除相应工资。',
      category: '请假流程',
      keywords: ['事假', '请假', '审批', 'OA', '流程']
    },
    
    // 系统权限
    {
      question: '如何申请系统账号？',
      answer: '系统账号申请流程：\n1. 新员工入职时，由HR在入职流程中统一申请\n2. 特殊情况下需单独申请：\n   - 填写《系统账号申请表》\n   - 部门经理签字\n   - 提交至IT部门\n3. IT部门在1-3个工作日内完成账号创建\n4. 账号信息将通过企业邮箱发送\n\n注意：账号仅限本人使用，请勿转借他人。',
      category: '系统权限',
      keywords: ['账号', '系统', '申请', 'IT', '权限']
    },
    {
      question: '权限过期如何续期？',
      answer: '权限续期流程：\n1. 系统会在权限到期前7天发送提醒邮件\n2. 登录IT管理平台 → "我的权限" → 选择需要续期的权限\n3. 点击"申请续期"按钮\n4. 填写续期原因并提交\n5. 部门经理审批后自动续期\n\n注意：部分权限需重新进行安全培训后方可续期。',
      category: '系统权限',
      keywords: ['权限', '续期', '过期', 'IT', '系统']
    },
    {
      question: '如何申请管理员权限？',
      answer: '管理员权限申请流程：\n1. 填写《管理员权限申请表》，详细说明使用场景\n2. 部门经理审核签字\n3. IT安全部门审核\n4. 分管领导审批\n5. IT部门配置权限\n\n审批周期：5-7个工作日\n\n安全要求：\n- 必须完成信息安全培训\n- 签署《管理员权限使用承诺书》\n- 权限使用情况将被监控和审计',
      category: '系统权限',
      keywords: ['管理员', '权限', '申请', '审批', '安全']
    },
    
    // 办公规范
    {
      question: '公司上下班时间？',
      answer: '公司工作时间规定：\n\n标准工时制：\n- 工作时间：周一至周五 9:00 - 18:00\n- 午休时间：12:00 - 13:30\n- 弹性时间：9:00-9:30 为弹性上班时段\n\n注意事项：\n- 上下班需打卡（指纹或人脸）\n- 每月允许3次忘打卡，超过需说明\n- 加班需提前申请并经领导批准',
      category: '办公规范',
      keywords: ['上下班', '工作时间', '打卡', '考勤', '办公']
    },
    {
      question: '会议室如何预订？',
      answer: '会议室预订流程：\n1. 登录OA系统 → "会议室管理"\n2. 查看可用会议室及时间段\n3. 选择会议室 → 填写预订信息（主题、参会人数、时间）\n4. 提交预订申请\n5. 系统确认后发送通知\n\n注意事项：\n- 预订后如不能使用，请及时取消\n- 超过15分钟未到视为放弃\n- 大型会议室（10人以上）需部门经理审批',
      category: '办公规范',
      keywords: ['会议室', '预订', 'OA', '办公', '会议']
    },
    {
      question: '快递收件地址？',
      answer: '快递收件信息：\n\n收件人：部门/本人姓名\n收件地址：XX市XX区XX路XX号XX大厦X楼\n邮政编码：XXXXXX\n\n注意事项：\n1. 快递请注明"内部办公"字样\n2. 员工个人快递请写清楚部门和姓名\n3. 快递到达后将存放在前台\n4. 请在3个工作日内领取\n5. 贵重物品请当面签收',
      category: '办公规范',
      keywords: ['快递', '收件', '地址', '办公', '邮寄']
    },
    
    // IT支持
    {
      question: 'VPN如何连接？',
      answer: 'VPN连接步骤：\n1. 在IT部门下载VPN客户端软件\n2. 安装并打开VPN客户端\n3. 输入OA系统用户名和密码\n4. 选择"连接"按钮\n5. 等待连接成功（显示绿色状态）\n6. 即可访问公司内网资源\n\n常见问题：\n- 连接失败：检查账号密码是否正确\n- 速度慢：切换VPN节点\n- 无法连接：联系IT部门（分机：8001）',
      category: 'IT支持',
      keywords: ['VPN', '连接', '内网', '远程', 'IT']
    },
    {
      question: '邮箱如何配置？',
      answer: '邮箱配置指南：\n\nOutlook配置：\n1. 打开Outlook → 文件 → 添加账户\n2. 选择"手动配置" → 下一步\n3. 填写信息：\n   - 您的姓名：您的姓名\n   - 电子邮件地址：name@company.com\n   - 账户类型：Exchange\n4. 服务器设置：\n   - 服务器：mail.company.com\n   - 用户名：您的邮箱账号\n5. 完成配置\n\n手机配置：\n- iOS：设置 → 邮件 → 添加账户 → Exchange\n- Android：设置 → 账户 → 添加 → Exchange',
      category: 'IT支持',
      keywords: ['邮箱', 'Outlook', '配置', '邮件', 'Exchange']
    },
    {
      question: '打印机如何设置？',
      answer: '打印机设置步骤：\n\n添加网络打印机：\n1. 控制面板 → 设备和打印机 → 添加打印机\n2. 选择"添加网络、无线或蓝牙打印机"\n3. 等待搜索可用打印机\n4. 选择目标打印机 → 下一步\n5. 安装驱动程序 → 完成\n\n常见问题：\n- 无法打印：检查网络连接和打印机状态\n- 打印队列卡住：重启打印机和电脑\n- 找不到打印机：确认在公司网络或VPN环境下\n\n打印机列表：请参考IT部门印发的《打印机使用指南》',
      category: 'IT支持',
      keywords: ['打印机', '设置', '网络', 'IT', '办公']
    },
    
    // 福利待遇
    {
      question: '公司有哪些福利？',
      answer: '公司福利待遇：\n\n1. 五险一金\n   - 养老保险、医疗保险、失业保险、工伤保险、生育保险\n   - 住房公积金（个人12%，公司12%）\n\n2. 补充医疗\n   - 门诊报销：年度上限2000元\n   - 住院报销：医保报销后公司承担90%\n\n3. 节日福利\n   - 春节、中秋节、端午节等节日礼品\n\n4. 员工活动\n   - 年度体检\n   - 团建活动\n   - 生日福利\n\n5. 其他\n   - 通讯补贴\n   - 交通补贴\n   - 餐饮补贴',
      category: '福利待遇',
      keywords: ['福利', '五险一金', '补贴', '节日', '待遇']
    },
    {
      question: '年假有多少天？',
      answer: '年休假规定：\n\n根据《职工带薪年休假条例》：\n1. 累计工作已满1年不满10年的，年休假5天\n2. 累计工作已满10年不满20年的，年休假10天\n3. 累计工作已满20年的，年休假15天\n\n公司额外福利：\n- 司龄满5年，每年额外增加1天年假\n- 司龄满10年，每年额外增加2天年假\n- 最高不超过20天/年\n\n未休年假处理：\n- 当年未休完可跨年（至次年3月底）\n- 逾期未休按日工资300%折算',
      category: '福利待遇',
      keywords: ['年假', '休假', '工龄', '福利', '考勤']
    },
    
    // 规章制度
    {
      question: '信息安全规定有哪些？',
      answer: '信息安全管理规定：\n\n1. 密码管理\n   - 密码长度不少于8位\n   - 包含字母、数字和特殊字符\n   - 每90天更换一次\n   - 不得使用与其他网站相同的密码\n\n2. 数据安全\n   - 敏感数据加密存储\n   - 禁止将公司数据存储在个人设备\n   - 离开工位时锁定电脑\n\n3. 网络安全\n   - 禁止私自连接公司内网\n   - 远程办公必须使用VPN\n   - 不得访问来路不明的网站\n\n4. 应急响应\n   - 发现安全事件立即上报IT部门\n   - 配合安全部门进行调查',
      category: '规章制度',
      keywords: ['信息安全', '密码', '数据', '网络', '安全']
    },
    {
      question: '保密协议要求？',
      answer: '保密协议要求：\n\n1. 保密义务\n   - 员工需对公司商业秘密、技术信息保密\n   - 保密期限：在职期间及离职后3年\n\n2. 保密信息范围\n   - 客户信息、财务数据\n   - 技术方案、研发成果\n   - 营销策略、合作计划\n   - 员工薪酬、人事信息\n\n3. 禁止行为\n   - 不得将保密信息泄露给第三方\n   - 不得利用保密信息谋取利益\n   - 离职时需归还所有涉密资料\n\n4. 违约责任\n   - 违反保密协议需承担法律责任\n   - 造成损失的需进行赔偿',
      category: '规章制度',
      keywords: ['保密', '协议', '规定', '法律', '合规']
    },

    // ============ 三峡集团业务文档 ============
    // 文档一：白鹤滩电站参数手册
    {
      question: '白鹤滩电站的装机容量是多少？单机容量在全球处于什么水平？和三峡电站相比总装机差多少？',
      answer: '【出处：《白鹤滩电站参数手册》】\n\n白鹤滩水电站总装机容量为 1600 万千瓦，共安装 16 台单机容量 100 万千瓦的水轮发电机组，单机容量居全球第一（目前全球单机容量最大）。\n\n对比：三峡电站总装机容量为 2250 万千瓦。\n\n总装机差距：2250 − 1600 = 650 万千瓦，即白鹤滩比三峡总装机少 650 万千瓦。',
      category: '白鹤滩电站参数手册',
      keywords: ['白鹤滩', '装机容量', '单机容量', '三峡', '千瓦', '全球最大', '100万', '1600', '2250', '650']
    },
    {
      question: '白鹤滩电站和三峡电站的机组数量与单机容量分别是多少？',
      answer: '【出处：《白鹤滩电站参数手册》】\n\n白鹤滩水电站：16 台机组，单机容量 100 万千瓦，总装机 1600 万千瓦。\n三峡水电站：机组单机容量 70 万千瓦，总装机 2250 万千瓦。\n\n白鹤滩单机容量（100 万千瓦）大于三峡单机容量（70 万千瓦），白鹤滩单机容量为全球最大。',
      category: '白鹤滩电站参数手册',
      keywords: ['白鹤滩', '三峡', '机组', '单机容量', '100万', '70万', '数量', '台']
    },

    // 文档二：监测巡检管理办法
    {
      question: '某一类测点今天测值超限，同时最近连续5天单向漂移、累计变化量超过历史年变幅的30%，这属于几级异常？多长时间内要处置？报给谁？',
      answer: '【出处：《监测巡检管理办法》异常分级章节】\n\n该情形属于 Ⅰ 级（紧急）异常。\n\n判定依据：测值超限，且最近连续 5 天单向漂移，累计变化量超过历史年变幅的 30%，满足 Ⅰ 级异常判定标准。\n\n处置要求：30 分钟内处置，并上报电站总工程师。',
      category: '监测巡检管理办法',
      keywords: ['测点', '超限', '连续5天', '单向漂移', '累计变化', '年变幅', '30%', 'Ⅰ级', '一级', '紧急', '30分钟', '总工程师', '异常', '分级']
    },
    {
      question: '监测异常分为几级？各级的处置时限和上报对象是怎样的？',
      answer: '【出处：《监测巡检管理办法》异常分级章节】\n\n监测异常分为三级：\n\n- Ⅰ 级（紧急）：30 分钟内处置，上报电站总工程师；\n  判定：测值超限 + 连续5天单向漂移 + 累计变化超历史年变幅30%。\n- Ⅱ 级（重要）：4 小时内处置，上报部门负责人。\n- Ⅲ 级（一般）：24 小时内处置，记录备案。\n  判定：如数据缺测等一般性异常。',
      category: '监测巡检管理办法',
      keywords: ['异常', '分级', 'Ⅰ级', 'Ⅱ级', 'Ⅲ级', '一级', '二级', '三级', '紧急', '重要', '一般', '处置', '时限', '30分钟', '4小时', '24小时', '总工程师']
    },
    {
      question: '监测数据缺测的判定标准是什么？多长时间内要报修？',
      answer: '【出处：《监测巡检管理办法》缺测管理章节】\n\n缺测判定标准：连续 4 个采集周期无数据，即判定为缺测。\n\n报修时限：发现缺测后 2 小时内向维护单位报修，并记录缺测的起止时间。\n\n异常级别：缺测属于 Ⅲ 级（一般）异常，需 24 小时内处置并记录备案。',
      category: '监测巡检管理办法',
      keywords: ['缺测', '判定', '采集周期', '无数据', '报修', '2小时', '4个', 'Ⅲ级', '24小时', '连续']
    },
    {
      question: '各类测点的巡检频次是怎样的？一类测点汛期每天要巡检几次？',
      answer: '【出处：《监测巡检管理办法》巡检频次章节】\n\n各类测点巡检频次：\n\n- 一类测点：汛期每日 2 次，非汛期每日 1 次；\n- 二类测点：汛期每日 1 次，非汛期每 2 日 1 次；\n- 三类测点：每周 1 次。\n\n因此一类测点在汛期每天巡检 2 次。',
      category: '监测巡检管理办法',
      keywords: ['巡检', '频次', '一类测点', '二类测点', '三类测点', '汛期', '每日', '2次', '1次', '每天']
    },
    {
      question: '汛期是哪几个月？7月属于汛期吗？',
      answer: '【出处：《监测巡检管理办法》汛期界定】\n\n汛期为每年 6 月 1 日至 9 月 30 日（即 6、7、8、9 月）。\n\n7 月属于汛期。汛期内各类测点巡检频次需相应提高（如一类测点汛期每日 2 次）。',
      category: '监测巡检管理办法',
      keywords: ['汛期', '6月', '7月', '8月', '9月', '月份', '6-9月']
    },

    // 文档三：符合性初审工作指引
    {
      question: '初审时发现某投标人的投标保证金在截止时间后才到账，其余七项全部满足。按照符合性初审工作指引，这家单位的初审结论应该是什么？为什么？',
      answer: '【出处：《符合性初审工作指引》强制项章节】\n\n初审结论：作废标处理。\n\n原因：符合性初审共设 7 项内容，其中投标保证金须在投标截止时间前到账为强制项。强制项任一不满足即作废标处理。投标保证金在截止时间后到账（即使仅迟数分钟）属于"不符合"，故该投标人初审结论为废标，不再进入后续评审。其余七项是否全部满足不影响该强制项的废标结论。',
      category: '符合性初审工作指引',
      keywords: ['符合性初审', '投标保证金', '保证金', '截止时间', '到账', '废标', '强制项', '投标', '初审', '不符合']
    },
    {
      question: '符合性初审共有几项内容？强制项不满足会怎样？',
      answer: '【出处：《符合性初审工作指引》】\n\n符合性初审共 7 项内容，其中含若干强制项（如投标保证金按时到账等）。\n\n规则：\n- 强制项任一不满足 → 即作废标处理；\n- 非强制项不满足 → 视情况扣分或要求澄清；\n- 7 项全部满足方可通过初审进入评标。',
      category: '符合性初审工作指引',
      keywords: ['符合性初审', '7项', '强制项', '废标', '投标', '初审', '内容', '项数']
    }
  ];
  
  const insert = db.prepare(`
    INSERT INTO knowledge_items (question, answer, category_id, keywords)
    VALUES (?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(item.category);
      if (cat) {
        insert.run(item.question, item.answer, cat.id, JSON.stringify(item.keywords));
      }
    }
  });
  
  insertMany(knowledgeItems);
  console.log('知识库数据初始化完成');
}

// 获取数据库连接
function getDb() {
  if (!db) {
    initDatabase();
  }
  return db;
}

// 关闭数据库连接
function closeDatabase() {
  if (db) {
    db.close();
    console.log('数据库连接已关闭');
  }
}

module.exports = {
  initDatabase,
  getDb,
  closeDatabase
};