import { createContext, useContext, useState, type HTMLAttributes, type ReactNode, Children, isValidElement } from 'react';
import { useApp, sectionFor, creates, edits, details, Sidebar, textOf } from './App';
const Field=createContext('');
const Interactive=createContext(false);
type Props=HTMLAttributes<HTMLDivElement>&{'data-name'?:string;'data-node-id'?:string};
function hasName(children:ReactNode,re:RegExp):boolean{return Children.toArray(children).some(c=>isValidElement(c)&&(re.test(String((c.props as Props)['data-name']??''))||hasName((c.props as Props).children,re)));}
function assetIn(children:ReactNode):string|undefined{for(const child of Children.toArray(children)){if(isValidElement(child)){const props=child.props as {src?:string;children?:ReactNode};if(child.type==='img'&&props.src)return props.src;const nested=assetIn(props.children);if(nested)return nested;}}}
function leaves(c:ReactNode):number {if(typeof c==='string')return c.trim()?1:0;if(typeof c==='number')return 1;if(Array.isArray(c))return c.reduce((n,v)=>n+leaves(v),0);if(isValidElement(c))return leaves((c.props as Props).children);return 0;}
export function DesignNode(props:Props){const {children,...attrs}=props;const name=props['data-name']??'',id=props['data-node-id']??name;const a=useApp();const parentLabel=useContext(Field),inside=useContext(Interactive);const [on,setOn]=useState(true);const [dismissed,setDismissed]=useState(false);const [revealed,setRevealed]=useState(false);const text=textOf(children).replace(/\s+/g,' ').trim();const section=sectionFor(a.screen);
 if(name==='Chatbot'||Children.toArray(children).some(c=>isValidElement(c)&&(c.props as Props)['data-name']==='Chatbot'))return null;
 if(name==='sidebar')return <Sidebar/>;
 if(text==='UZ'&&Children.toArray(children).some(c=>isValidElement(c)&&c.type==='p'&&textOf(c).trim()==='UZ')&&hasName(children,/More Than|chevron/i))return <div {...attrs} className={(attrs.className??'')+' language-dropdown'}><select aria-label="Tilni tanlash" value={a.language} onChange={e=>a.setLanguage(e.target.value)}><option value="UZ" lang="uz">UZ</option><option value="RU" lang="ru">RU</option></select><span aria-hidden="true"/></div>;
 const searchHint=Children.toArray(children).find(c=>isValidElement(c)&&c.type==='p'&&/qidir/i.test(textOf(c)));
 const searchPlaceholder=searchHint?textOf(searchHint).trim():'';
 if(searchPlaceholder&&hasName(children,/search/i))return <div {...attrs} className={(attrs.className??'')+' object-search-field'}><img src={assetIn(children)} width="16" height="16" alt=""/><input type="search" aria-label={searchPlaceholder.replace(/\.{3}$/,'')} placeholder={searchPlaceholder} value={a.query} onChange={e=>a.setQuery(e.target.value)}/></div>;
 const field=/^(field-wrapper|field-(?!input|label)|field$)/.test(name)&&!name.includes('row');
 if(field){const first=Children.toArray(children)[0];const label=isValidElement(first)&&first.type==='p'?textOf(first).trim():'';return <Field.Provider value={label}><div {...attrs}>{children}</div></Field.Provider>}
 const chipIcon=Children.toArray(children).find(c=>isValidElement(c)&&(c.props as Props)['data-name']==='Multiply');
 if(chipIcon&&!parentLabel&&name==='Frame'&&attrs.className?.split(' ').includes('d105')&&text&&text.length<80){if(dismissed)return null;return <div {...attrs}>{Children.toArray(children).filter(c=>!isValidElement(c)||(c.props as Props)['data-name']!=='Multiply')}<button type="button" className="chip-remove" aria-label={text+' — olib tashlash'} onClick={()=>setDismissed(true)}><img src={assetIn(chipIcon)} alt=""/></button></div>;}
 const search=/^search$|search-input|search-box/.test(name);
 const input=/^field-input-box$|^input-box$|^input$|^textarea$/.test(name)||(parentLabel&&['Frame',''].includes(name)&&!hasName(children,/field-wrapper|field-label/)&&text.length<400);
 if(search||input){const label=search?'Qidirish':parentLabel||name;const multiline=/izoh|tavsif|muammo|ishlar|reja|summary/i.test(label);const choice=hasName(children,/chevron-down|More Than/)&&!/sana|vaqt|dan|gacha/i.test(label);const value=search?a.query:a.values[label]??'';
 const change=(v:string)=>search?a.setQuery(v):a.setValue(label,v);
 const common={'data-node-id':id,className:(attrs.className??'')+' native-field','aria-label':label,value,onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>change(e.target.value)};
 if(choice){const options=/holat|status/i.test(label)?['Faol','Jarayonda','Kutilmoqda','Bajarildi','Arxiv']:/lavozim|rol/i.test(label)?['Menejer','Prorab','Bugalter','Muhandis']:/til/i.test(label)?['O‘zbekcha','Русский','English']:/valyuta/i.test(label)?['UZS (so‘m)','USD']:/obyekt/i.test(label)?['Navoiy 28 turar-joy','Chilonzor biznes markaz','Sergeli savdo markazi']:['Karim Aliyev','Ravshan Umarov','Otabek R.'];return <select {...common}><option value="">{text||label}</option>{options.map(v=><option key={v}>{v}</option>)}</select>}
 if(multiline)return <textarea {...common} placeholder={text||''}/>;
 const type=/parol/i.test(label)?'password':/email|pochta/i.test(label)?'email':/telefon/i.test(label)?'tel':/sana|^dan$|gacha/i.test(label)?'date':search?'search':'text';
 if(type==='password')return <div className={(attrs.className??'')+' password-field'}><input {...common} type={revealed?'text':'password'} placeholder={text||label} autoComplete="current-password"/><button type="button" aria-label={revealed?'Parolni yashirish':'Parolni ko‘rsatish'} onClick={()=>setRevealed(!revealed)}><img src="/assets/screen27-25ceb.png" alt="" width="20" height="20"/></button></div>;
 return <input {...common} type={type} placeholder={text||label} autoComplete={type==='email'?'email':type==='tel'?'tel':undefined}/>;
 }
 if(name==='filter-sub')return <select className={(attrs.className??'')+' native-filter'} aria-label={text} onChange={e=>a.setQuery(e.target.value)}><option value=''>{text}</option>{(/lavozim/i.test(text)?['Menejer','Prorab','Bugalter']:['Faol','Arxiv','Yakunlangan']).map(v=><option key={v}>{v}</option>)}</select>;
 if(name==='switch'||name==='toggle')return <button type="button" className={'toggle '+(on?'is-on':'')} role="switch" aria-checked={on} aria-label={parentLabel||'Bildirishnoma'} onClick={()=>{setOn(!on);a.setValue(id,String(!on));}}><span/></button>;
 if(/upload-dropzone|upload-area/.test(name))return <label data-name={name} {...{className:attrs.className}} style={{cursor:'pointer'}}>{children}<input type="file" accept=".xlsx,.xls,.csv,.pdf,image/*" onChange={e=>{const f=e.target.files?.[0];if(f){if(f.size>10*1024*1024){a.notice('Fayl hajmi 10 MB dan oshmasin.');return}a.setValue(id,f.name);a.notice(f.name+' tanlandi. Serverga yuborilmadi.');}}}/></label>;
 let action:(()=>void)|undefined;
 const short=text.length<95;
 const buttonName=/btn|button|^tab$|^tab-active$/.test(name)&&!name.includes('buttons');
 const actionable=short&&leaves(children)===1&&/^(Saqlash|Bekor qilish|Tahrirlash|O.chirish|Kirish|Ro.yxatdan o.tish|Barchasi|Filtrlash|Yuklab olish|Chop etish|Orqaga|Yopish|Tasdiqlash|Rad etish|[+]\s*|Yangi |Hodim qo.shish|Obyekt qo.shish|Vazifa qo.shish|Xomashyo qo.shish)/i.test(text);
 if(!inside&&((buttonName&&leaves(children)<=1)||actionable||(short&&leaves(children)===1&&/saqlash|tasdiq|yaratish|yuborish|chiqish|xomashyo buyurtmasi|smeta yaratish/i.test(text)))){
 if(/^chiqish$/i.test(text))action=()=>a.go(27);
 else if(/telegram orqali/i.test(text))action=()=>a.notice('Telegram orqali kirish uchun backend ulanishi kerak.');
 else if(/bekor|orqaga|yopish/i.test(text)||/cancel|close/.test(name))action=a.back;
 else if(/saqlash|tasdiq|jo.natish|yuborish/i.test(text)||(/yaratish/i.test(text)&&section!==a.screen))action=a.save;
 else if(/o.chirish/i.test(text)||name==='delete-btn')action=a.remove;
 else if(/tahrirlash/i.test(text))action=()=>a.go(edits[section]??section);
 else if(/kirish/i.test(text)&&!text.includes('Ro‘yxat'))action=()=>a.screen===28?a.go(27):a.save();
 else if(/ro.yxatdan/i.test(text))action=()=>a.screen===27?a.go(28):a.save();
 else if(/^barchasi$/i.test(text))action=()=>section===13?a.go(8):a.setQuery('');
 else if(/haftalik|kunlik|kundalik/i.test(text)&&name.startsWith('tab'))action=()=>{a.setReportTab(text);a.setQuery(text);};
 else if(/yuklab|export|eksport/i.test(text))action=()=>{const blob=new Blob(['\ufeff'+document.querySelector('main')?.innerText],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const el=document.createElement('a');el.href=url;el.download='barpo-hisobot.txt';el.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 else if(/chop etish/i.test(text))action=()=>window.print();
 else if(/filtr/i.test(text))action=()=>{const s=prompt('Qidiriladigan nomni kiriting:',a.query);if(s!==null)a.setQuery(s)};
 else if(/hisobot.*yaratish|yangi hisobot/i.test(text))action=()=>a.go(a.reportTab.toLowerCase().includes('hafta')?30:31);
 else if(/buyurtma/i.test(text))action=()=>a.go(16);
 else if(/blok.*qo.sh|yangi blok/i.test(text))action=()=>a.go(21);
 else if(/qo.sh|yangi|add/.test(text.toLowerCase()+' '+name))action=()=>a.go(creates[section]??section);
 else if(/tasdiq|rad etish/i.test(text))action=()=>a.notice(text+' — demo holati yangilandi.');
 }
 if(name==='operator-profile')action=()=>a.go(1);
 if(Children.toArray(children).some(c=>isValidElement(c)&&(c.props as Props)['data-name']==='Alarm')){action=a.toggleNotifications;attrs['aria-label']='Bildirishnomalar';attrs['aria-expanded']=a.notifications;attrs['aria-controls']='notifications-panel';}
 if(name==='Multiply'||name==='close-icon')action=a.back;
 const childCount=Children.toArray(children).length; const row=/^row-|^task-card$|^project-card$/.test(name)||(childCount>=3&&text.length<350&&((section===3&&/^Jamol Kamolov/.test(text))||(section===29&&/^#?12[2-7]\b/.test(text))||(section===12&&/^SM-/.test(text))||(section===7&&/^(Qum|Sement|Armatura)/.test(text))));
 if(row&&a.query&&!text.toLocaleLowerCase().includes(a.query.toLocaleLowerCase()))return null;
 if(!inside&&row&&details[section])action=()=>a.go([24,25].includes(a.screen)?20:section===29&&text.includes('Haftalik')?33:details[section]);
 if(!inside&&!action&&['Faol','Kutilmoqda','Kechikmoqda','Yakunlandi','Barchasi'].includes(text)&&childCount===1)action=()=>a.setQuery(text==='Barchasi'?'':text);
 if(!inside&&!action&&/^Ko.roq ko.rish$/i.test(text))action=()=>a.go(details[section]??section);
 if(!inside&&name==='Chatbot')action=()=>a.notice('AI yordamchi uchun backend ulanishi kerak.');
 if(action&&!a.canCrud(section,/o.chirish/i.test(text)?'delete':/tahrir|tasdiq|rad etish/i.test(text)||(action===a.save&&(a.selected||[4,11,18,36].includes(a.screen)))?'update':'create')&&!['Kirish','Ro‘yxatdan o‘tish'].includes(text)&&/saqlash|tahrirlash|o.chirish|tasdiq|rad etish|qo.sh|yangi |yaratish|buyurtma|jo.natish|yuborish/i.test(text)&&short)return null;
 if(action)return <Interactive.Provider value={true}><div {...attrs} role="button" tabIndex={0} aria-label={attrs['aria-label']||text||name} onClick={e=>{e.stopPropagation();action?.()}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();action?.()}}} className={(attrs.className??'')+' interactive'}>{children}</div></Interactive.Provider>;
 return <div {...attrs}>{children}</div>;
}
