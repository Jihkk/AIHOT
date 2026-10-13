import assert from 'node:assert/strict';
import {test} from 'node:test';
import {forecastRows,renderWeather,renderWaterQuality} from '../reader-panels.mjs';

test('district forecasts stay separate from federal territory forecasts and retain chronological days',()=>{
  const make=(id,date,min)=>({location:{location_id:id,location_name:'Kuala Lumpur'},date,min_temp:min,max_temp:33,summary_forecast:'Tiada Hujan'});
  const dataset={id:'weather-kl',status:'ok',dataFetchedAt:'2026-10-08T04:00:00Z',records:[make('St009','2026-10-08',99),make('Ds058','2026-10-09',25),make('Ds058','2026-10-08',24)]};
  assert.deepEqual(forecastRows(dataset).map(row=>[row.date,row.min_temp]),[['2026-10-08',24],['2026-10-09',25]]);
  const html=renderWeather({datasets:[dataset]});
  assert.ok(html.includes('24°–33°'));
  assert.ok(!html.includes('99°'));
  assert.match(html,/无雨/);
  assert.match(html,/上午、下午及夜间/);
});

test('forecast failures show retained-data status; unknown Malay phrases are preserved and escaped',()=>{
  const row={location:{location_id:'Ds058',location_name:'Kuala Lumpur'},date:'2026-10-08',summary_forecast:'Unknown <script>weather</script>',morning_forecast:'Unknown phrase'};
  const html=renderWeather({datasets:[{id:'weather-kl',status:'error',records:[row],dataFetchedAt:'2026-10-07T00:00:00Z'}]});
  assert.match(html,/读取失败/);
  assert.match(html,/Unknown &lt;script&gt;weather&lt;\/script&gt;/);
  assert.ok(!html.includes('<script>'));
  assert.match(html,/Unknown phrase/);
  assert.match(renderWeather(),/暂时没有可展示/);
});

test('river quality panel shows the latest verified annual report without implying live measurements',()=>{
  const article={publishedAt:'2026-10-12',url:'https://www.petra.gov.my/uploads/content-downloads/file_20261012162402.pdf',riverQualitySnapshot:{reportYear:2025,riversMonitored:672,clean:{count:467,percent:69},moderatelyPolluted:{count:172,percent:26},polluted:{count:33,percent:5},mainPollutant:'氨氮'}};
  const html=renderWaterQuality(article);
  assert.match(html,/最新官方年度报告/);
  assert.match(html,/2025<span>年/);
  assert.match(html,/<strong>467<\/strong><span>清洁 · 69%<\/span>/);
  assert.match(html,/<strong>172<\/strong><span>中度污染 · 26%<\/span>/);
  assert.match(html,/<strong>33<\/strong><span>污染 · 5%<\/span>/);
  assert.match(html,/监测 672 条主要河流/);
  assert.match(html,/不是实时水质/);
  assert.match(html,/file_20261012162402\.pdf/);
  assert.ok(!html.includes('2024年'));
  assert.match(renderWaterQuality(null),/暂缺已核对的最新年度统计/);
});
