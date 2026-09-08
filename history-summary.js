(function(){
  'use strict';

  function ensureHistorySummary(){
    let el=document.querySelector('#history-summary');
    if(el)return el;
    const toolbar=document.querySelector('#page-history .history-toolbar');
    if(!toolbar)return null;
    el=document.createElement('div');
    el.id='history-summary';
    el.className='mini-kpi-grid history-summary-grid';
    toolbar.insertAdjacentElement('afterend',el);

    if(!document.querySelector('#history-summary-style')){
      const style=document.createElement('style');
      style.id='history-summary-style';
      style.textContent=`
        .history-summary-grid{margin:0 0 18px;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
        .history-summary-grid .mini-kpi{min-height:118px;display:flex;flex-direction:column;justify-content:center;gap:7px}
        .history-summary-grid .mini-kpi strong{font-size:clamp(1.15rem,2vw,1.7rem);line-height:1.15}
        .history-summary-grid .mini-kpi small{color:var(--muted,#64748b);font-size:.78rem}
        .history-summary-grid .history-total-primary{background:linear-gradient(135deg,#0f172a,#164e63);color:#fff;border-color:transparent}
        .history-summary-grid .history-total-primary span,.history-summary-grid .history-total-primary small{color:rgba(255,255,255,.72)}
        @media(max-width:980px){.history-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:560px){.history-summary-grid{grid-template-columns:1fr 1fr;gap:10px}.history-summary-grid .mini-kpi{min-height:104px;padding:14px}.history-summary-grid .mini-kpi strong{font-size:1.05rem}}
      `;
      document.head.appendChild(style);
    }
    return el;
  }

  function localISODate(date=new Date()){
    const y=date.getFullYear();
    const m=String(date.getMonth()+1).padStart(2,'0');
    const d=String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  async function loadHistorySummary(){
    const historySummaryEl=ensureHistorySummary();
    if(!historySummaryEl||!state.session?.token)return;
    const today=localISODate();
    const selectedDate=document.querySelector('#history-date')?.value||today;
    const month=selectedDate.slice(0,7);
    historySummaryEl.setAttribute('aria-busy','true');
    try{
      const data=await apiCall('dashboard',{month});
      const daily=(data.dailySeries||[]).find(row=>row.date===selectedDate);
      const selectedTotal=Number(daily?.total||0);
      const isToday=selectedDate===today;
      historySummaryEl.innerHTML=`
        <div class="mini-kpi history-total-primary">
          <span>${isToday?'TOTAL BELANJA HARI INI':'TOTAL TANGGAL TERPILIH'}</span>
          <strong>${rupiah(selectedTotal)}</strong>
          <small>${fmtDate(selectedDate)}</small>
        </div>
        <div class="mini-kpi">
          <span>TOTAL ${monthLabel(month).toUpperCase()}</span>
          <strong>${rupiah(data.totalExpense)}</strong>
          <small>${Number(data.transactionCount||0)} transaksi</small>
        </div>
        <div class="mini-kpi">
          <span>JUMLAH TRANSAKSI</span>
          <strong>${new Intl.NumberFormat('id-ID').format(Number(data.transactionCount||0))}</strong>
          <small>${monthLabel(month)}</small>
        </div>
        <div class="mini-kpi">
          <span>RATA-RATA TRANSAKSI</span>
          <strong>${rupiah(data.averageTransaction)}</strong>
          <small>Rata-rata per transaksi</small>
        </div>`;
    }catch(error){
      historySummaryEl.innerHTML='<div class="empty">Ringkasan belanja belum dapat dimuat.</div>';
      console.error('History summary error',error);
    }finally{
      historySummaryEl.removeAttribute('aria-busy');
    }
  }

  function bindHistorySummary(){
    ensureHistorySummary();
    document.querySelectorAll('[data-page="history"]').forEach(button=>button.addEventListener('click',()=>setTimeout(loadHistorySummary,0)));
    document.querySelector('#history-date')?.addEventListener('input',loadHistorySummary);
    document.querySelector('#history-reset')?.addEventListener('click',()=>setTimeout(loadHistorySummary,0));
  }

  window.loadHistorySummary=loadHistorySummary;
  bindHistorySummary();
})();
