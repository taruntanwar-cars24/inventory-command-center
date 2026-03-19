import { useState, useCallback } from "react";

// ══════════════════════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════════════════════
const T={bg:"#04070c",s0:"#070b15",s1:"#0a1020",s2:"#0f182d",s3:"#15203a",bdr:"#172540",acc:"#ff6b2b",accS:"rgba(255,107,43,.07)",accM:"rgba(255,107,43,.14)",accG:"rgba(255,107,43,.3)",tx:"#e6ecfa",txM:"#7a90b3",txD:"#49607f",g:"#00d68f",gS:"rgba(0,214,143,.07)",gM:"rgba(0,214,143,.15)",r:"#ff4757",rS:"rgba(255,71,87,.07)",rM:"rgba(255,71,87,.15)",y:"#ffbe2e",yS:"rgba(255,190,46,.07)",yM:"rgba(255,190,46,.15)",b:"#3e8bff",bS:"rgba(62,139,255,.07)",cyan:"#00e0ff",cyanS:"rgba(0,224,255,.06)"};

// ══════════════════════════════════════════════════════════════
// SOLD CARS DATA (Liquidation Dashboard)
// ══════════════════════════════════════════════════════════════
const SOLD_CARS=[
  {id:10278001,make:"MARUTI SUZUKI",model:"Swift",year:2020,region:"DEL",buyPrice:485000,soldPrice:460000,msp:470000,tp:490000,c24:440000,bType:"C2D",siAge:12,cancelAge:8,aspBucket:"3-5L",soldDate:"2026-03-02",stockInDate:"2026-02-18",auctionCount:2,bidCount:5,soldTo:"Rajesh Motors",auctionType:"Day"},
  {id:10278002,make:"HYUNDAI",model:"Creta",year:2021,region:"BLR",buyPrice:1120000,soldPrice:1050000,msp:1060000,tp:1100000,c24:1020000,bType:"C2D",siAge:25,cancelAge:18,aspBucket:"10L+",soldDate:"2026-03-04",stockInDate:"2026-02-07",auctionCount:4,bidCount:3,soldTo:"Star Auto",auctionType:"Day"},
  {id:10278003,make:"HONDA",model:"City",year:2019,region:"PUN",buyPrice:780000,soldPrice:710000,msp:740000,tp:770000,c24:720000,bType:"C2B",siAge:35,cancelAge:28,aspBucket:"5-10L",soldDate:"2026-03-05",stockInDate:"2026-01-28",auctionCount:6,bidCount:2,soldTo:"Gupta Cars",auctionType:"Night"},
  {id:10278004,make:"TATA",model:"Nexon",year:2022,region:"DEL",buyPrice:870000,soldPrice:855000,msp:830000,tp:860000,c24:800000,bType:"C2D",siAge:8,cancelAge:5,aspBucket:"5-10L",soldDate:"2026-03-07",stockInDate:"2026-02-27",auctionCount:1,bidCount:8,soldTo:"Malik Auto",auctionType:"Day"},
  {id:10278005,make:"KIA",model:"Seltos",year:2020,region:"CHE",buyPrice:950000,soldPrice:880000,msp:910000,tp:940000,c24:870000,bType:"C2D",siAge:45,cancelAge:38,aspBucket:"5-10L",soldDate:"2026-03-08",stockInDate:"2026-01-22",auctionCount:8,bidCount:4,soldTo:"Chopra Vehicles",auctionType:"Day"},
  {id:10278006,make:"MARUTI SUZUKI",model:"Baleno",year:2021,region:"SKL",buyPrice:620000,soldPrice:590000,msp:600000,tp:615000,c24:580000,bType:"C2B",siAge:20,cancelAge:14,aspBucket:"5-10L",soldDate:"2026-03-10",stockInDate:"2026-02-18",auctionCount:3,bidCount:6,soldTo:"Kerala Motors",auctionType:"Night"},
  {id:10278007,make:"NISSAN",model:"Magnite",year:2022,region:"HYD",buyPrice:520000,soldPrice:510000,msp:505000,tp:518000,c24:490000,bType:"C2D",siAge:10,cancelAge:6,aspBucket:"3-5L",soldDate:"2026-03-11",stockInDate:"2026-03-01",auctionCount:1,bidCount:9,soldTo:"HYD Cars",auctionType:"Day"},
  {id:10278008,make:"MAHINDRA",model:"XUV300",year:2021,region:"MUM",buyPrice:780000,soldPrice:730000,msp:750000,tp:775000,c24:710000,bType:"C2D",siAge:55,cancelAge:42,aspBucket:"5-10L",soldDate:"2026-03-12",stockInDate:"2026-01-15",auctionCount:10,bidCount:2,soldTo:"Anand Auto",auctionType:"Night"},
  {id:10278009,make:"TOYOTA",model:"Glanza",year:2022,region:"DEL",buyPrice:690000,soldPrice:680000,msp:670000,tp:685000,c24:650000,bType:"C2D",siAge:6,cancelAge:3,aspBucket:"5-10L",soldDate:"2026-03-13",stockInDate:"2026-03-07",auctionCount:1,bidCount:12,soldTo:"Delhi Cars Hub",auctionType:"Day"},
  {id:10278010,make:"VOLKSWAGEN",model:"Polo",year:2019,region:"KOL",buyPrice:420000,soldPrice:370000,msp:390000,tp:415000,c24:380000,bType:"C2B",siAge:70,cancelAge:55,aspBucket:"3-5L",soldDate:"2026-03-14",stockInDate:"2026-01-03",auctionCount:12,bidCount:1,soldTo:"Kolkata Motors",auctionType:"Night"},
];

