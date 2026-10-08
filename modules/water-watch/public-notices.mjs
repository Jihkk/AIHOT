const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// These notices describe the static publication, not the optional database-backed framework.
export const notices = {
  terms: {
    title:'使用规则',
    sections:[
      ['本站及维护者','Malaysia Water Watch（马来西亚水利观察）是独立的水利与防洪行业资讯索引，由 GitHub 账号 Jihkk 维护，不代表政府机构或原文发布单位。'],
      ['内容与来源','本站通过 Codex 辅助阅读公开原文并整理中文摘要，保留来源、日期和工程阶段。摘要可能有翻译或理解错误，重要信息请以官方原文、正式文件和主管机构说明为准。原文及来源图片的版权归各来源；本站不转载未获许可的全文或图片。'],
      ['使用与分享','欢迎个人阅读、同事分享及组织内部参考。转引本站摘要时请注明本站和官方原文链接，保留日期与上下文；官方资料和开放数据仍按原来源的许可使用，不能因本站提供链接而认为获得全文、图片或第三方内容的再分发授权。data.gov.my 开放数据快照注明 CC BY 4.0 来源与许可；Public Infobanjir 遥测按原站条件使用，不将这一许可套用于其他来源。'],
      ['天气与工程判断','天气、气象公告和水质是采集时的记录，可能过期、不完整或读取失败；年度水质数据不是实时综合 WQI。降雨与水位是公开遥测快照，可能有缺测或校正；水位不是流量，本站按阈值进行的比较不是官方警情。本站不是政府预警服务，不能作为疏散、施工安全、工程设计、投标或合同决定的唯一依据。请核对官方有效期、正式采购文件及最新更新。'],
      ['更新与可用性','计划每日马来西亚时间 08:30 核查，但依赖执行更新的电脑、Codex 应用及网络可用，不能保证每天成功更新。降雨与水位另由 GitHub Actions 云端每半小时尝试采集，调度或官方数据可能延迟，页面显示观测及采集时间。网站按现状提供，不保证资讯完整、持续可用或无误。'],
      ['更正与下架','发现错误、版权问题或需要更正与下架，请通过下方 GitHub Issues 联系维护者，并提供相关页面、原文和问题说明。不要公开提交私人资料。维护者会核查后处理。']
    ]
  },
  privacy: {
    title:'隐私说明',
    sections:[
      ['适用范围','本说明适用于由 GitHub 账号 Jihkk 维护的 Malaysia Water Watch 静态网站。网站无需注册或登录，没有站内提交表单、广告或第三方访问统计代码。'],
      ['搜索与浏览','搜索词、分类和来源筛选在当前页面的浏览器内处理，不发送到维护者或模型服务。本站脚本不设置 Cookie，也不将搜索或阅读记录保存到 localStorage、sessionStorage 或数据库。浏览器可能按自身设置保留历史记录。'],
      ['托管服务','公开网站使用 GitHub Pages 托管。为提供与保护服务，GitHub 可能处理 IP 地址、设备或浏览器信息和访问请求等资料，具体处理、保存与权利按 GitHub 隐私声明执行。维护者没有接入自建访问日志或统计系统，不承诺托管平台不记录请求。'],
      ['外部链接与反馈','点击官方原文或 GitHub 链接后，适用对应网站的隐私规则。通过 GitHub Issues 提交的反馈、账号及附件通常是公开的；提交前请删除身份证明、电话号码、密码和其他私人信息。本站没有私密反馈渠道。'],
      ['Codex 与数据更新','Codex 辅助处理公开来源内容和编辑稿，不读取访客的搜索词或浏览记录。本站网页不会触发模型调用；网站更新凭据不发布在页面或仓库中。'],
      ['联系与变更','可通过下方 GitHub Issues 联系维护者，询问本站说明或申请更正公开反馈。涉及 GitHub 账号、托管日志或平台处理的请求须向 GitHub 提出。托管、统计或反馈方式发生变化时，本说明会相应更新。']
    ]
  }
};

export function renderNotice(kind) {
  const notice=notices[kind];
  if(!notice) throw new Error('Unknown public notice');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(notice.title)} · Malaysia Water Watch</title><link rel="icon" href="logo.svg" type="image/svg+xml"><link rel="stylesheet" href="style.css"></head><body><header><div class="header-inner"><a class="brand" href="./"><img src="logo.svg" width="40" height="40" alt=""><span>Malaysia Water Watch<small>马来西亚水利观察</small></span></a><nav aria-label="主导航"><a href="./">返回资讯首页</a><a href="terms.html">使用规则</a><a href="privacy.html">隐私说明</a></nav></div></header><main class="notice-page"><h1>${escape(notice.title)}</h1><p>版本 1.0 · 发布时生效 · 维护者：GitHub 账号 Jihkk</p>${notice.sections.map(([title,body])=>`<section><h2>${escape(title)}</h2><p>${escape(body)}</p></section>`).join('')}<p><a href="https://github.com/Jihkk/AIHOT/issues" target="_blank" rel="noopener noreferrer">GitHub Issues · 联系维护者 ↗</a>${kind==='privacy' ? ' · <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener noreferrer">GitHub 隐私声明 ↗</a>' : ' · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0 ↗</a>'}</p></main><footer><span>Malaysia Water Watch</span><a href="./">返回首页</a></footer></body></html>`;
}
