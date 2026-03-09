/**
 * 创建 Loyalty & Push 试用报告邮件公共模板
 * 执行前确保服务器已运行，且测试用户已设为管理员。
 * 运行方式：npx tsx server/scripts/create-loyalty-trial-report-template.ts
 *
 * 环境变量（可选）：
 * - API_BASE_URL 或 VITE_API_BASE_URL：后端 API 根地址，默认 http://localhost:3001
 *
 * v2 变更：数据指标列改为横向循环（loopBinding.expandDirection='horizontal'）
 * - 不再使用 3 个硬编码列 + visibilityCondition
 * - 改为 1 个列模板 + loopBinding，列数完全由 loyalty.metrics.statItems 数组决定
 * - 使用方在发信时传入 arrayData: { 'loyalty.metrics.statItems': [{label,value},...] }
 *   传 2 项 → 2 列，传 3 项 → 3 列，建议不超过 5 项
 *
 * 边框格式：与 migrate-border-config-remove-boolean-sides 迁移后一致，使用「纯宽度」格式，
 * 不再使用 top/right/bottom/left 布尔。无边框：unified: '0'；全边框：unified: '1px'；
 * 单边：mode: 'separate' + 对应边 topWidth/rightWidth/bottomWidth/leftWidth（不需的边为 '0'）。
 */

const API_BASE =
  process.env.API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  'http://localhost:3001';

// ── 辅助函数 ─────────────────────────────────────────────

function id(name: string): string {
  // 使用固定 ID 便于幂等重建
  return `loyalty-trial-${name}`;
}

/** 无边框（纯宽度格式，与 BorderConfig 一致） */
const BORDER_NONE = { mode: 'unified' as const, unified: '0', color: '#E0E5EB', style: 'solid' as const };
/** 四边 1px 浅灰 */
const BORDER_FULL = { mode: 'unified' as const, unified: '1px', color: '#E0E5EB', style: 'solid' as const };
/** 仅右边 1px（列间分隔线） */
const BORDER_RIGHT_ONLY = {
  mode: 'separate' as const,
  topWidth: '0', rightWidth: '1px', bottomWidth: '0', leftWidth: '0',
  color: '#E0E5EB',
  style: 'solid' as const,
};
/** 四边 1px 橙色（推荐卡片） */
const BORDER_FULL_ORANGE = { mode: 'unified' as const, unified: '1px', color: '#FED7AA', style: 'solid' as const };

const defaultWrapperStyle = (overrides: Record<string, unknown> = {}) => ({
  widthMode: 'fill',
  heightMode: 'fitContent',
  backgroundType: 'color',
  backgroundColor: 'rgba(0,0,0,0)',
  padding: { mode: 'unified', unified: '0px' },
  margin: { mode: 'unified', unified: '0px' },
  border: BORDER_NONE,
  borderRadius: { mode: 'unified', unified: '0px' },
  contentAlign: { horizontal: 'left', vertical: 'top' },
  ...overrides,
});

const textComponent = (
  compId: string,
  content: string,
  opts: {
    wrapperOverrides?: Record<string, unknown>;
    variableBindings?: Record<string, string>;
    visibilityCondition?: unknown;
  } = {}
) => ({
  id: compId,
  type: 'text',
  wrapperStyle: defaultWrapperStyle(opts.wrapperOverrides ?? {}),
  props: {
    content,
    fontMode: 'inherit',
    fontFamily: '',
  },
  ...(opts.variableBindings ? { variableBindings: opts.variableBindings } : {}),
  ...(opts.visibilityCondition ? { visibilityCondition: opts.visibilityCondition } : {}),
});

const dividerComponent = (compId: string) => ({
  id: compId,
  type: 'divider',
  wrapperStyle: defaultWrapperStyle({ padding: { mode: 'unified', unified: '0px' } }),
  props: {
    dividerStyle: 'line',
    color: '#E0E5EB',
    height: '1px',
    width: '100%',
  },
});

// ── 自定义变量列表 ─────────────────────────────────────────

