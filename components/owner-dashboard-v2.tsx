'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
const scopes:Record<string,string>={overview:'Chỉ số liệu tổng quan',feedback:'Kèm góp ý riêng tư'};
const endings:Record<string,string>={ended:'đã kết thúc',superseded:'bị thay bằng phiên mới',expired:'hết hạn'};
export type Impersonation={admin:string;scope:'overview'|'feedback';reason:string;expiresAt:string};
function AdminVisits({visits}:{visits:Data['adminVisits']}){
 return <section aria-label="Lượt truy cập của quản trị" data-admin-visits><h2>Lượt truy cập của quản trị</h2>
 <p className={styles.explain}>Mỗi lần quản trị viên nền tảng xem dashboard thay mặt shop đều được ghi lại ở đây, kèm lý do. Quản trị viên chỉ được xem, không sửa và không tải được dữ liệu.</p>
 {visits.length===0?<p>Chưa có lượt nào.</p>:visits.map(v=><article className={styles.card} key={v.id} data-admin-visit={v.id}>
 <div className={styles.row}><strong>{v.admin}</strong><time>{time(v.started_at)}</time><span>{scopes[v.scope]}</span></div>
 <p data-reason>{v.reason}</p>
 <p className={styles.muted}>{v.ended_at?`${endings[v.end_reason??'ended']} lúc ${time(v.ended_at)}`:`hết hạn lúc ${time(v.expires_at)}`} · {v.reads} lần xem</p>
 </article>)}</section>;
}
function Support({support,canChange,change}:{support:Data['support'];canChange:boolean;change:(enabled:boolean)=>Promise<void>}){
 const [busy,setBusy]=useState(false);
 return <section className={styles.exports} aria-label="Hỗ trợ từ quản trị" data-support={support.feedback?'on':'off'}><h2>Hỗ trợ từ quản trị</h2>
 <p>Quản trị viên nền tảng luôn xem được số liệu tổng quan để hỗ trợ, và mỗi lượt đều hiện ở mục bên dưới. Nội dung góp ý của khách chỉ đọc được khi công tắc này đang bật. Xong việc thì tắt lại.</p>
 <label className={styles.switch}><input type="checkbox" role="switch" checked={support.feedback} disabled={!canChange||busy}
  onChange={async e=>{setBusy(true);await change(e.target.checked);setBusy(false);}}/>Cho phép quản trị đọc góp ý riêng tư</label>
 {!canChange&&<p>Chỉ tài khoản chủ shop đổi được công tắc này.</p>}
 {support.history.length>0&&<p data-support-history>{support.history.map(h=>`${h.enabled?'Bật':'Tắt'} bởi ${h.by} lúc ${time(h.at)}`).join(' · ')}</p>}
 </section>;
}
export default function OwnerDashboard({slug,name,impersonation}:{slug:string;name:string;impersonation:Impersonation|null}){
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
 if(response.status===401){setExpired(true);setData(null);setNotice(impersonation?'Phiên xem thay mặt đã kết thúc.':'Phiên đăng nhập đã hết hạn.');return;}
 if(response.status===403&&impersonation&&(await response.clone().json().catch(()=>({}))).error==='SUPPORT_NOT_GRANTED'){setData(null);setNotice('Chủ shop đã tắt quyền đọc góp ý. Kết thúc phiên này và mở lại ở phạm vi tổng quan.');return;}
 if(!response.ok){setData(null);setNotice(response.status===403?'Bạn không còn quyền truy cập shop này.':'Không thể tải dữ liệu. Vui lòng thử lại.');return;}
 const loaded=await response.json();if(!signal?.aborted&&sequence===latest.current&&document.visibilityState!=='hidden'){setData(loaded);setExpired(false);}
 }).catch(()=>{if(!signal?.aborted&&sequence===latest.current){setData(null);setNotice('Không thể kết nối. Vui lòng thử lại.');}}).finally(()=>{if(!signal?.aborted&&sequence===latest.current)setBusy(false);});
 },[endpoint,query,cursor,impersonation]);
 useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return()=>controller.abort();},[refresh]);
 useEffect(()=>{const change=()=>{if(document.visibilityState==='hidden'){latest.current++;setData(null);}else void refresh();};const restored=(event:PageTransitionEvent)=>{if(event.persisted)void refresh();};document.addEventListener('visibilitychange',change);window.addEventListener('pageshow',restored);return()=>{document.removeEventListener('visibilitychange',change);window.removeEventListener('pageshow',restored);};},[refresh]);
 const changeSupport=async(enabled:boolean)=>{
 try{const response=await fetch(`${endpoint}/support`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({permission:'feedback',enabled})});
 if(!response.ok){setNotice(response.status===401?'Phiên đăng nhập đã hết hạn.':'Chưa đổi được công tắc. Thử lại.');return;}
 setNotice(enabled?'Đã cho phép quản trị đọc góp ý.':'Đã tắt quyền đọc góp ý của quản trị.');await refresh();
 }catch{setNotice('Chưa xác nhận được công tắc. Tải lại để kiểm tra.');}};
 const save=async(row:ExperienceRow,status:string,note:string)=>{
 try{const response=await fetch(endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:row.session_id,expectedCaseRevision:row.case_revision,expectedExperienceRevision:row.experience_revision,status,note})});
 if(response.status===401){setExpired(true);setData(null);setNotice('Phiên đăng nhập đã hết hạn.');return false;}
 if(response.status===409){setNotice('Góp ý hoặc trạng thái đã thay đổi. Dữ liệu mới được tải lại; hãy kiểm tra trước khi lưu.');await refresh();return false;}
 if(!response.ok){setNotice('Không lưu được. Kiểm tra quyền truy cập và thử lại.');return false;}
 setNotice('Đã lưu xử lý.');await refresh();return true;
 }catch{setNotice('Chưa xác nhận được kết quả lưu. Tải lại để kiểm tra trước khi gửi lại.');return false;}};
 return <main className={styles.shell}>
 {impersonation&&<aside className={styles.impersonation} data-impersonation={impersonation.scope} role="note">
 <strong>Đang xem thay mặt chủ shop</strong> · {impersonation.admin} · {scopes[impersonation.scope]} · chỉ xem · hết hạn lúc {time(impersonation.expiresAt)}
 <p>Lý do: {impersonation.reason}</p>
 <button onClick={async()=>{try{const r=await fetch(`${endpoint}/impersonation`,{method:'DELETE'});if(r.ok){latest.current++;setData(null);router.replace('/gov');}else setNotice('Chưa kết thúc được phiên. Thử lại.');}catch{setNotice('Chưa kết thúc được phiên. Kiểm tra kết nối.');}}}>Kết thúc phiên</button>
 </aside>}
 <header className={styles.header}><div><p>GÓC NHÌN KHÁCH HÀNG</p><h1>{name}</h1><span>Dữ liệu live · giờ Việt Nam</span></div>
 {!impersonation&&<button onClick={async()=>{try{const r=await fetch('/api/owner/v2/logout',{method:'POST'});if(r.ok){latest.current++;setData(null);router.replace(`/owner/login?next=${encodeURIComponent(`/ZZZ/${slug}`)}`);router.refresh();}else setNotice('Chưa đăng xuất được. Thử lại.');}catch{setNotice('Chưa đăng xuất được. Kiểm tra kết nối.');}}}>Đăng xuất</button>}</header>
 <form className={styles.filters} onSubmit={e=>{e.preventDefault();const p=new URLSearchParams();Object.entries(filters).forEach(([k,v])=>{if(v)p.set(k,v);});setNotice('');setBusy(true);if(!cursor&&query===p.toString())void refresh();else{setCursor('');setQuery(p.toString());}}}>
 <label>Từ ngày<input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})} required/></label>
 <label>Đến ngày<input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})} required/></label>
 <label>Nguồn<select value={filters.source} onChange={e=>setFilters({...filters,source:e.target.value})}><option value="">Tất cả</option><option value="direct">Trực tiếp</option><option value="unknown">Chưa rõ nguồn</option>{data?.tags.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select></label>
 <label>Bản phát hành<select value={filters.release} onChange={e=>setFilters({...filters,release:e.target.value})}><option value="">Tất cả</option><option value="unknown">Chưa rõ</option>{data?.releases.map(r=><option value={r.id} key={r.id}>{time(r.created_at)} · {r.id.slice(0,8)}</option>)}</select></label>
 <label>Số sao<select value={filters.rating} onChange={e=>setFilters({...filters,rating:e.target.value})}><option value="">Tất cả</option>{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label>
 <label>Xử lý góp ý<select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="">Tất cả</option>{Object.entries(labels).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 <button>Lọc dữ liệu</button></form>
 <p className={styles.explain}>Lọc lượt mở trang, xem đánh giá hiện tại của các phiên tương ứng. Phiên 15 phút không phải số khách duy nhất. Sao nội bộ không phải đánh giá Google.</p>
 <p role="status" aria-live="polite">{notice}</p>{expired&&(impersonation?<Link href="/gov">Về trang quản trị</Link>:<a href={`/owner/login?next=${encodeURIComponent(`/ZZZ/${slug}`)}`}>Đăng nhập lại</a>)}
 {busy&&<p>Đang tải dữ liệu…</p>}
 {!busy&&!data&&!expired&&<button onClick={()=>void refresh()}>Thử lại</button>}
 {data&&<>
 <section className={styles.metrics} aria-label="Tổng quan">{Object.entries({opens:'Lượt mở trang',sessions:'Phiên 15 phút',rated:'Trải nghiệm chấm sao',average:'Điểm nội bộ trung bình',feedback:'Có góp ý riêng',unresolved:'Góp ý chưa xử lý'}).map(([key,label])=><article key={key}><span>{label}</span><strong data-metric={key}>{data.metrics[key]??'—'}</strong></article>)}</section>
 {!impersonation&&<section className={styles.exports}><h2>Tải dữ liệu</h2><label>Loại dữ liệu<select value={dataset} onChange={e=>setDataset(e.target.value)}><option value="experiences">Trải nghiệm hiện tại</option><option value="page_visits">Lượt mở trang</option><option value="receipts">Lịch sử đánh giá / góp ý</option></select></label>
 {['csv','jsonl','dictionary'].map(format=><a key={format} href={`${endpoint}/export?${query}&dataset=${dataset}&format=${format}`}>{format==='dictionary'?'Từ điển dữ liệu':format.toUpperCase()}</a>)}
 <p>CSV cho Excel. JSONL đọc theo từng dòng cho dữ liệu lớn. File giữ cùng bộ lọc đang áp dụng; lịch sử gồm toàn bộ sự kiện của nhóm phiên đã chọn.</p></section>}
 <section aria-label="Danh sách trải nghiệm"><h2>Trải nghiệm & góp ý</h2>{data.records.length===0?<p>Chưa có trải nghiệm phù hợp bộ lọc.</p>:data.records.map(row=><article className={styles.card} key={`${row.session_id}:${row.case_revision}:${row.experience_revision}`}>
 <div className={styles.row}><strong>{row.rating}/5 sao nội bộ</strong><time>{time(row.first_rated_at)}</time><span>{row.status?labels[row.status]:'Chưa gửi góp ý'}</span></div>
 <p className={styles.muted}>{row.source_label} · Bản {row.release_id?.slice(0,8)??'chưa rõ'} · Phiên {row.session_id.slice(0,8)}</p>
 {row.message&&<><p className={styles.message}>{row.message}</p><p className={styles.muted}>Chủ đề: {row.topic}</p>{impersonation?(row.note&&<p className={styles.muted}>Ghi chú nội bộ: {row.note}</p>):<CaseForm row={row} save={save}/>}</>}
 {!row.message&&impersonation?.scope==='overview'&&row.status&&<p className={styles.muted}>Nội dung góp ý ẩn trong phạm vi tổng quan.</p>}
 </article>)}</section>
 <Support support={data.support} canChange={!impersonation&&data.viewer.kind==='owner'&&data.viewer.role==='owner'} change={changeSupport}/>
 <AdminVisits visits={data.adminVisits}/>
 <nav className={styles.row} aria-label="Phân trang">{cursor&&<button onClick={()=>setCursor('')}>Về trang đầu</button>}{data.nextCursor&&<button onClick={()=>setCursor(data.nextCursor!)}>Trang tiếp</button>}</nav>
 </>}
 </main>;
}