// ══════════════════════════════════════════════════════════════
// STUCK INVENTORY DATA
// ══════════════════════════════════════════════════════════════
const STUCK_DB={
  "10278662740":{LEAD_ID:10278662740,REGION:"BLR",MAKE:"MARUTI SUZUKI",MODEL:"Baleno",Year:2021,Odometer:48832,C24:519000,BUYING_PRICE:519000,TP:556787,NEW_MSP:519000,Anchor:509000,AUCTION:0,LAST_STOCK_IN:"2026-03-11",SALE_CANCEL_DATE:"2026-03-11",BUY_DATE:"2026-02-28",cancelAge:1,AUCTION_BIDDING_STATUS:"returned",REJECTION_REASON:"Returned",LVB_BID_AMOUNT:519000,LOCATION_NAME:"Bangalore Parking",PARKING_REGION:"SKA",RI_Pending:0,Auction_Scheduling:"Day",Auction_Slots:"Slot A",Schedule_Time:1331,MSP1:519000,MSP2:519000,MSP3:519000,Auction_Stop:0,Auction_Hold:null,C2D_Flag:1,C2D_Price:538025,NO_GO:0,Flooded:0,Issue_reason:"RI 15",bType:"C2D",aspBucket:"3-5L"},
  "13017065728":{LEAD_ID:13017065728,REGION:"SKL",MAKE:"NISSAN",MODEL:"Terrano",Year:2013,Odometer:181022,C24:220000,BUYING_PRICE:220000,TP:297497,NEW_MSP:220000,Anchor:210000,AUCTION:0,LAST_STOCK_IN:"2026-03-04",SALE_CANCEL_DATE:"2026-03-07",BUY_DATE:"2026-03-02",cancelAge:5,AUCTION_BIDDING_STATUS:"bid_over",REJECTION_REASON:"DEALER_BACKOUT",LVB_BID_AMOUNT:220000,LOCATION_NAME:"Kochi Parking",PARKING_REGION:"SKL",RI_Pending:0,Auction_Scheduling:"Day",Auction_Slots:"Slot B",Schedule_Time:1327,MSP1:220000,MSP2:220000,MSP3:220000,Auction_Stop:0,Auction_Hold:null,C2D_Flag:1,C2D_Price:236590,NO_GO:0,Flooded:0,Issue_reason:null,bType:"C2B",aspBucket:"0-3L"},
  "10663561745":{LEAD_ID:10663561745,REGION:"PUN",MAKE:"MAHINDRA",MODEL:"XUV500",Year:2012,Odometer:127521,C24:275000,BUYING_PRICE:275000,TP:359677,NEW_MSP:277750,Anchor:267750,AUCTION:0,LAST_STOCK_IN:"2026-03-08",SALE_CANCEL_DATE:"2026-03-08",BUY_DATE:"2026-03-05",cancelAge:4,AUCTION_BIDDING_STATUS:"bid_over",REJECTION_REASON:"DEALER_BACKOUT",LVB_BID_AMOUNT:275000,LOCATION_NAME:"Pune Parking",PARKING_REGION:"PUN",RI_Pending:0,Auction_Scheduling:"Cars Issue Hold",Auction_Slots:"Slot A",Schedule_Time:1328,MSP1:275000,MSP2:275000,MSP3:275000,Auction_Stop:1,Auction_Hold:1,C2D_Flag:1,C2D_Price:288328,NO_GO:0,Flooded:1,Issue_reason:"RI 15",bType:"C2D",aspBucket:"0-3L"},
};

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
const fmt=v=>{if(v==null||isNaN(v))return"\u2014";const a=Math.abs(v),s=v<0?"-":"";if(a>=100000)return`${s}\u20B9${(a/100000).toFixed(2)}L`;if(a>=1000)return`${s}\u20B9${(a/1000).toFixed(1)}K`;return`\u20B9${v}`};
const fmtD=d=>d?new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short"}):"\u2014";
const pct=(a,b)=>b?((a/b)*100).toFixed(1)+"%":"\u2014";