const customVariables = [
  { key: 'loyalty.merchantName',              label: '商家名称',            contentType: 'text',  defaultValue: '尊贵商家' },
  { key: 'loyalty.trial.remainingDays',       label: '试用剩余天数',         contentType: 'text',  defaultValue: '10' },
  // array 类型：每项包含 label（指标名称）和 value（指标值），横向循环展开为等宽列
  // 发信时通过 arrayData: { 'loyalty.metrics.statItems': [{label,value},...] } 传入
  {
    key: 'loyalty.metrics.statItems',
    label: '数据指标列（横向循环）',
    contentType: 'array',
    defaultValue: '',
    itemSchema: [
      { key: 'label', contentType: 'text', label: '指标名称' },
      { key: 'value', contentType: 'text', label: '指标值' },
    ],
    defaultPreviewItems: [
      { label: '新增订阅邮箱', value: '1,000' },
      { label: '客单价',       value: '↑12.4%' },
      { label: '转化率',       value: '↑23.4%' },
    ],
  },
  { key: 'loyalty.metrics.totalRevenue',      label: '累计带来收益',         contentType: 'text',  defaultValue: '$1,220' },
  { key: 'loyalty.metrics.gmvShare',          label: 'GMV 占比',            contentType: 'text',  defaultValue: '18.52%' },
  { key: 'loyalty.metrics.orderShare',        label: '订单占比',             contentType: 'text',  defaultValue: '23.32%' },
  { key: 'loyalty.estimate.monthlyGmv',       label: '预估每月 GMV 收益',    contentType: 'text',  defaultValue: '$2,335' },
  { key: 'loyalty.estimate.annualGmv',        label: '预估全年 GMV 收益',    contentType: 'text',  defaultValue: '$2,335' },
  { key: 'loyalty.plan.name',                 label: '推荐计划名称',         contentType: 'text',  defaultValue: 'Growth 版' },
  { key: 'loyalty.plan.description',          label: '推荐计划描述',         contentType: 'text',  defaultValue: '适合成长型商家精细化运营会员' },
  { key: 'loyalty.plan.originalPrice',        label: '计划原价',             contentType: 'text',  defaultValue: '$33/月' },
  { key: 'loyalty.plan.discountPrice',        label: '计划优惠价',           contentType: 'text',  defaultValue: '$23/月' },
  { key: 'loyalty.plan.discountBadge',        label: '连续订阅优惠说明',      contentType: 'text',  defaultValue: '连续12个月订阅优惠$30' },
  { key: 'loyalty.plan.ctaUrl',               label: '订阅链接',             contentType: 'link',  defaultValue: 'https://app.shoplazza.com' },
  { key: 'loyalty.contact.email',             label: '客服联系邮箱',         contentType: 'text',  defaultValue: 'support@shoplazza.com' },
];

// ── 组件树 ─────────────────────────────────────────────────

/**
 * 数据指标列模板（横向循环）
 *
 * 该组件作为「单列模板」，绑定 loopBinding.expandDirection='horizontal'。
 * 发信/导出时，系统将 loyalty.metrics.statItems 数组中的每一项实例化为一列，
 * 并自动包裹在横向父容器中，实现等宽多列布局。
 *
 * 对比旧方案（3 个硬编码列 + visibilityCondition）：
 * - 旧：列数固定为 1/2/3，字段名和样式分散在多个组件中
 * - 新：列数完全由数组数据决定，只需维护一个模板组件
 */
const statColumnTemplate = {
  id: id('stat-col-template'),
  type: 'layout',
  wrapperStyle: defaultWrapperStyle({
    widthMode: 'fill',
    padding: { mode: 'separate', top: '12px', right: '16px', bottom: '12px', left: '16px' },
    border: BORDER_RIGHT_ONLY,
  }),
  props: { gap: '6px', direction: 'vertical', distribution: 'packed' },
  loopBinding: {
    variableKey: 'loyalty.metrics.statItems',
    expandDirection: 'horizontal',
    previewIndex: 0,
  },
  children: [
    textComponent(id('stat-col-label'), '{{item.label}}', {
      variableBindings: { 'props.content': 'item.label' },
    }),
    textComponent(id('stat-col-value'), '{{item.value}}', {
      variableBindings: { 'props.content': 'item.value' },
    }),
  ],
};

const statsBox = {
  id: id('stats-box'),
  type: 'layout',
  wrapperStyle: defaultWrapperStyle({
    border: BORDER_FULL,
    borderRadius: { mode: 'unified', unified: '8px' },
    margin: { mode: 'unified', unified: '0px' },
  }),
  props: { gap: '0px', direction: 'vertical', distribution: 'packed' },
  children: [
    // 横向循环列模板：导出时展开为 N 个等宽列（N = statItems 数组长度）
    statColumnTemplate,
    dividerComponent(id('stats-div-1')),
    // 累计收益行（灰色背景）
    textComponent(
      id('total-revenue-text'),
      '带来的累计收益：{{loyalty.metrics.totalRevenue}}',
      {
        wrapperOverrides: {
          backgroundColor: '#F5F7FA',
          padding: { mode: 'separate', top: '12px', right: '16px', bottom: '12px', left: '16px' },
          contentAlign: { horizontal: 'center', vertical: 'top' },
        },
        variableBindings: { 'props.content': 'loyalty.metrics.totalRevenue' },
      }
    ),
    dividerComponent(id('stats-div-2')),
    // GMV 占比与订单占比
    textComponent(
      id('gmv-order-share-text'),
      'GMV 占比：{{loyalty.metrics.gmvShare}}\u3000|\u3000订单占比：{{loyalty.metrics.orderShare}}',
      {
        wrapperOverrides: {
          padding: { mode: 'separate', top: '12px', right: '16px', bottom: '12px', left: '16px' },
          contentAlign: { horizontal: 'center', vertical: 'top' },
        },
      }
    ),
  ],
};

