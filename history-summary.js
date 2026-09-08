const historySummaryEl=document.querySelector('#history-summary');

function localISODate(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

async function loadHistorySummary(){
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
    const selectedLabel=isToday?'TOTAL BELANJA HARI INI':'TOTAL TANGGAL TERPILIH';
    const selectedHint=isToday?fmtDate(today):fmtDate(selectedDate);
    historySummaryEl.innerHTML=`
      <div class="mini-kpi history-total-primary">
        <span>${selectedLabel}</span>
        <strong>${rupiah(selectedTotal)}</strong>
        <small>${selectedHint}</small>
      </div>
      <div class="mini-kpi">
        <span>TOTAL ${monthLabel(month).toUpperCase()}</span>
        <strong>${rupiah(data.totalExpense)}</strong>
        <small>${Number(data.transactionCount||0)} transaksi</small>
      </div>
      <div class="mini-kpi">
        <span>JUMLAH TRANSAKSI BULAN INI</span>
        <strong>${new Intl.NumberFormat('id-ID').format(Number(data.transactionCount||0))}</strong>
        <small>Transaksi pada ${monthLabel(month)}</small>
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
  document.querySelectorAll('[data-page="history"]').forEach(button=>button.addEventListener('click',()=>setTimeout(loadHistorySummary,0)));
  document.querySelector('#history-date')?.addEventListener('input',loadHistorySummary);
  document.querySelector('#history-reset')?.addEventListener('click',()=>setTimeout(loadHistorySummary,0));
}

bindHistorySummary();