const Pill=({children,c=T.txD,bg=T.s2})=><span style={{padding:"2px 9px",borderRadius:11,fontSize:10,fontWeight:700,background:bg,color:c,whiteSpace:"nowrap"}}>{children}</span>;
const Toggle=({on,onChange})=><div onClick={onChange} style={{width:36,height:20,borderRadius:10,background:on?T.g:T.s3,cursor:"pointer",position:"relative",transition:"background .2s",border:`1px solid ${on?T.g+"50":T.bdr}`,flexShrink:0}}><div style={{width:16,height:16,borderRadius:"50%",background:"#fff",position:"absolute",top:1,left:on?17:1,transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/></div>;

const MultiSelect=({options,selected,onChange,label})=>{
  return(<div>
    <div style={{fontSize:10,color:T.txD,fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{label}</div>
    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
      {options.map(o=>{const sel=selected.includes(o);return(
        <button key={o} onClick={()=>onChange(sel?selected.filter(x=>x!==o):[...selected,o])} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${sel?T.acc:T.bdr}`,background:sel?T.accS:"transparent",color:sel?T.acc:T.txM,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>{o}</button>
      )})}
    </div>
  </div>);
};

const NumInput=({value,onChange,label,unit,color=T.tx})=>(<div style={{flex:1}}><div style={{fontSize:10,color:T.txD,fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>{label}</div><div style={{display:"flex",alignItems:"center",gap:4,background:T.s0,borderRadius:6,border:`1px solid ${T.bdr}`,padding:"4px 8px"}}><input type="number" value={value} onChange={e=>onChange(Number(e.target.value))} style={{flex:1,background:"transparent",border:"none",color,fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",outline:"none",width:"100%"}}/>{unit&&<span style={{fontSize:10,color:T.txD}}>{unit}</span>}</div></div>);

const Slider=({value,onChange,min=0,max=30,label,color=T.acc})=>(<div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:10,color:T.txD,fontWeight:600,textTransform:"uppercase",letterSpacing:".08em"}}>{label}</span><span style={{fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color}}>{value}%</span></div><input type="range" min={min} max={max} value={value} onChange={e=>onChange(Number(e.target.value))} style={{width:"100%",height:4,appearance:"none",background:T.s3,borderRadius:2,outline:"none",cursor:"pointer",accentColor:color}}/></div>);

const Section=({title,icon,children,accent=T.acc,badge})=>(<div style={{background:T.s1,border:`1px solid ${T.bdr}`,borderRadius:12,overflow:"hidden"}}><div style={{padding:"11px 16px",borderBottom:`1px solid ${T.bdr}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{display:"flex",alignItems:"center",gap:7}}><span style={{color:accent,opacity:.8}}>{icon}</span><span style={{fontSize:12,fontWeight:800,color:T.tx}}>{title}</span></div>{badge}</div><div style={{padding:"14px 16px"}}>{children}</div></div>);

const Ic={
  dash:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  price:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  slot:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  quote:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  hist:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>,
  car:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17h14M5 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2M5 17a2 2 0 1 0 4 0m6 0a2 2 0 1 0 4 0"/></svg>,
  check:(s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#00d68f" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  xc:(s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#ff4757" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  clk:(s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#ffbe2e" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  search:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  save:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>,
  warn:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffbe2e" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  up:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#00d68f" strokeWidth="3"><path d="M12 19V5M5 12l7-7 7 7"/></svg>,
  down:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ff4757" strokeWidth="3"><path d="M12 5v14M5 12l7 7 7-7"/></svg>,
};

const MiniBar=({v,max,c})=><div style={{width:"100%",height:4,background:T.s3,borderRadius:2,marginTop:3}}><div style={{width:`${Math.min((v/max)*100,100)}%`,height:"100%",background:c,borderRadius:2}}/></div>;

// ══════════════════════════════════════════════════════════════
// LIQUIDATION DASHBOARD
// ══════════════════════════════════════════════════════════════
function LiquidationDash(){
  const cars=SOLD_CARS;
  const totalSold=cars.length;
  const totalBuy=cars.reduce((s,c)=>s+c.buyPrice,0);
  const totalSoldAmt=cars.reduce((s,c)=>s+c.soldPrice,0);
  const totalLoss=totalBuy-totalSoldAmt;
  const avgLoss=Math.round(totalLoss/totalSold);
  const avgLossPct=((totalLoss/totalBuy)*100).toFixed(1);
  const avgSIAge=Math.round(cars.reduce((s,c)=>s+c.siAge,0)/totalSold);
  const avgAuctions=Math.round(cars.reduce((s,c)=>s+c.auctionCount,0)/totalSold);
  const avgBids=(cars.reduce((s,c)=>s+c.bidCount,0)/totalSold).toFixed(1);
  const profitCars=cars.filter(c=>c.soldPrice>=c.buyPrice);
  const lossCars=cars.filter(c=>c.soldPrice<c.buyPrice);
  const belowMSP=cars.filter(c=>c.soldPrice<c.msp);
  const aboveTP=cars.filter(c=>c.soldPrice>=c.tp);

  // Region breakdown
  const regionData={};cars.forEach(c=>{if(!regionData[c.region])regionData[c.region]={count:0,loss:0,buy:0};regionData[c.region].count++;regionData[c.region].loss+=c.buyPrice-c.soldPrice;regionData[c.region].buy+=c.buyPrice;});
  // ASP breakdown
  const aspData={};cars.forEach(c=>{if(!aspData[c.aspBucket])aspData[c.aspBucket]={count:0,loss:0};aspData[c.aspBucket].count++;aspData[c.aspBucket].loss+=c.buyPrice-c.soldPrice;});
  // SI Age breakdown
  const siBuckets={"0-15d":c=>c.siAge<=15,"15-30d":c=>c.siAge>15&&c.siAge<=30,"30-60d":c=>c.siAge>30&&c.siAge<=60,"60+d":c=>c.siAge>60};
  const siData={};Object.entries(siBuckets).forEach(([k,fn])=>{const f=cars.filter(fn);siData[k]={count:f.length,avgLoss:f.length?Math.round(f.reduce((s,c)=>s+c.buyPrice-c.soldPrice,0)/f.length):0};});

  // Insights
  const worstRegion=Object.entries(regionData).sort((a,b)=>(b[1].loss/b[1].buy)-(a[1].loss/a[1].buy))[0];
  const bestRegion=Object.entries(regionData).sort((a,b)=>(a[1].loss/a[1].buy)-(b[1].loss/b[1].buy))[0];
  const highAgingCars=cars.filter(c=>c.siAge>45);
  const lowBidCars=cars.filter(c=>c.bidCount<=2);

  const kpi=(l,v,sub,c,bg)=><div style={{background:T.s1,border:`1px solid ${T.bdr}`,borderRadius:10,padding:"16px 18px",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",top:-14,right:-8,width:60,height:60,borderRadius:"50%",background:bg,opacity:.4}}/><div style={{fontSize:10,color:T.txD,fontWeight:700,letterSpacing:".09em",textTransform:"uppercase",marginBottom:4}}>{l}</div><div style={{fontSize:22,fontWeight:800,color:c,fontFamily:"'DM Mono',monospace"}}>{v}</div>{sub&&<div style={{fontSize:11,color:T.txM,marginTop:2}}>{sub}</div>}</div>;

  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:20}}>
      <div><h2 style={{fontSize:18,fontWeight:800,color:T.tx,margin:0}}>Liquidation Dashboard</h2><p style={{fontSize:12,color:T.txD,margin:"3px 0 0"}}>March 2026 \u00B7 {totalSold} cars sold \u00B7 P&L Overview + Actionable Insights</p></div>
      <Pill c={T.g} bg={T.gS}>Current Month</Pill>
    </div>

    {/* KPI Row */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:16}}>
      {kpi("Cars Sold",totalSold,`${profitCars.length} profit \u00B7 ${lossCars.length} loss`,T.acc,T.accS)}
      {kpi("Total Revenue",fmt(totalSoldAmt),"Sum of sold prices",T.b,T.bS)}
      {kpi("Total Loss",fmt(-totalLoss),`${avgLossPct}% avg loss`,T.r,T.rS)}
      {kpi("Avg Loss/Car",fmt(-avgLoss),`${belowMSP.length} sold below MSP`,T.y,T.yS)}
      {kpi("Avg SI Age",`${avgSIAge}d`,`${highAgingCars.length} cars >45d`,avgSIAge>30?T.r:T.g,avgSIAge>30?T.rS:T.gS)}
      {kpi("Avg Bids/Car",avgBids,`${avgAuctions} avg auctions`,T.cyan,T.cyanS)}
    </div>

    {/* Breakdown Row */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
      {/* Region */}
      <Section title="Region P&L" icon={Ic.dash} accent={T.cyan} badge={<Pill c={T.txD}>{Object.keys(regionData).length} regions</Pill>}>
        {Object.entries(regionData).sort((a,b)=>b[1].loss-a[1].loss).map(([r,d])=>{const lp=((d.loss/d.buy)*100).toFixed(1);return(
          <div key={r} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.bdr}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:12,fontWeight:800,color:T.acc,fontFamily:"'DM Mono',monospace",width:28}}>{r}</span><span style={{fontSize:11,color:T.txM}}>{d.count} cars</span></div>
            <div style={{textAlign:"right"}}><span style={{fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color:T.r}}>{fmt(-d.loss)}</span><span style={{fontSize:10,color:T.txD,marginLeft:6}}>({lp}%)</span></div>
          </div>
        )})}
      </Section>

      {/* SI Age */}
      <Section title="SI Age Analysis" icon={Ic.slot} accent={T.y} badge={<Pill c={T.y} bg={T.yS}>{avgSIAge}d avg</Pill>}>
        {Object.entries(siData).map(([b,d])=>(<div key={b} style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{fontSize:12,fontWeight:700,color:T.tx}}>{b}</span>
            <span style={{fontSize:11,color:T.txM}}>{d.count} cars \u00B7 {fmt(-d.avgLoss)} avg loss</span>
          </div>
          <MiniBar v={d.count} max={totalSold} c={d.avgLoss>50000?T.r:d.avgLoss>20000?T.y:T.g}/>
        </div>))}
        <div style={{marginTop:8,fontSize:11,color:T.txD,padding:"8px 10px",background:T.s0,borderRadius:6}}>
          <strong style={{color:T.y}}>Insight:</strong> Cars with SI age &gt;30d have {fmt(-Math.round(cars.filter(c=>c.siAge>30).reduce((s,c)=>s+c.buyPrice-c.soldPrice,0)/(cars.filter(c=>c.siAge>30).length||1)))} avg loss vs {fmt(-Math.round(cars.filter(c=>c.siAge<=30).reduce((s,c)=>s+c.buyPrice-c.soldPrice,0)/(cars.filter(c=>c.siAge<=30).length||1)))} for &lt;30d
        </div>
      </Section>

      {/* ASP */}
      <Section title="ASP Bucket Split" icon={Ic.price} accent={T.g} badge={<Pill c={T.g} bg={T.gS}>{Object.keys(aspData).length} tiers</Pill>}>
        {Object.entries(aspData).map(([b,d])=>(<div key={b} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${T.bdr}`}}>
          <div><span style={{fontSize:12,fontWeight:700,color:T.tx}}>\u20B9{b}</span><span style={{fontSize:10,color:T.txD,marginLeft:6}}>{d.count} cars</span></div>
          <span style={{fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color:T.r}}>{fmt(-d.loss)}</span>
        </div>))}
      </Section>
    </div>

    {/* Insights Bar */}
    <Section title="Actionable Insights" icon={Ic.warn} accent={T.y}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[
          {title:"Worst Region: "+worstRegion[0],body:`${worstRegion[1].count} cars sold at ${((worstRegion[1].loss/worstRegion[1].buy)*100).toFixed(1)}% avg loss. Consider increasing anchor price or reducing slot allocation for ${worstRegion[0]}.`,c:T.r},
          {title:"Best Region: "+bestRegion[0],body:`${bestRegion[1].count} cars sold at ${((bestRegion[1].loss/bestRegion[1].buy)*100).toFixed(1)}% avg loss. High demand \u2014 consider routing more inventory to ${bestRegion[0]}.`,c:T.g},
          {title:`${highAgingCars.length} High-Aging Cars (>45d)`,body:`These cars had ${(highAgingCars.reduce((s,c)=>s+c.auctionCount,0)/highAgingCars.length).toFixed(0)} avg auctions before selling. Accelerate pricing drops for 30+ day cars.`,c:T.y},
          {title:`${lowBidCars.length} Low-Bid Cars (\u22642 bids)`,body:`${lowBidCars.length} of ${totalSold} cars had \u22642 bids. Review anchor pricing \u2014 these may be priced too high for market demand.`,c:T.b},
          {title:`${belowMSP.length} Cars Sold Below MSP`,body:`${((belowMSP.length/totalSold)*100).toFixed(0)}% of sales were below MSP. Consider revising MSP for high-aging or low-demand segments.`,c:T.r},
          {title:`${aboveTP.length} Cars Sold Above Target`,body:`${((aboveTP.length/totalSold)*100).toFixed(0)}% sold above TP. Strong performer segments \u2014 identify common traits (region, ASP, age) to replicate.`,c:T.g},
        ].map((ins,i)=>(<div key={i} style={{background:T.s0,borderRadius:8,border:`1px solid ${T.bdr}`,borderLeft:`3px solid ${ins.c}`,padding:"10px 14px"}}>
          <div style={{fontSize:12,fontWeight:700,color:ins.c,marginBottom:4}}>{ins.title}</div>
          <div style={{fontSize:11,color:T.txM,lineHeight:1.5}}>{ins.body}</div>
        </div>))}
      </div>
    </Section>

    {/* Detailed Car Table */}
    <div style={{marginTop:16,background:T.s1,border:`1px solid ${T.bdr}`,borderRadius:12,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.bdr}`,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,fontWeight:800,color:T.tx}}>Car-Level P&L Detail</span><Pill c={T.txD}>{totalSold} cars</Pill></div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead><tr style={{background:T.s2}}>
          {["ID","Car","Region","Buy \u20B9","Sold \u20B9","P&L","Loss%","MSP","TP","SI Age","Auctions","Bids","Type","Buyer"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,color:T.txD,fontSize:9.5,textTransform:"uppercase",letterSpacing:".07em",borderBottom:`1px solid ${T.bdr}`}}>{h}</th>)}
        </tr></thead>
        <tbody>{cars.map(c=>{const pl=c.soldPrice-c.buyPrice;const plPct=((pl/c.buyPrice)*100).toFixed(1);return(
          <tr key={c.id} style={{borderBottom:`1px solid ${T.bdr}`}}>
            <td style={{padding:"7px 10px",fontFamily:"'DM Mono',monospace",color:T.acc,fontSize:10,fontWeight:600}}>{c.id}</td>
            <td style={{padding:"7px 10px",color:T.tx,fontWeight:600}}>{c.year} {c.make} {c.model}</td>
            <td style={{padding:"7px 10px"}}><Pill c={T.cyan} bg={T.cyanS}>{c.region}</Pill></td>
            <td style={{padding:"7px 10px",fontFamily:"'DM Mono',monospace",color:T.tx}}>{fmt(c.buyPrice)}</td>
            <td style={{padding:"7px 10px",fontFamily:"'DM Mono',monospace",color:T.tx}}>{fmt(c.soldPrice)}</td>
            <td style={{padding:"7px 10px",fontFamily:"'DM Mono',monospace",color:pl>=0?T.g:T.r,fontWeight:700}}>{fmt(pl)}</td>
            <td style={{padding:"7px 10px",fontFamily:"'DM Mono',monospace",color:pl>=0?T.g:T.r}}>{plPct}%</td>
            <td style={{padding:"7px 10px",fontFamily:"'DM Mono',monospace",color:c.soldPrice>=c.msp?T.g:T.r,fontSize:10}}>{fmt(c.msp)}</td>
            <td style={{padding:"7px 10px",fontFamily:"'DM Mono',monospace",color:T.txM,fontSize:10}}>{fmt(c.tp)}</td>
            <td style={{padding:"7px 10px"}}><Pill c={c.siAge>30?T.r:c.siAge>15?T.y:T.g} bg={c.siAge>30?T.rS:c.siAge>15?T.yS:T.gS}>{c.siAge}d</Pill></td>
            <td style={{padding:"7px 10px",fontFamily:"'DM Mono',monospace",color:c.auctionCount>5?T.r:T.txM,textAlign:"center"}}>{c.auctionCount}</td>
            <td style={{padding:"7px 10px",fontFamily:"'DM Mono',monospace",color:c.bidCount<=2?T.r:T.g,textAlign:"center"}}>{c.bidCount}</td>
            <td style={{padding:"7px 10px"}}><Pill c={c.bType==="C2D"?T.b:T.y} bg={c.bType==="C2D"?T.bS:T.yS}>{c.bType}</Pill></td>
            <td style={{padding:"7px 10px",color:T.txM,fontSize:10}}>{c.soldTo}</td>
          </tr>
        )})}</tbody>
      </table></div>
    </div>
  </div>);
}

// ══════════════════════════════════════════════════════════════
// PRICING CONTROLS
// ══════════════════════════════════════════════════════════════
function PricingControls(){
  const [rules,setRules]=useState([
    {id:1,name:"Aggressive 0-30d Liquidation",siBuckets:["0-30"],regions:["DEL","BLR","MUM"],bType:["C2D"],auctionType:["Day"],priceDrop:5,anchor:"MSP",active:true},
    {id:2,name:"High-Aging Clearance",siBuckets:["60-90","90+"],regions:["DEL","BLR","PUN","CHE","HYD","MUM","SKL","KOL"],bType:["C2D","C2B"],auctionType:["Day","Night"],priceDrop:15,anchor:"MSP-10%",active:true},
    {id:3,name:"Night Auction Boost",siBuckets:["0-30","30-60"],regions:["DEL","MUM"],bType:["C2B"],auctionType:["Night"],priceDrop:8,anchor:"MSP-5%",active:false},
  ]);
  const ALL_SI=["0-30","30-60","60-90","90+"];
  const ALL_REG=["DEL","BLR","PUN","CHE","HYD","MUM","SKL","KOL"];
  const ALL_BT=["C2D","C2B"];
  const ALL_AT=["Day","Night"];
  const ANCHORS=["MSP","MSP-3%","MSP-5%","MSP-10%","TP","C2D Price","Anchor"];

  const updateRule=(id,field,val)=>setRules(prev=>prev.map(r=>r.id===id?{...r,[field]:val}:r));
  const addRule=()=>setRules(prev=>[...prev,{id:Date.now(),name:"New Rule",siBuckets:["0-30"],regions:["DEL"],bType:["C2D"],auctionType:["Day"],priceDrop:0,anchor:"MSP",active:true}]);

  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div><h2 style={{fontSize:18,fontWeight:800,color:T.tx,margin:0}}>Pricing Control Rules</h2><p style={{fontSize:12,color:T.txD,margin:"3px 0 0"}}>Multi-filter rules that control anchor pricing and discounts. Each rule targets specific bucket + region + business type + auction type combinations.</p></div>
      <button onClick={addRule} style={{padding:"8px 16px",borderRadius:8,border:"none",background:T.acc,color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>+ Add Rule</button>
    </div>

    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {rules.map(rule=>(
        <div key={rule.id} style={{background:T.s1,border:`1px solid ${rule.active?T.bdr:`${T.r}20`}`,borderRadius:12,overflow:"hidden",opacity:rule.active?1:.5}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.bdr}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <Toggle on={rule.active} onChange={()=>updateRule(rule.id,"active",!rule.active)}/>
              <input value={rule.name} onChange={e=>updateRule(rule.id,"name",e.target.value)} style={{background:"transparent",border:"none",color:T.tx,fontSize:14,fontWeight:800,outline:"none",fontFamily:"inherit",width:300}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <Pill c={rule.priceDrop>10?T.r:rule.priceDrop>5?T.y:T.g} bg={rule.priceDrop>10?T.rS:rule.priceDrop>5?T.yS:T.gS}>-{rule.priceDrop}%</Pill>
              <Pill c={rule.active?T.g:T.r} bg={rule.active?T.gS:T.rS}>{rule.active?"ACTIVE":"OFF"}</Pill>
              <button onClick={()=>setRules(prev=>prev.filter(r=>r.id!==rule.id))} style={{background:"transparent",border:"none",color:T.txD,cursor:"pointer",fontSize:16,padding:"0 4px"}}>\u00D7</button>
            </div>
          </div>
          {rule.active&&<div style={{padding:"14px 16px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:14,marginBottom:14}}>
              <MultiSelect label="SI Age Buckets" options={ALL_SI} selected={rule.siBuckets} onChange={v=>updateRule(rule.id,"siBuckets",v)}/>
              <MultiSelect label="Regions" options={ALL_REG} selected={rule.regions} onChange={v=>updateRule(rule.id,"regions",v)}/>
              <MultiSelect label="Business Type" options={ALL_BT} selected={rule.bType} onChange={v=>updateRule(rule.id,"bType",v)}/>
              <MultiSelect label="Auction Type" options={ALL_AT} selected={rule.auctionType} onChange={v=>updateRule(rule.id,"auctionType",v)}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
              <Slider label="Price Drop / Discount" value={rule.priceDrop} onChange={v=>updateRule(rule.id,"priceDrop",v)} max={30} color={rule.priceDrop>10?T.r:T.y}/>
              <div><div style={{fontSize:10,color:T.txD,fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Anchor Base</div>
                <select value={rule.anchor} onChange={e=>updateRule(rule.id,"anchor",e.target.value)} style={{width:"100%",background:T.s0,border:`1px solid ${T.bdr}`,borderRadius:6,color:T.tx,fontSize:12,fontWeight:600,padding:"6px 8px",outline:"none",cursor:"pointer",fontFamily:"inherit"}}>{ANCHORS.map(a=><option key={a} value={a}>{a}</option>)}</select>
              </div>
            </div>
          </div>}
        </div>
      ))}
    </div>
  </div>);
}

// ══════════════════════════════════════════════════════════════
// AUCTION SLOTS (Sequential Rotation)
// ══════════════════════════════════════════════════════════════
function AuctionSlots(){
  const [totalCars,setTotalCars]=useState(1000);
  const [numSlots,setNumSlots]=useState(2);
  const [slotDuration,setSlotDuration]=useState(30);
  const [startTime,setStartTime]=useState("10:00");
  const [totalHours,setTotalHours]=useState(4);

  const slotNames="ABCDEFGHIJ".split("").slice(0,numSlots);
  const carsPerSlot=Math.floor(totalCars/numSlots);
  const remainder=totalCars%numSlots;
  const totalCycles=Math.floor((totalHours*60)/(numSlots*slotDuration));

  // Build timeline
  const timeline=[];
  let currentMin=0;
  const [startH,startM]=startTime.split(":").map(Number);
  for(let cycle=0;cycle<Math.min(totalCycles,8);cycle++){
    for(let s=0;s<numSlots;s++){
      const absMin=startH*60+startM+currentMin;
      const h=Math.floor(absMin/60);
      const m=absMin%60;
      timeline.push({slot:slotNames[s],start:`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`,end:`${String(Math.floor((absMin+slotDuration)/60)).padStart(2,"0")}:${String((absMin+slotDuration)%60).padStart(2,"0")}`,cycle:cycle+1,cars:carsPerSlot+(s<remainder?1:0)});
      currentMin+=slotDuration;
    }
  }

  return(<div>
    <div style={{marginBottom:20}}><h2 style={{fontSize:18,fontWeight:800,color:T.tx,margin:0}}>Auction Slot Configuration</h2><p style={{fontSize:12,color:T.txD,margin:"3px 0 0"}}>Sequential slot rotation \u2014 cars are divided equally across slots, slots run one after another in a repeating cycle.</p></div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:12,marginBottom:20}}>
      <NumInput label="Total Inventory Cars" value={totalCars} onChange={setTotalCars} unit="cars" color={T.acc}/>
      <NumInput label="Number of Slots" value={numSlots} onChange={v=>setNumSlots(Math.max(1,Math.min(v,10)))} unit="slots" color={T.b}/>
      <NumInput label="Slot Duration" value={slotDuration} onChange={setSlotDuration} unit="min" color={T.cyan}/>
      <div style={{flex:1}}><div style={{fontSize:10,color:T.txD,fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Start Time</div><input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} style={{width:"100%",background:T.s0,border:`1px solid ${T.bdr}`,borderRadius:6,color:T.tx,fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",padding:"5px 8px",outline:"none",boxSizing:"border-box"}}/></div>
      <NumInput label="Run For" value={totalHours} onChange={setTotalHours} unit="hours" color={T.y}/>
    </div>

    {/* Slot Distribution */}
    <Section title="Slot Distribution" icon={Ic.car} accent={T.b} badge={<Pill c={T.b} bg={T.bS}>{numSlots} slots \u00B7 {carsPerSlot} cars each</Pill>}>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(numSlots,5)},1fr)`,gap:10}}>
        {slotNames.map((s,i)=>(
          <div key={s} style={{background:T.s0,borderRadius:10,border:`1px solid ${T.bdr}`,padding:"14px 16px",textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:800,color:T.acc,fontFamily:"'DM Mono',monospace"}}>Slot {s}</div>
            <div style={{fontSize:28,fontWeight:800,color:T.tx,fontFamily:"'DM Mono',monospace",margin:"6px 0"}}>{carsPerSlot+(i<remainder?1:0)}</div>
            <div style={{fontSize:11,color:T.txM}}>cars assigned</div>
            <MiniBar v={carsPerSlot+(i<remainder?1:0)} max={totalCars} c={T.b}/>
          </div>
        ))}
      </div>
    </Section>

    {/* Timeline */}
    <div style={{marginTop:14}}><Section title="Auction Timeline (Sequential)" icon={Ic.slot} accent={T.y} badge={<Pill c={T.y} bg={T.yS}>{totalCycles} full cycles</Pill>}>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {timeline.map((t,i)=>{
          const colors=["#ff6b2b","#3e8bff","#00d68f","#ffbe2e","#00e0ff","#ff4757","#a855f7","#f472b6","#84cc16","#f97316"];
          const slotColor=colors[slotNames.indexOf(t.slot)%colors.length];
          return(<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:i<timeline.length-1?`1px solid ${T.bdr}`:"none"}}>
            <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:T.txD,width:60}}>Cycle {t.cycle}</span>
            <div style={{width:60,height:24,borderRadius:6,background:`${slotColor}18`,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${slotColor}30`}}>
              <span style={{fontSize:11,fontWeight:800,color:slotColor}}>Slot {t.slot}</span>
            </div>
            <span style={{fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color:T.tx}}>{t.start} \u2013 {t.end}</span>
            <span style={{fontSize:11,color:T.txM}}>{t.cars} cars live</span>
            <div style={{flex:1,height:8,background:T.s3,borderRadius:4,overflow:"hidden"}}>
              <div style={{width:`${(slotDuration/60)*100}%`,height:"100%",background:`${slotColor}40`,borderRadius:4}}/>
            </div>
          </div>);
        })}
      </div>
    </Section></div>
  </div>);
}

// ══════════════════════════════════════════════════════════════
// QUOTE SUBMISSION
// ══════════════════════════════════════════════════════════════
function QuoteSubmit({history,setHistory}){
  const [leadId,setLeadId]=useState("");
  const [quote,setQuote]=useState("");
  const [person,setPerson]=useState("");
  const [car,setCar]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [submitted,setSubmitted]=useState(false);
  const [verdict,setVerdict]=useState(null);

  const fetchCar=useCallback(()=>{
    const id=leadId.trim();if(!id){setError("Enter a Lead ID");return;}
    setLoading(true);setError("");setCar(null);setSubmitted(false);setVerdict(null);setQuote("");
    setTimeout(()=>{const f=STUCK_DB[id];if(f)setCar(f);else setError(`No record for "${id}". Try: ${Object.keys(STUCK_DB).join(", ")}`);setLoading(false);},500);
  },[leadId]);

  const handleSubmit=()=>{
    if(!car||!quote||!person.trim())return;
    const q=Number(quote);let v;
    if(car.Auction_Stop||car.Auction_Hold||car.NO_GO)v="BLOCKED";
    else if(q>=car.TP)v="AUTO-APPROVE";
    else if(q>=car.NEW_MSP)v="APPROVE";
    else if(q>=car.NEW_MSP*.95)v="ESCALATE";
    else v="REJECT";
    setVerdict(v);setSubmitted(true);
    setHistory(prev=>[{id:Date.now(),lead_id:String(car.LEAD_ID),quote:q,person,verdict:v,time:new Date().toISOString(),car},...prev]);
  };
  const reset=()=>{setLeadId("");setQuote("");setPerson("");setCar(null);setError("");setSubmitted(false);setVerdict(null);};
  const inpS={background:T.s0,border:`1.5px solid ${T.bdr}`,borderRadius:7,color:T.tx,padding:"9px 12px",fontSize:13,outline:"none",fontFamily:"'DM Mono',monospace",width:"100%",boxSizing:"border-box"};

  if(submitted&&car&&verdict){
    const q=Number(quote),loss=car.BUYING_PRICE-q,lossPct=((loss/car.BUYING_PRICE)*100).toFixed(1);
    const vc={
      "AUTO-APPROVE":{c:T.g,bg:T.gS,label:"APPROVED",sub:"Quote meets Target Price"},
      "APPROVE":{c:T.g,bg:T.gS,label:"APPROVED",sub:"Quote above MSP"},
      "ESCALATE":{c:T.y,bg:T.yS,label:"ESCALATED",sub:"Quote within 5% of MSP \u2014 PM review"},
      "REJECT":{c:T.r,bg:T.rS,label:"REJECTED",sub:"Quote below MSP"},
      "BLOCKED":{c:T.r,bg:T.rS,label:"BLOCKED",sub:"Car has active block"},
    }[verdict];
    return(<div>
      <div style={{background:`linear-gradient(135deg,${vc.bg},transparent)`,border:`1.5px solid ${vc.c}20`,borderRadius:14,padding:0,overflow:"hidden",boxShadow:`0 0 30px ${vc.c}10`}}>
        <div style={{padding:"20px 24px",display:"flex",alignItems:"center",gap:16,borderBottom:`1px solid ${vc.c}15`}}>
          <div style={{width:52,height:52,borderRadius:12,background:`${vc.c}12`,display:"flex",alignItems:"center",justifyContent:"center",border:`2px solid ${vc.c}25`}}>{verdict.includes("APPROV")?Ic.check(24):verdict==="ESCALATE"?Ic.clk(24):Ic.xc(24)}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:800,color:vc.c,letterSpacing:".12em",textTransform:"uppercase"}}>{vc.label}</div>
            <div style={{fontSize:14,fontWeight:700,color:T.tx}}>{car.Year} {car.MAKE} {car.MODEL}</div>
            <div style={{fontSize:11,color:T.txM}}>Lead: <span style={{fontFamily:"'DM Mono',monospace",color:T.acc}}>{car.LEAD_ID}</span> \u00B7 {person}</div>
          </div>
          <div style={{textAlign:"right"}}><div style={{fontSize:10,color:T.txD}}>Dealer Quote</div><div style={{fontSize:22,fontWeight:800,fontFamily:"'DM Mono',monospace",color:vc.c}}>{fmt(q)}</div></div>
        </div>
        <div style={{padding:"14px 24px",display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:0}}>
          {[{l:"vs TP",v:fmt(q-car.TP),c:q>=car.TP?T.g:T.r},{l:"vs MSP",v:fmt(q-car.NEW_MSP),c:q>=car.NEW_MSP?T.g:T.r},{l:"vs Anchor",v:fmt(q-car.Anchor),c:q>=car.Anchor?T.g:T.r},{l:"Loss",v:fmt(-loss),c:loss>0?T.r:T.g},{l:"Loss%",v:`${lossPct}%`,c:Number(lossPct)>0?T.r:T.g},{l:"Margin",v:fmt(q-car.C24),c:q>=car.C24?T.g:T.r}].map((m,i)=>(
            <div key={i} style={{padding:"8px 12px",borderRight:i<5?`1px solid ${T.bdr}40`:"none",textAlign:"center"}}>
              <div style={{fontSize:9,color:T.txD,fontWeight:600,textTransform:"uppercase",marginBottom:3}}>{m.l}</div>
              <div style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono',monospace",color:m.c}}>{m.v}</div>
            </div>
          ))}
        </div>
        {(verdict.includes("APPROV"))&&<div style={{padding:"12px 24px",borderTop:`1px solid ${T.bdr}30`,background:`${T.s0}80`}}>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {["Decision \u2713","Master Sheet \u2713","Auction Live \u2713","Slack Sent \u2713"].map((s,i)=><span key={i} style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:T.gS,color:T.g,fontWeight:600}}>{s}</span>)}
          </div>
        </div>}
      </div>
      <div style={{textAlign:"center",marginTop:20}}><button onClick={reset} style={{padding:"9px 24px",borderRadius:8,border:"none",background:T.acc,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>Submit Another</button></div>
    </div>);
  }

  return(<div>
    <div style={{marginBottom:20}}><h2 style={{fontSize:18,fontWeight:800,color:T.tx,margin:0}}>Submit Dealer Quote</h2><p style={{fontSize:12,color:T.txD,margin:"3px 0 0"}}>Enter Lead ID \u2192 Fetch \u2192 Quote \u2192 Instant Decision</p></div>
    <div style={{background:T.s1,border:`1px solid ${T.bdr}`,borderRadius:12,padding:"16px 18px",marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,alignItems:"end"}}>
        <div><div style={{fontSize:10,color:T.txD,fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Lead ID</div><input value={leadId} onChange={e=>setLeadId(e.target.value)} onKeyDown={e=>e.key==="Enter"&&fetchCar()} placeholder="e.g. 10278662740" style={inpS} onFocus={e=>e.target.style.borderColor=T.acc} onBlur={e=>e.target.style.borderColor=T.bdr}/></div>
        <div><div style={{fontSize:10,color:T.txD,fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Sales Person</div><input value={person} onChange={e=>setPerson(e.target.value)} placeholder="Your name" style={{...inpS,fontFamily:"inherit"}} onFocus={e=>e.target.style.borderColor=T.acc} onBlur={e=>e.target.style.borderColor=T.bdr}/></div>
        <button onClick={fetchCar} disabled={loading} style={{padding:"9px 18px",borderRadius:7,border:"none",background:T.acc,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:5,height:40,fontFamily:"inherit"}}>{Ic.search} {loading?"...":"Fetch"}</button>
      </div>
      {error&&<div style={{marginTop:8,padding:"8px 10px",background:T.rS,borderRadius:6,fontSize:12,color:T.r,borderLeft:`3px solid ${T.r}`}}>{error}</div>}
    </div>
    {car&&<>
      <Section title={`${car.Year} ${car.MAKE} ${car.MODEL}`} icon={Ic.car} accent={T.acc} badge={<div style={{display:"flex",gap:4}}>{car.Auction_Stop?<Pill c={T.r} bg={T.rS}>STOP</Pill>:null}{car.Flooded?<Pill c={T.r} bg={T.rS}>FLOOD</Pill>:null}{!car.Auction_Stop&&!car.Flooded&&<Pill c={T.g} bg={T.gS}>OK</Pill>}</div>}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8}}>
          {[{l:"C24",v:fmt(car.C24)},{l:"Buying",v:fmt(car.BUYING_PRICE)},{l:"TP",v:fmt(car.TP),c:T.g},{l:"MSP",v:fmt(car.NEW_MSP),c:T.y},{l:"Anchor",v:fmt(car.Anchor),c:T.acc},{l:"C2D",v:fmt(car.C2D_Price),c:T.b}].map((r,i)=>(
            <div key={i} style={{background:T.s0,borderRadius:7,padding:"8px 10px",textAlign:"center",border:`1px solid ${T.bdr}`}}>
              <div style={{fontSize:9,color:T.txD,fontWeight:600,textTransform:"uppercase",marginBottom:2}}>{r.l}</div>
              <div style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:r.c||T.tx}}>{r.v}</div>
            </div>
          ))}
        </div>
      </Section>
      <div style={{background:T.s1,border:`1px solid ${T.bdr}`,borderRadius:12,padding:"16px 18px",marginTop:12}}>
        <div style={{fontSize:10,color:T.txD,fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Dealer Quote (\u20B9)</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input type="number" value={quote} onChange={e=>setQuote(e.target.value)} placeholder="Enter amount" style={{...inpS,flex:1}} onFocus={e=>e.target.style.borderColor=T.acc} onBlur={e=>e.target.style.borderColor=T.bdr}/>
          <button onClick={handleSubmit} disabled={!quote||!person.trim()} style={{padding:"9px 20px",borderRadius:7,border:"none",background:!quote||!person.trim()?T.txD:T.g,color:"#fff",fontWeight:700,cursor:!quote||!person.trim()?"not-allowed":"pointer",fontSize:13,fontFamily:"inherit"}}>Submit</button>
        </div>
        <div style={{display:"flex",gap:4,marginTop:6}}>
          {[{l:"MSP",v:car.NEW_MSP},{l:"Anchor",v:car.Anchor},{l:"TP",v:car.TP},{l:"C2D",v:car.C2D_Price}].map((b,i)=>(
            <button key={i} onClick={()=>setQuote(String(b.v))} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${T.bdr}`,background:"transparent",color:T.txM,fontSize:10,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>{b.l}: {fmt(b.v)}</button>
          ))}
        </div>
      </div>
    </>}
  </div>);
}

// ══════════════════════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════════════════════
function History({history}){
  const vc=v=>({"AUTO-APPROVE":{c:T.g,bg:T.gS,lb:"Approved"},"APPROVE":{c:T.g,bg:T.gS,lb:"Approved"},"ESCALATE":{c:T.y,bg:T.yS,lb:"Escalated"},"REJECT":{c:T.r,bg:T.rS,lb:"Rejected"},"BLOCKED":{c:T.r,bg:T.rS,lb:"Blocked"}}[v]||{c:T.txD,bg:T.s2,lb:v});
  return(<div>
    <div style={{marginBottom:20}}><h2 style={{fontSize:18,fontWeight:800,color:T.tx,margin:0}}>Quote History</h2><p style={{fontSize:12,color:T.txD,margin:"3px 0 0"}}>Audit trail of all submitted quotes</p></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:16}}>
      {[{l:"Total",v:history.length,c:T.b,bg:T.bS},{l:"Approved",v:history.filter(h=>h.verdict.includes("APPROV")).length,c:T.g,bg:T.gS},{l:"Rejected",v:history.filter(h=>h.verdict==="REJECT"||h.verdict==="BLOCKED").length,c:T.r,bg:T.rS},{l:"Escalated",v:history.filter(h=>h.verdict==="ESCALATE").length,c:T.y,bg:T.yS}].map((m,i)=>(
        <div key={i} style={{background:T.s1,border:`1px solid ${T.bdr}`,borderRadius:10,padding:"14px 16px"}}><div style={{fontSize:10,color:T.txD,fontWeight:700,letterSpacing:".09em",textTransform:"uppercase",marginBottom:3}}>{m.l}</div><div style={{fontSize:24,fontWeight:800,color:m.c,fontFamily:"'DM Mono',monospace"}}>{m.v}</div></div>
      ))}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {history.map(h=>{const v=vc(h.verdict);const loss=h.car.BUYING_PRICE-h.quote;return(
        <div key={h.id} style={{background:T.s1,border:`1px solid ${T.bdr}`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:34,height:34,borderRadius:8,background:v.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>{h.verdict.includes("APPROV")?Ic.check():h.verdict==="ESCALATE"?Ic.clk():Ic.xc()}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}><span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:T.acc,fontWeight:700}}>{h.lead_id}</span><span style={{fontSize:12,color:T.tx,fontWeight:600}}>{h.car.Year} {h.car.MAKE} {h.car.MODEL}</span><Pill c={v.c} bg={v.bg}>{v.lb}</Pill></div>
            <div style={{fontSize:10.5,color:T.txD}}>by {h.person} \u00B7 {new Date(h.time).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
          </div>
          <div style={{display:"flex",gap:16}}>
            {[{l:"Quote",v:fmt(h.quote),c:T.tx},{l:"Loss%",v:`${((loss/h.car.BUYING_PRICE)*100).toFixed(1)}%`,c:T.r},{l:"vs MSP",v:fmt(h.quote-h.car.NEW_MSP),c:h.quote>=h.car.NEW_MSP?T.g:T.r}].map((m,i)=>(
              <div key={i} style={{textAlign:"right"}}><div style={{fontSize:9,color:T.txD}}>{m.l}</div><div style={{fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color:m.c}}>{m.v}</div></div>
            ))}
          </div>
        </div>
      )})}
      {history.length===0&&<div style={{textAlign:"center",padding:40,color:T.txD}}>No quotes submitted yet</div>}
    </div>
  </div>);
}

// ══════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════
export default function App(){
  const [tab,setTab]=useState("dashboard");
  const [history,setHistory]=useState([
    {id:1,lead_id:"10278662740",quote:525000,person:"Amit S.",verdict:"APPROVE",time:"2026-03-11T14:30",car:STUCK_DB["10278662740"]},
    {id:2,lead_id:"13017065728",quote:195000,person:"Priya R.",verdict:"REJECT",time:"2026-03-11T11:15",car:STUCK_DB["13017065728"]},
  ]);
  const [hasChanges,setHasChanges]=useState(false);

  const tabs=[
    {id:"dashboard",label:"Liquidation",icon:Ic.dash},
    {id:"pricing",label:"Pricing Rules",icon:Ic.price},
    {id:"slots",label:"Auction Slots",icon:Ic.slot},
    {id:"quote",label:"Submit Quote",icon:Ic.quote},
    {id:"history",label:"History",icon:Ic.hist},
  ];

  return(
    <div style={{minHeight:"100vh",background:T.bg,color:T.tx,fontFamily:"'Manrope','Helvetica Neue',system-ui,sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>

      <div style={{padding:"10px 24px",borderBottom:`1px solid ${T.bdr}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(7,11,21,.92)",backdropFilter:"blur(16px)",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:9,background:`linear-gradient(135deg,${T.acc},#e53935)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:11,color:"#fff"}}>C24</div>
          <div><div style={{fontSize:14,fontWeight:800,color:T.tx}}>Inventory Command Center</div><div style={{fontSize:10,color:T.txD}}>Liquidation \u00B7 Pricing \u00B7 Slots \u00B7 Quotes \u00B7 History</div></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{display:"flex",gap:2,background:T.s0,borderRadius:9,padding:3,border:`1px solid ${T.bdr}`}}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 14px",borderRadius:7,border:"none",background:tab===t.id?T.s2:"transparent",color:tab===t.id?T.acc:T.txD,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .15s",boxShadow:tab===t.id?`0 0 10px ${T.accG}`:"none"}}>{t.icon} {t.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{padding:"20px 24px",maxWidth:1220,margin:"0 auto"}}>
        {tab==="dashboard"&&<LiquidationDash/>}
        {tab==="pricing"&&<PricingControls/>}
        {tab==="slots"&&<AuctionSlots/>}
        {tab==="quote"&&<QuoteSubmit history={history} setHistory={setHistory}/>}
        {tab==="history"&&<History history={history}/>}
      </div>
    </div>
  );
}