const estimateSection = {
  id: id('estimate-section'),
  type: 'layout',
  wrapperStyle: defaultWrapperStyle({
    widthMode: 'fill',
    border: BORDER_FULL,
    borderRadius: { mode: 'unified', unified: '8px' },
  }),
  props: { gap: '0px', direction: 'horizontal', distribution: 'packed' },
  children: [
    // 每月 GMV
    {
      id: id('monthly-gmv-col'),
      type: 'layout',
      wrapperStyle: defaultWrapperStyle({
        widthMode: 'fill',
        padding: { mode: 'separate', top: '16px', right: '16px', bottom: '16px', left: '16px' },
        contentAlign: { horizontal: 'center', vertical: 'top' },
        border: BORDER_RIGHT_ONLY,
      }),
      props: { gap: '8px', direction: 'vertical', distribution: 'packed' },
      children: [
        textComponent(id('monthly-gmv-label'), '每月 GMV 收益', {
          wrapperOverrides: { contentAlign: { horizontal: 'center', vertical: 'top' } },
        }),
        textComponent(id('monthly-gmv-value'), '{{loyalty.estimate.monthlyGmv}}', {
          wrapperOverrides: { contentAlign: { horizontal: 'center', vertical: 'top' } },
          variableBindings: { 'props.content': 'loyalty.estimate.monthlyGmv' },
        }),
      ],
    },
    // 全年 GMV
    {
      id: id('annual-gmv-col'),
      type: 'layout',
      wrapperStyle: defaultWrapperStyle({
        widthMode: 'fill',
        padding: { mode: 'separate', top: '16px', right: '16px', bottom: '16px', left: '16px' },
        contentAlign: { horizontal: 'center', vertical: 'top' },
      }),
      props: { gap: '8px', direction: 'vertical', distribution: 'packed' },
      children: [
        textComponent(id('annual-gmv-label'), '全年 GMV 收益', {
          wrapperOverrides: { contentAlign: { horizontal: 'center', vertical: 'top' } },
        }),
        textComponent(id('annual-gmv-value'), '{{loyalty.estimate.annualGmv}}', {
          wrapperOverrides: { contentAlign: { horizontal: 'center', vertical: 'top' } },
          variableBindings: { 'props.content': 'loyalty.estimate.annualGmv' },
        }),
      ],
    },
  ],
};

const planCard = {
  id: id('plan-card'),
  type: 'layout',
  wrapperStyle: defaultWrapperStyle({
    widthMode: 'fill',
    backgroundColor: '#FFF7ED',
    padding: { mode: 'separate', top: '16px', right: '16px', bottom: '16px', left: '16px' },
    border: BORDER_FULL_ORANGE,
    borderRadius: { mode: 'unified', unified: '8px' },
  }),
  props: { gap: '8px', direction: 'vertical', distribution: 'packed' },
  children: [
    textComponent(id('plan-name'), '{{loyalty.plan.name}}', {
      variableBindings: { 'props.content': 'loyalty.plan.name' },
    }),
    textComponent(id('plan-desc'), '{{loyalty.plan.description}}', {
      variableBindings: { 'props.content': 'loyalty.plan.description' },
    }),
    // 定价行
    {
      id: id('plan-pricing-row'),
      type: 'layout',
      wrapperStyle: defaultWrapperStyle({ widthMode: 'fill' }),
      props: { gap: '8px', direction: 'horizontal', distribution: 'packed' },
      children: [
        textComponent(id('plan-original-price'), '<s>{{loyalty.plan.originalPrice}}</s>', {
          variableBindings: { 'props.content': 'loyalty.plan.originalPrice' },
        }),
        textComponent(id('plan-discount-price'), '{{loyalty.plan.discountPrice}}', {
          variableBindings: { 'props.content': 'loyalty.plan.discountPrice' },
        }),
        textComponent(id('plan-badge'), '{{loyalty.plan.discountBadge}}', {
          wrapperOverrides: {
            backgroundColor: '#DBEAFE',
            padding: { mode: 'separate', top: '2px', right: '8px', bottom: '2px', left: '8px' },
            borderRadius: { mode: 'unified', unified: '100px' },
          },
          variableBindings: { 'props.content': 'loyalty.plan.discountBadge' },
        }),
      ],
    },
  ],
};

