/* Official availability publication markers — v1.2.14 TEST.
 * Only the 8 names recovered from the previous working session are provisional.
 * Data-driven by facility ID + service code, not ambiguous facility names. */
window.TokuyoOfficialPublications={
  records: new Map(),
  status: 'loading',
  async load(){
    try {
      const r=await fetch('official-publication-facilities.json',{cache:'no-store'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const data=await r.json();
      const rows=Array.isArray(data.records)?data.records:[];
      this.records=new Map(rows.filter(x=>/^\d{10}$/.test(String(x.id))&&/^\d{3}$/.test(String(x.serviceCode))&&['confirmed','prior-chat-provisional'].includes(x.verification)).map(x=>[String(x.id)+'_'+String(x.serviceCode),x]));
      this.status='ready';
    }catch(e){this.status='error';console.warn('公式情報掲載施設の読込失敗',e)}
    if(typeof window.TokuyoOfficialPublicationsChanged==='function')window.TokuyoOfficialPublicationsChanged();
  },
  get(id,service){return this.records.get(String(id)+'_'+String(service||510))||null}
};
window.TokuyoOfficialPublications.load();
