export {roles,type Role,type RoleConfig} from '../roles';
import {roles,type Role} from '../roles';
import {liveBackend,getPermissions,screenPage,type CrudAction} from '../api/client';

export function roleSection(n:number){
  if([41,42,43,44,45].includes(n))return 41;
  if([46,47,48].includes(n))return 46;
  if([63,64,65,66,67].includes(n))return 63;
  if([68,69,70,71].includes(n))return 68;
  return [3,4,5,6].includes(n)?3:[7,15,16,17,18,19].includes(n)?7:[8,9,10,11].includes(n)?8:[12,34,35,36].includes(n)?12:[20,21,22,23,24,25,26].includes(n)?26:[29,30,31,32,33].includes(n)?29:n===14?13:n;
}

const forms=new Set([4,5,10,11,16,17,18,19,21,22,23,30,31,35,36,42,43,44,45,47,48,64,65,66,67,69,70]);
export function canCrud(role:Role,screen:number,action:CrudAction):boolean{
 if(!liveBackend)return action==='read'?canAccess(role,screen):roles[role].write.includes(roleSection(screen));
 if(['super_admin','platform_owner','technician'].includes(role))return action==='read'?roles[role].sections.includes(roleSection(screen)):roles[role].write.includes(roleSection(screen));
 const page=screenPage(screen);if(!page)return [1,2,27,28,85,86,96].includes(screen);const rules=getPermissions()?.pages[page];return Boolean(rules?.read&&rules[action]);
}
export function canWrite(role:Role,section:number):boolean{return ['create','update','delete'].some(action=>canCrud(role,section,action as CrudAction));}
export function canAccess(role:Role,screen:number){if([1,2,27,28].includes(screen))return true;if(liveBackend){if(!canCrud(role,screen,'read'))return false;if([5,10,16,17,19,21,22,23,30,31,35,94].includes(screen))return canCrud(role,screen,'create');if([4,11,18,36].includes(screen))return canCrud(role,screen,'update');return true;}const section=roleSection(screen);return roles[role].sections.includes(section)&&(!forms.has(screen)||canWrite(role,section));}
export function loadRole():Role{try{const saved=liveBackend?sessionStorage.getItem('barpo-live-role'):localStorage.getItem('barpo-demo-role');if(saved&&Object.hasOwn(roles,saved))return saved as Role;}catch{}return 'manager';}
