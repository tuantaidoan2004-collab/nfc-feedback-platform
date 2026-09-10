'use client';
import { useEffect, useRef, useState } from 'react';
import { copy, topics, type Language, type Topic } from '@/lib/copy';
type Experience = {rating:number|null;revision:number;message:string;topic:Topic};
type Props = {slug:string;name:string;googleUrl:string|null;heroUrl:string|null;heroKind:'image'|'video'|null};
export default function ShopFeedback(shop:Props) {
 const [lang,setLang]=useState<Language>('vi');const t=copy[lang];
 const [saved,setSaved]=useState<Experience|null>(null);const current=useRef<Experience|null>(null);
 const [rating,setRating]=useState(0);const [message,setMessage]=useState('');const [topic,setTopic]=useState<Topic>('other');
 const [open,setOpen]=useState(false);const [pulse,setPulse]=useState(0);const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
 const queue=useRef(Promise.resolve());const url=`/api/shops/${encodeURIComponent(shop.slug)}/experience`;
 useEffect(()=>{let active=true;fetch(url,{method:'POST'}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then((value:Experience)=>{if(active){current.current=value;setSaved(value);setRating(value.rating??0);setMessage(value.message);setTopic(value.topic);}}).catch(()=>{if(active)setNotice('Không kết nối được máy chủ / Server unavailable.');});return()=>{active=false;};},[url]);
 function update(fields:Partial<Omit<Experience,'revision'>>) {
  setBusy(true);setNotice('');
  queue.current=queue.current.then(async()=>{
   try {
    if(!current.current)throw Error();
    const response=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,revision:current.current.revision})});
    if(!response.ok)throw Error();const value:Experience=await response.json();current.current=value;setSaved(value);
    setNotice(lang==='vi'?'Đã lưu trên máy chủ.':'Saved on the server.');
   }catch{setNotice(lang==='vi'?'Chưa xác nhận lưu. Tải lại trang để kiểm tra rồi thử lại.':'Save not confirmed. Reload to check, then retry.');}
  }).finally(()=>setBusy(false));
 }
 function rate(value:number){setRating(value);if(value<=3){setOpen(true);setPulse(n=>n+1);}else setPulse(0);update({rating:value});}
 return <main className="customer-wrap" lang={lang}><article className="phone">
  <div className="language"><label htmlFor="language">Ngôn ngữ / Language</label><select id="language" value={lang} onChange={e=>setLang(e.target.value as Language)}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></div>
  {shop.heroUrl ? shop.heroKind==='video'?<video className="shop-media" src={shop.heroUrl} controls playsInline preload="none"/>:<div className="shop-media" role="img" aria-label={shop.name} style={{backgroundImage:`url(${JSON.stringify(shop.heroUrl)})`}}/>:<div className="cover"><strong>{shop.name}</strong></div>}
  <div className="customer-content"><h1>{shop.name}</h1><p className="question">{t.question}</p>
   <div className="stars" role="group" aria-label={t.question}>{[1,2,3,4,5].map(n=><button key={n} disabled={!saved} aria-label={`${n} ${t.stars}`} aria-pressed={rating===n} data-filled={n<=rating} onClick={()=>rate(n)}>★</button>)}</div>
   <p className="rating-receipt">{saved?.rating?`${lang==='vi'?'Đã lưu trên máy chủ':'Saved on server'}: ${saved.rating}/5`:'\u00a0'}</p>
   <section className="google-invitation"><p>{t.invite}</p>{shop.googleUrl?<a className="google-button" href={shop.googleUrl} target="_blank" rel="noopener noreferrer">G · Google Maps ↗</a>:<button className="google-button" disabled>Google Maps</button>}<p className="muted small">{t.thanks}</p></section>
   <button id="private-feedback" className={`feedback-trigger${rating>0&&rating<=3?' needs-attention':''}`} aria-expanded={open} onClick={()=>{setOpen(!open);setPulse(0);}}><span key={pulse} className={`pulse-fill${pulse?'':' idle'}`} aria-hidden="true"/><span className="trigger-label">{t.private}</span></button>
   {open&&<form id="private-form" className="feedback-form" onSubmit={e=>{e.preventDefault();if(message.trim())update({message,topic});}}><p>{t.privateNote}</p><label htmlFor="topic">{t.topic}</label><select id="topic" value={topic} onChange={e=>setTopic(e.target.value as Topic)}>{topics.map(k=><option key={k} value={k}>{t[k]}</option>)}</select><label htmlFor="message">{t.message}</label><textarea id="message" rows={4} maxLength={2000} required value={message} onChange={e=>setMessage(e.target.value)}/><button className="primary" disabled={!saved||busy}>{t.send}</button></form>}
   <p role="status">{notice}</p></div></article></main>;
}
