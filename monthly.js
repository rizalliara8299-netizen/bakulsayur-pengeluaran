(function(){
  'use strict';

  const currentMonth=()=>new Date().toISOString().slice(0,7);
  const monthBounds=month=>{const [y,m]=String(month||'').split('-').map(Number);if(!y||!m)return null;const last=new Date(y,m,0).getDate();return{dateFrom:`${month}-01`,dateTo:`${month}-${String(last).padStart(2,'0')}`}};
  const pct=v=>Number.isFinite(Number(v))?Number(v):0;
  const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function monthlyFacts(d){
    const categories=[...(d.categoryTotals||[])].sort((a,b)=>Number(b.total)-Number(a.total));
    const payments=[...(d.paymentBreakdown||[])].sort((a,b)=>Number(b.total)-Number(a.total));
    const items=[...(d.topItems||[])].sort((a,b)=>Number(b.total)-Number(a.total));
    const days=[...(d.dailySeries||[])].sort((a,b)=>Number(b.total)-Number(a.total));
    return{dominantCategory:categories[0]||null,dominantPayment:payments[0]||null,topItem:items[0]||null,topDay:days[0]||null};
  }

  function renderMonthlyAnalysis(d){
    if(!document.getElementById('monthly-summary-cards'))return;
    const month=d.month||$('#dashboard-month').value||currentMonth();
    const f=monthlyFacts(d);const tx=Number(d.transactionCount||0);
    const cards=[
      ['Total Bulan Ini',rupiah(d.totalExpense||0),monthLabel(month)],
      ['Jumlah Transaksi',new Intl.NumberFormat('id-ID').format(tx),'transaksi tercatat'],
      ['Item Tertinggi',f.topItem?.item||'—',f.topItem?rupiah(f.topItem.total):'Belum ada data'],
      ['Kategori Dominan',f.dominantCategory?.name||'—',f.dominantCategory?rupiah(f.dominantCategory.total):'Belum ada data']
    ];
    $('#monthly-summary-cards').innerHTML=cards.map(c=>`<div class="analysis-kpi"><span>${escapeHtml(c[0])}</span><strong>${escapeHtml(c[1])}</strong><small>${escapeHtml(c[2])}</small></div>`).join('');

    const insights=[];
    if(!tx){
      insights.push(`Belum ada transaksi pada ${monthLabel(month)}.`,'Tambahkan transaksi agar sistem dapat membaca pola pengeluaran.');
    }else{
      insights.push(`Tercatat ${new Intl.NumberFormat('id-ID').format(tx)} transaksi dengan total ${rupiah(d.totalExpense)} dan rata-rata ${rupiah(d.averageTransaction)} per transaksi.`);
      const prev=Number(d.previousMonthTotal||0),change=pct(d.changePercent);
      if(prev>0)insights.push(`Pengeluaran ${change>0?'naik':change<0?'turun':'relatif tetap'} ${Math.abs(change).toLocaleString('id-ID',{maximumFractionDigits:1})}% dibanding bulan sebelumnya (${rupiah(prev)}).`);
      else insights.push('Belum ada basis bulan sebelumnya yang cukup untuk membandingkan perubahan pengeluaran.');
      if(f.dominantCategory)insights.push(`${f.dominantCategory.name} menjadi kategori dominan dengan ${rupiah(f.dominantCategory.total)} dari ${f.dominantCategory.transaction_count||0} transaksi.`);
      if(f.topItem)insights.push(`${f.topItem.item} menjadi item dengan pengeluaran tertinggi sebesar ${rupiah(f.topItem.total)}.`);
      if(f.dominantPayment&&Number(f.dominantPayment.total)>0)insights.push(`${f.dominantPayment.name} mendominasi nilai pembayaran bulan ini sebesar ${rupiah(f.dominantPayment.total)}.`);
      if(f.topDay)insights.push(`Hari dengan pengeluaran tertinggi adalah ${fmtDate(f.topDay.date)} sebesar ${rupiah(f.topDay.total)}.`);
    }
    $('#monthly-insights').innerHTML=insights.map((x,i)=>`<div class="insight-row"><span>${i+1}</span><p>${escapeHtml(x)}</p></div>`).join('');

    const rank=(d.topItems||[]).slice(0,5),max=Math.max(...rank.map(r=>Number(r.total)),1);
    $('#monthly-ranking').innerHTML=rank.map((r,i)=>`<div class="month-rank-row"><div class="month-rank-index">${i+1}</div><div class="month-rank-copy"><strong>${escapeHtml(r.item)}</strong><span>${escapeHtml(categoryName(r.category_code))} · ${r.transaction_count||0} transaksi</span><div class="month-rank-bar"><i style="width:${Math.max(5,Number(r.total)/max*100)}%"></i></div></div><b>${rupiah(r.total)}</b></div>`).join('')||'<div class="empty compact-empty">Belum ada ranking pada bulan ini.</div>';
  }

  async function fetchMonthTransactions(month){
    const bounds=monthBounds(month);if(!bounds)throw new Error('Bulan laporan tidak valid.');
    const rows=[];
    for(let page=0;page<100;page++){
      const d=await apiCall('history',{page,pageSize:100,search:'',category:'',dateFrom:bounds.dateFrom,dateTo:bounds.dateTo});
      rows.push(...(d.rows||[]));if(!d.hasMore)break;
    }
    return rows;
  }

  function reportTable(headers,rows){return `<table><thead><tr>${headers.map(x=>`<th>${html(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${html(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`}

  async function downloadMonthlyReport(month,button){
    if(!/^\d{4}-\d{2}$/.test(String(month||'')))return toast('Pilih bulan laporan terlebih dahulu.',true);
    const old=button?.textContent;if(button){button.disabled=true;button.textContent='Menyiapkan laporan...'}
    try{
      const [d,rows]=await Promise.all([apiCall('dashboard',{month}),fetchMonthTransactions(month)]);
      const categories=[...(d.categoryTotals||[])].sort((a,b)=>Number(b.total)-Number(a.total));
      const payments=[...(d.paymentBreakdown||[])].sort((a,b)=>Number(b.total)-Number(a.total));
      const tops=d.topItems||[];
      const detail=rows.map(r=>[r.transaction_no,fmtDate(r.transaction_date),categoryName(r.category_code),r.item_name_snapshot,r.qty,r.unit||'',state.payments.find(p=>p.code===r.payment_code)?.name||r.payment_code,rupiah(r.total_price)]);
      const doc=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial,sans-serif;color:#172033}h1{color:#047448}h2{margin-top:26px;background:#172033;color:white;padding:8px}table{border-collapse:collapse;width:100%;margin:8px 0 18px}th,td{border:1px solid #dce5ef;padding:7px 9px;text-align:left}th{background:#dff4fd}.money{font-weight:700}</style></head><body><h1>BAKUL SAYUR — LAPORAN PENGELUARAN BULANAN</h1><p><b>Periode:</b> ${html(monthLabel(month))}</p><h2>Ringkasan</h2>${reportTable(['Indikator','Nilai'],[['Total Pengeluaran',rupiah(d.totalExpense)],['Jumlah Transaksi',d.transactionCount],['Rata-rata Transaksi',rupiah(d.averageTransaction)],['Bulan Sebelumnya',rupiah(d.previousMonthTotal)],['Perubahan',`${pct(d.changePercent).toLocaleString('id-ID',{maximumFractionDigits:1})}%`]])}<h2>Kategori</h2>${reportTable(['Kategori','Transaksi','Total'],categories.map(r=>[r.name,r.transaction_count,rupiah(r.total)]))}<h2>Metode Pembayaran</h2>${reportTable(['Metode','Transaksi','Total'],payments.map(r=>[r.name,r.transaction_count,rupiah(r.total)]))}<h2>Top Item</h2>${reportTable(['Peringkat','Item','Kategori','Transaksi','Total'],tops.map((r,i)=>[i+1,r.item,categoryName(r.category_code),r.transaction_count,rupiah(r.total)]))}<h2>Detail Transaksi</h2>${reportTable(['ID','Tanggal','Kategori','Item','Qty','Satuan','Pembayaran','Total Harga'],detail)}</body></html>`;
      const url=URL.createObjectURL(new Blob(['\ufeff'+doc],{type:'application/vnd.ms-excel;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download=`Laporan_Pengeluaran_Bakul_Sayur_${month}.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
      toast(`Laporan ${monthLabel(month)} berhasil dibuat (${rows.length} transaksi).`);
    }catch(e){toast(e.message,true)}finally{if(button){button.disabled=false;button.textContent=old}}
  }

  const originalRenderDashboard=renderDashboard;
  renderDashboard=function(d){originalRenderDashboard(d);const month=d.month||$('#dashboard-month').value||currentMonth();if($('#analysis-month'))$('#analysis-month').value=month;renderMonthlyAnalysis(d)};

  const m=$('#dashboard-month')?.value||currentMonth();
  if($('#analysis-month'))$('#analysis-month').value=m;
  if($('#history-report-month'))$('#history-report-month').value=m;
  $('#analysis-month')?.addEventListener('change',e=>{if($('#dashboard-month'))$('#dashboard-month').value=e.target.value;loadDashboard()});
  $('#download-monthly-analysis')?.addEventListener('click',e=>downloadMonthlyReport($('#analysis-month').value,e.currentTarget));
  $('#download-monthly-history')?.addEventListener('click',e=>downloadMonthlyReport($('#history-report-month').value,e.currentTarget));
  if(state.dashboard)renderMonthlyAnalysis(state.dashboard);
})();
