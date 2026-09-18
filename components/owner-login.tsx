'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './owner-dashboard.module.css';
/** Sign in with the @handle or the account's email (lát F2). A forgotten password goes through Tài: contact from NFC_SUPPORT_CONTACT. */
export default function OwnerLogin({next,contact}:{next:string;contact:string|null}){
 const router=useRouter();
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <main className={styles.login}><p>QUẢN LÝ SHOP</p><h1>Đăng nhập</h1><p>Dùng tài khoản đã được cấp quyền cho shop.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const form=new FormData(e.currentTarget);
 try{const response=await fetch('/api/owner/v2/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:form.get('username'),password:form.get('password'),next})});
 if(!response.ok){setError(response.status===401?'Không thể đăng nhập. Kiểm tra thông tin hoặc thử lại sau.':'Dịch vụ đang gián đoạn. Vui lòng thử lại.');return;}
 router.replace(next);router.refresh();
 }catch{setError('Không thể kết nối. Vui lòng thử lại.');}finally{setBusy(false);}}}>
 <label>@handle hoặc email<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder="@tenquan"/></label>
 <label>Mật khẩu<input name="password" type="password" autoComplete="current-password" required maxLength={256}/></label>
 <button disabled={busy}>{busy?'Đang đăng nhập…':'Đăng nhập'}</button><p role="alert">{error}</p>
 {contact&&<p data-forgot>Quên mật khẩu? Liên hệ {contact} để được đặt lại.</p>}
 </form></main>;
}
