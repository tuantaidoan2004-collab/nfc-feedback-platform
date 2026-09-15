'use client';
import { useRouter } from 'next/navigation';
import { useCallback,useEffect,useState,useRef } from 'react';
import type { OwnerDashboard as Repository,ExperienceRow } from '@/lib/owner/dashboard';
import styles from './owner-dashboard.module.css';
type Data=Awaited<ReturnType<Repository['read']>>;
const localDate=(days=0)=>new Date(Date.now()+7*3600000-days*86400000).toISOString().slice(0,10);
const time=(value:string|null)=>value?new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—';
const labels:Record<string,string>={new:'Chưa xử lý',progress:'Đang xử lý',resolved:'Đã xử lý'};
function CaseForm({row,save}:{row:ExperienceRow;save:(row:ExperienceRow,status:string,note:string)=>Promise<boolean>}){
 const [status,setStatus]=useState(row.status??'new'),[note,setNote]=useState(row.note),[busy,setBusy]=useState(false);
 return <form onSubmit={async e=>{e.preventDefault();setBusy(true);await save(row,status,note);setBusy(false);}}>
 <label>Trạng thái<select value={status} onChange={e=>setStatus(e.target.value)} disabled={busy}>{Object.entries(labels).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 <label>Ghi chú nội bộ<textarea value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} disabled={busy}/></label>
 <button disabled={busy}>{busy?'Đang lưu…':'Lưu xử lý'}</button></form>;
}
export default function OwnerDashboard({slug,name}:{slug:string;name:string}){
 const router=useRouter(),latest=useRef(0);
 const [data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(true),[notice,setNotice]=useState(''),[expired,setExpired]=useState(false);
 const [filters,setFilters]=useState({from:localDate(29),to:localDate(),source:'',release:'',rating:'',status:''});
 const [query,setQuery]=useState(()=>new URLSearchParams({from:localDate(29),to:localDate()}).toString());
 const [cursor,setCursor]=useState(''),[dataset,setDataset]=useState('experiences');
 const endpoint=`/api/owner/v2/${encodeURIComponent(slug)}`;
 const refresh=useCallback((signal?:AbortSignal)=>{
 const sequence=++latest.current;
 return fetch(`${endpoint}?${query}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`,{cache:'no-store',signal}).then(async response=>{
 if(signal?.aborted||sequence!==latest.current)return;
 if(response.status===401){setExpired(true);setData(null);setNotice('Phiên đăng nhập đã hết hạn.');return;}
 if(!response.ok){setData(null);setNotice(response.status===403?'Bạn không còn quyền truy cập shop này.':'Không thể tải dữ liệu. Vui lòng thử lại.');return;}
 const loaded=await response.json();if(!signal?.aborted&&sequence===latest.current&&document.visibilityState!=='hidden'){setData(loaded);setExpired(false);}
 }).catch(()=>{if(!signal?.aborted&&sequence===latest.current){setData(null);setNotice('Không thể kết nối. Vui lòng thử lại.');}}).finally(()=>{if(!signal?.aborted&&sequence===latest.current)setBusy(false);});
 },[endpoint,query,cursor]);
 useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return()=>controller.abort();},[refresh]);
 useEffect(()=>{const change=()=>{if(document.visibilityState==='hidden'){latest.current++;setData(null);}else void refresh();};const restored=(event:PageTransitionEvent)=>{if(event.persisted)void refresh();};document.addEventListener('visibilitychange',change);window.addEventListener('pageshow',restored);return()=>{document.removeEventListener('visibilitychange',change);window.removeEventListener('pageshow',restored);};},[refresh]);
 const save=async(row:ExperienceRow,status:string,note:string)=>{
 try{const response=await fetch(endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:row.session_id,expectedCaseRevision:row.case_revision,expectedExperienceRevision:row.experience_revision,status,note})});
 if(response.status===401){setExpired(true);setData(null);setNotice('Phiên đăng nhập đã hết hạn.');return false;}
 if(response.status===409){setNotice('Góp ý hoặc trạng thái đã thay đổi. Dữ liệu mới được tải lại; hãy kiểm tra trước khi lưu.');await refresh();return false;}
 if(!response.ok){setNotice('Không lưu được. Kiểm tra quyền truy cập và thử lại.');return false;}
 setNotice('Đã lưu xử lý.');await refresh();return true;
 }catch{setNotice('Chưa xác nhận được kết quả lưu. Tải lại để kiểm tra trước khi gửi lại.');return false;}};
 return <main className={styles.shell}>
 <header className={styles.header}><div><p>GÓC NHÌN KHÁCH HÀNG</p><h1>{name}</h1><span>Dữ liệu live · giờ Việt Nam</span></div>
 <button onClick={async()=>{try{const r=await fetch('/api/owner/v2/logout',{method:'POST'});if(r.ok){latest.current++;setData(null);router.replace(`/owner/login?next=${encodeURIComponent(`/ZZZ/${slug}`)}`);router.refresh();}else setNotice('Chưa đăng xuất được. Thử lại.');}catch{setNotice('Chưa đăng xuất được. Kiểm tra kết nối.');}}}>Đăng xuất</button></header>
 <form className={styles.filters} onSubmit={e=>{e.preventDefault();const p=new URLSearchParams();Object.entries(filters).forEach(([k,v])=>{if(v)p.set(k,v);});setNotice('');setBusy(true);if(!cursor&&query===p.toString())void refresh();else{setCursor('');setQuery(p.toString());}}}>
 <label>Từ ngày<input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})} required/></label>
 <label>Đến ngày<input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})} required/></label>
 <label>Nguồn<select value={filters.source} onChange={e=>setFilters({...filters,source:e.target.value})}><option value="">Tất cả</option><option value="direct">Trực tiếp</option><option value="unknown">Chưa rõ nguồn</option>{data?.tags.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select></label>
 <label>Bản phát hành<select value={filters.release} onChange={e=>setFilters({...filters,release:e.target.value})}><option value="">Tất cả</option><option value="unknown">Chưa rõ</option>{data?.releases.map(r=><option value={r.id} key={r.id}>{time(r.created_at)} · {r.id.slice(0,8)}</option>)}</select></label>
 <label>Số sao<select value={filters.rating} onChange={e=>setFilters({...filters,rating:e.target.value})}><option value="">Tất cả</option>{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label>
 <label>Xử lý góp ý<select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="">Tất cả</option>{Object.entries(labels).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 <button>Lọc dữ liệu</button></form>
 <p className={styles.explain}>Lọc lượt mở trang, xem đánh giá hiện tại của các phiên tương ứng. Phiên 15 phút không phải số khách duy nhất. Sao nội bộ không phải đánh giá Google.</p>
 <p role="status" aria-live="polite">{notice}</p>{expired&&<a href={`/owner/login?next=${encodeURIComponent(`/ZZZ/${slug}`)}`}>Đăng nhập lại</a>}
 {busy&&<p>Đang tải dữ liệu…</p>}
 {!busy&&!data&&!expired&&<button onClick={()=>void refresh()}>Thử lại</button>}
 {data&&<>
 <section className={styles.metrics} aria-label="Tổng quan">{Object.entries({opens:'Lượt mở trang',sessions:'Phiên 15 phút',rated:'Trải nghiệm chấm sao',average:'Điểm nội bộ trung bình',feedback:'Có góp ý riêng',unresolved:'Góp ý chưa xử lý'}).map(([key,label])=><article key={key}><span>{label}</span><strong data-metric={key}>{data.metrics[key]??'—'}</strong></article>)}</section>
 <section className={styles.exports}><h2>Tải dữ liệu</h2><label>Loại dữ liệu<select value={dataset} onChange={e=>setDataset(e.target.value)}><option value="experiences">Trải nghiệm hiện tại</option><option value="page_visits">Lượt mở trang</option><option value="receipts">Lịch sử đánh giá / góp ý</option></select></label>
 {['csv','jsonl','dictionary'].map(format=><a key={format} href={`${endpoint}/export?${query}&dataset=${dataset}&format=${format}`}>{format==='dictionary'?'Từ điển dữ liệu':format.toUpperCase()}</a>)}
 <p>CSV cho Excel. JSONL đọc theo từng dòng cho dữ liệu lớn. File giữ cùng bộ lọc đang áp dụng; lịch sử gồm toàn bộ sự kiện của nhóm phiên đã chọn.</p></section>
 <section aria-label="Danh sách trải nghiệm"><h2>Trải nghiệm & góp ý</h2>{data.records.length===0?<p>Chưa có trải nghiệm phù hợp bộ lọc.</p>:data.records.map(row=><article className={styles.card} key={`${row.session_id}:${row.case_revision}:${row.experience_revision}`}>
 <div className={styles.row}><strong>{row.rating}/5 sao nội bộ</strong><time>{time(row.first_rated_at)}</time><span>{row.status?labels[row.status]:'Chưa gửi góp ý'}</span></div>
 <p className={styles.muted}>{row.source_label} · Bản {row.release_id?.slice(0,8)??'chưa rõ'} · Phiên {row.session_id.slice(0,8)}</p>
 {row.message&&<><p className={styles.message}>{row.message}</p><p className={styles.muted}>Chủ đề: {row.topic}</p><CaseForm row={row} save={save}/></>}
 </article>)}</section>
 <nav className={styles.row} aria-label="Phân trang">{cursor&&<button onClick={()=>setCursor('')}>Về trang đầu</button>}{data.nextCursor&&<button onClick={()=>setCursor(data.nextCursor!)}>Trang tiếp</button>}</nav>
 </>}
 </main>;
}
