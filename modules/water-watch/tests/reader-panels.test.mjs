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

test('annual water quality cannot be presented as a composite or current WQI',()=>{
  const records=['clean','slightly__polluted','polluted'].map((status,i)=>({date:'2024-01-01',measure:'nh3n',status,n_basins:[61,45,38][i],basins_monitored:144}));
  records.push({date:'2024-01-01',measure:'ss',status:'clean',n_basins:122,basins_monitored:144});
  const html=renderWaterQuality({datasets:[{id:'water-pollution',status:'ok',records}]});
  assert.match(html,/氨氮 NH₃-N 单项分类/);
  assert.match(html,/不代表综合 WQI 或实时水质/);
  assert.ok(!html.includes('<strong>122</strong>'));
});