const subscribeButton = {
  id: id('subscribe-btn'),
  type: 'button',
  wrapperStyle: defaultWrapperStyle({
    widthMode: 'fill',
    contentAlign: { horizontal: 'center', vertical: 'top' },
    padding: { mode: 'separate', top: '8px', right: '0px', bottom: '0px', left: '0px' },
  }),
  props: {
    text: '立即订阅',
    buttonStyle: 'solid',
    backgroundColor: '#1976D2',
    textColor: '#FFFFFF',
    borderColor: '#1976D2',
    fontSize: '16px',
    fontWeight: '600',
    fontStyle: 'normal',
    textDecoration: 'none',
    fontMode: 'inherit',
    fontFamily: '',
    borderRadius: '6px',
    padding: { mode: 'separate', top: '12px', right: '32px', bottom: '12px', left: '32px' },
    widthMode: 'fixed',
    fixedWidth: '200px',
    link: 'https://app.shoplazza.com',
  },
  variableBindings: { 'props.link': 'loyalty.plan.ctaUrl' },
};


// ── 主体组件列表（直接放画布根级，画布本身是垂直容器）─────────────────
//
// 结构策略：
// - 所有组件直接作为画布的根级子项，不需要额外的外层 layout 包裹
// - 画布 config.padding 设为 24px（左右），统一控制内容区缩进
// - 各组件的 wrapperStyle 只负责组件自身的样式（背景、边框等），不用处理水平边距
// - 间距由画布的 contentGap 控制（各根级组件间统一间距）

const components = [
  // ── Logo + 品牌区 ──
  {
    id: id('logo-section'),
    type: 'layout',
    wrapperStyle: defaultWrapperStyle({
      widthMode: 'fill',
      contentAlign: { horizontal: 'left', vertical: 'center' },
    }),
    props: { gap: '8px', direction: 'horizontal', distribution: 'packed' },
    children: [
      {
        id: id('brand-icon'),
        type: 'icon',
        wrapperStyle: defaultWrapperStyle({
          widthMode: 'fitContent',
          contentAlign: { horizontal: 'left', vertical: 'center' },
        }),
        props: {
          iconType: 'star',
          sizeMode: 'height',
          size: '22px',
          color: '#D97706',
          link: '',
        },
      },
      textComponent(id('brand-name'), '<strong style="color:#D97706;font-size:16px;letter-spacing:1px">LOYALTY &amp; PUSH</strong>', {
        wrapperOverrides: {
          widthMode: 'fitContent',
          contentAlign: { horizontal: 'left', vertical: 'center' },
        },
      }),
    ],
  },

  // ── 问候语 ──
  textComponent(id('greeting'), '亲爱的 {{loyalty.merchantName}}，', {}),

  // ── 主标题 ──
  textComponent(id('main-title'), '<h2 style="margin:0;font-size:22px;font-weight:bold;color:#1A1A1A;text-align:center">您的店铺试用报告已更新</h2>', {
    wrapperOverrides: { contentAlign: { horizontal: 'center', vertical: 'top' } },
  }),

  // ── 副标题 ──
  textComponent(id('subtitle'), 'Loyalty &amp; Push 已在试用期间为你的店铺带来了正向收益，一起来看看具体表现：', {}),

  // ── 数据指标框（带边框的独立区块）──
  statsBox,

  // ── 过渡文案 ──
  textComponent(
    id('transition-text'),
    '当前您的试用仅剩余 <strong>{{loyalty.trial.remainingDays}} 天</strong>，别让增长中断，继续试用预计可获得',
    {}
  ),

  // ── GMV 预估区 ──
  estimateSection,

  // ── 推荐计划标题 ──
  textComponent(id('recommend-heading'), '<strong>为您推荐</strong>', {}),

  // ── 推荐计划卡片 ──
  planCard,

  // ── 订阅按钮 ──
  subscribeButton,

  // ── 页脚分割线 ──
  dividerComponent(id('footer-divider')),

  // ── 页脚 ──
  textComponent(
    id('footer'),
    '如果您有任何问题请联系 <a href="mailto:{{loyalty.contact.email}}" style="color:#1976D2">{{loyalty.contact.email}}</a>，我们将竭诚为您服务',
    { wrapperOverrides: { contentAlign: { horizontal: 'center', vertical: 'top' } } }
  ),
];

