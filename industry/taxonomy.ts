// Malaysia's water and flood sector vocabulary. Keep published category keys stable.
export const CATEGORIES = [
  {"key": "flood-alerts", "label": "洪水预警", "feedLabel": "洪水预警", "section": "洪水预警", "guide": "官方洪水、暴雨与雷暴预警；明确发布时刻、有效期、地区和等级。历史预警不能当作当前状态。"},
  {"key": "hydrology", "label": "水文降雨", "feedLabel": "水文降雨", "section": "水文降雨", "guide": "实测降雨、水位、流量、季风与气候展望、水文研究和模型；区分实测、预测及设计值。"},
  {"key": "projects", "label": "工程项目", "feedLabel": "工程项目", "section": "工程项目", "guide": "防洪、排水、河道、水坝及供水工程的规划、研究、批准、授标、施工和完成；保留实际阶段。"},
  {"key": "policy", "label": "政策标准", "feedLabel": "政策标准", "section": "政策标准", "guide": "水利与防灾政策、技术标准、设计指南和监管要求；区分建议、草案、发布及生效。"},
  {"key": "tenders", "label": "招标采购", "feedLabel": "招标采购", "section": "招标采购", "guide": "相关招标、询价、补遗、截止日期和授标公告；保留编号、资格、时区与原始文件。"},
  {"key": "water-resources", "label": "水资源", "feedLabel": "水资源", "section": "水资源", "guide": "水资源安全、供水、干旱、流域管理、环境与行业研究；不收无实质内容的礼节活动。"},
] as const satisfies ReadonlyArray<{ key: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

// There is no single release counter that represents this industry's activity.
export const RELEASE: { category: string; tag: string; unit: string } | null = null;
export const PLAIN_TERMS: readonly string[] = ["jps", "did", "metmalaysia", "nadma", "nahrim", "petra", "span", "msma", "ari", "aep", "iwrm", "irbm", "prab", "rtb", "rm"];
export const ITEM_TYPES = ["warning_update", "project_update", "technical_resource", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;
export const CATEGORY_TAGS = ["洪水预警", "水文降雨", "工程项目", "政策标准", "招标采购", "水资源", "论文/研究", "教程/实践", "观点分析", "行业动态", "其他"] as const;
export const TOPIC_TAGS = ["季风", "暴雨", "洪水", "干旱", "水坝", "河道", "城市排水", "供水", "水质", "气候变化", "流域管理", "水文模型", "水力模型", "MSMA", "IWRM", "IRBM", "Selangor", "Kuala Lumpur", "Pahang", "Perlis", "Sabah", "Sarawak"] as const;
export const ENTITY_TAGS = ["JPS", "METMalaysia", "NADMA", "NAHRIM", "PETRA", "SPAN", "Air Selangor"] as const;
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  banjir: "洪水", flood: "洪水", floods: "洪水", monsoon: "季风", hujan: "水文降雨", rainfall: "水文降雨",
  "flood warning": "洪水预警", "amaran banjir": "洪水预警", tender: "招标采购", procurement: "招标采购",
  guideline: "政策标准", policy: "政策标准", 标准: "政策标准", 政策: "政策标准",
  project: "工程项目", 项目: "工程项目", 研究: "论文/研究", paper: "论文/研究", 论文: "论文/研究",
  教程: "教程/实践", 实践: "教程/实践", 观点: "观点分析", 行业: "行业动态", "MET Malaysia": "METMalaysia",
};
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; otherNames?: string[] }> = {
  "jps": {
    "name": "JPS",
    "displayTag": "JPS",
    "aliases": [
      "JPS",
      "DID Malaysia",
      "Jabatan Pengairan dan Saliran",
      "Department of Irrigation and Drainage",
      "马来西亚灌溉与排水局"
    ]
  },
  "metmalaysia": {
    "name": "METMalaysia",
    "displayTag": "METMalaysia",
    "aliases": [
      "METMalaysia",
      "MET Malaysia",
      "Jabatan Meteorologi Malaysia",
      "Malaysian Meteorological Department",
      "马来西亚气象局"
    ]
  },
  "nadma": {
    "name": "NADMA",
    "displayTag": "NADMA",
    "aliases": [
      "NADMA",
      "Agensi Pengurusan Bencana Negara",
      "National Disaster Management Agency",
      "马来西亚国家灾难管理机构"
    ]
  },
  "nahrim": {
    "name": "NAHRIM",
    "displayTag": "NAHRIM",
    "aliases": [
      "NAHRIM",
      "Institut Penyelidikan Air Kebangsaan Malaysia",
      "National Water Research Institute of Malaysia"
    ]
  },
  "petra": {
    "name": "PETRA",
    "displayTag": "PETRA",
    "aliases": [
      "PETRA",
      "Kementerian Peralihan Tenaga dan Transformasi Air",
      "Ministry of Energy Transition and Water Transformation"
    ]
  },
  "span": {
    "name": "SPAN",
    "displayTag": "SPAN",
    "aliases": [
      "SPAN",
      "Suruhanjaya Perkhidmatan Air Negara",
      "National Water Services Commission"
    ]
  },
  "air-selangor": {
    "name": "Air Selangor",
    "displayTag": "Air Selangor",
    "aliases": [
      "Air Selangor",
      "Pengurusan Air Selangor"
    ]
  }
};

// Full agency names make the Chinese and Malay/English references equivalent.
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "jps", name: "JPS", patterns: [/\bjps\b|\bdid malaysia\b|jabatan pengairan dan saliran|department of irrigation and drainage|马来西亚灌溉与排水局/i] },
  { id: "metmalaysia", name: "METMalaysia", patterns: [/met\s?malaysia|jabatan meteorologi malaysia|malaysian meteorological department|马来西亚气象局/i] },
  { id: "nadma", name: "NADMA", patterns: [/\bnadma\b|agensi pengurusan bencana negara|national disaster management agency|马来西亚国家灾难管理机构/i] },
  { id: "nahrim", name: "NAHRIM", patterns: [/\bnahrim\b|institut penyelidikan air kebangsaan malaysia|national water research institute of malaysia/i] },
  { id: "petra", name: "PETRA", patterns: [/\bpetra\b|kementerian peralihan tenaga dan transformasi air|ministry of energy transition and water transformation/i] },
  { id: "span", name: "SPAN", patterns: [/\bSPAN\b|suruhanjaya perkhidmatan air negara|national water services commission/] },
  { id: "air-selangor", name: "Air Selangor", patterns: [/air selangor/i] },
];
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  {
    "entityId": "jps",
    "domains": [
      "water.gov.my"
    ]
  },
  {
    "entityId": "metmalaysia",
    "domains": [
      "met.gov.my"
    ]
  },
  {
    "entityId": "nadma",
    "domains": [
      "nadma.gov.my"
    ]
  },
  {
    "entityId": "nahrim",
    "domains": [
      "nahrim.gov.my"
    ]
  },
  {
    "entityId": "petra",
    "domains": [
      "petra.gov.my"
    ]
  },
  {
    "entityId": "span",
    "domains": [
      "span.gov.my"
    ]
  },
  {
    "entityId": "air-selangor",
    "domains": [
      "airselangor.com"
    ]
  }
];
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [];
