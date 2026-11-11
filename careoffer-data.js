/* Chiba facilities: MHLW open data, 2026-06-30. */
map.eachLayer(layer=>{if(layer instanceof L.TileLayer)map.removeLayer(layer)});
// OpenFreeMap Bright is a modern road map with clear water, green spaces and roads.
// MapLibre renders its vector tiles inside Leaflet, preserving existing markers.
const fallbackMap=()=>L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',{attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>',minZoom:5,maxZoom:18});
let activeBase;
if(typeof L.maplibreGL==='function'){
 activeBase=L.maplibreGL({style:'https://tiles.openfreemap.org/styles/bright',interactive:false}).addTo(map);
 const vectorMap=activeBase.getMaplibreMap();
 vectorMap.on('load',()=>{
  // Suppress English/romanized fallback labels. Only source Japanese names display.
  for(const layer of vectorMap.getStyle()?.layers||[]){
   // The Bright basemap draws its own railway strokes. Hide those dedicated
   // railway layers so parallel tracks do not merge with our custom overlay.
   if(layer.type==='line'&&layer['source-layer']==='transportation'&&/rail|transit/i.test(layer.id)){
    try{vectorMap.setPaintProperty(layer.id,'line-opacity',0)}catch(error){console.info('元の鉄道路線の非表示を省略しました',layer.id,error.message)}
   }
   // Google Maps-like subdued gray roads, keeping parks, water and rail lines intact.
   if(layer.type==='line'&&layer['source-layer']==='transportation'&&!/rail|ferry|water|path|foot|cycle|trail/i.test(layer.id)){
    const id=layer.id.toLowerCase();
    const major=/motorway|trunk|expressway/.test(id);
    const arterial=/primary|secondary|tertiary/.test(id);
    const casing=/casing|outline|border/.test(id);
    const roadColor=major?(casing?'#8d9dab':'#a6b6c4'):arterial?(casing?'#bac5ce':'#d0d9e0'):(casing?'#cfd7dc':'#e1e6e9');
    try{vectorMap.setPaintProperty(layer.id,'line-color',roadColor)}catch(error){console.info('道路色の変更を省略しました',layer.id,error.message)}
   }
   // Railway station names should remain useful at wider map scales.
   // This only targets station-specific symbol layers, not bus-stop or road labels.
   if(layer.type==='symbol'&&/railway.?station|train.?station|subway.?station|rail.?station|station.?label/i.test(layer.id)){
    try{
     vectorMap.setLayerZoomRange(layer.id,Math.min(layer.minzoom??8,8),layer.maxzoom??24);
     vectorMap.setLayoutProperty(layer.id,'text-size',['interpolate',['linear'],['zoom'],9,13,12,16,16,19]);
     vectorMap.setLayoutProperty(layer.id,'text-field',['coalesce',['get','name:ja'],['get','name_ja'],['get','name:nonlatin'],['get','name'],'']);
     vectorMap.setLayoutProperty(layer.id,'text-allow-overlap',false);
     vectorMap.setPaintProperty(layer.id,'text-halo-color','#ffffff');
     vectorMap.setPaintProperty(layer.id,'text-halo-width',2);
     vectorMap.setPaintProperty(layer.id,'text-color','#5c7587');
    }catch(error){console.info('駅名表示の調整を省略しました',layer.id,error.message)}
   }
   // Show local district / neighbourhood names earlier when zooming out.
   // Leave city, rail station, street and facility layers at their original zoom levels.
   if(layer.type==='symbol'&&layer['source-layer']==='place'&&/suburb|neighbou?rhood|quarter|district/i.test(layer.id)){
    try{
     const lower=Math.min(layer.minzoom??8.5,8.5);
     vectorMap.setLayerZoomRange(layer.id,lower,layer.maxzoom??24);
    }catch(error){console.info('町名の表示縮尺を変更できませんでした',layer.id,error.message)}
   }
   // Bus stops clutter the map; keep railway stations and station names.
   // Filter only POI symbol features, never the rail/transport layers.
   if(layer.type==='symbol'&&layer['source-layer']==='poi'){
    try{
     const original=vectorMap.getFilter(layer.id);
     const notBus=['all', ['!',['in',['get','class'],['literal',['bus','bus_stop','bus_station']]]], ['!',['in',['get','subclass'],['literal',['bus_stop','bus_station','bus_platform']]]]];
     vectorMap.setFilter(layer.id,original?['all',original,notBus]:notBus);
    }catch(error){console.info('バス停表示の調整を省略しました',layer.id,error.message)}
   }
   if(layer.type!=='symbol'||!layer.layout?.['text-field'])continue;
   // Keep road-number shields and route references as numerals.
   if(/shield|route.?number|highway.?number|junction|railway.?station|train.?station|subway.?station|rail.?station|station.?label/i.test(layer.id))continue;
   // Local-language names are often populated even when name:ja is missing.
   // This retains more neighbourhood names without reverting to Latin labels.
   const japaneseNames=layer['source-layer']==='place'||layer['source-layer']==='transportation_name';
   let labelExpression=japaneseNames
    ?['coalesce',['get','name:ja'],['get','name_ja'],['get','name:nonlatin'],['get','name'],'']
    :['coalesce',['get','name:ja'],['get','name_ja'],['get','name:nonlatin'],''];
   // Railway names are drawn by our persistent station overlay. Avoid duplicate
   // text from the POI layer while keeping its railway station symbols.
   if(layer['source-layer']==='poi')labelExpression=['case',['any',['==',['get','subclass'],'station'],['==',['get','subclass'],'halt']], '',labelExpression];
   try{vectorMap.setLayoutProperty(layer.id,'text-field',labelExpression)}catch(error){console.info('地名レイヤーを変更できませんでした',layer.id,error.message)}
  }
  // A map-scale railway overview excludes yard, spur, siding and crossover
  // tracks, keeping the through route readable even at large stations.
  // At close zooms retain all rail geometry but draw it at a hairline width.
  const transportationLayer=(vectorMap.getStyle()?.layers||[]).find(l=>l.type==='line'&&l['source-layer']==='transportation');
  if(transportationLayer){
   try{
    const before=(vectorMap.getStyle()?.layers||[]).find(l=>l.type==='symbol')?.id;
    const railwayFilter=['in',['get','class'],['literal',['rail','transit']]];
    const throughRailFilter=['all',railwayFilter,['!', ['in',['get','service'],['literal',['yard','siding','spur','crossover']]]]];
    const railWidth=['interpolate',['linear'],['zoom'],13,0.8,16,1.1,18,1.35];
    vectorMap.addLayer({id:'tokuyo-rail-overview',type:'line',source:transportationLayer.source,'source-layer':'transportation',filter:throughRailFilter,minzoom:5,maxzoom:14,paint:{'line-color':'#9ba9b3','line-width':['interpolate',['linear'],['zoom'],9,0.4,13,0.75],'line-opacity':0.8}},before);
    vectorMap.addLayer({id:'tokuyo-rail-bed',type:'line',source:transportationLayer.source,'source-layer':'transportation',filter:railwayFilter,minzoom:14,paint:{'line-color':'#f8f9fa','line-width':['+',railWidth,0.6]}},before);
    vectorMap.addLayer({id:'tokuyo-rail-ties',type:'line',source:transportationLayer.source,'source-layer':'transportation',filter:railwayFilter,minzoom:14,paint:{'line-color':'#87939e','line-width':railWidth,'line-dasharray':[5,3]}},before);
   }catch(error){console.info('鉄道路線の模様を変更できませんでした',error.message)}
  }
 });
}else activeBase=fallbackMap().addTo(map);
// Show every facility marker separately. Do not replace nearby pins with count bubbles.
map.removeLayer(markers);markers=L.layerGroup().addTo(map);
// Wide-area rail labels from independent Japanese station coordinates.
// The base map does not include minor stations at low zoom, so zoom rules alone
// cannot make their names appear. Keep this overlay below facility markers.
const railwayPane=map.createPane('tokuyoRailwayLabels');railwayPane.style.zIndex='550';railwayPane.style.pointerEvents='none';
const railwayLabels=L.layerGroup().addTo(map);
const stationStyle=document.createElement('style');stationStyle.textContent='.tokuyo-station-label{display:inline-flex;align-items:center;gap:3px;white-space:nowrap;width:max-content;transform:translate(-50%,-50%);font:800 13px/1.3 sans-serif;color:#647b8b;text-shadow:-1px -1px 2px #fff,1px 1px 2px #fff,0 0 4px #fff;pointer-events:none}.tokuyo-station-label:before{content:"";display:inline-block;width:7px;height:7px;border:2px solid #fff;border-radius:2px;background:#6089aa;box-shadow:0 0 0 1px #6089aa}.tokuyo-station-label.important{font-size:15px;color:#546e81}';document.head.append(stationStyle);
let railwayStationData=[];
function updateRailwayLabels(){
 railwayLabels.clearLayers();const zoom=map.getZoom();
 // Keep labels visible at every detailed zoom, too. The original zoom>=14
 // cutoff caused names to disappear before the basemap's labels appeared.
 if(zoom<8||!railwayStationData.length)return;
 const b=map.getBounds().pad(.1),minGap=zoom<10?115:zoom<12?85:65;
 const boxes=[];
 const major=/^(柏|北柏|南柏|新柏|流山おおたかの森|南流山|新松戸|松戸|我孫子|北小金|初石|豊四季|流山セントラルパーク)$/;
 const visible=railwayStationData.filter(s=>b.contains([s.lat,s.lon])).sort((a,c)=>Number(major.test(c.name))-Number(major.test(a.name))||a.name.localeCompare(c.name,'ja'));
 for(const s of visible){
  const pt=map.latLngToContainerPoint([s.lat,s.lon]);
  if(boxes.some(p=>Math.abs(pt.x-p.x)<minGap&&Math.abs(pt.y-p.y)<Math.max(28,minGap*.42)))continue;
  boxes.push(pt);
  const label=s.name.endsWith('駅')?s.name:`${s.name}駅`;
  const node=L.divIcon({className:'',html:`<span class="tokuyo-station-label${major.test(s.name)?' important':''}">${esc(label)}</span>`,iconSize:[0,0],iconAnchor:[0,0]});
  railwayLabels.addLayer(L.marker([s.lat,s.lon],{icon:node,pane:'tokuyoRailwayLabels',interactive:false,keyboard:false}));
 }
}
map.on('moveend zoomend',updateRailwayLabels);
fetch('https://raw.githubusercontent.com/piuccio/open-data-jp-railway-stations/master/stations.json',{cache:'force-cache'}).then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json()}).then(data=>{
 const found=[],seen=new Set(),stack=[data];let inspected=0;
 while(stack.length&&inspected++<100000){
  const item=stack.pop();if(!item||typeof item!=='object')continue;
  if(Array.isArray(item)){for(const child of item)stack.push(child);continue}
  const lat=Number(item.lat),lon=Number(item.lon),name=item.name_kanji;
  if(typeof name==='string'&&name.trim()&&Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=34.5&&lat<=36.5&&lon>=138.9&&lon<=141.3){
   const k=`${name}:${lat.toFixed(3)}:${lon.toFixed(3)}`;
   if(!seen.has(k)){seen.add(k);found.push({name:name.trim(),lat,lon})}
  }
  for(const value of Object.values(item))if(value&&typeof value==='object')stack.push(value);
 }
 railwayStationData=found;updateRailwayLabels();
}).catch(error=>console.info('広域用の駅名データを読み込めませんでした',error.message));
// Display a shorter facility name while preserving the official name for matching and search.
const displayFacilityName=name=>name.replace(/特別養護老人ホーム[\s\u3000]*/g,'').trim()||name;
document.querySelector('.footer').textContent='施設情報：厚生労働省「介護サービス情報公表システム」 ／ 地図：OpenFreeMap・OpenStreetMap';
const versionLabel=document.createElement('div');versionLabel.textContent='バージョン：v1.1.0';versionLabel.style.marginTop='5px';document.querySelector('.footer').append(versionLabel);
document.querySelector('.sub').remove();
document.querySelector('.notice').remove();
const style=document.createElement('style');style.textContent=`.map-wrap #map{background:#edf4ed}.leaflet-container{font-family:inherit}.map-overlay{border:1px solid #e6eae5;box-shadow:0 5px 18px #244b3515}.pin{width:36px;height:40px;clip-path:polygon(0 0,100% 0,100% 78%,50% 100%,0 78%);border-radius:11px 11px 2px 2px;font-size:12px}.marker-cluster-small,.marker-cluster-medium,.marker-cluster-large{background:rgba(28,122,87,.18)}.marker-cluster-small div,.marker-cluster-medium div,.marker-cluster-large div{background:#177a5a;color:white;font-weight:800}.facility{transition:background .15s}.facility:hover{background:#eef7f1}.map-loading{position:absolute;z-index:900;bottom:24px;left:50%;transform:translateX(-50%);background:#fff;color:#38614f;border:1px solid #dde8e0;border-radius:100px;padding:10px 18px;font-size:12px;box-shadow:0 3px 12px #2345}.app.sidebar-hidden{grid-template-columns:0 minmax(0,1fr)}.app.sidebar-hidden .side{visibility:hidden;overflow:hidden}.map-controls{position:absolute;z-index:850;top:16px;left:16px;display:flex;gap:8px}.map-controls button{border:1px solid #dbe4df;box-shadow:0 3px 14px #243a3121;background:#fff;border-radius:10px;padding:10px 12px;color:#244f40;font-weight:700;font-size:13px;cursor:pointer}.map-controls button:hover{background:#f3f8f4}.leaflet-tile-pane{filter:contrast(.92) brightness(1.04)}@media(max-width:750px){.app.sidebar-hidden{grid-template-rows:100dvh 0;grid-template-columns:1fr}.app.sidebar-hidden .side{display:none}.map-controls{top:9px;left:9px}}`;
document.head.append(style);
style.textContent+=`.pin-label{display:none;position:absolute;top:43px;left:50%;transform:translateX(-50%);white-space:nowrap;max-width:210px;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:700;color:#263c32;background:#f2f5f3;border:2px solid #84968a;padding:3px 7px;border-radius:6px;box-shadow:0 2px 7px #1b3c2826;pointer-events:none}.pin-label.low{background:#e4f6ec;border-color:#15976a;color:#116745}.pin-label.mid{background:#e3efff;border-color:#2866bd;color:#174785}.pin-label.high{background:#fff0d9;border-color:#ed8b24;color:#91500c}.pin-label.higher{background:#fce8e3;border-color:#dc6654;color:#8f302e}.pin-label.highest{background:#f4e3eb;border-color:#a84471;color:#76264e}.pin-label.unknown{background:#edf1ee;border-color:#84968a;color:#4c6156}.pin.mid{background:#2866bd}.pin.high{background:#ed8b24}.pin.higher{background:#dc6654}.pin.highest{background:#a84471}.regional-frame{position:absolute;top:-5px;left:-5px;width:46px;height:50px;padding:5px;background:#2445c2;clip-path:polygon(0 0,100% 0,100% 78%,50% 100%,0 78%);filter:drop-shadow(0 0 4px #2445c2)}.regional-frame .pin{border:0}.pin-label.regional-label{box-shadow:inset 4px 0 #2445c2,0 2px 7px #1b3c2826}.map-wrap.labels-visible .pin-label{display:block}.leaflet-marker-icon{overflow:visible!important}.map-controls{flex-wrap:wrap;max-width:calc(100% - 28px)}.map-overlay{max-width:min(380px,calc(100% - 18px))}.map-overlay .legend{max-width:340px}.map-overlay .legend-head{display:flex;justify-content:space-between;align-items:center;gap:16px}.map-overlay .legend-toggle{border:1px solid #cbd9d3;border-radius:7px;background:#f8fbf9;color:#285642;font-weight:700;font-size:12px;padding:4px 8px;cursor:pointer}.map-overlay.is-collapsed .legend-content{display:none}`;
style.textContent+=`.regional-frame{top:0;left:0;width:36px;height:40px;padding:3px;background:#f2cb12;filter:none}.regional-frame .pin{width:30px;height:34px;border:0}.pin-label.regional-label{box-shadow:inset 4px 0 #f2cb12,0 2px 7px #1b3c2826}.room-icons{position:absolute;bottom:calc(100% + 5px);left:50%;transform:translateX(-50%);display:flex;gap:2px;white-space:nowrap;pointer-events:none}.room-icon{display:inline-grid;place-items:center;min-width:21px;height:21px;padding:0 3px;border-radius:5px;background:#fff;color:#263e50;border:1.5px solid #607a89;font-size:12px;font-weight:850;box-shadow:0 1px 4px #0004}.room-icons:empty{display:none}`;
style.textContent+=`.regional-frame{background:#ffed00}.pin-label.regional-label{box-shadow:inset 4px 0 #ffed00,0 2px 7px #1b3c2826}.room-icons{top:-8px;bottom:auto;z-index:3;gap:1px}.room-icon{min-width:21px;width:21px;height:21px;padding:0;border-radius:50%;background:#fff;color:#173b5c;border:2px solid #285784;font-size:11px;line-height:1;box-shadow:0 1px 4px #172d3e70}`;
style.textContent+='.map-wrap.room-icons-hidden .room-icons{display:none!important}';
style.textContent+=`.address-search{margin:0 0 13px;padding:11px 12px;background:#fff5f3;border:1px solid #ffd8d3;border-radius:11px}.address-search label{display:block;font-size:12px;font-weight:800;color:#9b302f;margin-bottom:7px}.address-search .address-actions{display:flex;gap:6px;margin-top:6px}.address-search .address-actions button{border:0;border-radius:8px;padding:8px 10px;font-size:12px;cursor:pointer;font-weight:750}.address-search .address-actions .find-home{background:#dc4146;color:#fff;flex:1}.address-search .address-actions .clear-home{background:#fff;border:1px solid #f0c2bd;color:#8a4a46}.address-search .address-help,.address-search .address-result{font-size:11px;line-height:1.5;color:#916b66;margin:6px 0 0}.home-pin{width:36px;height:36px;border:3px solid #fff;border-radius:50%;background:#e53c43;display:grid;place-items:center;box-shadow:0 2px 9px #8e273b80}.home-pin svg{width:22px;height:22px;fill:#fff}.facility-memo{margin-top:12px;padding-top:10px;border-top:1px solid #e0e8e3}.facility-memo label{display:block;font-size:12px;font-weight:800;color:#355e49;margin-bottom:5px}.facility-memo textarea{width:100%;min-height:82px;resize:vertical;border:1px solid #bfd3c6;border-radius:7px;padding:8px;font:13px/1.5 inherit;box-sizing:border-box}.facility-memo small{color:#708078;font-size:11px}`;
const addressBox=document.createElement('form');addressBox.className='address-search';addressBox.innerHTML='<label for="client-address">🏠 住所にピンを立てる</label><input id="client-address" type="text" placeholder="例：千葉県柏市末広町1-1" autocomplete="off"><div class="address-actions"><button class="find-home" type="submit">表示</button><button class="clear-home" type="button" id="clear-client-address">ピンを消す</button></div><p class="address-result" role="status" id="address-result"></p>';
document.querySelector('.top h1').insertAdjacentElement('afterend',addressBox);
let homeMarker=null;
const homeIcon=L.divIcon({className:'',html:'<div class="home-pin"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 2 10.5l1.5 1.8L5 11v10h6v-6h3v6h6V11l1.5 1.3 1.5-1.8L12 2z"/></svg></div>',iconSize:[36,36],iconAnchor:[18,18]});
addressBox.addEventListener('submit',async event=>{
 event.preventDefault();const address=document.getElementById('client-address').value.trim(),status=document.getElementById('address-result');
 if(!address){status.textContent='住所を入力してください。';return}
 status.textContent='住所を検索中…';const button=addressBox.querySelector('.find-home');button.disabled=true;
 try{
  const response=await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent(address));
  if(!response.ok)throw Error('検索サービスに接続できませんでした');
  const data=await response.json();const candidate=(Array.isArray(data)?data:[]).find(item=>{
   const coordinates=item.geometry?.coordinates;
   return Array.isArray(coordinates)&&coordinates[0]>=139.5&&coordinates[0]<=141.2&&coordinates[1]>=34.8&&coordinates[1]<=36.3;
  });
  if(!candidate)throw Error('千葉県内に該当する住所が見つかりませんでした');
  const [lng,lat]=candidate.geometry.coordinates;
  if(homeMarker)homeMarker.remove();
  homeMarker=L.marker([lat,lng],{icon:homeIcon,draggable:true,zIndexOffset:2000}).addTo(map);
  homeMarker.bindPopup('<b>🏠 住所検索地点</b><p>'+esc(address)+'</p><small>地図上の位置はドラッグして微調整できます</small>');
  homeMarker.on('dragend',()=>{status.textContent='赤い家マークの位置を手動で調整しました。'});
  map.setView([lat,lng],14);homeMarker.openPopup();
  status.textContent='赤い家マークを表示しました。地番が正確に検索できない場合はドラッグで調整してください。';
 }catch(error){status.textContent=error.message||'住所検索に失敗しました'}finally{button.disabled=false}
});
document.getElementById('clear-client-address').onclick=()=>{if(homeMarker){homeMarker.remove();homeMarker=null}document.getElementById('address-result').textContent=''};
style.textContent+=`.csv-toggle{width:100%;margin:6px 0;border:1px solid #cddbd4;border-radius:9px;background:#f6faf7;color:#315b49;font-size:12px;padding:8px;cursor:pointer}.buttons.csv-collapsed{display:none}.map-controls.filter-toolbar{top:12px;left:12px;right:12px;max-width:none;display:flex;align-items:center;flex-wrap:nowrap;gap:6px;padding:7px;background:#fffffff2;border:1px solid #dfe9e3;border-radius:12px;box-shadow:0 3px 14px #243a3123;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}.map-controls.filter-toolbar button{flex:0 0 auto;white-space:nowrap;box-shadow:none;padding:7px 9px;font-size:12px}.toolbar-divider{height:24px;min-width:1px;background:#d8e5dc;flex:0 0 1px;margin:0 3px}.toolbar-label{font-size:11px;font-weight:800;color:#4d675b;white-space:nowrap;flex:0 0 auto}.map-controls.filter-toolbar button.is-active{background:#187755;color:white;border-color:#187755}.map-controls.filter-toolbar button.region-active{background:#fff4a5;color:#6e5600;border-color:#edc829}.map-controls.filter-toolbar button.wait-active{background:#2964ab;color:#fff;border-color:#2964ab}.map-overlay{top:75px!important}@media(max-width:750px){.map-controls.filter-toolbar{top:7px;left:7px;right:7px;padding:5px;gap:4px}.map-controls.filter-toolbar button{font-size:11px;padding:6px 7px}.map-overlay{top:64px!important}}`;
style.textContent+=`.address-result:empty{display:none}`;
style.textContent+=`.map-controls.filter-toolbar{gap:8px;padding:6px 8px;background:#f9fcfaed}.filter-toolbar .toolbar-group{display:flex;align-items:center;gap:5px;flex:0 0 auto;border:1px solid #dfebe4;border-radius:10px;background:#edf5f0;padding:5px 7px}.filter-toolbar .toolbar-group.group-room{background:#eaf3fd;border-color:#d0e3f5}.filter-toolbar .toolbar-group.group-region{background:#fff8de;border-color:#f2e4b0}.filter-toolbar .toolbar-group.group-wait{background:#f1eefc;border-color:#e2dcf3}.filter-toolbar .toolbar-heading{font-size:11px;font-weight:850;color:#34554b;white-space:nowrap;padding:0 5px 0 1px}.filter-toolbar .group-room .toolbar-heading{color:#235487}.filter-toolbar .group-region .toolbar-heading{color:#805d0c}.filter-toolbar .group-wait .toolbar-heading{color:#624e89}.filter-toolbar .toolbar-filters{display:flex;align-items:center;gap:8px;flex:0 0 auto}.filter-toolbar #clear-filters{border-color:#d7d9dd;color:#5e6570}.viewport-count{position:absolute;z-index:850;left:15px;bottom:32px;background:#173c32ee;color:#fff;border-radius:12px;padding:9px 13px;box-shadow:0 4px 16px #102b2540;pointer-events:none;display:flex;align-items:baseline;gap:6px;font-size:12px}.viewport-count strong{font-size:21px;font-weight:850;font-variant-numeric:tabular-nums}.viewport-count .total{font-size:11px;color:#d4e9de}@media(max-width:750px){.filter-toolbar .toolbar-group{padding:4px 5px;gap:3px}.filter-toolbar .toolbar-heading{font-size:10px}.viewport-count{left:9px;bottom:26px;padding:7px 10px}.viewport-count strong{font-size:18px}}`;
style.textContent+=`.map-controls.filter-toolbar{padding:4px 6px;gap:5px;border-radius:9px}.map-controls.filter-toolbar button{padding:5px 7px;font-size:11px;border-radius:7px}.filter-toolbar .toolbar-group{padding:3px 5px;gap:4px;border-radius:8px}.filter-toolbar .toolbar-filters{gap:5px}.filter-toolbar .toolbar-heading{font-size:10px;padding:0 3px 0 0}.filter-toolbar .group-room button.room-badge{display:inline-grid;place-items:center;width:26px;height:26px;padding:0;border:2px solid #285784;border-radius:50%;font-size:12px;font-weight:900;color:#173b5c;background:#fff;line-height:1}.filter-toolbar .group-room button.room-badge.is-active{background:#285784;color:#fff;box-shadow:0 0 0 2px #a9c8ed}.filter-toolbar .filter-count{align-self:center;white-space:nowrap;background:#1c654b;color:white;padding:5px 9px;border-radius:8px;font-size:11px;font-weight:800;font-variant-numeric:tabular-nums}.map-overlay{top:62px!important}@media(max-width:750px){.map-controls.filter-toolbar{padding:3px 4px;gap:4px}.map-controls.filter-toolbar button{padding:4px 6px;font-size:10px}.filter-toolbar .group-room button.room-badge{width:24px;height:24px;font-size:11px}.map-overlay{top:55px!important}}`;
style.textContent+=`.filter-toolbar .group-room button.room-badge{border-width:1px}.filter-toolbar .group-room button.room-badge.is-active{box-shadow:0 0 0 1px #a9c8ed}`;
style.textContent+=`.filter-toolbar .toolbar-group.group-date{background:#eaf7f5;border-color:#b7e2db}.filter-toolbar .group-date .toolbar-heading{color:#146356}.filter-toolbar .group-date button.date-active{background:#147d70;color:#fff;border-color:#147d70}.map-controls.filter-toolbar{overflow-x:auto;max-width:calc(100% - 24px);scrollbar-width:thin}.filter-toolbar .toolbar-filters{flex-wrap:nowrap}.filter-toolbar .group-date button{white-space:nowrap}`;
const csvButtons=document.querySelector('.top .buttons'),csvToggle=document.createElement('button');csvToggle.type='button';csvToggle.className='csv-toggle';csvToggle.textContent='📂 CSV操作を表示';csvButtons.classList.add('csv-collapsed');csvButtons.before(csvToggle);
csvToggle.onclick=()=>{const collapsed=csvButtons.classList.toggle('csv-collapsed');csvToggle.textContent=collapsed?'📂 CSV操作を表示':'📂 CSV操作を閉じる'};
style.textContent+=`.top .buttons:not(.csv-collapsed){flex-wrap:wrap}.top .buttons .publication-import{flex:1 1 100%;background:#e8f1ff;border:1px solid #b6cdea;color:#245383;border-radius:8px;padding:9px;cursor:pointer;font-size:12px;font-weight:800}`;
const publicationButton=document.createElement('button');publicationButton.type='button';publicationButton.className='publication-import';publicationButton.textContent='公表日時CSVを読み込む';csvButtons.append(publicationButton);
const publicationInput=document.createElement('input');publicationInput.type='file';publicationInput.accept='.csv,text/csv';publicationInput.hidden=true;csvButtons.after(publicationInput);
const publicationKey='chiba-tokuyo-publication-dates-v1',roomKey='chiba-tokuyo-room-types-v1';let importedDates={},importedRooms={};
// Only aggregated official facility records are published in this separate public repository.
const publicOfficialCsv='https://raw.githubusercontent.com/royalaihoshi-tech/chiba-tokuyo-public-data/main/publication-dates.csv';
const publicNewFacilities='https://raw.githubusercontent.com/royalaihoshi-tech/chiba-tokuyo-public-data/main/new-facilities.json';
const publicSyncHistory='https://raw.githubusercontent.com/royalaihoshi-tech/chiba-tokuyo-public-data/main/sync-history.json';
style.textContent+=`.sync-history{border-top:1px solid #e6eeea;background:#fafcfb;font-size:12px;margin-top:auto}.sync-history summary{cursor:pointer;list-style:none;padding:12px 20px;font-weight:800;color:#315c4a}.sync-history summary::-webkit-details-marker{display:none}.sync-history summary::after{content:' ＋';float:right}.sync-history[open] summary::after{content:' −'}.sync-history-body{max-height:32vh;overflow:auto;padding:0 15px 12px}.sync-history-day{margin:8px 0;padding:10px;background:#fff;border:1px solid #e2ebe6;border-radius:9px}.sync-history-day summary{padding:0;color:#315c4a}.sync-history-day summary::after{content:' ＋'}.sync-history-day[open] summary::after{content:' −'}.sync-history-day ul{margin:9px 0 0;padding-left:18px;line-height:1.75}.sync-history-note{color:#72857b;font-size:11px;line-height:1.6;margin:6px 2px 0}`;
const historyPanel=document.createElement('details');historyPanel.className='sync-history';historyPanel.innerHTML='<summary>データ更新履歴</summary><div class="sync-history-body" id="sync-history-body"><p class="sync-history-note">データを確認中です…</p></div>';
document.querySelector('.side .footer').before(historyPanel);
// Facility names and counts remain available on the map; the long sidebar list is not used.
document.querySelector('.side .count').remove();
document.querySelector('.side .results').remove();
// High-contrast road style without washed-out CSS filters.
style.textContent+=`.map-wrap #map{background:#f6f9fb}.leaflet-tile-pane{filter:none!important}.side{background:#fcfefd}.top{padding-bottom:16px}`;
const dateInJapan=iso=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
const timeInJapan=iso=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
function renderSyncHistory(entries,persistent){
 const container=document.getElementById('sync-history-body'),names=new Map(all.map(f=>[f.id+':'+f.serviceCode,displayFacilityName(f.name)])),days=new Map();
 for(const entry of entries){
  const timestamp=entry.checkedAt||entry.at||entry.date;
  if(!timestamp||!Number.isFinite(Date.parse(timestamp)))continue;
  const day=dateInJapan(timestamp),id=String(entry.id||''),code=String(entry.serviceCode||'');
  if(!days.has(day))days.set(day,[]);
  days.get(day).push({name:entry.name||names.get(id+':'+code)||id,time:timeInJapan(timestamp),status:entry.status||'確認済み'});
 }
 container.replaceChildren();
 const note=document.createElement('p');note.className='sync-history-note';note.textContent=persistent?'収集ログに保存された取得履歴です。':'公開CSVに残っている各施設の最新取得日時から集計しています。過去の再取得履歴は含まれません。';container.append(note);
 if(!days.size){const p=document.createElement('p');p.className='sync-history-note';p.textContent='取得日時の記録はまだありません。';container.append(p);return}
 const sorted=[...days.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
 for(const [day,facilities] of sorted){
  facilities.sort((a,b)=>a.time.localeCompare(b.time));
  const group=document.createElement('details');group.className='sync-history-day';
  const summary=document.createElement('summary');summary.textContent=`${day}　${facilities.length}施設`;
  const list=document.createElement('ul');
  for(const f of facilities){const li=document.createElement('li');li.textContent=`${f.time}　${f.name}${f.status==='確認済み'?'':`（${f.status}）`}`;list.append(li)}
  group.append(summary,list);container.append(group);
 }
}
async function refreshSyncHistory(fallbackEntries){
 try{
  const response=await fetch(publicSyncHistory+'?t='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('履歴ファイル未公開');
  const data=await response.json();
  if(!Array.isArray(data.entries))throw Error('履歴ファイル形式エラー');
  renderSyncHistory(data.entries,true);
 }catch{renderSyncHistory(fallbackEntries,false)}
}
async function refreshNewFacilities(){
 try{
  const response=await fetch(publicNewFacilities+'?t='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('公開施設一覧がまだありません');
  const data=await response.json();
  if(!Array.isArray(data.facilities)||data.facilities.length>500||data.facilities.length!==data.count)throw Error('施設追加データの形式が異なります');
  const known=new Set(all.map(f=>f.id+':'+f.serviceCode));let added=0;
  for(const f of data.facilities){
   if(!/^\d{10}$/.test(f.id)||![510,540].includes(Number(f.serviceCode))||!Number.isFinite(f.lat)||!Number.isFinite(f.lng)||f.lat<34.85||f.lat>36.2||f.lng<139.6||f.lng>141||typeof f.name!=='string'||typeof f.address!=='string')continue;
   const key=f.id+':'+f.serviceCode;if(known.has(key))continue;
   all.push({...f,wait:null,roomTypes:[],publishedAt:''});known.add(key);added++;
  }
  if(added){populate();draw();}
  return added;
 }catch(error){console.info('追加施設データの公開待ちです。',error.message);return 0}
}
async function refreshPublicOfficialData(){
 try{
  const response=await fetch(publicOfficialCsv+'?t='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('公開CSV未配置');
  const rows=(await response.text()).replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if(!rows[0]?.startsWith('事業所番号,サービスコード,公表日時,取得日時'))throw Error('CSV形式が異なります');
  const official=new Map(),syncEntries=[];
  for(const line of rows.slice(1)){
   const [id,code,date,checkedAt,types,,status,,waiting,waitingStatus,capacity,capacityStatus]=line.split(',');
   if(!/^\d{10}$/.test(id)||!/^\d{3}$/.test(code))continue;
   const update={};
   if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(date||''))update.publishedAt=date;
   if(status==='確認済み'&&types&&types.split('|').every(t=>['unit','private','shared'].includes(t)))update.roomTypes=types.split('|');
   if(waitingStatus==='確認済み'&&/^\d+$/.test(waiting||''))update.wait=Number(waiting);
   if(capacityStatus==='確認済み'&&/^\d+$/.test(capacity||'')&&Number(capacity)>0)update.capacity=Number(capacity);
   if(Object.keys(update).length)official.set(id+':'+code,update);
   if(Number.isFinite(Date.parse(checkedAt)))syncEntries.push({id,serviceCode:code,checkedAt,status:status||'取得済み'});
  }
  if(!official.size)return;
  all=all.map(f=>({...f,...official.get(f.id+':'+f.serviceCode)}));
  draw();
  await refreshSyncHistory(syncEntries);
 }catch(error){console.info('公式CSVの公開待ち。既存の施設データを表示します。',error.message)}
}
try{importedDates=JSON.parse(localStorage.getItem(publicationKey)||'{}')||{}}catch{importedDates={}}
try{importedRooms=JSON.parse(localStorage.getItem(roomKey)||'{}')||{}}catch{importedRooms={}}
publicationButton.onclick=()=>publicationInput.click();
publicationInput.onchange=async()=>{
 const file=publicationInput.files?.[0];if(!file)return;
 try{
  const rows=(await file.text()).replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if(!rows[0]?.startsWith('事業所番号,サービスコード,公表日時,取得日時'))throw Error('公式情報CSVの形式が異なります');
  const matched=new Set(all.map(f=>`${f.id}:${f.serviceCode}`));let changed=0,roomChanged=0;
  for(const line of rows.slice(1)){
   const [id,code,date,,types,,status]=line.split(',');const k=`${id}:${code}`;
   if(matched.has(k)&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(date||'')){
    importedDates[k]=date;changed++;
   }
   if(matched.has(k)&&status==='確認済み'&&typeof types==='string'&&types.split('|').every(t=>['unit','private','shared'].includes(t))&&types){importedRooms[k]=types.split('|');roomChanged++}
  }
  try{localStorage.setItem(publicationKey,JSON.stringify(importedDates))}catch{alert('ブラウザへの保存に失敗しました。別のブラウザでお試しください')}
  try{localStorage.setItem(roomKey,JSON.stringify(importedRooms))}catch{alert('居室タイプのブラウザ保存に失敗しました')}
  all=all.map(f=>({...f,publishedAt:importedDates[`${f.id}:${f.serviceCode}`]||f.publishedAt,roomTypes:importedRooms[`${f.id}:${f.serviceCode}`]||f.roomTypes}));draw();
  alert(`公式の公表日時${changed}施設・居室タイプ${roomChanged}施設を読み込みました。`);
 }catch(error){alert(error.message||'CSVを読み込めませんでした')}finally{publicationInput.value=''}
};
document.querySelector('.map-overlay').innerHTML='<div class="legend-head"><b>待機人数</b><button class="legend-toggle" id="toggle-legend" type="button" aria-expanded="true">非表示</button></div><div class="legend-content"><div class="legend"><span><i class="dot" style="background:#15976a"></i>1〜30人</span><span><i class="dot" style="background:#2866bd"></i>31〜60人</span><span><i class="dot" style="background:#ed8b24"></i>61〜100人</span><span><i class="dot" style="background:#dc6654"></i>101〜150人</span><span><i class="dot" style="background:#a84471"></i>151人以上</span><span><i class="dot" style="background:#84968a"></i>不明（0人表記含む）</span></div><div style="margin-top:9px;color:#425b75;font-size:11px">黄色い枠線：地域密着型特養</div><div style="margin-top:5px;color:#425b75;font-size:11px">居室：ユ＝ユニット型個室　個＝従来型個室　多＝従来型多床室（確認できた施設のみ）</div></div>';
document.getElementById('toggle-legend').onclick=()=>{const overlay=document.querySelector('.map-overlay'),hidden=overlay.classList.toggle('is-collapsed'),button=document.getElementById('toggle-legend');button.textContent=hidden?'表示':'非表示';button.setAttribute('aria-expanded',String(!hidden))};
document.querySelector('.map-overlay').classList.add('legend-hidden');
style.textContent+='.map-overlay.legend-hidden{display:none}';
document.getElementById('waiting').remove();
document.querySelector('.top .filters').style.gridTemplateColumns='1fr';
const controls=document.createElement('div');controls.className='map-controls filter-toolbar';controls.setAttribute('aria-label','地図の表示と施設の絞り込み');controls.innerHTML='<div class="toolbar-group group-display"><span class="toolbar-heading">表示設定</span><button id="toggle-sidebar" type="button" aria-expanded="true">☰ 設定を閉じる</button></div>';document.querySelector('.map-wrap').append(controls);
document.querySelector('.app').classList.add('sidebar-hidden');
const sidebarButton=document.getElementById('toggle-sidebar');sidebarButton.textContent='☰ 設定を開く';sidebarButton.setAttribute('aria-expanded','false');
const pinsButton=document.createElement('button');pinsButton.id='toggle-facility-pins';pinsButton.type='button';pinsButton.textContent='施設ピン：ON';pinsButton.setAttribute('aria-pressed','true');controls.querySelector('.group-display').append(pinsButton);
pinsButton.onclick=()=>{
 const visible=map.hasLayer(markers);
 if(visible){map.removeLayer(markers);map.closePopup()}else{markers.addTo(map)}
 pinsButton.textContent=visible?'施設ピン：OFF':'施設ピン：ON';
 pinsButton.setAttribute('aria-pressed',String(!visible));
};
const legendButton=document.createElement('button');legendButton.id='toggle-legend-window';legendButton.type='button';legendButton.textContent='凡例を表示';legendButton.setAttribute('aria-expanded','false');controls.querySelector('.group-display').append(legendButton);
controls.querySelector('.group-display').insertBefore(legendButton,pinsButton);
legendButton.onclick=()=>{const hidden=document.querySelector('.map-overlay').classList.toggle('legend-hidden');legendButton.textContent=hidden?'凡例を表示':'凡例を閉じる';legendButton.setAttribute('aria-expanded',String(!hidden))};
setTimeout(()=>map.invalidateSize(),0);
const nameButton=document.createElement('button');nameButton.id='toggle-names';nameButton.type='button';nameButton.textContent='施設名：ON';nameButton.setAttribute('aria-pressed','true');controls.querySelector('.group-display').append(nameButton);
const roomBadgeButton=document.createElement('button');roomBadgeButton.id='toggle-room-badges';roomBadgeButton.type='button';roomBadgeButton.textContent='居室バッジ：ON';roomBadgeButton.setAttribute('aria-pressed','true');controls.querySelector('.group-display').append(roomBadgeButton);
roomBadgeButton.onclick=()=>{const hidden=document.querySelector('.map-wrap').classList.toggle('room-icons-hidden');roomBadgeButton.textContent=hidden?'居室バッジ：OFF':'居室バッジ：ON';roomBadgeButton.setAttribute('aria-pressed',String(!hidden))};
const filterBar=document.createElement('div');filterBar.className='toolbar-filters';filterBar.innerHTML='<div class="toolbar-group group-room"><span class="toolbar-heading">居室タイプ</span><button class="room-badge" type="button" data-room="unit" aria-label="ユニット型個室" title="ユニット型個室" aria-pressed="false">ユ</button><button class="room-badge" type="button" data-room="private" aria-label="従来型個室" title="従来型個室" aria-pressed="false">個</button><button class="room-badge" type="button" data-room="shared" aria-label="従来型多床室" title="従来型多床室" aria-pressed="false">多</button></div><div class="toolbar-group group-region"><span class="toolbar-heading">施設区分</span><button type="button" data-regional="true" aria-pressed="false">地域密着型のみ</button></div><div class="toolbar-group group-wait"><span class="toolbar-heading">待機人数</span><button type="button" data-wait="low" aria-pressed="false">1〜30人</button><button type="button" data-wait="mid" aria-pressed="false">31〜60人</button><button type="button" data-wait="high" aria-pressed="false">61〜100人</button><button type="button" data-wait="higher" aria-pressed="false">101〜150人</button><button type="button" data-wait="highest" aria-pressed="false">151人以上</button><button type="button" data-wait="unknown" aria-pressed="false">不明</button></div><div class="toolbar-group group-date"><span class="toolbar-heading">厚労省 公表日時</span><button type="button" data-date="recent" aria-pressed="false">3か月以内</button><button type="button" data-date="half" aria-pressed="false">3〜6か月</button><button type="button" data-date="year" aria-pressed="false">6か月〜1年</button><button type="button" data-date="old" aria-pressed="false">1年以上</button><button type="button" data-date="unknown" aria-pressed="false">未取得</button></div><span class="filter-count" id="filtered-facility-count" role="status" aria-live="polite">該当 —施設</span>';controls.append(filterBar);
const selectedRooms=new Set(),selectedWaits=new Set(),selectedDates=new Set();let regionalOnly=false;
function dateBucket(value){
 const date=/^(\d{4})-(\d{2})-(\d{2})/.exec(value||'');
 if(!date)return 'unknown';
 const published=new Date(Number(date[1]),Number(date[2])-1,Number(date[3]));
 const today=new Date();today.setHours(0,0,0,0);
 if(!Number.isFinite(published.getTime())||published>today)return 'unknown';
 const monthsAgo=n=>{const y=today.getFullYear(),m=today.getMonth()-n,d=today.getDate();const last=new Date(y,m+1,0).getDate();return new Date(y,m,Math.min(d,last))};
 if(published>=monthsAgo(3))return 'recent';
 if(published>=monthsAgo(6))return 'half';
 if(published>=monthsAgo(12))return 'year';
 return 'old';
}
function refreshFilters(){filterBar.querySelectorAll('[data-room]').forEach(b=>{const active=selectedRooms.has(b.dataset.room);b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active))});filterBar.querySelectorAll('[data-wait]').forEach(b=>{const active=selectedWaits.has(b.dataset.wait);b.classList.toggle('wait-active',active);b.setAttribute('aria-pressed',String(active))});filterBar.querySelectorAll('[data-date]').forEach(b=>{const active=selectedDates.has(b.dataset.date);b.classList.toggle('date-active',active);b.setAttribute('aria-pressed',String(active))});const regional=filterBar.querySelector('[data-regional]');regional.classList.toggle('region-active',regionalOnly);regional.setAttribute('aria-pressed',String(regionalOnly))}
filterBar.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.room){const value=button.dataset.room;selectedRooms.has(value)?selectedRooms.delete(value):selectedRooms.add(value)}else if(button.dataset.wait){const value=button.dataset.wait;selectedWaits.has(value)?selectedWaits.delete(value):selectedWaits.add(value)}else if(button.dataset.date){const value=button.dataset.date;selectedDates.has(value)?selectedDates.delete(value):selectedDates.add(value)}else if(button.dataset.regional){regionalOnly=!regionalOnly}else return;refreshFilters();draw()});
let namesEnabled=true;
function updateLabelVisibility(){document.querySelector('.map-wrap').classList.toggle('labels-visible',namesEnabled&&map.getZoom()>=13);nameButton.textContent=namesEnabled?'施設名：ON':'施設名：OFF'}
nameButton.onclick=()=>{namesEnabled=!namesEnabled;nameButton.setAttribute('aria-pressed',String(namesEnabled));updateLabelVisibility()};
map.on('zoomend',updateLabelVisibility);
document.getElementById('toggle-sidebar').onclick=()=>{const hidden=document.querySelector('.app').classList.toggle('sidebar-hidden');const b=document.getElementById('toggle-sidebar');b.textContent=hidden?'☰ 設定を開く':'☰ 設定を閉じる';b.setAttribute('aria-expanded',String(!hidden));setTimeout(()=>map.invalidateSize(),240)};
let placedMarkers=[];
function repositionSharedMarkers(){
 const zoom=map.getZoom();
 const positions=placedMarkers.map(item=>map.project(item.original,zoom));
 const visited=new Set();
 for(let i=0;i<placedMarkers.length;i++){
  if(visited.has(i))continue;
  const group=[i];visited.add(i);
  for(let k=0;k<group.length;k++)for(let j=0;j<placedMarkers.length;j++){
   if(visited.has(j))continue;
   const a=positions[group[k]],b=positions[j];
   if(zoom>=12&&Math.hypot(a.x-b.x,a.y-b.y)<42){visited.add(j);group.push(j)}
  }
  group.sort((a,b)=>placedMarkers[a].original.lng-placedMarkers[b].original.lng||placedMarkers[a].original.lat-placedMarkers[b].original.lat);
  for(let k=0;k<group.length;k++){
   const index=group[k],p=positions[index],offset=(k-(group.length-1)/2)*48;
   placedMarkers[index].marker.setLatLng(map.unproject(L.point(p.x+offset,p.y),zoom));
  }
 }
}
map.on('zoomend',repositionSharedMarkers);
draw=function(fit=false){
 markers.clearLayers();placedMarkers=[];const q=$('q').value.toLowerCase(),city=$('city').value;
 const visible=all.filter(x=>(!q||(x.name+x.address).toLowerCase().includes(q))&&(!city||x.city===city)&&(!regionalOnly||x.type==='地域密着型特養')&&(!selectedRooms.size||(x.roomTypes||[]).some(type=>selectedRooms.has(type)))&&(!selectedWaits.size||selectedWaits.has(level(x.wait)))&&(!selectedDates.size||selectedDates.has(dateBucket(x.publishedAt))));
 document.getElementById('filtered-facility-count').textContent=`該当 ${visible.length}施設`;
 const bounds=[];
 for(const f of visible){
  const shortName=displayFacilityName(f.name);
  const cls=level(f.wait),regional=f.type==='地域密着型特養',pin=`<div class="pin ${cls}">${f.wait??'?'}</div>`,roomLabels={unit:'ユ',private:'個',shared:'多'},roomIcons=(f.roomTypes||[]).filter(t=>roomLabels[t]).map(t=>`<span class="room-icon">${roomLabels[t]}</span>`).join(''),icon=L.divIcon({html:`${regional?`<div class="regional-frame">${pin}</div>`:pin}<span class="room-icons">${roomIcons}</span><span class="pin-label ${cls}${regional?' regional-label':''}">${esc(shortName)}</span>`,iconSize:[36,40],iconAnchor:[18,40]});
  const waiting=f.wait==null?'不明':f.wait+'人';
  const detailURL=f.id&&/^\d{10}$/.test(f.id)?`https://www.kaigokensaku.mhlw.go.jp/12/index.php?action_kouhyou_detail_024_kani=true&JigyosyoCd=${f.id}-00&ServiceCd=${f.serviceCode||510}#title07`:'';
  const m=L.marker([f.lat,f.lng],{icon}).bindTooltip(`${esc(shortName)}｜待機 ${waiting}`,{direction:'top'})
    .bindPopup(`<div class="popup"><h3>${esc(shortName)}</h3><p>${esc(f.address)}</p><p><b>待機人数：${waiting}</b></p><p>施設区分：${esc(f.type||'未登録')}</p><p><b>厚労省 公表日時：${f.publishedAt?esc(f.publishedAt.replaceAll('-','/')):'未取得'}</b></p>${Number(f.capacity)>0?`<p>定員：${esc(f.capacity)}人</p>`:'<p>定員：未確認</p>'}${f.phone?`<p>電話：${esc(f.phone)}</p>`:''}${detailURL?`<p><a href="${detailURL}" target="_blank" rel="noopener noreferrer">厚労省の施設詳細を確認 ↗</a></p>`:''}${f.website&&/^https?:\/\//.test(f.website)?`<p><a href="${esc(f.website)}" target="_blank" rel="noopener noreferrer">施設の公式サイト ↗</a></p>`:''}</div>`,{maxWidth:350});
  placedMarkers.push({marker:m,original:L.latLng(f.lat,f.lng)});
  markers.addLayer(m);bounds.push([f.lat,f.lng]);
 }
 repositionSharedMarkers();updateLabelVisibility();
 if(fit&&bounds.length)map.fitBounds(bounds,{padding:[35,35],maxZoom:12});
};
const loading=document.createElement('div');loading.className='map-loading';loading.textContent='千葉県の施設情報を読み込み中…';document.querySelector('.map-wrap').append(loading);
fetch('./facilities.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('施設一覧が取得できませんでした');return r.json()}).then(async data=>{
 all=data.facilities.filter(f=>Number.isFinite(f.lat)&&Number.isFinite(f.lng)).map(f=>({...f,wait:f.wait===0?null:f.wait,publishedAt:importedDates[`${f.id}:${f.serviceCode}`]||f.publishedAt,roomTypes:importedRooms[`${f.id}:${f.serviceCode}`]||f.roomTypes}));
 populate();draw(true);loading.remove();await refreshNewFacilities();await refreshPublicOfficialData();
}).catch(error=>{loading.textContent='データ読込エラー：再読み込みしてください';console.error(error)});