// ── 画布配置 ─────────────────────────────────────────────

const config = {
  outerBackgroundColor: '#E8ECF1',
  backgroundType: 'color',
  backgroundColor: '#FFFFFF',
  padding: { mode: 'separate', top: '24px', right: '24px', bottom: '24px', left: '24px' },
  margin: { mode: 'unified', unified: '0px' },
  border: BORDER_NONE,
  borderRadius: { mode: 'unified', unified: '0px' },
  contentAlign: { horizontal: 'center', vertical: 'top' },
  contentDistribution: 'packed',
  contentGap: '16px',
  width: '600px',
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
};

// ── 模板对象 ─────────────────────────────────────────────

const TEMPLATE_ID = 'loyalty-push-trial-report-v1';

const template = {
  id: TEMPLATE_ID,
  title: 'Loyalty & Push 试用报告',
  desc: '展示商家试用 Loyalty & Push 期间的数据表现，并推荐订阅计划。数据指标列使用横向循环（loopBinding），列数由 statItems 数组长度动态决定，建议 2–5 项。',
  components,
  config,
  previewDataUrl: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  customVariables,
  isPublic: true,
  requiredVariableKeys: customVariables.map((v) => v.key),
  /** Layer 4：渲染規則，本模板未使用獨立 rendering_rules，顯式傳空對象以與後端一致 */
  renderingRules: {} as Record<string, unknown>,
};

// ── 执行 ─────────────────────────────────────────────────

async function main() {
  console.log('🔑 登录获取 token...');
  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'testuser@test.com',
      password: 'TestPass456',
    }),
  });
  if (!loginRes.ok) {
    const err = await loginRes.text();
    throw new Error(`登录失败 (${loginRes.status}): ${err}`);
  }
  const { token } = await loginRes.json() as { token: string };
  console.log('✅ 登录成功');

  // 检查是否已存在（若存在则更新）
  const checkRes = await fetch(`${API_BASE}/api/templates/${TEMPLATE_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (checkRes.ok) {
    console.log('📝 模板已存在，进行更新...');
    const putRes = await fetch(`${API_BASE}/api/templates/${TEMPLATE_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: template.id,
        title: template.title,
        desc: template.desc,
        components: template.components,
        config: template.config,
        previewDataUrl: '',
        createdAt: template.createdAt,
        updatedAt: Date.now(),
        isPublic: true,
        requiredVariableKeys: template.requiredVariableKeys,
        customVariables: template.customVariables,
        renderingRules: template.renderingRules,
      }),
    });
    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`更新模板失败 (${putRes.status}): ${err}`);
    }
    console.log('✅ 模板更新成功！ID:', TEMPLATE_ID);
  } else if (checkRes.status === 404) {
    console.log('📝 创建新模板...');
    const postRes = await fetch(`${API_BASE}/api/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: template.id,
        title: template.title,
        desc: template.desc,
        components: template.components,
        config: template.config,
        previewDataUrl: '',
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        isPublic: true,
        requiredVariableKeys: template.requiredVariableKeys,
        customVariables: template.customVariables,
        renderingRules: template.renderingRules,
      }),
    });
    if (!postRes.ok) {
      const err = await postRes.text();
      if (postRes.status === 403) {
        console.error('❌ 403 权限不足：testuser 不是管理员。请先执行：');
        console.error('   cd server && DATABASE_URL=postgresql://localhost:5432/email_editor npx tsx scripts/set-testuser-admin.ts');
        process.exit(1);
      }
      throw new Error(`创建模板失败 (${postRes.status}): ${err}`);
    }
    console.log('✅ 模板创建成功！ID:', TEMPLATE_ID);
  } else {
    throw new Error(`检查模板状态失败 (${checkRes.status})`);
  }

  console.log('\n🎉 完成！在前端公共模板列表中查找「Loyalty & Push 试用报告」即可使用。');
  console.log('💡 模板 v2 包含以下功能：');
  console.log('   - 自定义变量（loyalty.* 命名空间）含默认值');
  console.log('   - 数据指标列：横向循环（loopBinding.expandDirection=horizontal）');
  console.log('     发信时传 arrayData: { "loyalty.metrics.statItems": [{label,value},...] }');
  console.log('     建议 2–5 项，例：[{label:"新增订阅邮箱",value:"1,000"},{label:"客单价",value:"↑12.4%"}]');
  console.log('   - 在编辑器「变量」面板可为 statItems 添加预览数据，直接查看多列效果');
  console.log('   - 其余数值均以 {{变量key}} 形式绑定');
}

main().catch((err) => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
